/**
 * DashboardServicioWow.jsx — Dashboard del Servicio WOW 2026.
 *
 * VISTAS:
 *   Interno      → % por los 6 criterios de la rúbrica, heatmap
 *                  departamento × criterio y tabla por formulario/sucursal.
 *   Externo      → por pregunta de cada formulario (no comparables entre
 *                  departamentos), con distribución 1-5.
 *   Nominaciones → votos a "Embajador del Servicio WOW" por formulario.
 *
 * Resultados en %: puntos obtenidos / (respuestas × 5) × 100. Semáforo
 * ≥90 % Excelente, ≥80 % Aceptable (cortes del backend, recibidos en `escala`).
 */

import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell, ReferenceLine, CartesianGrid,
} from "recharts";
import {
  Users, Star, Award, Loader2, MessageSquareText, TrendingUp, TrendingDown, ChevronDown,
} from "lucide-react";
import { surveyWowService } from "../../services/surveyWow";
import { useFilters } from "../../hooks/useFilters";
import { useChartColors } from "../../hooks/useChartColors";
import Header from "../../components/Layout/Header";
import GlassCard from "../../components/Layout/GlassCard";
import KPICard from "../../components/Dashboard/KPICard";
import EstadoBadge from "../../components/ServicioWow/EstadoBadge";
import SatisfactionDonut from "../../components/ServicioWow/SatisfactionDonut";
import {
  DEFAULT_ESCALA, WOW_SEM, fmtPct, statementOf, wowColor, wowEstado,
} from "../../components/ServicioWow/wowUtils";

const VISTAS = [
  { id: "interno",      label: "Cliente interno", icon: Users },
  { id: "externo",      label: "Cliente externo", icon: Star  },
  { id: "nominaciones", label: "Nominaciones",    icon: Award },
];

// Distribución 1-5: semánticos fijos de rojo a verde (no dependen de la paleta)
const DIST_COLORS = { 1: "#DF4585", 2: "#E7708F", 3: "#EA9947", 4: "#B5CF8C", 5: "#98C062" };

const estadoColor = { Excelente: "success", Aceptable: "warning", "Crítico": "danger", "Sin datos": "primary" };

function Loading() {
  return (
    <div className="flex items-center justify-center h-64">
      <Loader2 size={28} className="animate-spin text-primary/40" />
    </div>
  );
}

function Empty({ text }) {
  return (
    <GlassCard hover={false} className="flex flex-col items-center justify-center h-48 gap-2 text-ink/30">
      <MessageSquareText size={28} className="opacity-40" />
      <p className="text-sm">{text}</p>
      <p className="text-xs">Importa respuestas desde la página Formularios.</p>
    </GlassCard>
  );
}

function SemaforoLegend({ escala }) {
  return (
    <div className="flex flex-wrap items-center gap-3 text-xs text-ink/50">
      {[
        [`≥${escala.excelente}% Excelente`, WOW_SEM.Excelente.color],
        [`≥${escala.aceptable}% Aceptable`, WOW_SEM.Aceptable.color],
        [`<${escala.aceptable}% Crítico`, WOW_SEM["Crítico"].color],
      ].map(([label, color]) => (
        <span key={label} className="flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-full" style={{ background: color }} />
          {label}
        </span>
      ))}
      <span className="text-ink/30">· % = puntos / (respuestas × 5)</span>
    </div>
  );
}

