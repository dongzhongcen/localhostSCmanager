# Service Manager（localhostSCmanager）

<p align="center">
  <img alt="TypeScript" src="https://img.shields.io/badge/typescript-5.x-blue">
  <img alt="React" src="https://img.shields.io/badge/react-19.x-61dafb">
  <img alt="Vite" src="https://img.shields.io/badge/vite-7.x-646cff">
  <img alt="Hono" src="https://img.shields.io/badge/hono-4.x-e36002">
  <img alt="tRPC" src="https://img.shields.io/badge/trpc-11.x-2596be">
  <img alt="SQLite" src="https://img.shields.io/badge/sqlite-better--sqlite3%2012.x-lightgrey">
  <img alt="Drizzle ORM" src="https://img.shields.io/badge/drizzle--orm-0.45-c5f74f">
  <img alt="Platform" src="https://img.shields.io/badge/platform-Windows%2010%20%7C%2011-0078d6">
  <img alt="License" src="https://img.shields.io/badge/license-GPL--3.0-blue">
</p>

Service Manager 是一个在 Windows 上统一管理本地服务（如 MySQL、Redis、Nginx）的本地 Web 工具，基于 Vite + React + Hono + tRPC 构建。项目目前实现了服务的添加、编辑、删除、启动、停止、重启，管理员权限（UAC）启动，开机自动启动，以及服务日志的查看和清理。源码以发布包 `ServiceManager-v1.0.0.zip` 的形式提供在仓库中。

## 功能特性

- **服务管理**：添加、编辑、删除服务，支持 MySQL / Redis / Nginx / 自定义四种类型，可配置启动命令、工作目录和 JSON 格式的环境变量。
- **启动 / 停止 / 重启**：通过本工具启动、停止和重启服务进程，删除服务前会自动停止该服务。
- **管理员权限**：勾选「需要管理员权限」的服务通过 Windows UAC 提权启动和停止。
- **自动启动**：勾选「开机自动启动」的服务会在服务管理器启动时自动启动。
- **日志查看**：查看服务最近 200 行输出，每 2 秒自动刷新，支持清空日志。
- **退出清理**：通过 `Ctrl + C` 关闭开发服务器时，会停止所有由本工具启动的服务。
- **本地持久化**：服务配置保存在 SQLite（better-sqlite3 + Drizzle ORM），首次启动自动建表。

## 项目结构

仓库根目录：

```text
.
├── ServiceManager-v1.0.0.zip   # 发布包（包含完整源码）
├── 使用说明.md                  # 详细使用说明和常见问题
├── build-release.ps1           # 打包脚本：清理后生成发布 zip
├── clean-for-release.ps1       # 清理脚本：删除 .env、数据库、日志、依赖和构建产物
└── LICENSE                     # GPL-3.0
```

发布包解压后：

```text
ServiceManager/
├── app/                        # 主应用（备用）
├── service-manager/
│   └── app/                    # 服务管理器主程序
│       ├── api/                # Hono + tRPC 后端，services/processManager.ts 负责进程管理
│       ├── src/                # React 前端（Tailwind CSS + shadcn/ui）
│       ├── db/                 # Drizzle Schema 和初始化
│       └── data/               # 运行数据（SQLite 数据库和日志）
└── 使用说明.md
```

## 快速开始

### 环境要求

- Windows 10 / Windows 11
- Node.js 20.19+ 或 22.12+（Vite 7 要求 `^20.19.0 || >=22.12.0`）
- npm

### 安装

解压 `ServiceManager-v1.0.0.zip` 到任意目录（例如 `D:\Tools\ServiceManager\`），然后安装依赖：

```powershell
cd ServiceManager\service-manager\app
npm install
```

### 启动

```powershell
npm run dev
```

开发服务器端口在 `vite.config.ts` 中配置为 `3000`，启动后在浏览器中打开 http://localhost:3000 。

如需以管理员身份启动整个开发服务器：

```powershell
npm run dev:admin
```

### 类型检查与代码检查

```powershell
npm run check   # TypeScript 类型检查
npm run lint
```

### 打包发布

在包含 `app/` 和 `service-manager/` 源码目录的工作目录中执行：

```powershell
.\build-release.ps1
```

脚本会先运行 `clean-for-release.ps1`，删除 `.env`、数据库、日志、`node_modules` 和 `dist`，再生成 `ServiceManager-v1.0.0.zip`。

更多服务启动命令示例（MySQL、Redis、Nginx）和常见问题见 [使用说明.md](使用说明.md)。

## 当前状态

项目已完成本地服务管理的核心功能，当前发布版本为 v1.0.0。本工具仅用于本地开发环境的服务管理，请勿用于生产环境；使用管理员权限启动服务时，请确保了解该服务的安全性。后续可继续完善：

- 将源码直接提交到仓库，而不仅以 zip 形式提供
- 统一 `使用说明.md` 中的 Node.js 版本和访问端口与实际配置
- 合并或移除发布包中重复的 `app/` 备用目录
- 清理脚手架遗留的依赖和配置（如 `mysql2`、`.env.example` 中的 MySQL / JWT 配置）
- 增加单元测试（已配置 vitest，但暂无测试文件）
- 让 `npm start` 在 Windows 下可用（当前使用 `NODE_ENV=production` 的 Unix 写法）

## 数据和敏感信息

运行数据（`data/services.db`、`data/logs/`）和 `.env` 文件不应提交或打包，发布前由 `clean-for-release.ps1` 清理。

## 许可证

本项目基于 [GPL-3.0](LICENSE) 许可证开源。
