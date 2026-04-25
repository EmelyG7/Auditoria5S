/**
 * SatisfactionQuadrant.jsx
 *
 * Gráfica de cuadrante estratégico: posiciona cada departamento
 * en el plano Satisfacción Interna (Y) × Satisfacción Externa (X).
 *
 * Cuadrantes (meta = 80%):
 *   Superior-derecho  → Campeón      (ambas ≥ 80)
 *   Superior-izquierdo→ Int. fuerte  (interna ≥ 80, externa < 80)
 *   Inferior-derecho  → Ext. fuerte  (externa ≥ 80, interna < 80)
 *   Inferior-izquierdo→ Crítico      (ambas < 80)
 *
 * Props:
 *   data  — array de { departamento, sat_interna, sat_externa }  (valores 0-1)
 *   height — alto del SVG (default 320)
 */

import { useMemo } from "react";
import {
  ScatterChart, Scatter, XAxis, YAxis, CartesianGrid,
  Tooltip, ReferenceLine, ResponsiveContainer, Cell, LabelList,
} from "recharts";

const META = 80; // % umbral de cuadrantes

const COL = {
  success:   "#98C062",
  warning:   "#EA9947",
  danger:    "#DF4585",
  primary:   "#0A4F79",
  secondary: "#B4427F",
};

function quadColor(xi, xe) {
  if (xi >= META && xe >= META) return COL.success;
  if (xi < 70    || xe < 70)    return COL.danger;
  return COL.warning;
}

function quadLabel(xi, xe) {
  if (xi >= META && xe >= META) return "Campeón";
  if (xi >= META && xe < META)  return "Int. fuerte";
  if (xi < META  && xe >= META) return "Ext. fuerte";
  return "Crítico";
}

// Tooltip personalizado
function CustomTooltip({ active, payload }) {
  if (!active || !payload?.length) return null;
  const d = payload[0]?.payload;
  if (!d) return null;
  const lbl = quadLabel(d.y, d.x);
  const c   = quadColor(d.y, d.x);
  return (
    <div
      className="glass rounded-xl px-3 py-2.5 shadow-xl"
      style={{ border: "1px solid rgba(255,255,255,0.6)", fontSize: 12 }}
    >
      <p className="font-semibold text-ink mb-1">{d.name}</p>
      <p className="text-ink/60">Interna: <b style={{ color: COL.primary }}>{d.y.toFixed(1)}%</b></p>
      <p className="text-ink/60">Externa: <b style={{ color: COL.secondary }}>{d.x.toFixed(1)}%</b></p>
      <span
        className="inline-block mt-1.5 px-2 py-0.5 rounded-full text-[10px] font-semibold"
        style={{ background: `${c}20`, color: c, border: `1px solid ${c}40` }}
      >
        {lbl}
      </span>
    </div>
  );
}

// Label del punto (nombre del departamento)
function DeptLabel({ x, y, value }) {
  return (
    <text
      x={x}
      y={y - 10}
      textAnchor="middle"
      fontSize={10}
      fill="rgba(30,30,47,0.6)"
    >
      {value}
    </text>
  );
}

export default function SatisfactionQuadrant({ data = [], height = 320 }) {
  // Transformar: sat_interna/externa 0-1 → porcentaje
  const points = useMemo(() =>
    data.map((d) => ({
      name: d.departamento || d.name || "—",
      x:    +(+d.sat_externa * 100).toFixed(1),
      y:    +(+d.sat_interna * 100).toFixed(1),
    })),
  [data]);

  if (!points.length) {
    return (
      <div className="flex items-center justify-center h-44 text-sm text-ink/30">
        Sin datos de departamentos.
      </div>
    );
  }

  return (
    <div>
      <ResponsiveContainer width="100%" height={height}>
        <ScatterChart margin={{ top: 24, right: 32, bottom: 24, left: 16 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(30,30,47,0.06)" />

          <XAxis
            type="number"
            dataKey="x"
            domain={[55, 100]}
            name="Externa"
            tick={{ fontSize: 10, fill: "rgba(30,30,47,0.5)" }}
            tickFormatter={(v) => `${v}%`}
            axisLine={false}
            tickLine={false}
            label={{
              value: "Satisfacción externa (%)",
              position: "insideBottom",
              offset: -12,
              style: { fontSize: 11, fill: "rgba(30,30,47,0.4)" },
            }}
          />

          <YAxis
            type="number"
            dataKey="y"
            domain={[55, 100]}
            name="Interna"
            tick={{ fontSize: 10, fill: "rgba(30,30,47,0.5)" }}
            tickFormatter={(v) => `${v}%`}
            axisLine={false}
            tickLine={false}
            label={{
              value: "Satisfacción interna (%)",
              angle: -90,
              position: "insideLeft",
              offset: 12,
              style: { fontSize: 11, fill: "rgba(30,30,47,0.4)" },
            }}
          />

          {/* Líneas divisoras de cuadrante */}
          <ReferenceLine
            x={META}
            stroke="rgba(30,30,47,0.15)"
            strokeDasharray="5 4"
            strokeWidth={1.5}
          />
          <ReferenceLine
            y={META}
            stroke="rgba(30,30,47,0.15)"
            strokeDasharray="5 4"
            strokeWidth={1.5}
          />

          <Tooltip content={<CustomTooltip />} cursor={{ strokeDasharray: "3 3" }} />

          <Scatter data={points} isAnimationActive={false}>
            <LabelList
              dataKey="name"
              content={DeptLabel}
            />
            {points.map((p, i) => (
              <Cell
                key={i}
                fill={quadColor(p.y, p.x)}
                fillOpacity={0.85}
                r={9}
              />
            ))}
          </Scatter>
        </ScatterChart>
      </ResponsiveContainer>

      {/* Leyenda de cuadrantes */}
      <div className="flex flex-wrap gap-3 mt-1 px-1">
        {[
          ["Campeón",       COL.success,   "≥80% en ambas"],
          ["En desarrollo", COL.warning,   "Una dimensión < 80%"],
          ["Crítico",       COL.danger,    "< 70% en alguna"],
        ].map(([lbl, c, desc]) => (
          <div key={lbl} className="flex items-center gap-1.5">
            <div className="w-2.5 h-2.5 rounded-full" style={{ background: c }} />
            <span className="text-[10px] text-ink/50">
              <b style={{ color: c }}>{lbl}</b> — {desc}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}