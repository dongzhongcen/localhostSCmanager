import { spawn, spawnSync, type ChildProcess, exec } from "child_process";
import { promisify } from "util";
import { getDb } from "../queries/connection";
import { services } from "@db/schema";
import { eq } from "drizzle-orm";
import path from "path";
import fs from "fs";
import { env as appEnv } from "../lib/env";
import { createLineTagger, formatLine, type LogTag } from "./logFormat";

const execAsync = promisify(exec);
const isWindows = process.platform === "win32";

/** 由本工具直接启动（非提权）的进程 */
const runningProcesses = new Map<number, ChildProcess>();
/** 正在被主动停止的服务：它们退出时记为“已停止”而不是“出错” */
const stoppingServices = new Set<number>();

const logsDir = appEnv.logsDir;

function getLogPath(serviceId: number) {
  return path.join(logsDir, `service_${serviceId}.log`);
}

/** 追加一行带时间和标签的日志；文件被其他进程占用时忽略 */
function appendLog(serviceId: number, tag: LogTag, text: string) {
  try {
    fs.appendFileSync(getLogPath(serviceId), formatLine(tag, text));
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== "EBUSY") throw err;
  }
}

export function parseCommand(command: string) {
  // Simple command parsing - handle quotes
  const args: string[] = [];
  let current = "";
  let inQuotes = false;
  let quoteChar = "";

  for (let i = 0; i < command.length; i++) {
    const char = command[i];
    if (!inQuotes && (char === '"' || char === "'")) {
      inQuotes = true;
      quoteChar = char;
    } else if (inQuotes && char === quoteChar) {
      inQuotes = false;
      quoteChar = "";
    } else if (!inQuotes && char === " ") {
      if (current) {
        args.push(current);
        current = "";
      }
    } else {
      current += char;
    }
  }

  if (current) {
    args.push(current);
  }

  return {
    command: args[0] || "",
    args: args.slice(1),
  };
}

/** 从启动命令推出可执行文件名，比如 "C:\\Redis\\redis-server.exe" a.conf → redis-server.exe */
function getExeName(command: string) {
  const { command: cmd } = parseCommand(command);
  let exeName = path.win32.basename(cmd);
  if (isWindows && exeName && !exeName.includes(".")) exeName += ".exe";
  return exeName;
}

