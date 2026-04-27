/**
 * DashboardSurveys.jsx — versión completa con suite analítica
 *
 * VISTAS:
 *   General    → Radar, Barras comparativa, Tabla sedes, Cuadrante estratégico
 *   Interna    → Gauge, Barras horizontales dept, Evolución temporal, Tabla pilares
 *   Externa    → Barras horizontales dept, Evolución temporal, Tabla comparativa
 *
 * PANELES ANALÍTICOS (pestaña "Análisis avanzado"):
 *   - Cuadrante estratégico (Interna × Externa)
 *   - Heatmap dimensiones × departamento
 *   - Gauge + métricas complementarias
 *   - Brechas: dimensiones vs meta + delta int−ext por depto
 *
 * Una ÚNICA query a /surveys/kpis.
 * Sin segunda query de list — todo se deriva de kpis.
 * Filtros: año, trimestre, sede (no filtra por tipo para no romper vistas).
 * Semáforo: ≥90% Excelente · 80-89% Aceptable · <80% Crítico
 */

import { useState, useMemo } from "react";
import { useQuery }           from "@tanstack/react-query";
import {
  RadarChart, Radar, PolarGrid, PolarAngleAxis, PolarRadiusAxis,
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  LineChart, Line, CartesianGrid, Legend, Cell,
} from "recharts";
import {
  Users, Star, TrendingUp, TrendingDown,
  Award, AlertTriangle, Loader2, RefreshCw, BarChart2,
} from "lucide-react";
import { surveysService } from "../services/surveys";
import { useFilters }     from "../hooks/useFilters";
import Header             from "../components/Layout/Header";
import GlassCard          from "../components/Layout/GlassCard";
// Componentes analíticos nuevos
import SatisfactionQuadrant              from "../components/Dashboard/Satisfactionquadrant";
import SatisfactionHeatmap               from "../components/Dashboard/SatisfactionHeatmap";
import SatisfactionGauge                 from "../components/Dashboard/SatisfactionGauge";
import { GapToDimensions, DeptDelta }   from "../components/Dashboard/SatisfactionGapChart";

// ─── Constantes ────────────────────────────────────────────────────────────────
const YEARS = Array.from({ length: 6 }, (_, i) => new Date().getFullYear() - i);
const QTRS  = ["Q1", "Q2", "Q3", "Q4"];
const SEDES = [
  "Almacén Finca", "Central", "El Portal",
  "Gurabo", "Oficina Principal", "Rómulo", "Tiradentes",
];

const SAT_EXC = 90;
const SAT_ACC = 80;

const COL = {
  primary:   "#0A4F79",
  secondary: "#B4427F",
  success:   "#98C062",
  warning:   "#EA9947",
  danger:    "#DF4585",
};

const VISTAS = [
  { id: "general",   label: "General",           icon: Award    },
  { id: "interna",   label: "Solo Interna",       icon: Users    },
  { id: "externa",   label: "Solo Externa",       icon: Star     },
  { id: "avanzado",  label: "Análisis avanzado",  icon: BarChart2 },
];

// ─── Helpers ───────────────────────────────────────────────────────────────────
const safe       = (v, fb = 0) => (v != null && !Number.isNaN(+v) ? +v : fb);
const toPct      = (v)  => (v != null ? +(safe(v) * 100).toFixed(1) : null);
const fmtPct     = (v)  => (toPct(v) !== null ? `${toPct(v)}%` : "—");

const semColor = (v) => {
  if (v == null) return COL.primary;
  const p = safe(v) * 100;
  if (p >= SAT_EXC) return COL.success;
  if (p >= SAT_ACC) return COL.warning;
  return COL.danger;
};
const semColorPct = (p) => {
  if (p == null) return COL.primary;
  if (+p >= SAT_EXC) return COL.success;
  if (+p >= SAT_ACC) return COL.warning;
  return COL.danger;
};
const semLabel = (v) => {
  if (v == null) return "Sin datos";
  const p = safe(v) * 100;
  if (p >= SAT_EXC) return "Excelente";
  if (p >= SAT_ACC) return "Aceptable";
  return "Crítico";
};
const semBadge = (v) => {
  if (v == null) return "bg-ink/10 text-ink/50 border-ink/20";
  const p = safe(v) * 100;
  if (p >= SAT_EXC) return "bg-success/15 text-success border-success/30";
  if (p >= SAT_ACC) return "bg-warning/15 text-warning border-warning/30";
  return "bg-danger/15 text-danger border-danger/30";
};

