import { afterAll, beforeAll, describe, expect, it } from "vitest";
import fs from "fs";
import os from "os";
import path from "path";

// 用临时目录做数据目录，不碰真实数据
const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "sm-test-"));
process.env.SM_DATA_DIR = dataDir;

type PM = typeof import("./processManager");
let pm: PM;
let db: ReturnType<typeof import("../queries/connection").getDb>;
let services: typeof import("@db/schema").services;

const scriptDir = path.join(dataDir, "带 空格 的目录");
const childPidFile = path.join(scriptDir, "child.pid");

function isAlive(pid: number) {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

async function waitFor(fn: () => boolean, ms = 5000) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    if (fn()) return true;
    await new Promise((r) => setTimeout(r, 50));
  }
  return false;
}

function addService(name: string, command: string) {
  return db
    .insert(services)
    .values({ name, type: "custom", command, cwd: scriptDir, status: "stopped" })
    .returning()
    .get().id;
}

beforeAll(async () => {
  fs.mkdirSync(scriptDir, { recursive: true });
  // 这个“服务”会再启动一个子进程，用来验证停止时整个进程树都会被结束
  fs.writeFileSync(
    path.join(scriptDir, "svc.cjs"),
    `const { spawn } = require("child_process");
const c = spawn(process.execPath, ["-e", "setInterval(() => {}, 1000)"], { stdio: "ignore" });
require("fs").writeFileSync(${JSON.stringify(childPidFile)}, String(c.pid));
console.log("ready");
console.error("something on stderr");
setInterval(() => {}, 1000);
`
  );
  const { initDb } = await import("@db/init");
  initDb();
  db = (await import("../queries/connection")).getDb();
  services = (await import("@db/schema")).services;
  pm = await import("./processManager");
});

afterAll(() => {
  pm?.cleanupProcesses();
});

describe("processManager", () => {
  it("启动、写带标签的日志、停止整个进程树，状态是“已停止”", async () => {
    const node = JSON.stringify(process.execPath);
    const id = addService("demo", `${node} "${path.join(scriptDir, "svc.cjs")}"`);

    const started = await pm.startService(id);
    expect(started.success).toBe(true);
    expect(await waitFor(() => pm.getServiceLogs(id).some((l) => l.includes("[STDOUT] ready")))).toBe(true);
    expect(await waitFor(() => fs.existsSync(childPidFile))).toBe(true);
    const childPid = Number(fs.readFileSync(childPidFile, "utf-8"));

    const logs = pm.getServiceLogs(id);
    expect(logs.some((l) => /^\[\d{4}-\d\d-\d\d \d\d:\d\d:\d\d\] \[INFO\] 启动服务：demo$/.test(l))).toBe(true);
    expect(await waitFor(() => pm.getServiceLogs(id).some((l) => l.includes("[STDERR] something on stderr")))).toBe(true);

    const stopped = await pm.stopService(id);
    expect(stopped.success).toBe(true);
    expect(await waitFor(() => !isAlive(childPid))).toBe(true);

    const status = await pm.getServiceStatus(id);
    expect(status.status).toBe("stopped");
    expect(await waitFor(() => pm.getServiceLogs(id).some((l) => l.includes("[INFO] 服务已停止")))).toBe(true);
  });

  it("进程自己异常退出时状态是“错误”，并记录退出码", async () => {
    const node = JSON.stringify(process.execPath);
    const id = addService("crash", `${node} -e "process.exit(3)"`);
    await pm.startService(id);
    expect(await waitFor(() => pm.getServiceLogs(id).some((l) => l.includes("[ERROR] 进程异常退出（退出码 3）")))).toBe(true);
    const row = db.select().from(services).all().find((s) => s.id === id);
    expect(row?.status).toBe("error");
  });

  it("工作目录不存在时直接报错，不会启动", async () => {
    const id = db
      .insert(services)
      .values({ name: "nocwd", type: "custom", command: "echo hi", cwd: path.join(dataDir, "不存在"), status: "stopped" })
      .returning()
      .get().id;
    const result = await pm.startService(id);
    expect(result.success).toBe(false);
  });
});
