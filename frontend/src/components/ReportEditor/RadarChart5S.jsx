/**
 * RadarChart5S.jsx — Pentágono de las 5S para el Reporte de Presentación.
 *
 * Uso simple (una sucursal):
 *   <RadarChart5S data={[{ dimension: "Clasificacion (25%)", value: 92 }]} color={deptColor} />
 *
 * Uso múltiple (todas las sucursales superpuestas, Conclusión General):
 *   <RadarChart5SMulti data={rows} series={[{ key: "Tienda A", color: "#..." }]} />
 */

import {
  Radar, RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis,
  ResponsiveContainer, Tooltip, Legend,
} from "recharts";

export default function RadarChart5S({ data = [], color = "#7B2D6E", height = 260 }) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <RadarChart data={data} outerRadius="68%" margin={{ top: 8, right: 16, bottom: 8, left: 16 }}>
        <PolarGrid stroke="rgba(0,0,0,0.10)" />
        <PolarAngleAxis dataKey="dimension" tick={{ fontSize: 10, fill: "#333" }} />
        <PolarRadiusAxis domain={[0, 100]} tick={false} axisLine={false} tickCount={5} />
        <Radar
          name="Cumplimiento"
          dataKey="value"
          stroke={color}
          fill={color}
          fillOpacity={0.4}
          strokeWidth={2}
          dot={{ r: 3, fill: color, strokeWidth: 0 }}
        />
        <Tooltip formatter={(v) => [`${Number(v).toFixed(1)}%`, "Cumplimiento"]} />
      </RadarChart>
    </ResponsiveContainer>
  );
}

export function RadarChart5SMulti({ data = [], series = [], height = 340 }) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <RadarChart data={data} outerRadius="65%" margin={{ top: 8, right: 16, bottom: 8, left: 16 }}>
        <PolarGrid stroke="rgba(0,0,0,0.10)" />
        <PolarAngleAxis dataKey="dimension" tick={{ fontSize: 10, fill: "#333" }} />
        <PolarRadiusAxis domain={[0, 100]} tick={false} axisLine={false} tickCount={5} />
        {series.map((s) => (
          <Radar
            key={s.key}
            name={s.key}
            dataKey={s.key}
            stroke={s.color}
            fill={s.color}
            fillOpacity={0.08}
            strokeWidth={1.75}
            dot={{ r: 2, fill: s.color, strokeWidth: 0 }}
          />
        ))}
        <Legend wrapperStyle={{ fontSize: 10 }} />
        <Tooltip formatter={(v) => [`${Number(v).toFixed(1)}%`]} />
      </RadarChart>
    </ResponsiveContainer>
  );
}
