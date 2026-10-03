# Service Manager（localhostSCmanager）

<p align="center">
  <img alt="TypeScript" src="https://img.shields.io/badge/typescript-5.x-blue">
  <img alt="React" src="https://img.shields.io/badge/react-19.x-61dafb">
  <img alt="Vite" src="https://img.shields.io/badge/vite-7.x-646cff">
  <img alt="Hono" src="https://img.shields.io/badge/hono-4.x-e36002">
  <img alt="tRPC" src="https://img.shields.io/badge/trpc-11.x-2596be">
  <img alt="SQLite" src="https://img.shields.io/badge/sqlite-better--sqlite3%2012.x-lightgrey">
  <img alt="Go" src="https://img.shields.io/badge/launcher-Go-00add8">
  <img alt="Platform" src="https://img.shields.io/badge/platform-Windows%2010%20%7C%2011-0078d6">
  <img alt="License" src="https://img.shields.io/badge/license-GPL--3.0-blue">
</p>

这是我写的一个 Windows 本地服务管理小工具。本地开发时经常要同时开 MySQL、Redis、Nginx，每个都开一个命令行窗口很乱，关的时候还容易漏掉，所以我把它们集中到一个网页界面里：添加好启动命令后，就能一键启动、停止、重启，还能看带标注的实时日志。从 v1.1.0 开始，我把它打包成了双击就能用的 `ServiceManager.exe`，不用再装 Node、敲命令。

> 📢 **v1.1.0 公告（2026-10-03）**：新增免安装 exe 和托盘图标；日志每行带时间和标签，可按标签筛选；修复了停止服务后进程还留在后台等一批问题；默认只允许本机访问。详情见下方「当前状态」和 [CHANGELOG.md](CHANGELOG.md)。

## 功能特性

- **服务管理**：添加、编辑、删除服务，支持 MySQL / Redis / Nginx / 自定义四种类型，可以配置启动命令、工作目录和 JSON 格式的环境变量。
- **启动 / 停止 / 重启**：停止时我会结束整个进程树，不会留下 `mysqld.exe` 这类后台进程；删除服务前也会先自动停止。
- **管理员权限**：勾选「需要管理员权限」的服务，会通过 Windows UAC 提权启动和停止。
- **自动启动**：勾选「开机自动启动」的服务，会在服务管理器启动时自动启动。
- **日志标注**：每行日志的格式是 `[2026-10-03 21:55:01] [STDOUT] 内容`，界面里按标签着色、可以筛选，每 2 秒刷新；中文 Windows 上的 GBK 输出会自动转码。

  | 标签 | 含义 |
  | --- | --- |
  | `INFO` | 管理器自己的记录：启动命令、工作目录、停止、退出码 |
  | `STDOUT` | 服务的标准输出 |
  | `STDERR` | 服务的标准错误输出（很多程序也会把普通信息写在这里） |
  | `ERROR` | 出错：异常退出、命令不存在、工作目录不存在、提权失败 |

- **更新公告**：界面右上角显示版本号，点击可以看更新公告；升级后第一次打开会自动弹出。
- **exe 启动和托盘图标**：双击 `ServiceManager.exe` 在后台启动，不弹命令行窗口；托盘菜单可以打开界面、查看日志、退出（退出时停止所有服务）。
- **只允许本机访问**：默认只监听 `127.0.0.1`，局域网里的其他电脑打不开管理界面。
- **本地持久化**：服务配置保存在 SQLite（better-sqlite3 + Drizzle ORM），第一次启动时自动建表。

## 项目结构

仓库根目录：

```text
.
├── app/                         # 主程序（Vite + React + Hono + tRPC）
│   ├── api/                     # 后端
│   │   ├── boot.ts              # 入口：tRPC、/api/health、/api/shutdown、静态文件
│   │   ├── lib/env.ts           # 配置：PORT、HOST、SM_DATA_DIR
│   │   └── services/
│   │       ├── processManager.ts  # 启动 / 停止进程、状态、日志
│   │       └── logFormat.ts       # 日志标注格式、GBK 转码
│   ├── contracts/version.ts     # 版本号和更新公告内容
│   ├── db/                      # Drizzle Schema 和初始化
│   ├── src/                     # React 前端（Tailwind CSS + shadcn/ui）
│   └── scripts/package-win.mjs  # 打包 Windows 免安装版
├── launcher/                    # ServiceManager.exe 启动器（Go，托盘图标）
├── .github/workflows/           # GitHub Actions：在 Windows 上自动测试和打包
├── CHANGELOG.md                 # 更新日志
├── 使用说明.md                   # 详细使用说明和常见问题
└── LICENSE                      # GPL-3.0
```

免安装版解压后：

```text
ServiceManager/
├── ServiceManager.exe     # 双击启动
├── runtime/node.exe       # 自带的 Node 运行环境
├── app/                   # 后台程序和网页界面
├── data/                  # 第一次运行时创建
│   ├── services.db        # 服务配置
│   └── logs/
│       ├── service_1.log  # 每个服务的日志
│       └── manager.log    # 管理器自己的运行日志，出问题先看这里
└── 使用说明.txt
```