// ─── Sub-componentes ────────────────────────────────────────────────────────────
function KPI({ label, value, sub, icon: Icon, colorCss, pct01 }) {
  const c = colorCss ?? semColor(pct01);
  return (
    <GlassCard className="flex items-start gap-4 animate-fade-up">
      <div className="w-11 h-11 rounded-2xl flex items-center justify-center shrink-0 mt-0.5"
           style={{ background: `${c}20` }}>
        <Icon size={19} style={{ color: c }} />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-xs font-semibold text-ink/50 uppercase tracking-wide mb-0.5 leading-tight">
          {label}
        </p>
        <p className="text-2xl font-bold leading-tight" style={{ color: c }}>{value}</p>
        {sub && <p className="text-xs text-ink/40 mt-0.5">{sub}</p>}
      </div>
    </GlassCard>
  );
}

function GTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="glass rounded-xl px-3 py-2 text-xs shadow-xl border border-white/60">
      <p className="font-semibold text-ink mb-1.5">{label}</p>
      {payload.map((p) => (
        <p key={p.dataKey} style={{ color: p.color }} className="flex justify-between gap-4">
          <span>{p.name}</span>
          <span className="font-semibold">{(+p.value).toFixed(1)}%</span>
        </p>
      ))}
    </div>
  );
}

function SatBar({ label, value01 }) {
  const pct = safe(value01) * 100;
  const c   = semColor(value01);
  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <span className="text-sm text-ink">{label}</span>
        <span className="text-sm font-bold" style={{ color: c }}>{fmtPct(value01)}</span>
      </div>
      <div className="h-2 bg-ink/8 rounded-full overflow-hidden">
        <div className="h-full rounded-full transition-all duration-700"
             style={{ width: `${Math.min(pct, 100)}%`, background: c }} />
      </div>
    </div>
  );
}

function Empty({ msg = "Sin datos para esta selección." }) {
  return <div className="flex items-center justify-center h-44 text-sm text-ink/30">{msg}</div>;
}

function SemaforoLeyenda() {
  return (
    <div className="flex items-center gap-3 mt-3 flex-wrap">
      {[["≥90% Excelente", COL.success], ["80-89% Aceptable", COL.warning], ["<80% Crítico", COL.danger]]
        .map(([lbl, c]) => (
          <div key={lbl} className="flex items-center gap-1.5">
            <div className="w-2.5 h-2.5 rounded-full" style={{ background: c }} />
            <span className="text-[10px] text-ink/50">{lbl}</span>
          </div>
        ))}
    </div>
  );
}

