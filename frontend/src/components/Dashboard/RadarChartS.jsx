import { Radar, RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, ResponsiveContainer, Tooltip } from "recharts";

const COLORS = { fill: "#0A4F79", stroke: "#0A4F79" };

export default function RadarChartS({ data = [], height = 260 }) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <RadarChart data={data} margin={{ top: 10, right: 20, bottom: 10, left: 20 }}>
        <PolarGrid stroke="rgba(10,79,121,0.12)" />
        <PolarAngleAxis
          dataKey="s"
          tick={{ fontSize: 11, fill: "#1E1E2F", fontWeight: 500 }}
        />
        <PolarRadiusAxis
          domain={[0, 100]}
          tick={{ fontSize: 10, fill: "#1E1E2F60" }}
          angle={30}
          tickCount={6}
          tickFormatter={(v) => `${v}%`}
        />
        <Radar
          name="Cumplimiento"
          dataKey="value"
          stroke={COLORS.stroke}
          fill={COLORS.fill}
          fillOpacity={0.18}
          strokeWidth={2}
          dot={{ r: 4, fill: COLORS.fill, strokeWidth: 0 }}
        />
        <Tooltip
          formatter={(v) => [`${Number(v).toFixed(1)}%`, "Cumplimiento"]}
          contentStyle={{ borderRadius: 12, border: "1px solid rgba(255,255,255,0.7)", background: "rgba(255,255,255,0.9)", backdropFilter: "blur(12px)" }}
        />
      </RadarChart>
    </ResponsiveContainer>
  );
}