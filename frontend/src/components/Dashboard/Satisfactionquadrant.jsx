import { useMemo } from "react";
import {
  ScatterChart, Scatter, XAxis, YAxis, CartesianGrid,
  Tooltip, ReferenceLine, ResponsiveContainer, Cell, LabelList,
} from "recharts";
import { useChartColors } from "../../hooks/useChartColors";

const META = 80;

const SEM = { success: "#98C062", warning: "#EA9947", danger: "#DF4585" };

function quadColor(xi, xe) {
  if (xi >= META && xe >= META) return SEM.success;
  if (xi < 70    || xe < 70)    return SEM.danger;
  return SEM.warning;
}
function quadLabel(xi, xe) {
  if (xi >= META && xe >= META) return "Campeón";
  if (xi >= META && xe < META)  return "Int. fuerte";
  if (xi < META  && xe >= META) return "Ext. fuerte";
  return "Crítico";
}

function CustomTooltip({ active, payload, c1, c2, tooltipStyle }) {
  if (!active || !payload?.length) return null;
  const d = payload[0]?.payload;
  if (!d) return null;
  const lbl = quadLabel(d.y, d.x);
  const col = quadColor(d.y, d.x);
  return (
    <div className="glass rounded-xl px-3 py-2.5 shadow-xl" style={{ border: `1px solid ${tooltipStyle.borderColor}`, fontSize: 12, background: tooltipStyle.background }}>
      <p className="font-semibold text-ink mb-1">{d.name}</p>
      <p className="text-ink/60">Interna: <b style={{ color: c1 }}>{d.y.toFixed(1)}%</b></p>
      <p className="text-ink/60">Externa: <b style={{ color: c2 }}>{d.x.toFixed(1)}%</b></p>
      <span className="inline-block mt-1.5 px-2 py-0.5 rounded-full text-[10px] font-semibold" style={{ background: `${col}22`, color: col, border: `1px solid ${col}44` }}>
        {lbl}
      </span>
    </div>
  );
}

function shortName(name) {
  const base = name.split("(")[0].trim();
  return base.length > 14 ? base.slice(0, 13) + "…" : base;
}

export default function SatisfactionQuadrant({ data = [], height = 320 }) {
  const c = useChartColors();

  const points = useMemo(() =>
    data
      .filter((d) => d.sat_interna != null && d.sat_externa != null)
      .map((d) => ({
        name: d.departamento || d.name || "—",
        x: +(+d.sat_externa * 100).toFixed(1),
        y: +(+d.sat_interna * 100).toFixed(1),
      })),
  [data]);

  const domainX = useMemo(() => {
    if (!points.length) return [50, 100];
    const vals = points.map((p) => p.x);
    return [Math.max(0, Math.floor((Math.min(...vals) - 4) / 5) * 5), 100];
  }, [points]);

  const domainY = useMemo(() => {
    if (!points.length) return [50, 100];
    const vals = points.map((p) => p.y);
    return [Math.max(0, Math.floor((Math.min(...vals) - 4) / 5) * 5), 100];
  }, [points]);

  if (!points.length) {
    return <div className="flex items-center justify-center h-44 text-sm text-ink/30">Sin datos de departamentos (se necesitan ambas: interna y externa).</div>;
  }

  const tooltipStyle = { background: c.tooltipBg, borderColor: c.tooltipBorder };

  return (
    <div>
      <ResponsiveContainer width="100%" height={height}>
        <ScatterChart margin={{ top: 28, right: 40, bottom: 40, left: 20 }}>
          <CartesianGrid strokeDasharray="3 3" stroke={c.grid} />
          <XAxis
            type="number" dataKey="x" domain={domainX} name="Externa"
            tick={{ fontSize: 10, fill: c.axis }}
            tickFormatter={(v) => `${v}%`}
            axisLine={false} tickLine={false} height={36}
            label={{ value: "Satisfacción externa (%)", position: "insideBottom", offset: -8, style: { fontSize: 11, fill: c.axis } }}
          />
          <YAxis
            type="number" dataKey="y" domain={domainY} name="Interna"
            tick={{ fontSize: 10, fill: c.axis }}
            tickFormatter={(v) => `${v}%`}
            axisLine={false} tickLine={false} width={44}
            label={{ value: "Satisfacción interna (%)", angle: -90, position: "insideLeft", offset: 14, style: { fontSize: 11, fill: c.axis } }}
          />
          <ReferenceLine x={META} stroke={c.refLine} strokeDasharray="5 4" strokeWidth={1.5} />
          <ReferenceLine y={META} stroke={c.refLine} strokeDasharray="5 4" strokeWidth={1.5} />
          <Tooltip content={<CustomTooltip c1={c.c1} c2={c.c2} tooltipStyle={tooltipStyle} />} cursor={{ strokeDasharray: "3 3" }} />
          <Scatter data={points} isAnimationActive={false}>
            <LabelList
              dataKey="name"
              content={({ x, y, value }) => {
                const offsetY = y < 50 ? 16 : -12;
                return (
                  <text x={x} y={y + offsetY} textAnchor="middle" fontSize={9} fill={c.labelFill}>
                    {shortName(value)}
                  </text>
                );
              }}
            />
            {points.map((p, i) => <Cell key={i} fill={quadColor(p.y, p.x)} fillOpacity={0.85} r={8} />)}
          </Scatter>
        </ScatterChart>
      </ResponsiveContainer>

      <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2 px-1 items-center">
        {[
          ["Campeón",       SEM.success, "≥80% en ambas"],
          ["En desarrollo", SEM.warning, "Una dimensión < 80%"],
          ["Crítico",       SEM.danger,  "< 70% en alguna"],
        ].map(([lbl, col, desc]) => (
          <div key={lbl} className="flex items-center gap-1.5">
            <div className="w-2.5 h-2.5 rounded-full" style={{ background: col }} />
            <span className="text-[10px] text-ink/50">
              <b style={{ color: col }}>{lbl}</b> — {desc}
            </span>
          </div>
        ))}
        <span className="text-[10px] text-ink/30 ml-auto italic">Hover para nombre completo</span>
      </div>
    </div>
  );
}
