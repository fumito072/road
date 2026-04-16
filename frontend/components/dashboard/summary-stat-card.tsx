import type { LucideIcon } from "lucide-react";
import { ArrowDownRight, ArrowUpRight } from "lucide-react";

import { cn } from "@/lib/utils";

type SummaryStatCardProps = {
  title: string;
  value: string;
  icon: LucideIcon;
  caption: string;
  delta: string;
  deltaDirection: "up" | "down" | "neutral";
  tone: "cyan" | "blue" | "violet" | "amber" | "rose";
};

const toneClassName = {
  cyan: "from-cyan-400/18 via-cyan-400/8 to-transparent border-cyan-400/20 text-cyan-100",
  blue: "from-sky-400/18 via-sky-400/8 to-transparent border-sky-400/20 text-sky-100",
  violet: "from-violet-400/18 via-violet-400/8 to-transparent border-violet-400/20 text-violet-100",
  amber: "from-amber-400/18 via-amber-400/8 to-transparent border-amber-400/20 text-amber-100",
  rose: "from-rose-400/18 via-rose-400/8 to-transparent border-rose-400/20 text-rose-100",
};

export function SummaryStatCard({
  title,
  value,
  icon: Icon,
  caption,
  delta,
  deltaDirection,
  tone,
}: SummaryStatCardProps) {
  const DeltaIcon = deltaDirection === "down" ? ArrowDownRight : ArrowUpRight;

  return (
    <article className="group relative overflow-hidden rounded-[28px] border border-white/10 bg-[linear-gradient(180deg,rgba(15,23,42,0.92),rgba(2,6,23,0.92))] p-5 shadow-[0_20px_70px_rgba(2,6,23,0.38)] backdrop-blur transition hover:-translate-y-0.5 hover:border-white/15">
      <div className={cn("absolute inset-0 bg-gradient-to-br opacity-100", toneClassName[tone])} />
      <div className="relative">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-sm font-medium text-slate-300">{title}</p>
            <p className="mt-4 text-3xl font-semibold tracking-tight text-white sm:text-[2rem]">
              {value}
            </p>
          </div>
          <div className={cn("rounded-2xl border bg-white/5 p-3", toneClassName[tone])}>
            <Icon className="h-5 w-5" />
          </div>
        </div>

        <div className="mt-6 flex items-center justify-between gap-4">
          <p className="text-sm text-slate-400">{caption}</p>
          <span
            className={cn(
              "inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-semibold",
              deltaDirection === "up"
                ? "border-emerald-400/20 bg-emerald-400/10 text-emerald-200"
                : deltaDirection === "down"
                  ? "border-rose-400/20 bg-rose-400/10 text-rose-200"
                  : "border-white/10 bg-white/5 text-slate-300",
            )}
          >
            {deltaDirection === "neutral" ? null : <DeltaIcon className="h-3.5 w-3.5" />}
            {delta}
          </span>
        </div>
      </div>
    </article>
  );
}
