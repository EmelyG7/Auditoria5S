import { useMemo } from "react";
import { PieChart, Pie, Cell, ResponsiveContainer } from "recharts";
import {
  TrendingUp, TrendingDown, Target, Users,
  Star, Activity, Award,
} from "lucide-react";
import { useChartColors } from "../../hooks/useChartColors";

const META    = 90;
const SAT_EXC = 90;
const SAT_ACC = 80;

const SEM = { success: "#98C062", warning: "#EA9947", danger: "#DF4585" };

const safe    = (v, fb = 0) => (v != null && !Number.isNaN(+v) ? +v : fb);
const fmtPct  = (v) => (v != null ? `${(safe(v) * 100).toFixed(1)}%` : "—");
const fmtPctN = (v) => (v != null ? `${safe(v).toFixed(1)}%` : "—");

function semColor01(v) {
  if (v == null) return null;
  const p = safe(v) * 100;
  if (p >= SAT_EXC) return SEM.success;
  if (p >= SAT_ACC) return SEM.warning;
  return SEM.danger;
}
function semLabel01(v) {
  if (v == null) return "Sin datos";
  const p = safe(v) * 100;
  if (p >= SAT_EXC) return "Excelente";
  if (p >= SAT_ACC) return "Aceptable";
  return "Crítico";
}

function MetricTile({ label, value, sub, icon: Icon, color }) {
  const c = color || "var(--accent)";
  return (
    <div
      className="rounded-2xl p-3"
      style={{ background: `${c}12`, border: `1px solid ${c}28` }}
    >
      <div className="flex items-center gap-2 mb-1.5">
        <div
          className="w-6 h-6 rounded-lg flex items-center justify-center shrink-0"
          style={{ background: `${c}22` }}
        >
          <Icon size={12} style={{ color: c }} />
        </div>
        <p className="text-[10px] font-semibold uppercase tracking-wide leading-tight" style={{ color: "var(--text-faint)" }}>
          {label}
        </p>
      </div>
      <p className="text-lg font-bold leading-tight" style={{ color: c }}>
        {value}
      </p>
      {sub && (
        <p className="text-[10px] mt-0.5" style={{ color: "var(--text-faint)" }}>{sub}</p>
      )}
    </div>
  );
}

function GaugeArc({ pct }) {
  const c   = semColor01(pct / 100) || SEM.success;
  const val = Math.min(Math.max(pct, 0), 100);
  const data = [{ value: val }, { value: 100 - val }];

  return (
    <div className="relative" style={{ width: "100%", height: 180 }}>
      <ResponsiveContainer width="100%" height={180}>
        <PieChart>
          <Pie
            data={data}
            cx="50%" cy="85%"
            startAngle={180} endAngle={0}
            innerRadius="65%" outerRadius="85%"
            paddingAngle={0} dataKey="value"
            strokeWidth={0} isAnimationActive
          >
            <Cell fill={c} />
            <Cell fill="var(--surface-2)" />
          </Pie>
        </PieChart>
      </ResponsiveContainer>

      <div className="absolute inset-0 flex flex-col items-center justify-end pb-4" style={{ pointerEvents: "none" }}>
        <p className="text-2xl font-bold leading-none" style={{ color: c }}>
          {pct.toFixed(1)}%
        </p>
        <p className="text-xs mt-1" style={{ color: "var(--text-faint)" }}>Índice global</p>
      </div>

      <div className="flex justify-between px-6 -mt-1">
        <span className="text-[10px]" style={{ color: "var(--text-faint)" }}>0%</span>
        <span className="text-[10px]" style={{ color: "var(--text-faint)" }}>100%</span>
      </div>
    </div>
  );
}

export default function SatisfactionGauge({ kpis, radarData = [] }) {
  const { c1 } = useChartColors();
  const si = kpis?.sat_interna_global;
  const se = kpis?.sat_externa_global;

  const global = useMemo(() => {
    const vals = [si, se].filter((v) => v != null).map(Number);
    return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null;
  }, [si, se]);

  const globalPct = global != null ? +(global * 100).toFixed(1) : 0;

  const brecha = useMemo(() => {
    if (si == null || se == null) return null;
    return +((safe(si) - safe(se)) * 100).toFixed(1);
  }, [si, se]);

  const distMeta = useMemo(() => {
    if (global == null) return null;
    return +(META - global * 100).toFixed(1);
  }, [global]);

  const { mejorDim, peorDim } = useMemo(() => {
    if (!radarData.length) return { mejorDim: null, peorDim: null };
    const sorted = [...radarData].sort((a, b) => b.value - a.value);
    return { mejorDim: sorted[0], peorDim: sorted[sorted.length - 1] };
  }, [radarData]);

  const brechaColor = brecha != null
    ? Math.abs(brecha) <= 3 ? SEM.success : Math.abs(brecha) <= 7 ? SEM.warning : SEM.danger
    : c1;

  const distColor = distMeta != null
    ? distMeta <= 0 ? SEM.success : distMeta <= 5 ? SEM.warning : SEM.danger
    : c1;

  return (
    <div>
      <GaugeArc pct={globalPct} />

      <div className="grid grid-cols-2 gap-2.5 mt-4">
        <MetricTile label="Sat. Interna"    value={fmtPct(si)}    sub={semLabel01(si)}   icon={Users}    color={semColor01(si)    || c1} />
        <MetricTile label="Sat. Externa"    value={fmtPct(se)}    sub={semLabel01(se)}   icon={Star}     color={semColor01(se)    || c1} />
        <MetricTile
          label="Brecha int−ext"
          value={brecha != null ? `${brecha > 0 ? "+" : ""}${brecha} pp` : "—"}
          sub={brecha != null ? brecha > 3 ? "Interna supera ext." : brecha < -3 ? "Externa supera int." : "Bien equilibrado" : ""}
          icon={brecha != null && brecha >= 0 ? TrendingUp : TrendingDown}
          color={brechaColor}
        />
        <MetricTile
          label="Dist. a meta"
          value={distMeta != null ? `${distMeta > 0 ? "−" : "+"}${Math.abs(distMeta)} pp` : "—"}
          sub={`Meta: ${META}%`}
          icon={Target}
          color={distColor}
        />
        {mejorDim && <MetricTile label="Mejor dimensión" value={mejorDim.subject} sub={`${mejorDim.value.toFixed(1)}%`} icon={Award}    color={SEM.success} />}
        {peorDim  && <MetricTile label="Dimensión crítica" value={peorDim.subject} sub={`${peorDim.value.toFixed(1)}%`}  icon={Activity} color={SEM.danger} />}
      </div>

      {global != null && (
        <div className="mt-4">
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-[10px] font-semibold uppercase tracking-wide" style={{ color: "var(--text-faint)" }}>
              Avance hacia meta ({META}%)
            </span>
            <span className="text-[10px] font-bold" style={{ color: semColor01(global) || c1 }}>
              {((globalPct / META) * 100).toFixed(0)}%
            </span>
          </div>
          <div className="h-2 rounded-full overflow-hidden" style={{ background: "var(--surface-2)" }}>
            <div
              className="h-full rounded-full transition-all duration-700"
              style={{ width: `${Math.min((globalPct / META) * 100, 100)}%`, background: semColor01(global) || c1 }}
            />
          </div>
          <div className="flex justify-between mt-1">
            <span className="text-[9px]" style={{ color: "var(--text-faint)" }}>0%</span>
            <span className="text-[9px]" style={{ color: "var(--text-faint)" }}>Meta {META}%</span>
          </div>
        </div>
      )}
    </div>
  );
}