// ─── Vista interna ────────────────────────────────────────────────────────────
function VistaInterna({ data }) {
  const cc     = useChartColors();
  const escala = data.escala || DEFAULT_ESCALA;
  const conDatos = data.criterios.filter((c) => c.porcentaje != null);
  const mejor  = conDatos.length ? conDatos.reduce((a, b) => (b.porcentaje > a.porcentaje ? b : a)) : null;
  const peor   = conDatos.length ? conDatos.reduce((a, b) => (b.porcentaje < a.porcentaje ? b : a)) : null;

  if (!data.total_respuestas) return <Empty text="Aún no hay respuestas de cliente interno." />;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KPICard title="Respuestas" value={data.total_respuestas} icon={MessageSquareText} color="primary" />
        <KPICard
          title="Resultado general" value={fmtPct(data.porcentaje_global)}
          subtitle={data.estado_global} icon={Star} color={estadoColor[data.estado_global]}
        />
        <KPICard title="Criterio más fuerte" value={mejor ? fmtPct(mejor.porcentaje) : "—"} subtitle={mejor?.label} icon={TrendingUp} color={estadoColor[wowEstado(mejor?.porcentaje, escala)]} />
        <KPICard title="Criterio a mejorar" value={peor ? fmtPct(peor.porcentaje) : "—"} subtitle={peor?.label} icon={TrendingDown} color={estadoColor[wowEstado(peor?.porcentaje, escala)]} />
      </div>

      <GlassCard hover={false}>
        <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
          <h3 className="text-sm font-semibold text-ink">Resultado por criterio</h3>
          <SemaforoLegend escala={escala} />
        </div>
        <ResponsiveContainer width="100%" height={Math.max(data.criterios.length * 44, 220)}>
          <BarChart data={data.criterios} layout="vertical" margin={{ top: 4, right: 40, left: 8, bottom: 4 }}>
            <CartesianGrid horizontal={false} stroke={cc.grid} />
            <XAxis type="number" domain={[0, 100]} ticks={[0, 20, 40, 60, 80, 100]} tickFormatter={(v) => `${v}%`} tick={{ fill: cc.axis, fontSize: 11 }} />
            <YAxis type="category" dataKey="label" width={140} tick={{ fill: cc.axisStrong, fontSize: 12 }} />
            <Tooltip
              cursor={{ fill: cc.cursor }}
              contentStyle={cc.tooltipStyle}
              formatter={(v, _n, p) => [`${fmtPct(v)} · promedio ${p.payload.promedio}/5 · ${p.payload.n} respuestas`, "Resultado"]}
            />
            <ReferenceLine x={escala.aceptable} stroke={cc.refLine} strokeDasharray="4 4" />
            <ReferenceLine x={escala.excelente} stroke={cc.refLine} strokeDasharray="4 4" />
            <Bar dataKey="porcentaje" radius={[0, 6, 6, 0]} maxBarSize={24} label={{ position: "right", fill: cc.labelFill, fontSize: 11, formatter: fmtPct }}>
              {data.criterios.map((c) => <Cell key={c.code} fill={wowColor(c.porcentaje, escala)} />)}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </GlassCard>

      <GlassCard hover={false} padding={false}>
        <div className="px-6 pt-5 pb-3">
          <h3 className="text-sm font-semibold text-ink">Departamento × criterio</h3>
          <p className="text-xs text-ink/40 mt-0.5">Resultado (%) de cada criterio por departamento</p>
        </div>
        <div className="overflow-x-auto pb-2">
          <table className="w-full text-sm min-w-[860px]">
            <thead>
              <tr className="border-b border-ink/10">
                <th className="text-left py-3 px-4 text-xs font-semibold text-ink/50 uppercase tracking-wide">Departamento</th>
                <th className="text-center py-3 px-2 text-xs font-semibold text-ink/50 uppercase tracking-wide">n</th>
                {data.criterios.map((c) => (
                  <th key={c.code} className="text-center py-3 px-2 text-xs font-semibold text-ink/50 uppercase tracking-wide">{c.label}</th>
                ))}
                <th className="text-center py-3 px-4 text-xs font-semibold text-ink/50 uppercase tracking-wide">Resultado</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-ink/5">
              {data.por_departamento.map((d) => (
                <tr key={d.department_id}>
                  <td className="py-2.5 px-4 font-medium text-ink whitespace-nowrap">{d.departamento}</td>
                  <td className="py-2.5 px-2 text-center text-ink/50">{d.n_respuestas}</td>
                  {data.criterios.map((c) => {
                    const v = d.criterios[c.code];
                    const color = wowColor(v, escala);
                    return (
                      <td key={c.code} className="py-1.5 px-1.5 text-center">
                        <span
                          className="inline-block min-w-[3.25rem] py-1 rounded-lg font-semibold text-xs"
                          style={{ background: v == null ? "transparent" : `${color}26`, color: v == null ? undefined : color }}
                        >
                          {fmtPct(v)}
                        </span>
                      </td>
                    );
                  })}
                  <td className="py-2.5 px-4 text-center"><EstadoBadge estado={d.estado} /> <span className="font-semibold ml-1">{fmtPct(d.porcentaje)}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </GlassCard>

      <GlassCard hover={false} padding={false}>
        <div className="px-6 pt-5 pb-3">
          <h3 className="text-sm font-semibold text-ink">Por formulario / sucursal</h3>
        </div>
        <div className="overflow-x-auto pb-2">
          <table className="w-full text-sm min-w-[560px]">
            <thead>
              <tr className="border-b border-ink/10">
                {["Departamento", "Sucursal", "Respuestas", "Resultado", "Estado"].map((h) => (
                  <th key={h} className="text-left py-3 px-4 text-xs font-semibold text-ink/50 uppercase tracking-wide">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-ink/5">
              {data.por_formulario.map((f) => (
                <tr key={f.form_id}>
                  <td className="py-2.5 px-4 font-medium text-ink">{f.departamento}</td>
                  <td className="py-2.5 px-4 text-ink/60">{f.branch || "—"}</td>
                  <td className="py-2.5 px-4 text-ink/60">{f.n_respuestas}</td>
                  <td className="py-2.5 px-4 font-semibold" style={{ color: wowColor(f.porcentaje, escala) }}>{fmtPct(f.porcentaje)}</td>
                  <td className="py-2.5 px-4"><EstadoBadge estado={f.estado} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </GlassCard>
    </div>
  );
}

// ─── Vista externa ────────────────────────────────────────────────────────────
function DistributionBar({ distribucion, n }) {
  if (!n) return <div className="h-2 rounded-full bg-ink/5" />;
  return (
    <div className="flex h-2 rounded-full overflow-hidden bg-ink/5" title={
      [1, 2, 3, 4, 5].map((k) => `${k}: ${distribucion[k] || 0}`).join(" · ")
    }>
      {[1, 2, 3, 4, 5].map((k) => {
        const c = distribucion[k] || 0;
        return c ? <div key={k} style={{ width: `${(c / n) * 100}%`, background: DIST_COLORS[k] }} /> : null;
      })}
    </div>
  );
}

function VistaExterna({ data }) {
  const escala = data.escala || DEFAULT_ESCALA;
  if (!data.total_respuestas) return <Empty text="Aún no hay respuestas de cliente externo." />;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KPICard title="Respuestas" value={data.total_respuestas} icon={MessageSquareText} color="primary" />
        <KPICard
          title="Resultado general" value={fmtPct(data.porcentaje_global)}
          subtitle={data.estado_global} icon={Star} color={estadoColor[data.estado_global]}
        />
        <KPICard title="Formularios con datos" value={data.formularios.length} icon={Award} color="secondary" />
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-ink/40">Las preguntas externas son propias de cada proceso: no se comparan entre departamentos.</p>
        <div className="flex items-center gap-2 text-xs text-ink/40">
          Distribución:
          {[1, 2, 3, 4, 5].map((k) => (
            <span key={k} className="flex items-center gap-1">
              <span className="w-2.5 h-2.5 rounded-sm" style={{ background: DIST_COLORS[k] }} />{k}
            </span>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        {data.formularios.map((f) => (
          <GlassCard key={f.form_id} hover={false}>
            <div className="flex items-start justify-between gap-3 mb-4">
              <div className="min-w-0">
                <h3 className="text-sm font-semibold text-ink">{f.departamento}</h3>
                <p className="text-xs text-ink/40">
                  {[f.subprocess, f.branch].filter(Boolean).join(" · ") || "General"} · {f.n_respuestas} respuestas
                </p>
              </div>
              <div className="flex flex-col items-center gap-1.5 shrink-0 text-ink">
                <SatisfactionDonut percentage={f.porcentaje} size={72} decimals={1} color={wowColor(f.porcentaje, escala)} />
                <EstadoBadge estado={f.estado} />
              </div>
            </div>
            <div className="space-y-3">
              {f.preguntas.map((q) => (
                <div key={q.question_id}>
                  <div className="flex items-start justify-between gap-3 mb-1">
                    <p className="text-xs text-ink/60 leading-snug line-clamp-2" title={q.text}>
                      {statementOf(q.text)}
                    </p>
                    <span className="text-xs font-semibold shrink-0" style={{ color: wowColor(q.porcentaje, escala) }}>
                      {fmtPct(q.porcentaje)}
                    </span>
                  </div>
                  <DistributionBar distribucion={q.distribucion} n={q.n} />
                </div>
              ))}
            </div>
          </GlassCard>
        ))}
      </div>
    </div>
  );
}

// ─── Nominaciones ─────────────────────────────────────────────────────────────
function VistaNominaciones({ data }) {
  const cc = useChartColors();
  const [open, setOpen] = useState(null);

  const grupos = useMemo(() => {
    const g = {};
    for (const n of data) {
      const key = n.form_id;
      (g[key] ||= { titulo: [n.departamento, n.branch].filter(Boolean).join(" · "), items: [] }).items.push(n);
    }
    return Object.entries(g);
  }, [data]);

  if (!data.length) return <Empty text="Aún no hay nominaciones." />;

  return (
    <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
      {grupos.map(([formId, grupo]) => {
        const totalVotos = grupo.items.reduce((a, n) => a + n.votos, 0);
        const max = Math.max(...grupo.items.map((n) => n.votos));
        return (
          <GlassCard key={formId} hover={false}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-semibold text-ink flex items-center gap-2">
                <Award size={15} className="text-secondary" /> {grupo.titulo}
              </h3>
              <span className="text-xs text-ink/40">{totalVotos} votos</span>
            </div>
            <div className="space-y-2.5">
              {grupo.items.map((n) => {
                const key = `${formId}-${n.nominee_name}`;
                const isOpen = open === key;
                return (
                  <div key={key}>
                    <button
                      onClick={() => setOpen(isOpen ? null : key)}
                      className="w-full text-left"
                      disabled={!n.motivos.length}
                    >
                      <div className="flex items-center justify-between gap-3 mb-1 text-sm">
                        <span className="flex items-center gap-1.5 text-ink font-medium">
                          {n.votos === max && <Star size={13} className="text-warning fill-warning" />}
                          {n.nominee_name}
                          {n.motivos.length > 0 && (
                            <ChevronDown size={13} className={`text-ink/30 transition-transform ${isOpen ? "" : "-rotate-90"}`} />
                          )}
                        </span>
                        <span className="text-xs font-semibold text-ink/60">{n.votos}</span>
                      </div>
                      <div className="h-1.5 rounded-full bg-ink/5 overflow-hidden">
                        <div className="h-full rounded-full" style={{ width: `${(n.votos / max) * 100}%`, background: cc.c1 }} />
                      </div>
                    </button>
                    {isOpen && (
                      <ul className="mt-2 space-y-1.5 pl-3 border-l-2 border-ink/10">
                        {n.motivos.map((m, i) => (
                          <li key={i} className="text-xs text-ink/60 leading-snug">{m}</li>
                        ))}
                      </ul>
                    )}
                  </div>
                );
              })}
            </div>
          </GlassCard>
        );
      })}
    </div>
  );
}

// ─── Página ───────────────────────────────────────────────────────────────────
export default function DashboardServicioWow() {
  const [vista, setVista] = useState("interno");
  const { filters, activeFilters, setFilter } = useFilters({});

  const { data: departments = [] } = useQuery({
    queryKey: ["wow-departments"],
    queryFn:  surveyWowService.getDepartments,
  });

  const interno = useQuery({
    queryKey: ["wow-dashboard", "interno", activeFilters],
    queryFn:  () => surveyWowService.getDashboardInterno(activeFilters),
    enabled:  vista === "interno",
    keepPreviousData: true,
  });
  const externo = useQuery({
    queryKey: ["wow-dashboard", "externo", activeFilters],
    queryFn:  () => surveyWowService.getDashboardExterno(activeFilters),
    enabled:  vista === "externo",
    keepPreviousData: true,
  });
  const noms = useQuery({
    queryKey: ["wow-dashboard", "nominaciones", activeFilters],
    queryFn:  () => surveyWowService.getNominations(activeFilters),
    enabled:  vista === "nominaciones",
    keepPreviousData: true,
  });

  const current = { interno, externo, nominaciones: noms }[vista];

  return (
    <div className="min-h-screen relative z-10">
      <Header
        title="Dashboard — Servicio WOW 2026"
        subtitle="Satisfacción de cliente interno y externo · Embajador del Servicio WOW"
        onRefresh={() => current.refetch()}
      />

      <div className="flex flex-wrap items-center gap-2 mb-6">
        {VISTAS.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            onClick={() => setVista(id)}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-all duration-200 border ${
              vista === id
                ? "bg-primary text-white border-primary shadow-sm"
                : "glass text-ink/60 border-transparent hover:text-ink hover:border-white/50"
            }`}
          >
            <Icon size={14} /> {label}
          </button>
        ))}

        <select
          value={filters.department_id || ""}
          onChange={(e) => setFilter("department_id", e.target.value ? Number(e.target.value) : undefined)}
          className="input-glass text-sm py-1.5 px-3 w-auto ml-auto"
        >
          <option value="">Todos los departamentos</option>
          {departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
        </select>
        {current.isFetching && !current.isLoading && <Loader2 size={14} className="animate-spin text-primary/40" />}
      </div>

      {current.isLoading || !current.data ? (
        current.isError
          ? <GlassCard hover={false} className="text-sm text-danger">No se pudo cargar el dashboard.</GlassCard>
          : <Loading />
      ) : vista === "interno" ? (
        <VistaInterna data={current.data} />
      ) : vista === "externo" ? (
        <VistaExterna data={current.data} />
      ) : (
        <VistaNominaciones data={current.data} />
      )}
    </div>
  );
}

