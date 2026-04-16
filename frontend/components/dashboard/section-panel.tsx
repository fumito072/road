import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

type SectionPanelProps = {
  eyebrow?: string;
  title: string;
  description?: string;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
  bodyClassName?: string;
};

export function SectionPanel({
  eyebrow,
  title,
  description,
  action,
  children,
  className,
  bodyClassName,
}: SectionPanelProps) {
  return (
    <section
      className={cn(
        "rounded-[30px] border border-white/10 bg-[linear-gradient(180deg,rgba(15,23,42,0.84),rgba(2,6,23,0.92))] shadow-[0_0_0_1px_rgba(148,163,184,0.04),0_30px_80px_rgba(2,6,23,0.45)] backdrop-blur",
        className,
      )}
    >
      <div className="flex flex-col gap-4 border-b border-white/10 px-5 py-5 sm:px-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            {eyebrow ? (
              <p className="text-[11px] font-semibold uppercase tracking-[0.3em] text-cyan-200/70">
                {eyebrow}
              </p>
            ) : null}
            <h2 className="mt-2 text-xl font-semibold tracking-tight text-white sm:text-2xl">
              {title}
            </h2>
            {description ? <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-400">{description}</p> : null}
          </div>
          {action ? <div>{action}</div> : null}
        </div>
      </div>
      <div className={cn("px-5 py-5 sm:px-6", bodyClassName)}>{children}</div>
    </section>
  );
}
