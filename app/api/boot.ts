import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import type { HttpBindings } from "@hono/node-server";
import { fetchRequestHandler } from "@trpc/server/adapters/fetch";
import { appRouter } from "./router";
import { createContext } from "./context";
import { env } from "./lib/env";
import { initDb } from "@db/init";
import { autoStartServices, cleanupProcesses } from "./services/processManager";
import readline from "readline";
import { APP_VERSION } from "@contracts/version";

const app = new Hono<{ Bindings: HttpBindings }>();

app.use(bodyLimit({ maxSize: 50 * 1024 * 1024 }));
app.use("/api/trpc/*", async (c) => {
  return fetchRequestHandler({
    endpoint: "/api/trpc",
    req: c.req.raw,
    router: appRouter,
    createContext,
  });
});
// 健康检查：exe 启动器用它判断服务是否已经就绪
app.get("/api/health", (c) => c.json({ ok: true, name: "localhost-sc-manager", version: APP_VERSION }));

// 退出：exe 启动器在托盘点“退出”时调用，先停掉所有服务再退出。
// 必须带上启动器生成的口令，网页或其他程序不能随便让它退出。
app.post("/api/shutdown", (c) => {
  if (!env.shutdownToken || c.req.header("x-shutdown-token") !== env.shutdownToken) {
    return c.json({ error: "Forbidden" }, 403);
  }
  setTimeout(() => {
    console.log("收到退出请求，正在停止所有服务...");
    cleanupProcesses();
    process.exit(0);
  }, 100);
  return c.json({ ok: true });
});

app.all("/api/*", (c) => c.json({ error: "Not Found" }, 404));

// Initialize database
initDb();

// Auto-start services
autoStartServices().catch(console.error);

// Enable SIGINT on Windows (Ctrl+C in CMD/PowerShell)
// 只在有控制台的时候需要；exe 启动器在后台运行，没有可交互的 stdin
if (process.platform === "win32" && process.stdin.isTTY) {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });
  rl.on("SIGINT", () => {
    process.emit("SIGINT", "SIGINT");
  });
}

// Handle cleanup on shutdown
process.on("SIGINT", () => {
  console.log("\nShutting down, stopping services...");
  cleanupProcesses();
  process.exit(0);
});

process.on("SIGTERM", () => {
  cleanupProcesses();
  process.exit(0);
});

// Fallback: also cleanup on normal exit
process.on("exit", () => {
  cleanupProcesses();
});

export default app;

if (env.isProduction) {
  const { serve } = await import("@hono/node-server");
  const { serveStaticFiles } = await import("./lib/vite");
  serveStaticFiles(app);

  const server = serve({ fetch: app.fetch, port: env.port, hostname: env.host }, () => {
    console.log(`服务管理器 v${APP_VERSION} 已启动：http://localhost:${env.port}/`);
    console.log(`数据目录：${env.dataDir}`);
  });
  server.on("error", (err: NodeJS.ErrnoException) => {
    if (err.code === "EADDRINUSE") {
      console.error(`端口 ${env.port} 已被占用，请关闭占用它的程序，或者用 PORT 换一个端口`);
    } else {
      console.error(err);
    }
    process.exit(1);
  });
}
