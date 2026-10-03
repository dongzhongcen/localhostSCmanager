/**
 * 服务日志的格式与标注。
 *
 * 每一行日志都写成：
 *   [2026-10-03 21:55:01] [STDOUT] 内容
 *
 * 标签含义：
 *   INFO    服务管理器自己的记录（启动、停止、退出码等）
 *   STDOUT  服务的标准输出
 *   STDERR  服务的标准错误输出（很多程序也会把普通信息写到这里）
 *   ERROR   服务管理器遇到的错误（命令不存在、提权失败等）
 */
export type LogTag = "INFO" | "STDOUT" | "STDERR" | "ERROR";

function pad(n: number) {
  return n.toString().padStart(2, "0");
}

/** 本地时间，格式 2026-10-03 21:55:01 */
export function formatTime(d = new Date()) {
  return (
    `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ` +
    `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
  );
}

export function formatLine(tag: LogTag, text: string, d = new Date()) {
  return `[${formatTime(d)}] [${tag}] ${text}\n`;
}

const utf8 = new TextDecoder("utf-8", { fatal: true });
let gbk: { decode(input: Uint8Array): string } | null = null;
try {
  gbk = new TextDecoder("gbk");
} catch {
  gbk = null; // 没有完整 ICU 的 Node 不支持 gbk，退回 UTF-8
}

/**
 * 中文 Windows 上很多程序（mysqld、nginx、cmd 自带命令）输出的是 GBK，
 * 直接按 UTF-8 读会变成乱码。先按 UTF-8 严格解码，失败再按 GBK 解码。
 */
export function decodeOutput(buf: Buffer) {
  try {
    return utf8.decode(buf);
  } catch {
    return gbk ? gbk.decode(buf) : buf.toString("utf-8");
  }
}

/**
 * 把输出流按行切开，每一行单独加时间和标签。
 * 数据块可能在一行中间断开，所以没遇到换行的部分先攒着，等下一块数据或流结束再写。
 */
export function createLineTagger(tag: LogTag, write: (line: string) => void) {
  let pending = Buffer.alloc(0);

  const emit = (bytes: Buffer) => {
    const text = decodeOutput(bytes).replace(/\r$/, "");
    write(formatLine(tag, text));
  };

  return {
    push(chunk: Buffer) {
      pending = Buffer.concat([pending, chunk]);
      let idx: number;
      while ((idx = pending.indexOf(0x0a)) !== -1) {
        emit(pending.subarray(0, idx));
        pending = pending.subarray(idx + 1);
      }
    },
    flush() {
      if (pending.length > 0) {
        emit(pending);
        pending = Buffer.alloc(0);
      }
    },
  };
}