async function isProcessRunningAsync(pid: number): Promise<boolean> {
  if (isWindows) {
    try {
      const { stdout } = await execAsync(`tasklist /FI "PID eq ${pid}" /NH /FO CSV`);
      return stdout.includes(`"${pid}"`);
    } catch {
      // fall through
    }
  }
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

async function findProcessByName(name: string): Promise<number | null> {
  if (!isWindows) return null;
  try {
    // CSV 格式："mysqld.exe","1234","Console","1","12,345 K"
    const { stdout } = await execAsync(`tasklist /FI "IMAGENAME eq ${name}" /NH /FO CSV`);
    const match = stdout.match(/^"[^"]+","(\d+)"/m);
    return match ? parseInt(match[1], 10) : null;
  } catch {
    return null;
  }
}

/**
 * 结束整个进程树。
 * 启动命令是通过 shell 运行的（Windows 上是 cmd.exe），只杀 shell 的话，
 * 真正的服务进程（mysqld.exe、redis-server.exe……）会继续在后台运行，
 * 所以 Windows 上用 taskkill /T 连子进程一起结束，其他系统杀整个进程组。
 */
function killTree(pid: number, sync = false) {
  if (isWindows) {
    const args = ["/PID", pid.toString(), "/T", "/F"];
    if (sync) {
      spawnSync("taskkill", args, { windowsHide: true });
    } else {
      spawn("taskkill", args, { windowsHide: true }).on("error", () => {});
    }
    return;
  }
  try {
    process.kill(-pid, "SIGTERM");
  } catch {
    try {
      process.kill(pid, "SIGTERM");
    } catch {
      // already dead
    }
  }
}

async function stopElevatedProcess(pid: number): Promise<boolean> {
  const psScript = `
    try {
      $psi = New-Object System.Diagnostics.ProcessStartInfo;
      $psi.FileName = "taskkill";
      $psi.Arguments = "/PID ${pid} /F /T";
      $psi.Verb = "runAs";
      $psi.WindowStyle = "Hidden";
      $psi.UseShellExecute = $true;
      [System.Diagnostics.Process]::Start($psi) | Out-Null
      Write-Output "ok"
    } catch {
      Write-Error $_.Exception.Message
      exit 1
    }
  `;

  return new Promise((resolve) => {
    const ps = spawn("powershell", ["-NoProfile", "-Command", psScript], {
      windowsHide: true,
    });

    let errorOutput = "";

    ps.stderr?.on("data", (data: Buffer) => {
      errorOutput += data.toString();
    });

    ps.on("close", (code) => {
      if (code !== 0) {
        console.error(`Failed to stop elevated process ${pid}:`, errorOutput.trim());
        resolve(false);
      } else {
        resolve(true);
      }
    });

    ps.on("error", () => resolve(false));
  });
}

function buildEnv(envVars: string | null) {
  const env: Record<string, string> = {};
  for (const [key, value] of Object.entries(process.env)) {
    if (value !== undefined) env[key] = value;
  }
  // 这些是服务管理器自己的配置，不需要传给被管理的服务
  delete env.SM_SHUTDOWN_TOKEN;
  if (envVars) {
    try {
      Object.assign(env, JSON.parse(envVars));
    } catch {
      // Ignore invalid env JSON
    }
  }
  return env;
}

export async function startService(serviceId: number) {
  const db = getDb();
  const service = db.select().from(services).where(eq(services.id, serviceId)).get();

  if (!service) {
    throw new Error("Service not found");
  }

  // Check if already running by PID
  if (service.pid && (await isProcessRunningAsync(service.pid))) {
    return { success: true, message: "Service is already running", pid: service.pid };
  }

  // For elevated starts, also check by process name if PID is missing
  if (!service.pid && service.status === "running" && service.requireAdmin && isWindows) {
    const exeName = getExeName(service.command);
    if (exeName) {
      const foundPid = await findProcessByName(exeName);
      if (foundPid) {
        db.update(services).set({ pid: foundPid }).where(eq(services.id, serviceId)).run();
        return { success: true, message: "Service is already running", pid: foundPid };
      }
    }
  }

  const { command, args } = parseCommand(service.command);
  if (!command) {
    throw new Error("Invalid command");
  }

  const env = buildEnv(service.envVars);
  const cwd = service.cwd || process.cwd();

  if (cwd && !fs.existsSync(cwd)) {
    appendLog(serviceId, "ERROR", `工作目录不存在：${cwd}`);
    db.update(services).set({ status: "error", pid: null }).where(eq(services.id, serviceId)).run();
    return { success: false, message: `工作目录不存在：${cwd}` };
  }

  // Use elevated privileges on Windows if required
  if (service.requireAdmin && isWindows) {
    return startElevatedService(service, serviceId, command, args, env);
  }

  const logStream = fs.createWriteStream(getLogPath(serviceId), { flags: "a" });
  const write = (line: string) => logStream.write(line);
  write(formatLine("INFO", `启动服务：${service.name}`));
  write(formatLine("INFO", `命令：${service.command}`));
  write(formatLine("INFO", `工作目录：${cwd}`));

  // 整条命令原样交给 shell 执行，保留用户写的引号，
  // 这样 "C:\Program Files\..." 这类带空格的路径不会被拆开
  const child = spawn(service.command, {
    cwd,
    env,
    shell: true,
    detached: !isWindows, // 非 Windows 下单独成组，方便整组结束
    windowsHide: true, // Hide console window on Windows
  });

  runningProcesses.set(serviceId, child);

  const out = createLineTagger("STDOUT", write);
  const err = createLineTagger("STDERR", write);
  child.stdout?.on("data", (data: Buffer) => out.push(data));
  child.stderr?.on("data", (data: Buffer) => err.push(data));

  let finished = false;
  const finish = (status: "stopped" | "error", message: string, tag: LogTag) => {
    if (finished) return;
    finished = true;
    out.flush();
    err.flush();
    write(formatLine(tag, message));
    logStream.end();

    // 只有当前记录的还是这个进程时才更新，避免覆盖重启后新进程的状态
    if (runningProcesses.get(serviceId) === child) {
      runningProcesses.delete(serviceId);
    }
    const current = db.select().from(services).where(eq(services.id, serviceId)).get();
    if (current && (current.pid === child.pid || current.pid === null)) {
      db.update(services).set({ status, pid: null }).where(eq(services.id, serviceId)).run();
    }
  };

  child.on("exit", (code, signal) => {
    const stopping = stoppingServices.delete(serviceId);
    if (stopping) {
      finish("stopped", "服务已停止", "INFO");
    } else if (code === 0) {
      finish("stopped", "进程正常退出（退出码 0）", "INFO");
    } else {
      finish("error", `进程异常退出（退出码 ${code ?? "无"}${signal ? `，信号 ${signal}` : ""}）`, "ERROR");
    }
  });

  child.on("error", (e) => {
    stoppingServices.delete(serviceId);
    finish("error", `启动失败：${e.message}`, "ERROR");
  });

  const pid = child.pid;
  if (pid) {
    db.update(services).set({ status: "running", pid }).where(eq(services.id, serviceId)).run();
  }

  return { success: true, message: "Service started", pid };
}
async function startElevatedService(
  service: typeof services.$inferSelect,
  serviceId: number,
  command: string,
  args: string[],
  env: Record<string, string>
) {
  const db = getDb();
  const logPath = getLogPath(serviceId);
  const cwd = service.cwd || process.cwd();

  appendLog(serviceId, "INFO", `启动服务（管理员权限）：${service.name}`);
  appendLog(serviceId, "INFO", `命令：${service.command}`);
  appendLog(serviceId, "INFO", `工作目录：${cwd}`);
  appendLog(serviceId, "INFO", "提示：管理员权限启动的服务，输出会原样写入日志，不带时间和标签");

  // 提权后的进程不是本程序的子进程，拿不到它的输出流，
  // 只能写一个批处理脚本，把输出重定向到日志文件
  const batchPath = path.join(logsDir, `run_service_${serviceId}.bat`);
  const batchLines = [
    "@echo off",
    "chcp 65001 >nul", // 批处理按 UTF-8 写入，切到 UTF-8 代码页，中文路径才不会乱
    ...Object.entries(env).map(([k, v]) => `set "${k}=${v.replace(/"/g, '\\"')}"`),
    `cd /d "${cwd}"`,
    `"${command}" ${args
      .map((a) => {
        if (a.includes(" ") || a.includes('"')) {
          return `"${a.replace(/"/g, '\\"')}"`;
        }
        return a;
      })
      .join(" ")} >> "${logPath}" 2>&1`,
  ];
  fs.writeFileSync(batchPath, batchLines.join("\r\n"));

  const psScript = `
    $batchPath = '${batchPath.replace(/'/g, "''")}';
    try {
      $proc = Start-Process -FilePath $batchPath -Verb runAs -WindowStyle Hidden -PassThru
      if ($proc.Id) {
        Write-Output $proc.Id
      } else {
        Write-Error "Failed to get process ID"
        exit 1
      }
    } catch {
      Write-Error $_.Exception.Message
      exit 1
    }
  `;

  return new Promise<{ success: boolean; message: string; pid?: number }>((resolve) => {
    const ps = spawn("powershell", ["-NoProfile", "-Command", psScript], {
      windowsHide: true,
    });

    let output = "";
    let errorOutput = "";

    ps.stdout?.on("data", (data: Buffer) => {
      output += data.toString();
    });

    ps.stderr?.on("data", (data: Buffer) => {
      errorOutput += data.toString();
    });

    ps.on("close", (code) => {
      if (code !== 0) {
        const errMsg = errorOutput.trim() || "提权启动失败（可能在 UAC 弹窗里点了“否”）";
        appendLog(serviceId, "ERROR", errMsg);
        db.update(services).set({ status: "error", pid: null }).where(eq(services.id, serviceId)).run();
        resolve({ success: false, message: errMsg });
        return;
      }

      const pidMatch = output.trim().match(/\d+/);
      const pid = pidMatch ? parseInt(pidMatch[0], 10) : undefined;
      db.update(services)
        .set({ status: "running", pid: pid ?? null })
        .where(eq(services.id, serviceId))
        .run();
      resolve({
        success: true,
        message: pid ? "Service started with admin privileges" : "Service started with admin privileges (PID unavailable)",
        pid,
      });
    });

    ps.on("error", (err) => {
      appendLog(serviceId, "ERROR", `无法调用 PowerShell：${err.message}`);
      db.update(services).set({ status: "error", pid: null }).where(eq(services.id, serviceId)).run();
      resolve({ success: false, message: err.message });
    });
  });
}

function waitForExit(child: ChildProcess, timeoutMs: number) {
  return new Promise<boolean>((resolve) => {
    if (child.exitCode !== null || child.signalCode !== null) return resolve(true);
    const timer = setTimeout(() => resolve(false), timeoutMs);
    child.once("exit", () => {
      clearTimeout(timer);
      resolve(true);
    });
  });
}

export async function stopService(serviceId: number) {
  const db = getDb();
  const service = db.select().from(services).where(eq(services.id, serviceId)).get();

  if (!service) {
    throw new Error("Service not found");
  }

  let targetPid = service.pid;

  // If PID is missing for an elevated process, try to find it by process name
  if (!targetPid && service.requireAdmin && isWindows) {
    const exeName = getExeName(service.command);
    if (exeName) {
      targetPid = await findProcessByName(exeName);
    }
  }

  let stopped = false;
  const child = runningProcesses.get(serviceId);

  if (service.requireAdmin && isWindows && targetPid) {
    // 管理员权限启动的进程，要再弹一次 UAC 才能结束
    stopped = await stopElevatedProcess(targetPid);
    if (stopped) appendLog(serviceId, "INFO", "服务已停止（管理员权限）");
  } else if (child && child.pid) {
    stoppingServices.add(serviceId);
    killTree(child.pid);
    stopped = await waitForExit(child, 5000);
    if (!stopped && !isWindows) {
      // SIGTERM 5 秒还没退出，强制结束
      try {
        process.kill(-child.pid, "SIGKILL");
      } catch {
        // ignore
      }
      stopped = await waitForExit(child, 2000);
    }
  } else if (targetPid) {
    // 进程不是这次启动的（比如服务管理器重启过），按 PID 结束
    if (await isProcessRunningAsync(targetPid)) {
      killTree(targetPid, true);
    }
    stopped = !(await isProcessRunningAsync(targetPid));
    if (stopped) appendLog(serviceId, "INFO", `已按 PID ${targetPid} 结束服务`);
  } else {
    // 没有记录到任何进程，视为已停止
    stopped = true;
  }

  if (stopped) {
    db.update(services).set({ status: "stopped", pid: null }).where(eq(services.id, serviceId)).run();
  } else {
    stoppingServices.delete(serviceId);
  }

  return { success: stopped, message: stopped ? "Service stopped" : "Failed to stop service (UAC may be required)" };
}

export async function restartService(serviceId: number) {
  const result = await stopService(serviceId);
  if (!result.success) return result;
  // 给端口释放留一点时间
  await new Promise((resolve) => setTimeout(resolve, 500));
  return startService(serviceId);
}

export function getServiceLogs(serviceId: number, lines: number = 100) {
  const logPath = getLogPath(serviceId);

  if (!fs.existsSync(logPath)) {
    return [];
  }

  const content = fs.readFileSync(logPath, "utf-8");
  const allLines = content.split(/\r?\n/).filter((l) => l.trim());
  return allLines.slice(-lines);
}

export function clearServiceLogs(serviceId: number) {
  const logPath = getLogPath(serviceId);
  if (fs.existsSync(logPath)) {
    try {
      fs.writeFileSync(logPath, "");
    } catch {
      // Ignore errors (file may be locked by a running process)
    }
  }
}

export async function getServiceStatus(serviceId: number) {
  const db = getDb();
  const service = db.select().from(services).where(eq(services.id, serviceId)).get();

  if (!service) {
    return { status: "stopped", pid: null };
  }

  if (!service.pid) {
    if (service.status === "running") {
      // Try to find process by executable name for elevated starts with missing PID
      const exeName = getExeName(service.command);
      if (exeName) {
        const foundPid = await findProcessByName(exeName);
        if (foundPid) {
          db.update(services).set({ pid: foundPid }).where(eq(services.id, serviceId)).run();
          return { status: "running", pid: foundPid };
        }
      }
      // Trust the database status if process not found yet
      return { status: "running", pid: null };
    }
    return { status: service.status, pid: null };
  }

  const running = await isProcessRunningAsync(service.pid);

  if (!running && service.status === "running") {
    // Process died but db still shows running
    db.update(services).set({ status: "stopped", pid: null }).where(eq(services.id, serviceId)).run();
    return { status: "stopped", pid: null };
  }

  return { status: running ? "running" : service.status, pid: service.pid };
}

/**
 * 退出时结束所有服务。
 * 会在 process.on("exit") 里调用，那里不能等异步操作，所以全部用同步方式结束进程。
 */
export function cleanupProcesses() {
  for (const [id, child] of runningProcesses.entries()) {
    if (!child.pid) continue;
    stoppingServices.add(id);
    killTree(child.pid, true);
  }
  runningProcesses.clear();

  try {
    const db = getDb();
    const runningServices = db.select().from(services).where(eq(services.status, "running")).all();
    for (const service of runningServices) {
      if (service.pid && !(service.requireAdmin && isWindows)) {
        killTree(service.pid, true);
      }
      appendLog(service.id, "INFO", "服务管理器退出，服务已停止");
    }
    db.update(services).set({ status: "stopped", pid: null }).where(eq(services.status, "running")).run();
  } catch {
    // Ignore errors during cleanup
  }
}

// Auto-start services on boot
export async function autoStartServices() {
  const db = getDb();
  const autoStartServices = db.select().from(services).where(eq(services.autoStart, true)).all();

  for (const service of autoStartServices) {
    // Skip services that require admin on Windows - UAC prompt during boot is not ideal
    if (service.requireAdmin && isWindows) {
      console.log(`Skipping auto-start for service ${service.name} (requires admin privileges)`);
      continue;
    }
    try {
      await startService(service.id);
    } catch (err) {
      console.error(`Failed to auto-start service ${service.name}:`, err);
    }
  }
}
