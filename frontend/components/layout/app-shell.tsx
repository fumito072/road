import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

type AppShellProps = {
  sidebar: ReactNode;
  header: ReactNode;
  children: ReactNode;
  floating?: ReactNode;
};

export function AppShell({ sidebar, header, children, floating }: AppShellProps) {
  return (
    <div className="relative min-h-screen overflow-hidden bg-[#06101d] text-slate-100">
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(45,212,191,0.16),transparent_28%),radial-gradient(circle_at_top_right,rgba(96,165,250,0.14),transparent_34%),linear-gradient(180deg,#07111f_0%,#030712_100%)]" />
        <div className="absolute inset-0 opacity-30 [background-image:linear-gradient(rgba(148,163,184,0.08)_1px,transparent_1px),linear-gradient(90deg,rgba(148,163,184,0.08)_1px,transparent_1px)] [background-size:72px_72px]" />
        <div className="absolute left-0 top-0 h-full w-full bg-[radial-gradient(circle_at_20%_12%,rgba(34,211,238,0.16),transparent_0,transparent_24%),radial-gradient(circle_at_80%_18%,rgba(96,165,250,0.12),transparent_0,transparent_20%),radial-gradient(circle_at_70%_70%,rgba(168,85,247,0.08),transparent_0,transparent_18%)]" />
        <svg className="absolute inset-0 h-full w-full opacity-30" viewBox="0 0 1440 1024" fill="none" preserveAspectRatio="none">
          <path d="M0 180C170 140 240 260 370 230C520 194 590 70 730 104C835 130 884 222 1010 236C1165 252 1228 148 1440 102" stroke="url(#network-line-a)" strokeWidth="2" strokeDasharray="5 12" />
          <path d="M0 428C136 382 278 340 412 392C530 438 649 582 774 568C904 554 954 404 1090 384C1218 366 1304 408 1440 374" stroke="url(#network-line-b)" strokeWidth="2" strokeDasharray="6 14" />
          <path d="M0 714C154 760 250 678 394 706C565 740 618 904 808 892C987 880 1118 708 1440 778" stroke="url(#network-line-c)" strokeWidth="2" strokeDasharray="4 16" />
          <defs>
            <linearGradient id="network-line-a" x1="0" y1="0" x2="1440" y2="0" gradientUnits="userSpaceOnUse">
              <stop stopColor="rgba(34,211,238,0)" />
              <stop offset="0.35" stopColor="rgba(34,211,238,0.9)" />
              <stop offset="0.7" stopColor="rgba(96,165,250,0.75)" />
              <stop offset="1" stopColor="rgba(96,165,250,0)" />
            </linearGradient>
            <linearGradient id="network-line-b" x1="0" y1="0" x2="1440" y2="0" gradientUnits="userSpaceOnUse">
              <stop stopColor="rgba(45,212,191,0)" />
              <stop offset="0.4" stopColor="rgba(45,212,191,0.85)" />
              <stop offset="0.78" stopColor="rgba(129,140,248,0.8)" />
              <stop offset="1" stopColor="rgba(129,140,248,0)" />
            </linearGradient>
            <linearGradient id="network-line-c" x1="0" y1="0" x2="1440" y2="0" gradientUnits="userSpaceOnUse">
              <stop stopColor="rgba(56,189,248,0)" />
              <stop offset="0.45" stopColor="rgba(56,189,248,0.75)" />
              <stop offset="0.82" stopColor="rgba(168,85,247,0.72)" />
              <stop offset="1" stopColor="rgba(168,85,247,0)" />
            </linearGradient>
          </defs>
        </svg>
      </div>

      <div className="relative z-10 grid min-h-screen lg:grid-cols-[288px_minmax(0,1fr)]">
        <aside className="border-b border-white/10 bg-slate-950/65 backdrop-blur xl:border-r xl:border-b-0">
          {sidebar}
        </aside>
        <div className="flex min-w-0 flex-col">
          <div className="border-b border-white/10 bg-slate-950/35 backdrop-blur">{header}</div>
          <main className={cn("flex-1 p-4 sm:p-6 xl:p-8")}>{children}</main>
        </div>
      </div>

      {floating ? <div className="pointer-events-none fixed bottom-6 right-6 z-20">{floating}</div> : null}
    </div>
  );
}
