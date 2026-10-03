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

Service Manager 是一个在 Windows 上统一管理本地服务（MySQL、Redis、Nginx 等）的小工具。在网页界面里添加服务的启动命令，就能一键启动、停止、重启，查看带标注的实时日志。

## 📢 公告

> **v1.1.0（2026-10-03）：双击 exe 就能用，告别命令行。**
>
> - 新增免安装的 `ServiceManager.exe`，自带运行环境，双击启动，托盘图标管理。
> - 日志每行带时间和 `INFO` / `STDOUT` / `STDERR` / `ERROR` 标签，可按标签筛选，中文输出不再乱码。
> - 修复停止服务后进程还在后台运行、停止后显示“错误”、带空格的路径无法启动、打包版无法启动等问题。
> - 安全：默认只允许本机访问管理界面。
>
> 从 v1.0.0 升级：把旧版的 `service-manager\app\data` 文件夹复制到新版 `ServiceManager.exe` 旁边即可保留配置。完整内容见 [CHANGELOG.md](CHANGELOG.md)。

## 下载和使用（推荐）

1. 到 [Releases](https://github.com/dongzhongcen/localhostSCmanager/releases) 下载 `ServiceManager-v1.1.0-win-x64.zip`。
2. 解压到任意目录，例如 `D:\Tools\ServiceManager\`。
3. 双击 `ServiceManager.exe`。

几秒后浏览器会自动打开管理界面（默认 http://localhost:3000 ），任务栏右下角出现托盘图标：

| 托盘菜单 | 作用 |
| --- | --- |
| 打开管理界面 | 在浏览器里打开（左键单击图标也可以） |
| 查看运行日志 | 打开 `data\logs` 文件夹 |
| 退出（停止所有服务） | 停止所有由本工具启动的服务，然后退出 |

不需要安装 Node.js，也不用打开命令行。再次双击 exe 不会重复启动，只会打开管理界面。

解压后的目录：

```text
ServiceManager/
├── ServiceManager.exe     # 双击启动
├── runtime/node.exe       # 自带的 Node 运行环境
├── app/                   # 后台程序和网页界面
├── data/                  # 首次运行时创建
│   ├── services.db        # 服务配置
│   └── logs/
│       ├── service_1.log  # 每个服务的日志
│       └── manager.log    # 管理器自己的运行日志，出问题先看这里
└── 使用说明.txt
```

服务启动命令示例（MySQL、Redis、Nginx）和常见问题见 [使用说明.md](使用说明.md)。

## 功能

- **服务管理**：添加、编辑、删除服务，支持 MySQL / Redis / Nginx / 自定义四种类型，可配置启动命令、工作目录和 JSON 格式的环境变量。
- **启动 / 停止 / 重启**：停止时会结束整个进程树，不会留下后台进程；删除服务前会自动停止。
- **管理员权限**：勾选「需要管理员权限」的服务通过 Windows UAC 提权启动和停止。
- **自动启动**：勾选「开机自动启动」的服务会在服务管理器启动时自动启动。
- **日志标注**：每行日志的格式是 `[2026-10-03 21:55:01] [STDOUT] 内容`，界面里按标签着色、可筛选，每 2 秒刷新。

  | 标签 | 含义 |
  | --- | --- |
  | `INFO` | 管理器自己的记录：启动命令、工作目录、停止、退出码 |
  | `STDOUT` | 服务的标准输出 |
  | `STDERR` | 服务的标准错误输出（很多程序也会把普通信息写在这里） |
  | `ERROR` | 出错：异常退出、命令不存在、工作目录不存在、提权失败 |

  管理员权限启动的服务不是本工具的子进程，它的输出只能原样写入日志，没有时间和标签。
- **更新公告**：界面右上角显示版本号，点击查看更新公告；升级后第一次打开会自动弹出。
- **退出清理**：从托盘退出或按 `Ctrl + C` 时，会停止所有由本工具启动的服务。
- **只允许本机访问**：默认监听 `127.0.0.1`，局域网里的其他电脑打不开管理界面。

## 开发

### 环境要求

- Node.js 20.19+ 或 22.12+（Vite 7 的要求）
- Go 1.24+（只有打包 exe 时需要）

### 项目结构

```text
.
├── app/                       # 主程序（Vite + React + Hono + tRPC）
│   ├── api/                   # 后端
│   │   ├── boot.ts            # 入口：tRPC、/api/health、/api/shutdown、静态文件
│   │   ├── lib/env.ts         # 配置：PORT、HOST、SM_DATA_DIR
│   │   └── services/
│   │       ├── processManager.ts  # 启动 / 停止进程、状态、日志
│   │       └── logFormat.ts       # 日志标注格式、GBK 转码
│   ├── contracts/version.ts   # 版本号和更新公告内容
│   ├── db/                    # Drizzle Schema 和初始化
│   ├── src/                   # React 前端（Tailwind CSS + shadcn/ui）
│   └── scripts/package-win.mjs  # 打包 Windows 免安装版
├── launcher/                  # ServiceManager.exe 启动器（Go，托盘图标）
├── .github/workflows/         # GitHub Actions：Windows 上自动打包和测试
├── CHANGELOG.md
└── 使用说明.md
```

### 常用命令

在 `app` 目录下：

```powershell
npm install
npm run dev          # 开发模式，http://localhost:3000
npm run dev:admin    # 以管理员身份运行开发服务器
npm run build        # 构建到 dist/
npm start            # 运行构建结果（生产模式）
npm test             # 单元测试
npm run check        # TypeScript 类型检查
npm run lint         # 代码检查
npm run package:win  # 打包成 release/ServiceManager-v<版本>-win-x64.zip
```

`npm run package:win` 在 Windows 和 Linux 上都能运行，会编译 `ServiceManager.exe`，并带上与当前 Node 同版本的 Windows 版 `node.exe` 和 better-sqlite3 预编译文件。

### 配置

都是可选的，见 `app/.env.example`：

| 变量 | 默认值 | 说明 |
| --- | --- | --- |
| `PORT` | `3000` | 管理界面端口 |
| `HOST` | `127.0.0.1` | 监听地址，改成 `0.0.0.0` 局域网也能访问（有安全风险） |
| `SM_DATA_DIR` | 启动目录下的 `data/` | 配置数据库和日志的位置；exe 版固定为程序目录下的 `data\` |

### 发布新版本

1. 修改 `app/package.json` 的 `version` 和 `app/contracts/version.ts`（版本号和更新公告）。
2. 在 `CHANGELOG.md` 和本 README 的公告里写上新版本内容，更新 `.github/release-notes.md`。
3. 合并到 `main` 后推送标签，例如 `git tag v1.1.0 && git push origin v1.1.0`，GitHub Actions 会自动打包并发布到 Releases。

## 注意

本工具只用于本地开发环境的服务管理，请勿用于生产环境。它会执行你填写的任意命令；使用管理员权限启动服务时，请确保了解该服务的安全性。

## 许可证

本项目基于 [GPL-3.0](LICENSE) 许可证开源。
