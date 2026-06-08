import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import type { BusiestHour } from '@/api/usage';

export interface BusiestHoursChartProps {
  data: BusiestHour[];
}

const formatHour = (hour: number): string => `${String(hour).padStart(2, '0')}h`;

export function BusiestHoursChart({ data }: BusiestHoursChartProps): JSX.Element {
  return (
    <div
      data-testid="busiest-hours-chart"
      className="rounded-lg border border-white/5 bg-surface p-4"
    >
      <h2 className="mb-3 text-sm font-semibold text-text-primary">Busiest hours (UTC)</h2>
      <div style={{ width: '100%', height: 240 }}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 8, right: 16, left: 0, bottom: 8 }}>
            <CartesianGrid stroke="rgba(255,255,255,0.06)" strokeDasharray="3 3" vertical={false} />
            <XAxis
              dataKey="hour"
              tickFormatter={formatHour}
              stroke="#6B7C93"
              tick={{ fill: '#6B7C93', fontSize: 11 }}
              tickLine={false}
              axisLine={{ stroke: 'rgba(255,255,255,0.08)' }}
              interval={2}
            />
            <YAxis
              allowDecimals={false}
              stroke="#6B7C93"
              tick={{ fill: '#6B7C93', fontSize: 11 }}
              tickLine={false}
              axisLine={{ stroke: 'rgba(255,255,255,0.08)' }}
              width={32}
            />
            <Tooltip
              cursor={{ fill: 'rgba(255,255,255,0.04)' }}
              contentStyle={{
                background: '#112240',
                border: '1px solid rgba(255,255,255,0.08)',
                borderRadius: 8,
                color: '#F6F8FA',
                fontSize: 12,
              }}
              labelFormatter={(label: number) => formatHour(label)}
            />
            <Bar dataKey="count" fill="#00D4B3" radius={[2, 2, 0, 0]} isAnimationActive={false} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
