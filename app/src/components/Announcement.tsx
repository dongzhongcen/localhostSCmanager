import { useState } from "react";
import { Megaphone } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { APP_VERSION, RELEASE_NOTES } from "@contracts/version";

const SEEN_KEY = "sm-announcement-seen";

/** 右上角的版本号按钮。升级到新版本后第一次打开，会自动弹出更新公告。 */
export function Announcement() {
  // 这个版本还没看过公告就自动打开
  const [open, setOpen] = useState(() => localStorage.getItem(SEEN_KEY) !== APP_VERSION);

  const handleOpenChange = (value: boolean) => {
    setOpen(value);
    if (!value) localStorage.setItem(SEEN_KEY, APP_VERSION);
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-white transition-colors"
        title="查看更新公告"
      >
        <Megaphone className="w-3.5 h-3.5" />
        <span>v{APP_VERSION}</span>
      </button>
      <Dialog open={open} onOpenChange={handleOpenChange}>
        <DialogContent className="bg-slate-900 border-slate-800 text-slate-100 max-w-xl max-h-[80vh] overflow-auto">
          <DialogHeader>
            <DialogTitle className="text-white">更新公告</DialogTitle>
            <DialogDescription className="text-slate-400">当前版本 v{APP_VERSION}</DialogDescription>
          </DialogHeader>
          <div className="space-y-5">
            {RELEASE_NOTES.map((note) => (
              <section key={note.version} className="space-y-2">
                <div className="flex items-center gap-2">
                  <Badge className="bg-indigo-500/20 text-indigo-300 border-indigo-500/30">v{note.version}</Badge>
                  <span className="text-sm font-medium text-white">{note.title}</span>
                  <span className="text-xs text-slate-500 ml-auto">{note.date}</span>
                </div>
                <ul className="list-disc pl-5 space-y-1 text-sm text-slate-300">
                  {note.items.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              </section>
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
