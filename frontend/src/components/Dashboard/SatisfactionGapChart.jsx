/**
 * SatisfactionGapChart.jsx
 *
 * Dos gráficas de análisis de brechas:
 *
 * 1. GapToDimensions — barras horizontales de cuántos pp
 *    falta cada dimensión para llegar a la meta (90%).
 *
 * 2. DeptDelta — barras verticales del delta (interna − externa)
 *    por departamento. Valores positivos = interna supera externa.
 *    Color según magnitud (verde/amarillo/rojo).
 *
 * Props:
 *   radarData   — array { subject, value (0-100) }
 *   byDept      — array { name, fullName, interna, externa } (ya en %)
 *   meta        — número, meta en % (default 90)
 */

import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  CartesianGrid, ReferenceLine, Cell, LabelList,
} from "recharts";

const META_DEFAULT = 90;

const COL = {
  success:   "#98C062",
  warning:   "#EA9947",
  danger:    "#DF4585",
  primary:   "#0A4F79",
};

function deltaColor(d) {
  const a = Math.abs(d);
  if (a <= 3) return COL.success;
  if (a <= 7) return COL.warning;
  return COL.danger;
}

function gapColor(gap) {
  // gap = META - value; cuanto más pequeño, mejor
  if (gap <= 0)  return COL.success;
  if (gap <= 5)  return COL.warning;
  return COL.danger;
}

// Tooltip genérico glass
function GTooltip({ active, payload, label, formatter }) {
  if (!active || !payload?.length) return null;
  return (
    <div
      className="glass rounded-xl px-3 py-2 text-xs shadow-xl"
      style={{ border: "1px solid rgba(255,255,255,0.6)" }}
    >
      <p className="font-semibold text-ink mb-1">{label}</p>
      {payload.map((p) => (
        <p key={p.dataKey} style={{ color: p.color }} className="flex justify-between gap-4">
          <span>{p.name}</span>
          <span className="font-semibold">
            {formatter ? formatter(p.value, p.name) : `${(+p.value).toFixed(1)}%`}
          </span>
        </p>
      ))}
    </div>
  );
}

