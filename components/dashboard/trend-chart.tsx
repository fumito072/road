type TrendPoint = {
  label: string;
  total: number;
  completed: number;
  errors: number;
};

type TrendChartProps = {
  data: TrendPoint[];
};

function getPath(values: number[], width: number, height: number, padding: number, maxValue: number) {
  return values
    .map((value, index) => {
      const x = padding + (index * (width - padding * 2)) / Math.max(values.length - 1, 1);
      const y = height - padding - (value / maxValue) * (height - padding * 2);
      return `${index === 0 ? "M" : "L"}${x},${y}`;
    })
    .join(" ");
}

export function TrendChart({ data }: TrendChartProps) {
  const width = 780;
  const height = 280;
  const padding = 28;
  const maxValue = Math.max(...data.flatMap((item) => [item.total, item.completed, item.errors * 8]));
  const totalPath = getPath(
    data.map((item) => item.total),
    width,
    height,
    padding,
    maxValue,
  );
  const completedPath = getPath(
    data.map((item) => item.completed),
    width,
    height,
    padding,
    maxValue,
  );

  return (
    <div>
      <div className="mb-5 flex flex-wrap items-center gap-3 text-xs text-slate-400">
        <span className="inline-flex items-center gap-2">
          <span className="h-2.5 w-2.5 rounded-full bg-cyan-300" /> 受付件数
        </span>
        <span className="inline-flex items-center gap-2">
          <span className="h-2.5 w-2.5 rounded-full bg-indigo-300" /> 完了件数
        </span>
        <span className="inline-flex items-center gap-2">
          <span className="h-2.5 w-2.5 rounded-full bg-amber-300" /> エラー件数
        </span>
      </div>

      <div className="rounded-[26px] border border-white/10 bg-slate-950/35 p-4 sm:p-5">
        <svg viewBox={`0 0 ${width} ${height}`} className="h-[280px] w-full">
          <defs>
            <linearGradient id="area-total" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="rgba(34,211,238,0.28)" />
              <stop offset="100%" stopColor="rgba(34,211,238,0.02)" />
            </linearGradient>
            <linearGradient id="line-total" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor="#67e8f9" />
              <stop offset="100%" stopColor="#38bdf8" />
            </linearGradient>
            <linearGradient id="line-completed" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor="#a5b4fc" />
              <stop offset="100%" stopColor="#818cf8" />
            </linearGradient>
          </defs>

          {[0, 1, 2, 3].map((step) => {
            const y = padding + (step * (height - padding * 2)) / 3;
            return (
              <line
                key={step}
                x1={padding}
                x2={width - padding}
                y1={y}
                y2={y}
                stroke="rgba(148,163,184,0.14)"
                strokeDasharray="4 8"
              />
            );
          })}

          {data.map((item, index) => {
            const x = padding + (index * (width - padding * 2)) / Math.max(data.length - 1, 1);
            const barHeight = (item.errors * 8 * (height - padding * 2)) / maxValue;
            const y = height - padding - barHeight;
            return (
              <g key={item.label}>
                <line x1={x} x2={x} y1={padding} y2={height - padding} stroke="rgba(148,163,184,0.08)" />
                <rect
                  x={x - 12}
                  y={y}
                  width={24}
                  height={barHeight}
                  rx={12}
                  fill="rgba(251,191,36,0.72)"
                />
                <text x={x} y={height - 4} textAnchor="middle" fill="rgba(148,163,184,0.85)" fontSize="11">
                  {item.label}
                </text>
              </g>
            );
          })}

          <path
            d={`${totalPath} L ${width - padding},${height - padding} L ${padding},${height - padding} Z`}
            fill="url(#area-total)"
          />
          <path d={totalPath} fill="none" stroke="url(#line-total)" strokeWidth="4" strokeLinecap="round" />
          <path d={completedPath} fill="none" stroke="url(#line-completed)" strokeWidth="3" strokeLinecap="round" strokeDasharray="2 8" />

          {data.map((item, index) => {
            const x = padding + (index * (width - padding * 2)) / Math.max(data.length - 1, 1);
            const totalY = height - padding - (item.total / maxValue) * (height - padding * 2);
            const completeY = height - padding - (item.completed / maxValue) * (height - padding * 2);
            return (
              <g key={`${item.label}-points`}>
                <circle cx={x} cy={totalY} r="5" fill="#67e8f9" />
                <circle cx={x} cy={completeY} r="4" fill="#818cf8" />
              </g>
            );
          })}
        </svg>
      </div>
    </div>
  );
}
