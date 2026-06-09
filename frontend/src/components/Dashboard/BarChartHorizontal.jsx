import { BarChart, Bar, XAxis, YAxis, Cell, Tooltip, ResponsiveContainer, ReferenceLine } from "recharts";
import { fmt } from "../../utils/format";
import { useChartColors } from "../../hooks/useChartColors";

function CustomTooltip({ active, payload, colors }) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  return (
    <div className="glass px-3 py-2 rounded-xl text-xs shadow-glass">
      <p className="font-semibold text-ink">{d.name}</p>
      <p className="text-ink/60">{fmt.pct(d.value)}</p>
      {d.estado && (
        <span className={fmt.badgeClass(d.estado)}>{d.estado}</span>
      )}
    </div>
  );
}

export default function BarChartHorizontal({ data = [], height = 280 }) {
  const c = useChartColors();

  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} layout="vertical" margin={{ top: 4, right: 40, left: 0, bottom: 4 }}>
        <XAxis
          type="number" domain={[0, 100]}
          tick={{ fontSize: 11, fill: c.axis }}
          tickFormatter={(v) => `${v}%`}
          axisLine={false} tickLine={false}
        />
        <YAxis
          type="category" dataKey="name"
          tick={{ fontSize: 12, fill: c.axisStrong }}
          axisLine={false} tickLine={false} width={110}
        />
        <Tooltip content={<CustomTooltip colors={c} />} cursor={{ fill: c.cursor }} />
        <ReferenceLine x={80} stroke={c.sem.success} strokeDasharray="4 4" strokeWidth={1.5} />
        <ReferenceLine x={60} stroke={c.sem.danger}  strokeDasharray="4 4" strokeWidth={1.5} />
        <Bar dataKey="value" radius={[0, 8, 8, 0]} maxBarSize={28}>
          {data.map((entry, i) => (
            <Cell key={i} fill={fmt.semaforoColor(entry.value)} fillOpacity={0.85} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
