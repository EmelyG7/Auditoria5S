/**
 * SatisfactionGauge.jsx
 *
 * Gauge semicircular + tarjetas de métricas complementarias:
 *   - Índice global (promedio de interna y externa)
 *   - Satisfacción interna
 *   - Satisfacción externa
 *   - Brecha interna − externa
 *   - Distancia a meta (90%)
 *   - Mejor / peor dimensión
 *
 * Props:
 *   kpis     — objeto kpis del endpoint /surveys/kpis
 *   radarData — array { subject, value (0-100) } para mejor/peor dim
 */

import { useMemo } from "react";
import {
  PieChart, Pie, Cell, ResponsiveContainer,
} from "recharts";
import {
  TrendingUp, TrendingDown, Target, Users,
  Star, Activity, Award,
} from "lucide-react";

const META       = 90;
const SAT_EXC    = 90;
const SAT_ACC    = 80;

const COL = {
  success:   "#98C062",
  warning:   "#EA9947",
  danger:    "#DF4585",
  primary:   "#0A4F79",
  secondary: "#B4427F",
};

const safe    = (v, fb = 0) => (v != null && !Number.isNaN(+v) ? +v : fb);
const fmtPct  = (v) => (v != null ? `${(safe(v) * 100).toFixed(1)}%` : "—");
const fmtPctN = (v) => (v != null ? `${safe(v).toFixed(1)}%` : "—"); // ya en porcentaje

function semColor01(v) {
  if (v == null) return COL.primary;
  const p = safe(v) * 100;
  if (p >= SAT_EXC) return COL.success;
  if (p >= SAT_ACC) return COL.warning;
  return COL.danger;
}

function semLabel01(v) {
  if (v == null) return "Sin datos";
  const p = safe(v) * 100;
  if (p >= SAT_EXC) return "Excelente";
  if (p >= SAT_ACC) return "Aceptable";
  return "Crítico";
}

// Tarjeta métrica pequeña
function MetricTile({ label, value, sub, icon: Icon, color }) {
  const c = color || COL.primary;
  return (
    <div
      className="rounded-2xl p-3"
      style={{ background: `${c}0F`, border: `1px solid ${c}25` }}
    >
      <div className="flex items-center gap-2 mb-1.5">
        <div
          className="w-6 h-6 rounded-lg flex items-center justify-center shrink-0"
          style={{ background: `${c}20` }}
        >
          <Icon size={12} style={{ color: c }} />
        </div>
        <p className="text-[10px] font-semibold text-ink/50 uppercase tracking-wide leading-tight">
          {label}
        </p>
      </div>
      <p className="text-lg font-bold leading-tight" style={{ color: c }}>
        {value}
      </p>
      {sub && (
        <p className="text-[10px] text-ink/40 mt-0.5">{sub}</p>
      )}
    </div>
  );
}

// Gauge personalizado con Recharts Pie
function GaugeArc({ pct }) {
  const c     = semColor01(pct / 100);
  const bg    = "rgba(30,30,47,0.08)";
  const val   = Math.min(Math.max(pct, 0), 100);
  const data  = [{ value: val }, { value: 100 - val }];

  return (
    <div className="relative" style={{ width: "100%", height: 180 }}>
      <ResponsiveContainer width="100%" height={180}>
        <PieChart>
          <Pie
            data={data}
            cx="50%"
            cy="85%"
            startAngle={180}
            endAngle={0}
            innerRadius="65%"
            outerRadius="85%"
            paddingAngle={0}
            dataKey="value"
            strokeWidth={0}
            isAnimationActive
          >
            <Cell fill={c} />
            <Cell fill={bg} />
          </Pie>
        </PieChart>
      </ResponsiveContainer>

      {/* Texto central */}
      <div
        className="absolute inset-0 flex flex-col items-center justify-end pb-4"
        style={{ pointerEvents: "none" }}
      >
        <p className="text-4xl font-bold leading-none" style={{ color: c }}>
          {pct.toFixed(1)}%
        </p>
        <p className="text-xs text-ink/40 mt-1">Índice global</p>
      </div>

      {/* Marcas de referencia */}
      <div className="flex justify-between px-6 -mt-1">
        <span className="text-[10px] text-ink/30">0%</span>
        <span className="text-[10px] text-ink/30">100%</span>
      </div>
    </div>
  );
}