// ─── Componente principal ───────────────────────────────────────────────────────
export default function DashboardSurveys() {
  const [vista, setVista] = useState("general");
  const { filters, activeFilters, setFilter, resetFilters } = useFilters({});

  // Una sola query — sin filtro de tipo para no romper vistas
  const queryParams = useMemo(() => {
    const p = { ...activeFilters };
    Object.keys(p).forEach((k) => { if (p[k] == null || p[k] === "") delete p[k]; });
    return p;
  }, [activeFilters]);

  const { data: kpis, isLoading, isFetching, isError, refetch } = useQuery({
    queryKey:         ["survey-kpis", queryParams],
    queryFn:          () => surveysService.getKPIs(queryParams),
    keepPreviousData: true,
    retry:            1,
    staleTime:        30_000,
  });

  // ── Datos derivados de kpis ────────────────────────────────────────────────

  // Radar — kpis.dimensiones[].{ nombre, promedio (0-1) }
  const radarData = useMemo(() =>
    (kpis?.dimensiones || []).map((d) => ({
      subject:   d.nombre,
      fullLabel: d.nombre,
      value:     +(safe(d.promedio) * 100).toFixed(1),
      fullMark:  100,
    })),
  [kpis]);

  // Barras/tablas — kpis.por_departamento (incluye dims desde v2 del backend)
  const byDept = useMemo(() =>
    (kpis?.por_departamento || []).map((d) => ({
      name:             d.departamento?.length > 20 ? d.departamento.slice(0, 18) + "…" : (d.departamento || "—"),
      fullName:         d.departamento || "—",
      interna:          d.sat_interna  != null ? toPct(d.sat_interna)  : null,
      externa:          d.sat_externa  != null ? toPct(d.sat_externa)  : null,
      n:                d.n_registros  || 0,
      // Dimensiones (para heatmap y cuadrante)
      sat_interna:      d.sat_interna,
      sat_externa:      d.sat_externa,
      departamento:     d.departamento,
      efficiency:       d.efficiency,
      communication:    d.communication,
      technical_quality:d.technical_quality,
      added_value:      d.added_value,
      global_experience:d.global_experience,
    })),
  [kpis]);

  // Evolución temporal — kpis.por_periodo
  const byPeriod = useMemo(() =>
    (kpis?.por_periodo || []).map((p) => ({
      period:  p.period_name || p.period || "—",
      interna: p.sat_interna != null ? toPct(p.sat_interna) : null,
      externa: p.sat_externa != null ? toPct(p.sat_externa) : null,
    })),
  [kpis]);

  // Mejor/peor dimensión
  const { mejorDim, peorDim } = useMemo(() => {
    if (!radarData.length) return { mejorDim: null, peorDim: null };
    const sorted = [...radarData].sort((a, b) => b.value - a.value);
    return { mejorDim: sorted[0], peorDim: sorted[sorted.length - 1] };
  }, [radarData]);

  // Mejor/peor dept interna
  const { mejorDeptInt, peorDeptInt } = useMemo(() => {
    const w = byDept.filter((d) => d.interna != null);
    if (!w.length) return { mejorDeptInt: null, peorDeptInt: null };
    return {
      mejorDeptInt: w.reduce((a, b) => a.interna >= b.interna ? a : b),
      peorDeptInt:  w.reduce((a, b) => a.interna <= b.interna ? a : b),
    };
  }, [byDept]);

  // Mejor/peor dept externa
  const { mejorDeptExt, peorDeptExt } = useMemo(() => {
    const w = byDept.filter((d) => d.externa != null);
    if (!w.length) return { mejorDeptExt: null, peorDeptExt: null };
    return {
      mejorDeptExt: w.reduce((a, b) => a.externa >= b.externa ? a : b),
      peorDeptExt:  w.reduce((a, b) => a.externa <= b.externa ? a : b),
    };
  }, [byDept]);

  const initialLoad   = isLoading && !kpis;
  const hasPrev       = !initialLoad && !!kpis;
  const filtersActive = !!(filters.year || filters.quarter || filters.site);

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen relative z-10">
      <Header
        title="Dashboard de Satisfacción"
        subtitle="≥90% Excelente · 80-89% Aceptable · <80% Crítico"
        onRefresh={refetch}
      />

      {/* Selector de vista */}
      <div className="flex items-center gap-2 mb-5 flex-wrap">
        {VISTAS.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            onClick={() => setVista(id)}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium
                        transition-all duration-200 border ${
              vista === id
                ? id === "avanzado"
                  ? "bg-secondary text-white border-secondary shadow-sm"
                  : "bg-primary text-white border-primary shadow-sm"
                : "glass text-ink/60 border-transparent hover:text-ink hover:border-white/50"
            }`}
          >
            <Icon size={14} />
            {label}
          </button>
        ))}
        {isFetching && !initialLoad && (
          <div className="flex items-center gap-1.5 text-xs text-ink/40 ml-1">
            <Loader2 size={12} className="animate-spin" />
            Actualizando…
          </div>
        )}
      </div>

      {/* Filtros */}
      <GlassCard className="mb-6 !p-4">
        <div className="flex flex-wrap gap-3 items-end">
          <div>
            <label className="field-label">Año</label>
            <select value={filters.year || ""}
              onChange={(e) => setFilter("year", e.target.value || undefined)}
              className="input-glass text-sm w-28">
              <option value="">Todos</option>
              {YEARS.map((y) => <option key={y} value={y}>{y}</option>)}
            </select>
          </div>
          <div>
            <label className="field-label">Trimestre</label>
            <select value={filters.quarter || ""}
              onChange={(e) => setFilter("quarter", e.target.value || undefined)}
              className="input-glass text-sm w-28">
              <option value="">Todos</option>
              {QTRS.map((q) => <option key={q} value={q}>{q}</option>)}
            </select>
          </div>
          <div>
            <label className="field-label">Sede</label>
            <select value={filters.site || ""}
              onChange={(e) => setFilter("site", e.target.value || undefined)}
              className="input-glass text-sm w-44">
              <option value="">Todas</option>
              {SEDES.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
          {filtersActive && (
            <button onClick={resetFilters}
              className="btn-ghost text-xs self-end mb-0.5 flex items-center gap-1.5">
              <RefreshCw size={11} /> Limpiar
            </button>
          )}
        </div>
      </GlassCard>

      {/* Skeleton inicial */}
      {initialLoad && (
        <div className="space-y-4">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="h-32 bg-ink/8 rounded-3xl animate-pulse" />
          ))}
        </div>
      )}

      {/* Error */}
      {isError && !hasPrev && (
        <GlassCard className="text-center py-10">
          <p className="text-danger/70 text-sm mb-3">No se pudieron cargar los datos.</p>
          <button onClick={refetch} className="btn-secondary text-sm">Reintentar</button>
        </GlassCard>
      )}

      {/* Contenido */}
      {hasPrev && (
        <div className={`transition-opacity duration-200 ${isFetching ? "opacity-70" : "opacity-100"}`}>

          {vista === "general" && (
            <VistaGeneral
              kpis={kpis} byDept={byDept} byPeriod={byPeriod}
              radarData={radarData} mejorDim={mejorDim} peorDim={peorDim}
            />
          )}

          {vista === "interna" && (
            <VistaInterna
              kpis={kpis} byDept={byDept} byPeriod={byPeriod}
              radarData={radarData}
              mejorDept={mejorDeptInt} peorDept={peorDeptInt}
            />
          )}

          {vista === "externa" && (
            <VistaExterna
              kpis={kpis} byDept={byDept} byPeriod={byPeriod}
              mejorDept={mejorDeptExt} peorDept={peorDeptExt}
            />
          )}

          {vista === "avanzado" && (
            <VistaAvanzada
              kpis={kpis} byDept={byDept}
              radarData={radarData}
            />
          )}

        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// VISTA GENERAL
// ─────────────────────────────────────────────────────────────────────────────
function VistaGeneral({ kpis, byDept, byPeriod, radarData, mejorDim, peorDim }) {
  const si      = kpis?.sat_interna_global;
  const se      = kpis?.sat_externa_global;
  const porSede = kpis?.por_sede || [];
  const barData = byDept
    .filter((d) => d.interna != null || d.externa != null)
    .sort((a, b) => ((b.interna||0)+(b.externa||0)) - ((a.interna||0)+(a.externa||0)))
    .slice(0, 12);

  return (
    <>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6 stagger">
        <KPI label="Satisfacción Interna" value={fmtPct(si)} pct01={si} icon={Users}
             sub={`${semLabel(si)} · ${kpis?.total_registros ?? 0} registros`} />
        <KPI label="Satisfacción Externa" value={fmtPct(se)} pct01={se} icon={Star}
             sub={semLabel(se)} />
        <KPI label="Mejor Dimensión" value={mejorDim?.subject || "—"}
             colorCss={COL.success} icon={TrendingUp}
             sub={mejorDim ? `${mejorDim.value}%` : "Sin datos"} />
        <KPI label="Dimensión a Mejorar" value={peorDim?.subject || "—"}
             colorCss={COL.warning} icon={TrendingDown}
             sub={peorDim ? `${peorDim.value}%` : "Sin datos"} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 mb-5">
        {/* Radar */}
        <GlassCard className="animate-fade-up">
          <h3 className="text-xs font-semibold text-ink/50 uppercase tracking-wide mb-1">
            5 Dimensiones — Cliente Interno
          </h3>
          <p className="text-[11px] text-ink/30 mb-4">Escala 0–100%</p>
          {radarData.length === 0 ? <Empty /> : (
            <ResponsiveContainer width="100%" height={270}>
              <RadarChart data={radarData} margin={{ top: 10, right: 20, bottom: 10, left: 20 }}>
                <PolarGrid stroke="rgba(30,30,47,0.08)" />
                <PolarAngleAxis dataKey="subject"
                  tick={{ fontSize: 11, fill: "#1E1E2F", fontWeight: 500 }} />
                <PolarRadiusAxis domain={[0, 100]} tickCount={5}
                  tick={{ fontSize: 9, fill: "#1E1E2F80" }} axisLine={false} />
                <Radar dataKey="value" name="Promedio"
                  stroke={COL.primary} fill={COL.primary} fillOpacity={0.18}
                  dot={{ r: 4, fill: COL.primary, strokeWidth: 0 }} />
                <Tooltip formatter={(v) => [`${v}%`, "Promedio"]}
                  contentStyle={{ borderRadius: 12, border: "1px solid rgba(255,255,255,0.7)",
                    background: "rgba(255,255,255,0.9)", fontSize: 11 }} />
              </RadarChart>
            </ResponsiveContainer>
          )}
        </GlassCard>

        {/* Barras comparativa */}
        <GlassCard className="animate-fade-up">
          <h3 className="text-xs font-semibold text-ink/50 uppercase tracking-wide mb-1">
            Interna vs Externa por Departamento
          </h3>
          <p className="text-[11px] text-ink/30 mb-4">Promedio (%)</p>
          {barData.length === 0 ? <Empty /> : (
            <div className="overflow-x-auto">
              <div style={{ minWidth: Math.max(barData.length * 68, 320) }}>
                <ResponsiveContainer width="100%" height={270}>
                  <BarChart data={barData} margin={{ top: 4, right: 8, left: -10, bottom: 44 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(30,30,47,0.05)" vertical={false} />
                    <XAxis dataKey="name" tick={{ fontSize: 10, fill: "#1E1E2F80" }}
                      axisLine={false} tickLine={false} angle={-35} textAnchor="end" interval={0} />
                    <YAxis domain={[0, 100]} tick={{ fontSize: 10, fill: "#1E1E2F80" }}
                      tickFormatter={(v) => `${v}%`} axisLine={false} tickLine={false} />
                    <Tooltip content={<GTooltip />} />
                    <Legend wrapperStyle={{ fontSize: 11, paddingTop: 8 }} />
                    <Bar dataKey="interna" name="Interna" fill={COL.primary}
                      radius={[4,4,0,0]} maxBarSize={24} />
                    <Bar dataKey="externa" name="Externa" fill={COL.secondary}
                      radius={[4,4,0,0]} maxBarSize={24} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}
        </GlassCard>
      </div>

      {/* Tabla por sede */}
      {porSede.length > 0 && (
        <GlassCard className="animate-fade-up">
          <h3 className="text-xs font-semibold text-ink/50 uppercase tracking-wide mb-4">
            Resumen por Sede
          </h3>
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[540px]">
              <thead>
                <tr className="border-b border-ink/10">
                  {["Sede","Sat. Interna","Sat. Externa","Registros","Estado"].map((h) => (
                    <th key={h} className="text-left py-2.5 px-3 text-xs font-semibold text-ink/50 uppercase tracking-wide">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-ink/5">
                {porSede.map((s) => (
                  <tr key={s.site} className="hover:bg-primary/[0.025] transition-colors">
                    <td className="py-3 px-3 font-medium text-ink">{s.site}</td>
                    <td className="py-3 px-3 font-semibold" style={{ color: semColor(s.sat_interna) }}>{fmtPct(s.sat_interna)}</td>
                    <td className="py-3 px-3 font-semibold" style={{ color: semColor(s.sat_externa) }}>{fmtPct(s.sat_externa)}</td>
                    <td className="py-3 px-3 text-ink/60">{s.n_registros}</td>
                    <td className="py-3 px-3">
                      <span className={`text-xs px-2.5 py-0.5 rounded-full border font-semibold ${semBadge(s.sat_interna)}`}>
                        {semLabel(s.sat_interna)}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </GlassCard>
      )}
    </>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// VISTA INTERNA
// ─────────────────────────────────────────────────────────────────────────────
function VistaInterna({ kpis, byDept, byPeriod, radarData, mejorDept, peorDept }) {
  const si       = kpis?.sat_interna_global;
  const hBarData = [...byDept].filter((d) => d.interna != null).sort((a, b) => b.interna - a.interna);
  const lineData = byPeriod.filter((p) => p.interna != null);

  return (
    <>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6 stagger">
        <KPI label="Satisfacción Interna" value={fmtPct(si)} pct01={si} icon={Users} sub={semLabel(si)} />
        <KPI label="Total Registros" value={kpis?.total_registros ?? "—"} colorCss={COL.primary} icon={Award} sub="Todos los tipos" />
        <KPI label="Mejor Departamento" value={mejorDept?.fullName || "—"} colorCss={COL.success} icon={TrendingUp}
             sub={mejorDept ? `${mejorDept.interna}%` : "—"} />
        <KPI label="Departamento a Reforzar" value={peorDept?.fullName || "—"} colorCss={COL.warning} icon={AlertTriangle}
             sub={peorDept ? `${peorDept.interna}%` : "—"} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 mb-5">
        {/* Radar + barras de progreso */}
        <GlassCard className="animate-fade-up">
          <h3 className="text-xs font-semibold text-ink/50 uppercase tracking-wide mb-1">5 Dimensiones</h3>
          <p className="text-[11px] text-ink/30 mb-3">Eficiencia · Comunicación · Cal. Técnica · Val. Agr. · Exp. Global</p>
          {radarData.length === 0 ? <Empty /> : (
            <>
              <ResponsiveContainer width="100%" height={220}>
                <RadarChart data={radarData} margin={{ top: 10, right: 20, bottom: 10, left: 20 }}>
                  <PolarGrid stroke="rgba(30,30,47,0.08)" />
                  <PolarAngleAxis dataKey="subject" tick={{ fontSize: 11, fill: "#1E1E2F", fontWeight: 500 }} />
                  <PolarRadiusAxis domain={[0, 100]} tickCount={5} tick={{ fontSize: 9, fill: "#1E1E2F80" }} axisLine={false} />
                  <Radar dataKey="value" name="Promedio" stroke={COL.primary} fill={COL.primary} fillOpacity={0.20}
                    dot={{ r: 4, fill: COL.primary, strokeWidth: 0 }} />
                  <Tooltip formatter={(v) => [`${v}%`, "Promedio"]}
                    contentStyle={{ borderRadius: 12, border: "1px solid rgba(255,255,255,0.7)", background: "rgba(255,255,255,0.9)", fontSize: 11 }} />
                </RadarChart>
              </ResponsiveContainer>
              <div className="mt-4 space-y-2.5">
                {radarData.map((d) => <SatBar key={d.subject} label={d.fullLabel} value01={d.value / 100} />)}
              </div>
            </>
          )}
        </GlassCard>

        {/* Barras horizontales */}
        <GlassCard className="animate-fade-up">
          <h3 className="text-xs font-semibold text-ink/50 uppercase tracking-wide mb-1">Por Departamento</h3>
          <p className="text-[11px] text-ink/30 mb-4">Satisfacción interna — mayor a menor</p>
          {hBarData.length === 0 ? <Empty /> : (
            <>
              <div className="overflow-y-auto max-h-72">
                <ResponsiveContainer width="100%" height={Math.max(hBarData.length * 40, 200)}>
                  <BarChart data={hBarData} layout="vertical" margin={{ top: 4, right: 48, left: 8, bottom: 4 }}>
                    <XAxis type="number" domain={[0, 100]} tick={{ fontSize: 9, fill: "#1E1E2F80" }}
                      tickFormatter={(v) => `${v}%`} axisLine={false} tickLine={false} />
                    <YAxis type="category" dataKey="name" width={95} tick={{ fontSize: 10, fill: "#1E1E2F" }} axisLine={false} tickLine={false} />
                    <Tooltip content={<GTooltip />} />
                    <Bar dataKey="interna" name="Interna" radius={[0,4,4,0]} maxBarSize={22}>
                      {hBarData.map((d, i) => <Cell key={i} fill={semColorPct(d.interna)} />)}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
              <SemaforoLeyenda />
            </>
          )}
        </GlassCard>
      </div>

      {/* Evolución temporal */}
      {lineData.length > 1 && (
        <GlassCard className="animate-fade-up mb-5">
          <h3 className="text-xs font-semibold text-ink/50 uppercase tracking-wide mb-1">Evolución Temporal</h3>
          <p className="text-[11px] text-ink/30 mb-4">Satisfacción interna por período</p>
          <div className="overflow-x-auto">
            <div style={{ minWidth: Math.max(lineData.length * 90, 380) }}>
              <ResponsiveContainer width="100%" height={200}>
                <LineChart data={lineData} margin={{ top: 8, right: 20, left: -8, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(30,30,47,0.06)" />
                  <XAxis dataKey="period" tick={{ fontSize: 10 }} axisLine={false} tickLine={false} />
                  <YAxis domain={[0, 100]} tickFormatter={(v) => `${v}%`} tick={{ fontSize: 10 }} axisLine={false} tickLine={false} />
                  <Tooltip content={<GTooltip />} />
                  <Line type="monotone" dataKey="interna" name="Interna" stroke={COL.primary}
                    strokeWidth={2.5} dot={{ r: 4, fill: COL.primary, strokeWidth: 0 }} activeDot={{ r: 6 }} connectNulls />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>
        </GlassCard>
      )}

      {/* Tabla detalle dimensiones */}
      {radarData.length > 0 && (
        <GlassCard className="animate-fade-up">
          <h3 className="text-xs font-semibold text-ink/50 uppercase tracking-wide mb-4">Detalle por Pilar</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[460px]">
              <thead>
                <tr className="border-b border-ink/10">
                  {["Dimensión","Puntaje","Estado","Interpretación"].map((h) => (
                    <th key={h} className="text-left py-2.5 px-3 text-xs font-semibold text-ink/50 uppercase tracking-wide">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-ink/5">
                {radarData.map((d) => {
                  const v01 = d.value / 100;
                  return (
                    <tr key={d.subject} className="hover:bg-primary/[0.025] transition-colors">
                      <td className="py-3 px-3 font-medium text-ink">{d.fullLabel}</td>
                      <td className="py-3 px-3 font-bold" style={{ color: semColor(v01) }}>{d.value}%</td>
                      <td className="py-3 px-3">
                        <span className={`text-xs px-2.5 py-0.5 rounded-full border font-semibold ${semBadge(v01)}`}>{semLabel(v01)}</span>
                      </td>
                      <td className="py-3 px-3 text-xs text-ink/50">
                        {d.value >= SAT_EXC ? "Cumple adecuadamente." : d.value >= SAT_ACC ? "Nivel aceptable, requiere monitoreo." : "Requiere acciones prioritarias."}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </GlassCard>
      )}
    </>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// VISTA EXTERNA
// ─────────────────────────────────────────────────────────────────────────────
function VistaExterna({ kpis, byDept, byPeriod, mejorDept, peorDept }) {
  const se       = kpis?.sat_externa_global;
  const hBarData = [...byDept].filter((d) => d.externa != null).sort((a, b) => b.externa - a.externa);
  const lineData = byPeriod.filter((p) => p.externa != null);

  return (
    <>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6 stagger">
        <KPI label="Satisfacción Externa" value={fmtPct(se)} pct01={se} icon={Star} sub={semLabel(se)} />
        <KPI label="Total Registros" value={kpis?.total_registros ?? "—"} colorCss={COL.secondary} icon={Award} sub="Todos los tipos" />
        <KPI label="Mejor Departamento" value={mejorDept?.fullName || "—"} colorCss={COL.success} icon={TrendingUp}
             sub={mejorDept ? `${mejorDept.externa}%` : "—"} />
        <KPI label="Departamento a Reforzar" value={peorDept?.fullName || "—"} colorCss={COL.warning} icon={AlertTriangle}
             sub={peorDept ? `${peorDept.externa}%` : "—"} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 mb-5">
        <GlassCard className="animate-fade-up">
          <h3 className="text-xs font-semibold text-ink/50 uppercase tracking-wide mb-1">Por Departamento</h3>
          <p className="text-[11px] text-ink/30 mb-4">Fuerza de Ventas · Almacén · Proyectos · Corporativo · CS/RMA</p>
          {hBarData.length === 0 ? <Empty /> : (
            <>
              <div className="overflow-y-auto max-h-72">
                <ResponsiveContainer width="100%" height={Math.max(hBarData.length * 42, 200)}>
                  <BarChart data={hBarData} layout="vertical" margin={{ top: 4, right: 52, left: 8, bottom: 4 }}>
                    <XAxis type="number" domain={[0, 100]} tick={{ fontSize: 9, fill: "#1E1E2F80" }}
                      tickFormatter={(v) => `${v}%`} axisLine={false} tickLine={false} />
                    <YAxis type="category" dataKey="name" width={100} tick={{ fontSize: 10, fill: "#1E1E2F" }} axisLine={false} tickLine={false} />
                    <Tooltip content={<GTooltip />} />
                    <Bar dataKey="externa" name="Externa" radius={[0,4,4,0]} maxBarSize={22}>
                      {hBarData.map((d, i) => <Cell key={i} fill={semColorPct(d.externa)} />)}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
              <SemaforoLeyenda />
            </>
          )}
        </GlassCard>

        <GlassCard className="animate-fade-up">
          <h3 className="text-xs font-semibold text-ink/50 uppercase tracking-wide mb-1">Evolución Temporal</h3>
          <p className="text-[11px] text-ink/30 mb-4">Satisfacción externa por período</p>
          {lineData.length < 2 ? <Empty msg="Se necesitan al menos 2 períodos." /> : (
            <div className="overflow-x-auto">
              <div style={{ minWidth: Math.max(lineData.length * 90, 280) }}>
                <ResponsiveContainer width="100%" height={260}>
                  <LineChart data={lineData} margin={{ top: 8, right: 20, left: -8, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(30,30,47,0.06)" />
                    <XAxis dataKey="period" tick={{ fontSize: 10 }} axisLine={false} tickLine={false} />
                    <YAxis domain={[0, 100]} tickFormatter={(v) => `${v}%`} tick={{ fontSize: 10 }} axisLine={false} tickLine={false} />
                    <Tooltip content={<GTooltip />} />
                    <Line type="monotone" dataKey="externa" name="Externa" stroke={COL.secondary}
                      strokeWidth={2.5} dot={{ r: 4, fill: COL.secondary, strokeWidth: 0 }} activeDot={{ r: 6 }} connectNulls />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}
        </GlassCard>
      </div>

      {/* Tabla comparativa */}
      {hBarData.length > 0 && (
        <GlassCard className="animate-fade-up">
          <h3 className="text-xs font-semibold text-ink/50 uppercase tracking-wide mb-1">Comparativa por Departamento</h3>
          <p className="text-[11px] text-ink/30 mb-4">Atención · Rapidez · Solución · Percepción general</p>
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[520px]">
              <thead>
                <tr className="border-b border-ink/10">
                  {["Departamento","Sat. Externa","Registros","Estado","Interpretación"].map((h) => (
                    <th key={h} className="text-left py-2.5 px-3 text-xs font-semibold text-ink/50 uppercase tracking-wide">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-ink/5">
                {hBarData.slice(0, 10).map((d) => {
                  const v01 = d.externa / 100;
                  return (
                    <tr key={d.fullName} className="hover:bg-primary/[0.025] transition-colors">
                      <td className="py-3 px-3 font-medium text-ink">{d.fullName}</td>
                      <td className="py-3 px-3 font-bold text-lg" style={{ color: semColorPct(d.externa) }}>{d.externa}%</td>
                      <td className="py-3 px-3 text-ink/60">{d.n}</td>
                      <td className="py-3 px-3">
                        <span className={`text-xs px-2.5 py-0.5 rounded-full border font-semibold ${semBadge(v01)}`}>{semLabel(v01)}</span>
                      </td>
                      <td className="py-3 px-3 text-xs text-ink/50">
                        {d.externa >= SAT_EXC ? "Desempeño satisfactorio." : d.externa >= SAT_ACC ? "Aceptable, con oportunidades." : "Requiere acciones prioritarias."}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </GlassCard>
      )}
    </>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// VISTA AVANZADA — suite analítica completa
// ─────────────────────────────────────────────────────────────────────────────
function VistaAvanzada({ kpis, byDept, radarData }) {
  return (
    <>
      {/* Fila 1: Gauge + Cuadrante */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 mb-5">
        {/* Gauge global */}
        <GlassCard className="animate-fade-up">
          <h3 className="text-xs font-semibold text-ink/50 uppercase tracking-wide mb-4">
            Índice Global de Satisfacción
          </h3>
          <SatisfactionGauge kpis={kpis} radarData={radarData} />
        </GlassCard>

        {/* Cuadrante estratégico */}
        <GlassCard className="animate-fade-up">
          <h3 className="text-xs font-semibold text-ink/50 uppercase tracking-wide mb-1">
            Cuadrante Estratégico
          </h3>
          <p className="text-[11px] text-ink/30 mb-3">
            Posición de cada departamento en el plano Interna × Externa
          </p>
          <SatisfactionQuadrant data={byDept} height={300} />
        </GlassCard>
      </div>

      {/* Heatmap */}
      <GlassCard className="animate-fade-up mb-5">
        <h3 className="text-xs font-semibold text-ink/50 uppercase tracking-wide mb-1">
          Heatmap — Dimensión × Departamento
        </h3>
        <p className="text-[11px] text-ink/30 mb-4">
          Intensidad del color indica nivel de satisfacción por dimensión y departamento.
          {" "}<span className="italic">Requiere backend v2 con dimensiones en por_departamento.</span>
        </p>
        <SatisfactionHeatmap data={byDept} showSat />
      </GlassCard>

      {/* Brechas */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* Brecha a meta por dimensión */}
        <GlassCard className="animate-fade-up">
          <h3 className="text-xs font-semibold text-ink/50 uppercase tracking-wide mb-1">
            Brecha a Meta por Dimensión
          </h3>
          <p className="text-[11px] text-ink/30 mb-4">
            Puntos porcentuales que faltan para alcanzar el 90%
          </p>
          <GapToDimensions radarData={radarData} meta={90} />
        </GlassCard>

        {/* Delta interna − externa */}
        <GlassCard className="animate-fade-up">
          <h3 className="text-xs font-semibold text-ink/50 uppercase tracking-wide mb-1">
            Delta Interna − Externa por Departamento
          </h3>
          <p className="text-[11px] text-ink/30 mb-4">
            Diferencia entre percepción de clientes internos y externos
          </p>
          <DeptDelta byDept={byDept} />
        </GlassCard>
      </div>
    </>
  );
}