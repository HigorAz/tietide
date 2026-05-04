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

export interface RunsPerDayChartProps {
  data: RunsPerDayPoint[];
}

const formatXTick = (value: string): string => {
  // Input: "2026-05-04". Show "May 4" — drop the year for compactness.
  const [, m, d] = value.split('-');
  if (!m || !d) return value;
  const monthIdx = Number(m) - 1;
  const monthNames = [
    'Jan',
    'Feb',
    'Mar',
    'Apr',
    'May',
    'Jun',
    'Jul',
    'Aug',
    'Sep',
    'Oct',
    'Nov',
    'Dec',
  ];
  return `${monthNames[monthIdx] ?? m} ${Number(d)}`;
};

export function RunsPerDayChart({ data }: RunsPerDayChartProps): JSX.Element {
  return (
    <div
      data-testid="runs-per-day-chart"
      className="rounded-lg border border-white/5 bg-surface p-4"
    >
      <h2 className="mb-3 text-sm font-semibold text-text-primary">Runs per day</h2>
      <div style={{ width: '100%', height: 240 }}>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 8, right: 16, left: 0, bottom: 8 }}>
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
              allowDecimals={false}
              stroke="#6B7C93"
              tick={{ fill: '#6B7C93', fontSize: 11 }}
              tickLine={false}
              axisLine={{ stroke: 'rgba(255,255,255,0.08)' }}
              width={32}
            />
            <Tooltip
              contentStyle={{
                background: '#112240',
                border: '1px solid rgba(255,255,255,0.08)',
                borderRadius: 8,
                color: '#F6F8FA',
                fontSize: 12,
              }}
              labelFormatter={(label: string) => formatXTick(label)}
            />
            <Line
              type="monotone"
              dataKey="count"
              stroke="#00D4B3"
              strokeWidth={2}
              dot={false}
              activeDot={{ r: 4, fill: '#00D4B3' }}
              isAnimationActive={false}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
