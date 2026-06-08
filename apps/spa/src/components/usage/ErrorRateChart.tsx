import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type { RunsPerDayPoint } from '@/api/usage';

export interface ErrorRateChartProps {
  data: RunsPerDayPoint[];
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const formatXTick = (value: string): string => {
  const [, m, d] = value.split('-');
  if (!m || !d) return value;
  return `${MONTHS[Number(m) - 1] ?? m} ${Number(d)}`;
};

const formatRate = (value: number): string => `${Math.round(value * 100)}%`;

export function ErrorRateChart({ data }: ErrorRateChartProps): JSX.Element {
  const points = data.map((p) => ({
    date: p.date,
    rate: p.count > 0 ? p.failed / p.count : 0,
  }));

  return (
    <div data-testid="error-rate-chart" className="rounded-lg border border-white/5 bg-surface p-4">
      <h2 className="mb-3 text-sm font-semibold text-text-primary">Error rate per day</h2>
      <div style={{ width: '100%', height: 240 }}>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={points} margin={{ top: 8, right: 16, left: 0, bottom: 8 }}>
            <CartesianGrid stroke="rgba(255,255,255,0.06)" strokeDasharray="3 3" />
            <XAxis
              dataKey="date"
              tickFormatter={formatXTick}
              stroke="#6B7C93"
              tick={{ fill: '#6B7C93', fontSize: 11 }}
              tickLine={false}
              axisLine={{ stroke: 'rgba(255,255,255,0.08)' }}
              minTickGap={20}
            />
            <YAxis
              domain={[0, 1]}
              tickFormatter={formatRate}
              stroke="#6B7C93"
              tick={{ fill: '#6B7C93', fontSize: 11 }}
              tickLine={false}
              axisLine={{ stroke: 'rgba(255,255,255,0.08)' }}
              width={40}
            />
            <Tooltip
              contentStyle={{
                background: '#112240',
                border: '1px solid rgba(255,255,255,0.08)',
                borderRadius: 8,
                color: '#F6F8FA',
                fontSize: 12,
              }}
              formatter={(value: number) => formatRate(value)}
              labelFormatter={(label: string) => formatXTick(label)}
            />
            <Line
              type="monotone"
              dataKey="rate"
              stroke="#FF6B6B"
              strokeWidth={2}
              dot={false}
              activeDot={{ r: 4, fill: '#FF6B6B' }}
              isAnimationActive={false}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