## 快速开始

### 方式一：双击 exe（推荐）

1. 到 [Releases](https://github.com/dongzhongcen/localhostSCmanager/releases) 下载 `ServiceManager-v1.1.0-win-x64.zip`。
2. 解压到任意目录，例如 `D:\Tools\ServiceManager\`。
3. 双击 `ServiceManager.exe`。

几秒后浏览器会自动打开管理界面（默认 http://localhost:3000 ，3000 被占用时会换成 3001～3010），任务栏右下角出现托盘图标：

| 托盘菜单 | 作用 |
| --- | --- |
| 打开管理界面 | 在浏览器里打开（左键单击图标也可以） |
| 查看运行日志 | 打开 `data\logs` 文件夹 |
| 退出（停止所有服务） | 停止所有由本工具启动的服务，然后退出 |

我把 Node 运行环境一起打包进去了，所以不需要另外安装 Node.js。再次双击 exe 不会重复启动，只会打开管理界面。

### 方式二：从源码运行

环境要求：

- Windows 10 / Windows 11
- Node.js 20.19+ 或 22.12+（Vite 7 要求 `^20.19.0 || >=22.12.0`）
- Go 1.24+（只有打包 exe 时需要）

在 `app` 目录下：

```powershell
cd app
npm install
npm run dev          # 开发模式，打开 http://localhost:3000
npm run dev:admin    # 以管理员身份运行开发服务器
npm run build        # 构建到 dist/
npm start            # 运行构建结果（生产模式）
```

### 测试与代码检查

```powershell
npm test             # 单元测试（vitest）
npm run check        # TypeScript 类型检查
npm run lint
```

### 配置

都是可选的，见 `app/.env.example`：

| 变量 | 默认值 | 说明 |
| --- | --- | --- |
| `PORT` | `3000` | 管理界面端口 |
| `HOST` | `127.0.0.1` | 监听地址，改成 `0.0.0.0` 局域网也能访问（有安全风险） |
| `SM_DATA_DIR` | 启动目录下的 `data/` | 配置数据库和日志的位置；exe 版固定为程序目录下的 `data\` |

### 打包发布

```powershell
npm run package:win
```

会生成 `release/ServiceManager-v<版本>-win-x64.zip`，里面有编译好的 `ServiceManager.exe`、与当前 Node 同版本的 Windows 版 `node.exe` 和 better-sqlite3 预编译文件。这个脚本在 Windows 和 Linux 上都能跑。

我自己发新版本的步骤：

1. 改 `app/package.json` 的 `version` 和 `app/contracts/version.ts`（版本号和更新公告）。
2. 更新 `CHANGELOG.md`、本 README 的公告和 `.github/release-notes.md`。
3. 合并到 `main` 后推送标签，例如 `git tag v1.1.0 && git push origin v1.1.0`，GitHub Actions 会自动打包并发布到 Releases。

MySQL、Redis、Nginx 的启动命令示例和常见问题，我整理在 [使用说明.md](使用说明.md) 里。

## 当前状态

当前版本是 **v1.1.0**（2026-10-03），这一版的重点是双击 exe 就能用，告别命令行：

- 新增 `ServiceManager.exe` 和托盘图标，自带运行环境，免安装。
- 日志每行带时间和 `INFO` / `STDOUT` / `STDERR` / `ERROR` 标签，界面里可以按标签筛选，中文输出不再乱码。
- 修复了停止服务后进程还在后台运行、主动停止后显示“错误”、带空格的路径无法启动、打包版无法启动、数据位置跟着启动目录走等问题。
- 安全上，现在默认只监听本机，之前同一局域网的人也能打开界面执行命令。
- 源码直接放在仓库的 `app/` 里，不再以 zip 形式提交；补上了单元测试和 GitHub Actions 自动构建。

如果你在用 v1.0.0，把旧版的 `service-manager\app\data` 文件夹复制到新版 `ServiceManager.exe` 旁边，原来的配置就都还在。完整改动我记在了 [CHANGELOG.md](CHANGELOG.md)。

还有一个已知限制：管理员权限启动的服务不是本工具的子进程，我拿不到它的输出流，只能原样写入日志，所以这类日志没有时间和标签。

这个工具是我为本地开发环境写的，请不要用在生产环境。它会执行你填写的任意命令，用管理员权限启动服务前，请先确认你了解这个服务的安全性。有问题或建议欢迎提 [Issue](https://github.com/dongzhongcen/localhostSCmanager/issues)。

## 数据和敏感信息

运行数据（`data/services.db`、`data/logs/`）和 `.env` 文件已经加进 `.gitignore`，不会被提交；打包脚本也只会打包程序本身，不会带上你的数据。

## 许可证

本项目基于 [GPL-3.0](LICENSE) 许可证开源。
