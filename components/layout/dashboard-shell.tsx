type DashboardShellProps = {
  children: React.ReactNode;
};

export function DashboardShell({ children }: DashboardShellProps) {
  return (
    <main className="mx-auto flex min-h-screen w-full max-w-7xl flex-col gap-8 px-6 py-10 sm:px-8 lg:px-12">
      <header className="flex flex-col gap-4 rounded-3xl border border-white/10 bg-white/5 p-6 shadow-panel backdrop-blur md:flex-row md:items-center md:justify-between">
        <div>
          <p className="text-sm uppercase tracking-[0.35em] text-sky-300">Road</p>
          <p className="mt-2 text-sm text-slate-300">
            Empty workspace から復旧した実行可能なベース構成
          </p>
        </div>
        <div className="flex items-center gap-3 text-sm text-slate-300">
          <span className="inline-flex h-2.5 w-2.5 rounded-full bg-emerald-400" />
          Build ready
        </div>
      </header>
      {children}
    </main>
  );
}