export default function SatisfactionGauge({ kpis, radarData = [] }) {
  const si = kpis?.sat_interna_global;
  const se = kpis?.sat_externa_global;

  const global = useMemo(() => {
    const vals = [si, se].filter((v) => v != null).map(Number);
    return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null;
  }, [si, se]);

  const globalPct = global != null ? +(global * 100).toFixed(1) : 0;

  // Brecha interna − externa
  const brecha = useMemo(() => {
    if (si == null || se == null) return null;
    return +((safe(si) - safe(se)) * 100).toFixed(1);
  }, [si, se]);

  // Distancia a meta
  const distMeta = useMemo(() => {
    if (global == null) return null;
    return +(META - global * 100).toFixed(1);
  }, [global]);

  // Mejor / peor dimensión
  const { mejorDim, peorDim } = useMemo(() => {
    if (!radarData.length) return { mejorDim: null, peorDim: null };
    const sorted = [...radarData].sort((a, b) => b.value - a.value);
    return { mejorDim: sorted[0], peorDim: sorted[sorted.length - 1] };
  }, [radarData]);

  return (
    <div>
      {/* Gauge principal */}
      <GaugeArc pct={globalPct} />

      {/* Grid de métricas */}
      <div className="grid grid-cols-2 gap-2.5 mt-4">
        <MetricTile
          label="Sat. Interna"
          value={fmtPct(si)}
          sub={semLabel01(si)}
          icon={Users}
          color={semColor01(si)}
        />
        <MetricTile
          label="Sat. Externa"
          value={fmtPct(se)}
          sub={semLabel01(se)}
          icon={Star}
          color={semColor01(se)}
        />
        <MetricTile
          label="Brecha int−ext"
          value={brecha != null ? `${brecha > 0 ? "+" : ""}${brecha} pp` : "—"}
          sub={brecha != null
            ? brecha > 3 ? "Interna supera ext."
            : brecha < -3 ? "Externa supera int."
            : "Bien equilibrado"
            : ""}
          icon={brecha != null && brecha >= 0 ? TrendingUp : TrendingDown}
          color={brecha != null
            ? Math.abs(brecha) <= 3 ? COL.success
            : Math.abs(brecha) <= 7 ? COL.warning
            : COL.danger
            : COL.primary}
        />
        <MetricTile
          label="Dist. a meta"
          value={distMeta != null ? `${distMeta > 0 ? "−" : "+"}${Math.abs(distMeta)} pp` : "—"}
          sub={`Meta: ${META}%`}
          icon={Target}
          color={distMeta != null
            ? distMeta <= 0  ? COL.success
            : distMeta <= 5  ? COL.warning
            : COL.danger
            : COL.primary}
        />
        {mejorDim && (
          <MetricTile
            label="Mejor dimensión"
            value={mejorDim.subject}
            sub={`${mejorDim.value.toFixed(1)}%`}
            icon={Award}
            color={COL.success}
          />
        )}
        {peorDim && (
          <MetricTile
            label="Dimensión crítica"
            value={peorDim.subject}
            sub={`${peorDim.value.toFixed(1)}%`}
            icon={Activity}
            color={COL.danger}
          />
        )}
      </div>

      {/* Barra de progreso hacia meta */}
      {global != null && (
        <div className="mt-4">
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-[10px] text-ink/50 uppercase tracking-wide font-semibold">
              Avance hacia meta ({META}%)
            </span>
            <span
              className="text-[10px] font-bold"
              style={{ color: semColor01(global) }}
            >
              {((globalPct / META) * 100).toFixed(0)}%
            </span>
          </div>
          <div className="h-2 bg-ink/8 rounded-full overflow-hidden">
            <div
              className="h-full rounded-full transition-all duration-700"
              style={{
                width:      `${Math.min((globalPct / META) * 100, 100)}%`,
                background: semColor01(global),
              }}
            />
          </div>
          <div className="flex justify-between mt-1">
            <span className="text-[9px] text-ink/30">0%</span>
            <span className="text-[9px] text-ink/30">Meta {META}%</span>
          </div>
        </div>
      )}
    </div>
  );
}