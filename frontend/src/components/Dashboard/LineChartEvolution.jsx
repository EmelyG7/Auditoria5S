import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, ReferenceLine } from "recharts";
import { useChartColors } from "../../hooks/useChartColors";

export default function LineChartEvolution({ data = [], lines = [], height = 240 }) {
  const c = useChartColors();

  return (
    <ResponsiveContainer width="100%" height={height}>
      <LineChart data={data} margin={{ top: 8, right: 20, left: -4, bottom: 8 }}>
        <CartesianGrid stroke={c.grid} strokeDasharray="4 4" />
        <XAxis
          dataKey="label"
          tick={{ fontSize: 11, fill: c.axis }}
          axisLine={false}
          tickLine={false}
        />
        <YAxis
          domain={[0, 100]}
          tick={{ fontSize: 11, fill: c.axis }}
          axisLine={false}
          tickLine={false}
          tickFormatter={(v) => `${v}%`}
          width={42}
        />
        <Tooltip
          formatter={(v, name) => [`${Number(v).toFixed(1)}%`, name]}
          contentStyle={c.tooltipStyle}
        />
        <ReferenceLine y={80} stroke={c.sem.success} strokeDasharray="4 4" strokeWidth={1} />
        <ReferenceLine y={60} stroke={c.sem.danger}  strokeDasharray="4 4" strokeWidth={1} />
        {lines.length > 0
          ? lines.map((key, i) => (
              <Line key={key} type="monotone" dataKey={key} stroke={c.series[i % c.series.length]}
                strokeWidth={2.5} dot={{ r: 4 }} activeDot={{ r: 6 }} />
            ))
          : <Line type="monotone" dataKey="value" stroke={c.c1} strokeWidth={2.5} dot={{ r: 4 }} />
        }
        {lines.length > 1 && <Legend wrapperStyle={{ fontSize: 12, color: c.axis }} />}
      </LineChart>
    </ResponsiveContainer>
  );
}
