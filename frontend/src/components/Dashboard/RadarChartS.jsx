import { Radar, RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, ResponsiveContainer, Tooltip } from "recharts";
import { useChartColors } from "../../hooks/useChartColors";

export default function RadarChartS({ data = [], height = 500 }) {
  const c = useChartColors();

  return (
    <ResponsiveContainer width="100%" height={height}>
      <RadarChart data={data} margin={{ top: 16, right: 40, bottom: 16, left: 40 }} outerRadius="70%">
        <PolarGrid stroke={c.grid} />
        <PolarAngleAxis
          dataKey="s"
          tick={{ fontSize: 11, fill: c.axisStrong, fontWeight: 500 }}
        />
        <PolarRadiusAxis
          domain={[0, 100]}
          tick={false}
          axisLine={false}
          tickCount={5}
        />
        <Radar
          name="Cumplimiento"
          dataKey="value"
          stroke={c.c1}
          fill={c.c1}
          fillOpacity={0.18}
          strokeWidth={2}
          dot={{ r: 4, fill: c.c1, strokeWidth: 0 }}
        />
        <Tooltip
          formatter={(v) => [`${Number(v).toFixed(1)}%`, "Cumplimiento"]}
          contentStyle={c.tooltipStyle}
        />
      </RadarChart>
    </ResponsiveContainer>
  );
}
