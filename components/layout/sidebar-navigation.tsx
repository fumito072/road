import {
  BarChart3,
  Bot,
  CircleGauge,
  FileScan,
  History,
  Layers3,
  MessageSquareMore,
  Settings,
  ShieldCheck,
  Workflow,
} from "lucide-react";

import { cn } from "@/lib/utils";

type NavigationItem = {
  key:
    | "dashboard"
    | "ocr"
    | "history"
    | "feedback"
    | "analytics"
    | "settings"
    | "ai"
    | "integration"
    | "admin";
  label: string;
  active?: boolean;
  future?: boolean;
};

type NavigationSection = {
  label: string;
  items: NavigationItem[];
};

type SidebarNavigationProps = {
  sections: NavigationSection[];
};

const iconMap = {
  dashboard: CircleGauge,
  ocr: FileScan,
  history: History,
  feedback: MessageSquareMore,
  analytics: BarChart3,
  settings: Settings,
  ai: Bot,
  integration: Workflow,
  admin: ShieldCheck,
} satisfies Record<NavigationItem["key"], typeof CircleGauge>;

export function SidebarNavigation({ sections }: SidebarNavigationProps) {
  return (
    <div className="flex h-full flex-col px-4 py-5 sm:px-5 lg:px-6">
      <div className="rounded-[28px] border border-cyan-400/15 bg-gradient-to-r from-cyan-400/20 via-emerald-300/10 to-indigo-400/10 p-5 shadow-[0_0_0_1px_rgba(34,211,238,0.08),0_18px_60px_rgba(8,15,31,0.45)]">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-xs font-medium uppercase tracking-[0.38em] text-cyan-100/80">
              Network AI Suite
            </p>
            <h2 className="mt-2 text-2xl font-semibold tracking-tight text-white">
              ROAD OCR Hub
            </h2>
          </div>
          <div className="rounded-2xl border border-white/15 bg-white/10 p-3 text-cyan-100">
            <Layers3 className="h-5 w-5" />
          </div>
        </div>
        <p className="mt-4 text-sm leading-6 text-slate-200/90">
          通信業務に必要な監視・処理・改善を一つの業務基盤でつなぐためのトップダッシュボード。
        </p>
      </div>

      <nav className="mt-6 space-y-5">
        {sections.map((section) => (
          <div key={section.label}>
            <p className="px-2 text-[11px] font-semibold uppercase tracking-[0.32em] text-slate-500">
              {section.label}
            </p>
            <div className="mt-3 space-y-1.5">
              {section.items.map((item) => {
                const Icon = iconMap[item.key];

                return (
                  <button
                    key={item.key}
                    type="button"
                    className={cn(
                      "flex w-full items-center justify-between rounded-2xl border px-3 py-3 text-left transition",
                      item.active
                        ? "border-cyan-400/35 bg-cyan-400/12 text-white shadow-[0_0_0_1px_rgba(34,211,238,0.1),0_16px_36px_rgba(7,17,31,0.35)]"
                        : "border-transparent bg-white/[0.03] text-slate-300 hover:border-white/10 hover:bg-white/[0.06] hover:text-white",
                    )}
                  >
                    <span className="flex items-center gap-3">
                      <span
                        className={cn(
                          "inline-flex h-10 w-10 items-center justify-center rounded-2xl border",
                          item.active
                            ? "border-cyan-400/20 bg-cyan-400/10 text-cyan-100"
                            : "border-white/10 bg-slate-900/80 text-slate-400",
                        )}
                      >
                        <Icon className="h-[18px] w-[18px]" />
                      </span>
                      <span>
                        <span className="block text-sm font-medium">{item.label}</span>
                        <span className="mt-0.5 block text-xs text-slate-500">
                          {item.future ? "今後追加予定" : item.active ? "現在表示中" : "モジュール"}
                        </span>
                      </span>
                    </span>
                    {item.future ? (
                      <span className="rounded-full border border-indigo-400/20 bg-indigo-400/10 px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.28em] text-indigo-200">
                        soon
                      </span>
                    ) : null}
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </nav>

      <div className="mt-auto rounded-[28px] border border-white/10 bg-white/[0.04] p-5 backdrop-blur">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.28em] text-slate-500">
              Vol.1 roadmap
            </p>
            <h3 className="mt-2 text-lg font-semibold text-white">4月末公開 / 6月末改善完了</h3>
          </div>
          <span className="rounded-full border border-emerald-400/20 bg-emerald-400/10 px-3 py-1 text-xs font-medium text-emerald-200">
            On Track
          </span>
        </div>
        <div className="mt-4 h-2 rounded-full bg-white/8">
          <div className="h-full w-2/3 rounded-full bg-gradient-to-r from-cyan-400 via-sky-400 to-indigo-400" />
        </div>
        <p className="mt-3 text-sm leading-6 text-slate-400">
          OCR を起点に、AI機能・外部連携・分析モジュールを順次接続する設計です。
        </p>
      </div>
    </div>
  );
}
