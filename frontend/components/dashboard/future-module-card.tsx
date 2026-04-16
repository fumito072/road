import { ChevronRight } from "lucide-react";

import { StatusBadge } from "@/components/dashboard/status-badge";

type FutureModuleCardProps = {
  title: string;
  description: string;
  eta: string;
  tags: string[];
};

export function FutureModuleCard({ title, description, eta, tags }: FutureModuleCardProps) {
  return (
    <article className="rounded-[28px] border border-white/10 bg-white/[0.04] p-5 transition hover:border-cyan-400/20 hover:bg-cyan-400/[0.05]">
      <div className="flex items-start justify-between gap-4">
        <div>
          <StatusBadge status="processing" label="future module" />
          <h3 className="mt-4 text-lg font-semibold text-white">{title}</h3>
          <p className="mt-2 text-sm leading-6 text-slate-400">{description}</p>
        </div>
        <button
          type="button"
          aria-label={`${title} details`}
          className="inline-flex h-10 w-10 items-center justify-center rounded-2xl border border-white/10 bg-white/[0.04] text-slate-300"
        >
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>
      <div className="mt-5 flex flex-wrap items-center gap-2">
        <span className="rounded-full border border-cyan-400/20 bg-cyan-400/10 px-3 py-1 text-xs font-medium text-cyan-100">
          {eta}
        </span>
        {tags.map((tag) => (
          <span
            key={tag}
            className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-xs text-slate-300"
          >
            {tag}
          </span>
        ))}
      </div>
    </article>
  );
}
