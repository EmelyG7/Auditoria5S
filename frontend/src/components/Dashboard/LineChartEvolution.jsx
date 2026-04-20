import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, ReferenceLine } from "recharts";

const PALETTE = ["#0A4F79", "#B4427F", "#98C062", "#EA9947", "#DF4585", "#5B8FBF"];

export default function LineChartEvolution({ data = [], lines = [], height = 240 }) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <LineChart data={data} margin={{ top: 8, right: 16, left: 0, bottom: 8 }}>
        <CartesianGrid stroke="rgba(10,79,121,0.06)" strokeDasharray="4 4" />
        <XAxis dataKey="label" tick={{ fontSize: 11, fill: "#1E1E2F80" }} axisLine={false} tickLine={false} />
        <YAxis domain={[0, 100]} tick={{ fontSize: 11, fill: "#1E1E2F80" }} axisLine={false} tickLine={false} tickFormatter={(v) => `${v}%`} />
        <Tooltip
          formatter={(v, name) => [`${Number(v).toFixed(1)}%`, name]}
          contentStyle={{ borderRadius: 12, border: "1px solid rgba(255,255,255,0.7)", background: "rgba(255,255,255,0.9)", backdropFilter: "blur(12px)", fontSize: 12 }}
        />
        <ReferenceLine y={80} stroke="#98C062" strokeDasharray="4 4" strokeWidth={1} />
        <ReferenceLine y={60} stroke="#DF4585" strokeDasharray="4 4" strokeWidth={1} />
        {lines.length > 0
          ? lines.map((key, i) => (
              <Line key={key} type="monotone" dataKey={key} stroke={PALETTE[i % PALETTE.length]}
                strokeWidth={2.5} dot={{ r: 4 }} activeDot={{ r: 6 }} />
            ))
          : <Line type="monotone" dataKey="value" stroke={PALETTE[0]} strokeWidth={2.5} dot={{ r: 4 }} />
        }
        {lines.length > 1 && <Legend wrapperStyle={{ fontSize: 12 }} />}
      </LineChart>
    </ResponsiveContainer>
  );
}