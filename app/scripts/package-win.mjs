#!/usr/bin/env node
/**
 * 打包 Windows 免安装版：release/ServiceManager-v<版本>-win-x64.zip
 *
 * 用法（在 app 目录下）：
 *   npm run package:win              先构建前后端，再打包
 *   npm run package:win -- --skip-build   跳过构建，直接用现有的 dist/
 *
 * 需要：Node 20.19+、Go 1.24+（编译 ServiceManager.exe）。
 * Windows 和 Linux 上都能运行；在 Linux 上会自动下载 Windows 版的 node.exe 和 better-sqlite3 预编译文件。
 *
 * 压缩包里的结构：
 *   ServiceManager.exe          双击启动（托盘程序）
 *   runtime/node.exe            自带的 Node 运行环境
 *   app/boot.js                 后台服务
 *   app/public/                 网页界面
 *   app/node_modules/           只有 better-sqlite3 及其依赖（原生模块不能打进 boot.js）
 *   使用说明.txt
 *   data/                       首次运行时自动创建，存放配置数据库和日志
 */
import { execFileSync, execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const appDir = path.resolve(import.meta.dirname, "..");
const repoDir = path.resolve(appDir, "..");
const launcherDir = path.join(repoDir, "launcher");
const pkg = JSON.parse(fs.readFileSync(path.join(appDir, "package.json"), "utf-8"));
const version = pkg.version;
const nodeVersion = process.versions.node;
const isWin = process.platform === "win32";
const skipBuild = process.argv.includes("--skip-build");

const releaseDir = path.join(repoDir, "release");
const name = `ServiceManager-v${version}-win-x64`;
const stage = path.join(releaseDir, name);
const zipPath = path.join(releaseDir, `${name}.zip`);
const cacheDir = path.join(releaseDir, ".cache");

function log(msg) {
  console.log(`[package] ${msg}`);
}

function run(cmd, args, opts = {}) {
  log(`${cmd} ${args.join(" ")}`);
  execFileSync(cmd, args, { stdio: "inherit", shell: isWin, ...opts });
}

function copy(src, dest) {
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.cpSync(src, dest, { recursive: true });
}

async function download(url, dest) {
  if (fs.existsSync(dest)) return dest;
  log(`下载 ${url}`);
  const res = await fetch(url);
  if (!res.ok) throw new Error(`下载失败 ${res.status}：${url}`);
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.writeFileSync(dest + ".part", Buffer.from(await res.arrayBuffer()));
  fs.renameSync(dest + ".part", dest);
  return dest;
}

/** Windows x64 的 node.exe，版本和当前构建用的 Node 一致 */
async function getNodeExe() {
  if (isWin && process.arch === "x64") return process.execPath;
  return download(
    `https://nodejs.org/dist/v${nodeVersion}/win-x64/node.exe`,
    path.join(cacheDir, `node-v${nodeVersion}-win-x64.exe`)
  );
}

/** better-sqlite3 的 Windows 预编译文件（better_sqlite3.node），要和 node.exe 的版本匹配 */
function getSqliteBinary() {
  const modDir = path.join(appDir, "node_modules", "better-sqlite3");
  if (isWin && process.arch === "x64") {
    return path.join(modDir, "build", "Release", "better_sqlite3.node");
  }
  const sqliteVersion = JSON.parse(fs.readFileSync(path.join(modDir, "package.json"), "utf-8")).version;
  const out = path.join(cacheDir, `better-sqlite3-${sqliteVersion}-node-${nodeVersion}-win32-x64`);
  const bin = path.join(out, "build", "Release", "better_sqlite3.node");
  if (fs.existsSync(bin)) return bin;
  // 复制一份模块到缓存目录，在那里用 prebuild-install 下载 Windows 版，不影响本机的 node_modules
  fs.rmSync(out, { recursive: true, force: true });
  fs.mkdirSync(out, { recursive: true });
  fs.copyFileSync(path.join(modDir, "package.json"), path.join(out, "package.json"));
  const prebuild = path.join(appDir, "node_modules", "prebuild-install", "bin.js");
  run(process.execPath, [prebuild, "--platform", "win32", "--arch", "x64", "--runtime", "node", "--target", nodeVersion], {
    cwd: out,
  });
  if (!fs.existsSync(bin)) throw new Error("没拿到 better-sqlite3 的 Windows 预编译文件");
  return bin;
}

function buildLauncher(dest) {
  const env = { ...process.env, GOOS: "windows", GOARCH: "amd64", CGO_ENABLED: "0" };
  run("go", ["build", "-trimpath", "-ldflags", "-H windowsgui -s -w", "-o", dest, "."], { cwd: launcherDir, env, shell: false });
}

function zipDir(dir, zip) {
  fs.rmSync(zip, { force: true });
  if (isWin) {
    run("powershell", ["-NoProfile", "-Command", `Compress-Archive -Path '${dir}' -DestinationPath '${zip}'`], { shell: false });
  } else {
    execSync(`cd "${path.dirname(dir)}" && python3 -m zipfile -c "${zip}" "${path.basename(dir)}"`, { stdio: "inherit" });
  }
}

const README = `Service Manager v${version}  本地服务管理工具
==============================================

【启动】
  双击 ServiceManager.exe。几秒后浏览器会自动打开管理界面，
  任务栏右下角会出现托盘图标（可能在“^”里面）。

【托盘菜单】
  打开管理界面      在浏览器里打开（左键单击图标也可以）
  查看运行日志      打开 data\\logs 文件夹
  退出              停止所有服务，然后退出

【数据放在哪】
  data\\services.db        服务配置
  data\\logs\\service_*.log  每个服务的日志
  data\\logs\\manager.log    管理器自己的运行日志，出问题时先看这里
  升级新版本时，把旧版本的 data 文件夹复制到新版本目录即可保留配置。

【常见问题】
  - 双击没反应：看托盘里是不是已经有图标了，已在运行时再次双击只会打开浏览器。
  - 提示端口被占用：默认用 3000，被占用会自动换 3001～3010。
  - 需要管理员权限的服务（如注册为系统服务的 MySQL）：在服务设置里打开“管理员权限”，启动时会弹出 UAC 确认。
  - 不要只拷贝 ServiceManager.exe，runtime 和 app 文件夹必须和它放在一起。

项目主页：https://github.com/dongzhongcen/localhostSCmanager
`;

async function main() {
  if (!skipBuild) run("npm", ["run", "build"], { cwd: appDir });
  for (const f of ["dist/boot.js", "dist/public/index.html"]) {
    if (!fs.existsSync(path.join(appDir, f))) throw new Error(`缺少 ${f}，请先运行 npm run build`);
  }

  log(`清理 ${stage}`);
  fs.rmSync(stage, { recursive: true, force: true });
  fs.mkdirSync(stage, { recursive: true });

  buildLauncher(path.join(stage, "ServiceManager.exe"));
  copy(await getNodeExe(), path.join(stage, "runtime", "node.exe"));

  const outApp = path.join(stage, "app");
  copy(path.join(appDir, "dist", "boot.js"), path.join(outApp, "boot.js"));
  copy(path.join(appDir, "dist", "public"), path.join(outApp, "public"));
  fs.writeFileSync(
    path.join(outApp, "package.json"),
    JSON.stringify({ name: pkg.name, version, private: true, type: "module" }, null, 2) + "\n"
  );

  // better-sqlite3 只需要 lib/、package.json 和编译好的 .node 文件
  const nm = path.join(appDir, "node_modules");
  const outNm = path.join(outApp, "node_modules");
  copy(path.join(nm, "better-sqlite3", "package.json"), path.join(outNm, "better-sqlite3", "package.json"));
  copy(path.join(nm, "better-sqlite3", "lib"), path.join(outNm, "better-sqlite3", "lib"));
  copy(path.join(nm, "better-sqlite3", "LICENSE"), path.join(outNm, "better-sqlite3", "LICENSE"));
  copy(getSqliteBinary(), path.join(outNm, "better-sqlite3", "build", "Release", "better_sqlite3.node"));
  for (const dep of ["bindings", "file-uri-to-path"]) {
    copy(path.join(nm, dep), path.join(outNm, dep));
  }

  fs.writeFileSync(path.join(stage, "使用说明.txt"), "\ufeff" + README.replace(/\n/g, "\r\n"));
  copy(path.join(repoDir, "LICENSE"), path.join(stage, "LICENSE"));

  zipDir(stage, zipPath);
  const size = (fs.statSync(zipPath).size / 1024 / 1024).toFixed(1);
  log(`完成：${path.relative(repoDir, zipPath)}（${size} MB）`);
}

main().catch((err) => {
  console.error(`[package] 失败：${err.message}`);
  process.exit(1);
});
