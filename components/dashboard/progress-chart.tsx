type ProgressPoint = {
  label: string;
  value: number;
};

type ProgressChartProps = {
  data: ProgressPoint[];
};

export function ProgressChart({ data }: ProgressChartProps) {
  const max = Math.max(...data.map((item) => item.value));

  return (
    <div className="rounded-3xl border border-white/10 bg-card p-6 shadow-panel backdrop-blur">
      <div className="flex items-end justify-between gap-3">
        <div>
          <p className="text-sm font-medium uppercase tracking-[0.25em] text-slate-400">
            Weekly progress
          </p>
          <h2 className="mt-2 text-2xl font-semibold text-white">作業量の推移</h2>
        </div>
        <p className="text-sm text-slate-400">過去7日間</p>
      </div>

      <div className="mt-8 grid grid-cols-7 items-end gap-3">
        {data.map((item) => {
          const height = `${Math.max((item.value / max) * 220, 24)}px`;

          return (
            <div key={item.label} className="flex flex-col items-center gap-3">
              <div className="flex h-60 w-full items-end justify-center rounded-2xl bg-slate-950/40 p-2">
                <div
                  className="w-full rounded-xl bg-gradient-to-t from-sky-500 to-cyan-300"
                  style={{ height }}
                />
              </div>
              <div className="text-center">
                <p className="text-sm font-medium text-white">{item.value}%</p>
                <p className="mt-1 text-xs uppercase tracking-[0.2em] text-slate-500">
                  {item.label}
                </p>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
