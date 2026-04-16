import { Bell, ChevronDown, Settings2, UserCircle2 } from "lucide-react";

import { cn } from "@/lib/utils";

type HeaderBarProps = {
  title: string;
  subtitle: string;
  timeframeLabel: string;
  workspaceLabel: string;
  className?: string;
};

const iconButtonClassName =
  "inline-flex h-11 w-11 items-center justify-center rounded-2xl border border-white/10 bg-white/5 text-slate-200 transition hover:border-cyan-400/40 hover:bg-cyan-400/10 hover:text-cyan-100";

export function HeaderBar({
  title,
  subtitle,
  timeframeLabel,
  workspaceLabel,
  className,
}: HeaderBarProps) {
  return (
    <header className={cn("flex flex-col gap-4 px-4 py-5 sm:px-6 xl:px-8", className)}>
      <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
        <div className="space-y-2">
          <div className="inline-flex items-center gap-2 rounded-full border border-cyan-400/20 bg-cyan-400/10 px-3 py-1 text-[11px] font-medium uppercase tracking-[0.3em] text-cyan-100">
            OCR / AI Workflow Dashboard
          </div>
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-white sm:text-3xl">
              {title}
            </h1>
            <p className="mt-1 text-sm text-slate-300 sm:text-base">{subtitle}</p>
          </div>
        </div>

        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <div className="flex items-center gap-2 rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-slate-200 backdrop-blur">
            <span className="text-slate-400">ワークスペース</span>
            <span className="font-medium text-white">{workspaceLabel}</span>
            <ChevronDown className="h-4 w-4 text-slate-400" />
          </div>
          <div className="flex items-center gap-2 rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-slate-200 backdrop-blur">
            <span className="text-slate-400">時点</span>
            <span className="font-medium text-white">{timeframeLabel}</span>
          </div>
          <div className="flex items-center gap-2">
            <button type="button" aria-label="通知" className={iconButtonClassName}>
              <Bell className="h-5 w-5" />
            </button>
            <button type="button" aria-label="設定" className={iconButtonClassName}>
              <Settings2 className="h-5 w-5" />
            </button>
            <button type="button" aria-label="ユーザー" className={iconButtonClassName}>
              <UserCircle2 className="h-5 w-5" />
            </button>
          </div>
        </div>
      </div>
    </header>
  );
}
