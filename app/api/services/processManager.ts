import { spawn, type ChildProcess, exec } from "child_process";
import { promisify } from "util";
import { getDb } from "../queries/connection";
import { services } from "@db/schema";
import { eq } from "drizzle-orm";
import path from "path";
import fs from "fs";

const execAsync = promisify(exec);

const runningProcesses = new Map<number, ChildProcess>();

// Ensure logs directory exists
const logsDir = path.join(process.cwd(), "data", "logs");
if (!fs.existsSync(logsDir)) {
  fs.mkdirSync(logsDir, { recursive: true });
}

function getLogPath(serviceId: number) {
  return path.join(logsDir, `service_${serviceId}.log`);
}

function parseCommand(command: string) {
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

async function isProcessRunningAsync(pid: number): Promise<boolean> {
  if (process.platform === "win32") {
    try {
      const { stdout } = await execAsync(`tasklist /FI "PID eq ${pid}" /NH`);
      return stdout.includes(pid.toString());
    } catch {
      // Fallback to process.kill for quick check
      try {
        process.kill(pid, 0);
        return true;
      } catch {
        return false;
      }
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
  if (process.platform !== "win32") return null;
  try {
    const { stdout } = await execAsync(`tasklist /FI "IMAGENAME eq ${name}" /NH`);
    const lines = stdout.trim().split("\n").filter((l) => l.trim());
    if (lines.length === 0) return null;
    const match = lines[0].match(/\s+(\d+)\s+/);
    return match ? parseInt(match[1], 10) : null;
  } catch {
    return null;
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
  if (!service.pid && service.status === "running" && service.requireAdmin && process.platform === "win32") {
    const { command: cmd } = parseCommand(service.command);
    let exeName = path.basename(cmd);
    if (exeName && !exeName.includes(".")) exeName += ".exe";
    if (exeName) {
      const foundPid = await findProcessByName(exeName);
      if (foundPid) {
        db.update(services)
          .set({ pid: foundPid })
          .where(eq(services.id, serviceId))
          .run();
        return { success: true, message: "Service is already running", pid: foundPid };
      }
    }
  }

  const { command, args } = parseCommand(service.command);
  
  if (!command) {
    throw new Error("Invalid command");
  }

  // Parse environment variables
  const env: Record<string, string> = {};
  if (process.env) {
    for (const [key, value] of Object.entries(process.env)) {
      if (value !== undefined) {
        env[key] = value;
      }
    }
  }
  if (service.envVars) {
    try {
      const customEnv = JSON.parse(service.envVars);
      Object.assign(env, customEnv);
    } catch {
      // Ignore invalid env JSON
    }
  }

  // Use elevated privileges on Windows if required
  if (service.requireAdmin && process.platform === "win32") {
    return startElevatedService(service, serviceId, command, args, env);
  }

  // Open log file
  const logPath = getLogPath(serviceId);
  const logStream = fs.createWriteStream(logPath, { flags: "a" });

  const now = new Date().toISOString();
  logStream.write(`\n[${now}] Starting service: ${service.name}\n`);
  logStream.write(`[${now}] Command: ${service.command}\n`);

  const child = spawn(command, args, {
    cwd: service.cwd || process.cwd(),
    env,
    detached: false,
    shell: true,
    windowsHide: true, // Hide console window on Windows
  });

  // Store reference
  runningProcesses.set(serviceId, child);

  child.stdout?.on("data", (data: Buffer) => {
    logStream.write(`[${new Date().toISOString()}] [STDOUT] ${data.toString()}`);
  });

  child.stderr?.on("data", (data: Buffer) => {
    logStream.write(`[${new Date().toISOString()}] [STDERR] ${data.toString()}`);
  });

  child.on("exit", (code) => {
    const exitTime = new Date().toISOString();
    logStream.write(`[${exitTime}] Process exited with code ${code}\n`);
    logStream.end();

    runningProcesses.delete(serviceId);

    // Update status in database
    db.update(services)
      .set({
        status: code === 0 ? "stopped" : "error",
        pid: null,
      })
      .where(eq(services.id, serviceId))
      .run();
  });

  child.on("error", (err) => {
    logStream.write(`[${new Date().toISOString()}] [ERROR] ${err.message}\n`);
    logStream.end();
    runningProcesses.delete(serviceId);

    db.update(services)
      .set({
        status: "error",
        pid: null,
      })
      .where(eq(services.id, serviceId))
      .run();
  });

  // Update database with PID
  const pid = child.pid;
  if (pid) {
    db.update(services)
      .set({
        status: "running",
        pid,
      })
      .where(eq(services.id, serviceId))
      .run();
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

  // Write startup log (skip if file is locked by a running process)
  const now = new Date().toISOString();
  try {
    fs.appendFileSync(logPath, `\n[${now}] Starting service (admin elevated): ${service.name}\n`);
    fs.appendFileSync(logPath, `[${now}] Command: ${service.command}\n`);
  } catch (err: any) {
    if (err.code !== "EBUSY") throw err;
    // File is locked by a running process; startup info will be in the batch file output
  }

  // Build a batch script that sets env vars, changes dir, runs the command and redirects output
  const batchPath = path.join(logsDir, `run_service_${serviceId}.bat`);
  const batchLines = [
    "@echo off",
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

  // Use PowerShell to start the batch file directly with elevation
  // (Windows will auto-use cmd.exe to run .bat files)
  const psScript = `
    $batchPath = '${batchPath}';
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

  return new Promise<{ success: boolean; message: string; pid?: number }>((resolve, reject) => {
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
      fs.appendFileSync(logPath, `[${new Date().toISOString()}] [PS-ERR] ${data.toString()}`);
    });

    ps.on("close", (code) => {
      if (code !== 0) {
        const errMsg = errorOutput.trim() || "Failed to start elevated process";
        fs.appendFileSync(logPath, `[${new Date().toISOString()}] [ERROR] ${errMsg}\n`);
        db.update(services)
          .set({ status: "error", pid: null })
          .where(eq(services.id, serviceId))
          .run();
        resolve({ success: false, message: errMsg });
        return;
      }

      const pidMatch = output.trim().match(/\d+/);
      const pid = pidMatch ? parseInt(pidMatch[0], 10) : NaN;
      if (!isNaN(pid)) {
        // Create a minimal ChildProcess-like object for tracking
        const mockChild = {
          pid,
          killed: false,
          kill: (_signal?: string) => {
            try {
              spawn("taskkill", ["/PID", pid.toString(), "/F", "/T"], { windowsHide: true });
            } catch {
              // ignore
            }
          },
          stdout: null,
          stderr: null,
          on: () => {},
        } as unknown as ChildProcess;

        runningProcesses.set(serviceId, mockChild);

        db.update(services)
          .set({ status: "running", pid })
          .where(eq(services.id, serviceId))
          .run();

        resolve({ success: true, message: "Service started with admin privileges", pid });
      } else {
        // UAC may have been shown but we couldn't capture PID
        db.update(services)
          .set({ status: "running", pid: null })
          .where(eq(services.id, serviceId))
          .run();

        resolve({ success: true, message: "Service started with admin privileges (PID unavailable)", pid: undefined });
      }
    });

    ps.on("error", (err) => {
      fs.appendFileSync(logPath, `[${new Date().toISOString()}] [ERROR] ${err.message}\n`);
      reject(err);
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
  if (!targetPid && service.requireAdmin && process.platform === "win32") {
    const { command: cmd } = parseCommand(service.command);
    let exeName = path.basename(cmd);
    if (exeName && !exeName.includes(".")) exeName += ".exe";
    if (exeName) {
      targetPid = await findProcessByName(exeName);
    }
  }

  let stopped = false;

  // For elevated Windows processes, use UAC to run taskkill
  if (service.requireAdmin && process.platform === "win32" && targetPid) {
    stopped = await stopElevatedProcess(targetPid);
  } else {
    const child = runningProcesses.get(serviceId);

    if (child) {
      // Try graceful kill first
      child.kill("SIGTERM");
      
      // Force kill after 5 seconds if still running
      setTimeout(() => {
        if (!child.killed) {
          child.kill("SIGKILL");
        }
      }, 5000);

      runningProcesses.delete(serviceId);
      stopped = true;
    } else if (targetPid) {
      // Try to kill by PID if we have it but not in memory
      if (process.platform === "win32") {
        try {
          spawn("taskkill", ["/PID", targetPid.toString(), "/F", "/T"], { windowsHide: true });
          stopped = true;
        } catch {
          // Process already dead
        }
      } else {
        try {
          process.kill(targetPid, "SIGTERM");
          stopped = true;
        } catch {
          // Process already dead
        }
      }
    }
  }

  if (stopped) {
    db.update(services)
      .set({
        status: "stopped",
        pid: null,
      })
      .where(eq(services.id, serviceId))
      .run();
  }

  return { success: stopped, message: stopped ? "Service stopped" : "Failed to stop service (UAC may be required)" };
}

export async function restartService(serviceId: number) {
  await stopService(serviceId);
  // Wait a bit for the process to fully stop
  await new Promise((resolve) => setTimeout(resolve, 1000));
  return startService(serviceId);
}

export function getServiceLogs(serviceId: number, lines: number = 100) {
  const logPath = getLogPath(serviceId);

  if (!fs.existsSync(logPath)) {
    return [];
  }

  const content = fs.readFileSync(logPath, "utf-8");
  const allLines = content.split("\n").filter((l) => l.trim());
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
      const { command } = parseCommand(service.command);
      let exeName = path.basename(command);
      if (process.platform === "win32" && exeName && !exeName.includes(".")) {
        exeName += ".exe";
      }
      if (exeName) {
        const foundPid = await findProcessByName(exeName);
        if (foundPid) {
          db.update(services)
            .set({ pid: foundPid })
            .where(eq(services.id, serviceId))
            .run();
          return { status: "running", pid: foundPid };
        }
      }
      // Trust the database status if process not found yet
      return { status: "running", pid: null };
    }
    return { status: "stopped", pid: null };
  }

  const running = await isProcessRunningAsync(service.pid);

  if (!running && service.status === "running") {
    // Process died but db still shows running
    db.update(services)
      .set({ status: "stopped", pid: null })
      .where(eq(services.id, serviceId))
      .run();
    return { status: "stopped", pid: null };
  }

  return { status: running ? "running" : service.status, pid: service.pid };
}

// Clean up all running processes on shutdown
export function cleanupProcesses() {
  // Kill in-memory tracked processes
  for (const [_id, child] of runningProcesses.entries()) {
    try {
      child.kill("SIGTERM");
    } catch {
      // Ignore errors during cleanup
    }
  }
  runningProcesses.clear();

  // Also try to kill any running services recorded in the database
  try {
    const db = getDb();
    const runningServices = db.select().from(services).where(eq(services.status, "running")).all();
    for (const service of runningServices) {
      if (service.pid) {
        if (process.platform === "win32") {
          try {
            spawn("taskkill", ["/PID", service.pid.toString(), "/F", "/T"], { windowsHide: true });
          } catch {
            // ignore
          }
        } else {
          try {
            process.kill(service.pid, "SIGTERM");
          } catch {
            // ignore
          }
        }
      }
    }
    // Mark all as stopped in database
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
    if (service.requireAdmin && process.platform === "win32") {
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
