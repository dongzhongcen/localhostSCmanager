import "dotenv/config";
import fs from "fs";
import path from "path";

/**
 * 运行配置。
 * - SM_DATA_DIR：数据目录（SQLite 数据库和日志），默认是启动目录下的 data/。
 *   exe 启动器会把它设成 exe 所在目录下的 data/，所以从哪里双击都不会乱放文件。
 * - PORT：管理界面端口，默认 3000。
 * - HOST：监听地址，默认只监听本机 127.0.0.1，局域网里的其他电脑访问不到。
 * - SM_SHUTDOWN_TOKEN：exe 启动器用来请求“停止所有服务并退出”的口令，命令行启动时不需要。
 */
const dataDir = path.resolve(process.env.SM_DATA_DIR || path.join(process.cwd(), "data"));
const logsDir = path.join(dataDir, "logs");
fs.mkdirSync(logsDir, { recursive: true });

export const env = {
  isProduction: process.env.NODE_ENV === "production",
  dataDir,
  logsDir,
  port: parseInt(process.env.PORT || "3000", 10),
  host: process.env.HOST || "127.0.0.1",
  shutdownToken: process.env.SM_SHUTDOWN_TOKEN || "",
};
