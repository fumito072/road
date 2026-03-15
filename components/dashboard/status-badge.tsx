import { cn } from "@/lib/utils";

type StatusBadgeProps = {
  status: "success" | "processing" | "warning" | "error" | "idle";
  label: string;
};

const statusClassName = {
  success: "border-cyan-400/25 bg-cyan-400/10 text-cyan-100",
  processing: "border-indigo-400/25 bg-indigo-400/10 text-indigo-100",
  warning: "border-amber-400/25 bg-amber-400/10 text-amber-100",
  error: "border-rose-400/25 bg-rose-400/10 text-rose-100",
  idle: "border-white/10 bg-white/5 text-slate-300",
};

export function StatusBadge({ status, label }: StatusBadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border px-3 py-1 text-xs font-semibold tracking-[0.18em] uppercase",
        statusClassName[status],
      )}
    >
      {label}
    </span>
  );
}
