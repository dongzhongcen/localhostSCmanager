// 日志行格式：[2026-10-03 21:55:01] [STDOUT] 内容（见 api/services/logFormat.ts）
export const LOG_RE = /^\[([^\]]+)\] \[(INFO|STDOUT|STDERR|ERROR)\] ?(.*)$/;

export const LOG_TAGS = ["INFO", "STDOUT", "STDERR", "ERROR"] as const;

export function getLogTag(line: string) {
  return line.match(LOG_RE)?.[2] ?? null;
}
