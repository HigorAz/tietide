import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts';

export interface DonutDatum {
  name: string;
  value: number;
  color: string;
}

export interface DonutChartProps {
  title: string;
  data: DonutDatum[];
  emptyMessage?: string;
  testId?: string;
}

export function DonutChart({
  title,
  data,
  emptyMessage = 'No data in this window yet.',
  testId = 'donut-chart',
}: DonutChartProps): JSX.Element {
  const total = data.reduce((sum, d) => sum + d.value, 0);
  const slices = data.filter((d) => d.value > 0);

  return (
    <div data-testid={testId} className="rounded-lg border border-white/5 bg-surface p-4">
      <h2 className="mb-3 text-sm font-semibold text-text-primary">{title}</h2>
      {total === 0 ? (
        <p className="text-xs text-text-secondary">{emptyMessage}</p>
      ) : (
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
          <div style={{ width: 160, height: 160 }} className="shrink-0">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={slices}
                  dataKey="value"
                  nameKey="name"
                  innerRadius={48}
                  outerRadius={72}
                  paddingAngle={2}
                  isAnimationActive={false}
                  stroke="none"
                >
                  {slices.map((d) => (
                    <Cell key={d.name} fill={d.color} />
                  ))}
                </Pie>
                <Tooltip
                  contentStyle={{
                    background: '#112240',
                    border: '1px solid rgba(255,255,255,0.08)',
                    borderRadius: 8,
                    color: '#F6F8FA',
                    fontSize: 12,
                  }}
                />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <ul className="flex flex-1 flex-col gap-1.5">
            {data.map((d) => (
              <li key={d.name} className="flex items-center justify-between gap-2 text-xs">
                <span className="flex items-center gap-2 text-text-secondary">
                  <span
                    aria-hidden
                    className="inline-block h-2.5 w-2.5 rounded-sm"
                    style={{ background: d.color }}
                  />
                  {d.name}
                </span>
                <span className="tabular-nums text-text-primary">{d.value}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
