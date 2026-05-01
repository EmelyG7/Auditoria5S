/**
 * BurndownChart.jsx
 * Gráfica de burndown del sprint activo.
 *
 * Muestra:
 *   - Línea ideal (pendiente perfecta desde planned_points a 0)
 *   - Línea real (trabajo restante según horas loggeadas)
 *   - Zona de alerta si la real supera la ideal
 *
 * Props:
 *   sprint      — objeto SprintResponse (con start_date, end_date, planned_points)
 *   tasks       — array de tareas del sprint (con estimated_hours, logged_hours, status)
 *   height      — alto del SVG (default 280)
 */

import { useMemo }             from "react";
import {
  Area, Line,
  XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, ReferenceLine, Legend,
  ComposedChart,
} from "recharts";
import { AlertTriangle, CheckCircle2, TrendingDown } from "lucide-react";
import GlassCard from "../Layout/GlassCard";

// ─── Helpers ──────────────────────────────────────────────────────────────────
const safe = (v, fb = 0) => (v != null && !isNaN(+v) ? +v : fb);

function addDays(date, n) {
  const d = new Date(date);
  d.setDate(d.getDate() + n);
  return d;
}

function fmtDate(date) {
  return new Date(date).toLocaleDateString("es-DO", { day: "2-digit", month: "short" });
}

function GTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="glass rounded-xl px-3 py-2 text-xs shadow-xl border border-white/60">
      <p className="font-semibold text-ink mb-1.5">{label}</p>
      {payload.map((p) => (
        <p key={p.dataKey} style={{ color: p.color }} className="flex justify-between gap-4">
          <span>{p.name}</span>
          <span className="font-semibold">{(+p.value).toFixed(1)}</span>
        </p>
      ))}
    </div>
  );
}

const COL = { primary: "#0A4F79", success: "#98C062", warning: "#EA9947", danger: "#DF4585" };