// ── Gráfica 1: brecha por dimensión ──────────────────────────────────────────
export function GapToDimensions({ radarData = [], meta = META_DEFAULT }) {
  const data = radarData
    .map((d) => ({
      name:  d.subject || d.fullLabel || "—",
      gap:   +(meta - d.value).toFixed(1),
      value: +d.value.toFixed(1),
    }))
    .sort((a, b) => b.gap - a.gap);

  if (!data.length) {
    return (
      <div className="flex items-center justify-center h-32 text-sm text-ink/30">
        Sin datos de dimensiones.
      </div>
    );
  }

  return (
    <div>
      <div style={{ position: "relative", width: "100%", height: data.length * 48 + 48 }}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart
            data={data}
            layout="vertical"
            margin={{ top: 4, right: 56, left: 8, bottom: 4 }}
          >
            <CartesianGrid
              horizontal={false}
              strokeDasharray="3 3"
              stroke="rgba(30,30,47,0.05)"
            />
            <XAxis
              type="number"
              domain={[0, 15]}
              tick={{ fontSize: 10, fill: "rgba(30,30,47,0.5)" }}
              tickFormatter={(v) => `${v} pp`}
              axisLine={false}
              tickLine={false}
            />
            <YAxis
              type="category"
              dataKey="name"
              width={95}
              tick={{ fontSize: 11, fill: "rgba(30,30,47,0.75)" }}
              axisLine={false}
              tickLine={false}
            />
            <Tooltip
              content={
                <GTooltip
                  formatter={(v, n) =>
                    n === "gap"
                      ? v <= 0 ? "¡Meta alcanzada!" : `Faltan ${v} pp`
                      : `${v}%`
                  }
                />
              }
            />
            <ReferenceLine x={0} stroke="rgba(30,30,47,0.15)" strokeWidth={1} />

            <Bar
              dataKey="gap"
              name="Brecha a meta"
              radius={[0, 6, 6, 0]}
              maxBarSize={26}
            >
              <LabelList
                dataKey="gap"
                position="right"
                formatter={(v) => v <= 0 ? "✓" : `${v} pp`}
                style={{ fontSize: 10, fill: "rgba(30,30,47,0.5)" }}
              />
              {data.map((d, i) => (
                <Cell key={i} fill={gapColor(d.gap)} fillOpacity={0.85} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>

      <p className="text-[10px] text-ink/30 mt-1 text-center">
        Meta: {meta}% | Barras más cortas = mejor desempeño
      </p>
    </div>
  );
}

// ── Gráfica 2: delta interna − externa por departamento ───────────────────────
export function DeptDelta({ byDept = [] }) {
  const data = byDept
    .filter((d) => d.interna != null && d.externa != null)
    .map((d) => ({
      name:  d.name || "—",
      full:  d.fullName || d.name || "—",
      delta: +((+d.interna) - (+d.externa)).toFixed(1),
    }))
    .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));

  if (!data.length) {
    return (
      <div className="flex items-center justify-center h-32 text-sm text-ink/30">
        Sin datos de departamentos con ambas dimensiones.
      </div>
    );
  }

  const barH = Math.max(data.length * 44, 200);

  return (
    <div>
      <div style={{ position: "relative", width: "100%", height: barH }}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart
            data={data}
            layout="vertical"
            margin={{ top: 4, right: 56, left: 8, bottom: 4 }}
          >
            <CartesianGrid
              horizontal={false}
              strokeDasharray="3 3"
              stroke="rgba(30,30,47,0.05)"
            />
            <XAxis
              type="number"
              domain={["auto", "auto"]}
              tick={{ fontSize: 10, fill: "rgba(30,30,47,0.5)" }}
              tickFormatter={(v) => `${v > 0 ? "+" : ""}${v} pp`}
              axisLine={false}
              tickLine={false}
            />
            <YAxis
              type="category"
              dataKey="name"
              width={95}
              tick={{ fontSize: 11, fill: "rgba(30,30,47,0.75)" }}
              axisLine={false}
              tickLine={false}
            />
            <Tooltip
              content={
                <GTooltip
                  formatter={(v) =>
                    v > 0
                      ? `Interna supera en ${v.toFixed(1)} pp`
                      : v < 0
                      ? `Externa supera en ${Math.abs(v).toFixed(1)} pp`
                      : "Sin diferencia"
                  }
                />
              }
            />
            {/* Línea cero */}
            <ReferenceLine x={0} stroke="rgba(30,30,47,0.2)" strokeWidth={1.5} />
            {/* Líneas de ±3 pp (umbral aceptable) */}
            <ReferenceLine
              x={3} stroke={COL.warning}
              strokeDasharray="4 3" strokeOpacity={0.4} strokeWidth={1}
              label={{ value: "+3 pp", position: "insideTopRight", fontSize: 9, fill: COL.warning }}
            />
            <ReferenceLine
              x={-3} stroke={COL.warning}
              strokeDasharray="4 3" strokeOpacity={0.4} strokeWidth={1}
              label={{ value: "−3 pp", position: "insideTopLeft", fontSize: 9, fill: COL.warning }}
            />

            <Bar
              dataKey="delta"
              name="Delta Int−Ext"
              radius={[0, 6, 6, 0]}
              maxBarSize={26}
            >
              <LabelList
                dataKey="delta"
                position="right"
                formatter={(v) => `${v > 0 ? "+" : ""}${v} pp`}
                style={{ fontSize: 10, fill: "rgba(30,30,47,0.5)" }}
              />
              {data.map((d, i) => (
                <Cell key={i} fill={deltaColor(d.delta)} fillOpacity={0.85} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Leyenda */}
      <div className="flex flex-wrap gap-3 mt-2">
        {[
          ["≤ ±3 pp", COL.success, "Percepción consistente"],
          ["±4-7 pp",  COL.warning, "Diferencia notable"],
          ["> ±7 pp",  COL.danger,  "Inconsistencia alta"],
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