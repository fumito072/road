import type { LucideIcon } from "lucide-react";

type StatCardProps = {
  title: string;
  value: string;
  description: string;
  icon: LucideIcon;
};

export function StatCard({ title, value, description, icon: Icon }: StatCardProps) {
  return (
    <article className="rounded-3xl border border-white/10 bg-card p-5 shadow-panel backdrop-blur">
      <div className="flex items-center justify-between gap-4">
        <div>
          <p className="text-sm text-slate-400">{title}</p>
          <p className="mt-3 text-3xl font-semibold text-white">{value}</p>
        </div>
        <div className="rounded-2xl border border-sky-400/20 bg-sky-400/10 p-3 text-sky-200">
          <Icon className="h-5 w-5" />
        </div>
      </div>
      <p className="mt-4 text-sm text-slate-400">{description}</p>
    </article>
  );
}
