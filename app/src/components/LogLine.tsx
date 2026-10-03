import { cn } from "@/lib/utils";

import { LOG_RE } from "@/lib/logTags";

const TAG_STYLE: Record<string, string> = {
  INFO: "bg-sky-500/15 text-sky-300 border-sky-500/30",
  STDOUT: "bg-slate-500/15 text-slate-300 border-slate-500/30",
  STDERR: "bg-amber-500/15 text-amber-300 border-amber-500/30",
  ERROR: "bg-red-500/15 text-red-300 border-red-500/30",
};

const TEXT_STYLE: Record<string, string> = {
  INFO: "text-sky-200",
  STDOUT: "text-slate-300",
  STDERR: "text-amber-200",
  ERROR: "text-red-300",
};

/** 一行日志：时间灰色，标签按类型着色。没有标签的行（比如管理员权限启动的服务输出）原样显示。 */
export function LogLine({ line }: { line: string }) {
  const m = line.match(LOG_RE);
  if (!m) {
    return <div className="text-xs font-mono text-slate-400 break-all whitespace-pre-wrap">{line}</div>;
  }
  const [, time, tag, text] = m;
  return (
    <div className="text-xs font-mono break-all whitespace-pre-wrap flex gap-2">
      <span className="text-slate-500 shrink-0">{time}</span>
      <span className={cn("shrink-0 rounded border px-1 leading-4 h-4 text-[10px]", TAG_STYLE[tag])}>{tag}</span>
      <span className={TEXT_STYLE[tag]}>{text}</span>
    </div>
  );
}
