import { Bug, Lightbulb, MessageCircleMore } from "lucide-react";

import { cn } from "@/lib/utils";

const actions = [
  { label: "改善要望", icon: Lightbulb },
  { label: "不具合報告", icon: Bug },
  { label: "新機能案", icon: MessageCircleMore },
];

type FeedbackWidgetProps = {
  className?: string;
};

export function FeedbackWidget({ className }: FeedbackWidgetProps) {
  return (
    <div
      className={cn(
        "pointer-events-auto w-[320px] rounded-[28px] border border-cyan-400/20 bg-slate-950/85 p-5 shadow-[0_30px_80px_rgba(2,6,23,0.58)] backdrop-blur",
        className,
      )}
    >
      <p className="text-[11px] font-semibold uppercase tracking-[0.3em] text-cyan-200/75">
        Feedback Loop
      </p>
      <h3 className="mt-2 text-lg font-semibold text-white">Vol.1 への声を回収</h3>
      <p className="mt-2 text-sm leading-6 text-slate-400">
        実運用で見えた不便・不安・不満をそのまま改善 backlog に取り込める導線です。
      </p>
      <div className="mt-4 grid gap-2">
        {actions.map((action) => {
          const Icon = action.icon;
          return (
            <button
              key={action.label}
              type="button"
              className="flex items-center justify-between rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3 text-sm text-slate-200 transition hover:border-cyan-400/30 hover:bg-cyan-400/10"
            >
              <span className="inline-flex items-center gap-3">
                <span className="inline-flex h-9 w-9 items-center justify-center rounded-2xl border border-cyan-400/20 bg-cyan-400/10 text-cyan-100">
                  <Icon className="h-4 w-4" />
                </span>
                {action.label}
              </span>
              <span className="text-xs text-slate-500">送信</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