// ─── Componente ───────────────────────────────────────────────────────────────
export default function BurndownChart({ sprint, tasks = [], height = 280 }) {
  // ── Construir serie de datos ──────────────────────────────────────────────
  const { series, status, remainingPct } = useMemo(() => {
    if (!sprint?.start_date || !sprint?.end_date) {
      return { series: [], status: "sin_fechas", remainingPct: null };
    }

    const start      = new Date(sprint.start_date);
    const end        = new Date(sprint.end_date);
    const today      = new Date(); today.setHours(0,0,0,0);
    const totalDays  = Math.max(Math.round((end - start) / 86_400_000), 1);

    // Total de horas estimadas (como proxy de "work") del sprint
    const totalWork  = tasks.reduce((a, t) => a + safe(t.estimated_hours), 0)
                    || safe(sprint.planned_points) * 4  // fallback: 4h por SP
                    || 40;  // fallback final

    // Calcular trabajo completado por día (simulado: distribuido entre tareas done)
    const doneTasks   = tasks.filter((t) => t.status === "completada" && t.completed_at);
    const doneTotals = {};

    doneTasks.forEach((t) => {
      const d = t.completed_at?.split("T")[0];
      if (d) doneTotals[d] = (doneTotals[d] || 0) + safe(t.estimated_hours);
    });

    // Construir puntos día por día
    const points = [];
    let remaining = totalWork;

    for (let i = 0; i <= totalDays; i++) {
      const dayDate = addDays(start, i);
      const dayStr  = dayDate.toISOString().split("T")[0];
      const label   = fmtDate(dayDate);
      const ideal   = +(totalWork - (totalWork / totalDays) * i).toFixed(2);
      const isPast  = dayDate <= today;

      if (isPast) {
        const burned = doneTotals[dayStr] || 0;
        remaining    = Math.max(0, remaining - burned);
        points.push({ day: label, ideal: Math.max(0, ideal), real: +remaining.toFixed(2) });
      } else {
        points.push({ day: label, ideal: Math.max(0, ideal), real: null });
      }
    }

    // Determinar estado
    const lastReal   = points.filter((p) => p.real != null).pop();
    const lastIdeal  = lastReal
      ? points.find((p) => p.day === lastReal.day)?.ideal ?? 0
      : totalWork;

    const isAhead    = lastReal && lastReal.real < lastIdeal;
    const isBehind   = lastReal && lastReal.real > lastIdeal * 1.15;
    const remPct     = lastReal ? (lastReal.real / totalWork * 100) : null;

    return {
      series:       points,
      status:       isBehind ? "atrasado" : isAhead ? "adelantado" : "en_curso",
      remainingPct: remPct,
    };
  }, [sprint, tasks]);

  if (!sprint) return null;

  const daysLeft  = sprint.end_date
    ? Math.round((new Date(sprint.end_date) - new Date()) / 86_400_000)
    : null;

  const statusConfig = {
    atrasado:   { color: COL.danger,  icon: AlertTriangle, label: "Atrasado" },
    adelantado: { color: COL.success, icon: CheckCircle2,  label: "Adelantado" },
    en_curso:   { color: COL.primary, icon: TrendingDown,  label: "En curso" },
    sin_fechas: { color: "#94a3b8",   icon: TrendingDown,  label: "Sin fechas" },
  };
  const cfg = statusConfig[status] || statusConfig.en_curso;
  const Icon = cfg.icon;

  return (
    <GlassCard>
      {/* Header */}
      <div className="flex items-start justify-between mb-4">
        <div>
          <h3 className="text-xs font-semibold text-ink/50 uppercase tracking-wide mb-0.5">
            Burndown — {sprint.name}
          </h3>
          <div className="flex items-center gap-2 flex-wrap">
            <div className="flex items-center gap-1.5 text-xs"
                 style={{ color: cfg.color }}>
              <Icon size={12} />
              <span className="font-semibold">{cfg.label}</span>
            </div>
            {daysLeft != null && (
              <span className={`text-xs ${daysLeft < 0 ? "text-danger" : "text-ink/40"}`}>
                {daysLeft < 0
                  ? `Vencido hace ${Math.abs(daysLeft)}d`
                  : daysLeft === 0 ? "Vence hoy"
                  : `${daysLeft}d restantes`}
              </span>
            )}
            {remainingPct != null && (
              <span className="text-xs text-ink/40">
                · {remainingPct.toFixed(0)}% de trabajo restante
              </span>
            )}
          </div>
        </div>

        <div className="text-right">
          {sprint.planned_points && (
            <p className="text-xs text-ink/40">
              {safe(sprint.completed_points).toFixed(0)}/{safe(sprint.planned_points).toFixed(0)} SP
            </p>
          )}
        </div>
      </div>

      {/* Gráfica */}
      {series.length < 2 ? (
        <p className="text-sm text-ink/30 text-center py-8">
          Se necesitan al menos 2 días de sprint para mostrar el burndown.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <div style={{ minWidth: Math.max(series.length * 50, 320) }}>
            <ResponsiveContainer width="100%" height={height}>
              <ComposedChart data={series} margin={{ top: 8, right: 16, left: -8, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(30,30,47,0.06)" />
                <XAxis dataKey="day" tick={{ fontSize: 10 }} axisLine={false} tickLine={false} />
                <YAxis
                  tickFormatter={(v) => `${v.toFixed(0)}`}
                  tick={{ fontSize: 10 }} axisLine={false} tickLine={false}
                  label={{ value: "Trabajo restante", angle: -90, position: "insideLeft",
                           offset: 12, style: { fontSize: 10, fill: "rgba(30,30,47,0.4)" } }}
                />
                <Tooltip content={<GTooltip />} />
                <Legend wrapperStyle={{ fontSize: 11 }} />

                {/* Área de zona "detrás" */}
                <Area
                  type="monotone"
                  dataKey="ideal"
                  name="Ideal"
                  stroke={COL.primary}
                  fill={`${COL.primary}08`}
                  strokeWidth={1.5}
                  strokeDasharray="5 4"
                  dot={false}
                  activeDot={false}
                />

                {/* Línea real */}
                <Line
                  type="monotone"
                  dataKey="real"
                  name="Real"
                  stroke={status === "atrasado" ? COL.danger : COL.success}
                  strokeWidth={2.5}
                  dot={{ r: 3, fill: status === "atrasado" ? COL.danger : COL.success, strokeWidth: 0 }}
                  activeDot={{ r: 5 }}
                  connectNulls={false}
                />

                {/* Línea de hoy */}
                <ReferenceLine
                  x={fmtDate(new Date())}
                  stroke="rgba(30,30,47,0.2)"
                  strokeDasharray="3 3"
                  label={{ value: "Hoy", position: "top", fontSize: 9, fill: "rgba(30,30,47,0.4)" }}
                />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* Leyenda */}
      <div className="flex items-center gap-4 mt-2 text-[10px] text-ink/40 flex-wrap">
        <div className="flex items-center gap-1.5">
          <div className="w-6 border-t border-dashed" style={{ borderColor: COL.primary }} />
          <span>Línea ideal (pendiente perfecta)</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-6 border-t-2" style={{ borderColor: status === "atrasado" ? COL.danger : COL.success }} />
          <span>Progreso real</span>
        </div>
      </div>
    </GlassCard>
  );
}