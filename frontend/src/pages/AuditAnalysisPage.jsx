/**
 * AuditAnalysisPage.jsx
 *
 * Página completa de análisis inteligente de una auditoría.
 * Acceso: /audits/:id/analysis
 *
 * Secciones:
 *   1. Resumen ejecutivo (texto + score global)
 *   2. Comparativa vs auditoría anterior (tabla de deltas por S)
 *   3. Análisis por S (tarjetas con tendencia, semáforo, gráfica mini)
 *   4. S estancadas (alert cards)
 *   5. Preguntas críticas (0% cumplimiento)
 *   6. Análisis de comentarios (topics + hallazgos recurrentes)
 *   7. Recomendaciones priorizadas
 *   8. Evolución histórica (gráfica de líneas por S)
 */

import { useMemo }                              from "react";
import { useParams, useNavigate }               from "react-router-dom";
import { useQuery }                             from "@tanstack/react-query";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, ResponsiveContainer, RadarChart,
  Radar, PolarGrid, PolarAngleAxis, PolarRadiusAxis,
  BarChart, Bar, Cell,
} from "recharts";
import {
  ArrowLeft, TrendingUp, TrendingDown, Minus,
  AlertTriangle, CheckCircle2, AlertCircle,
  MessageSquare, Lightbulb, BarChart2, History,
  Activity, ChevronRight, Loader2, Info,
} from "lucide-react";
import { auditsService } from "../services/audits";
import Header            from "../components/Layout/Header";
import GlassCard         from "../components/Layout/GlassCard";
import { fmt }           from "../utils/format";

// ─── Paleta ───────────────────────────────────────────────────────────────────
const COL = {
  primary:   "#0A4F79",
  secondary: "#B4427F",
  success:   "#98C062",
  warning:   "#EA9947",
  danger:    "#DF4585",
};
const S_COLORS_LINE = [COL.primary, COL.secondary, COL.success, COL.warning, COL.danger];

// ─── Helpers ──────────────────────────────────────────────────────────────────
const safe       = (v) => (v != null && !isNaN(+v) ? +v : 0);
const semColor   = (pct) => pct >= 80 ? COL.success : pct >= 60 ? COL.warning : COL.danger;
const semLabel   = (pct) => pct >= 80 ? "Cumple" : pct >= 60 ? "Por mejorar" : "Crítico";
const semBadge   = (pct) => pct >= 80
  ? "bg-success/15 text-success border-success/30"
  : pct >= 60
  ? "bg-warning/15 text-warning border-warning/30"
  : "bg-danger/15 text-danger border-danger/30";

function DeltaBadge({ delta }) {
  if (delta == null) return null;
  const d = +delta;
  const color = d >= 3 ? COL.success : d <= -3 ? COL.danger : COL.warning;
  const Icon  = d >= 3 ? TrendingUp  : d <= -3 ? TrendingDown  : Minus;
  return (
    <span className="inline-flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded-full"
          style={{ background: `${color}18`, color }}>
      <Icon size={10} />
      {d > 0 ? "+" : ""}{d.toFixed(1)} pp
    </span>
  );
}

function SectionTitle({ icon: Icon, title, subtitle, color = COL.primary }) {
  return (
    <div className="flex items-center gap-3 mb-4">
      <div className="w-8 h-8 rounded-xl flex items-center justify-center shrink-0"
           style={{ background: `${color}18` }}>
        <Icon size={15} style={{ color }} />
      </div>
      <div>
        <h2 className="text-sm font-semibold text-ink">{title}</h2>
        {subtitle && <p className="text-xs text-ink/40">{subtitle}</p>}
      </div>
    </div>
  );
}

function GTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="glass rounded-xl px-3 py-2 text-xs shadow-xl border border-white/60">
      <p className="font-semibold text-ink mb-1">{label}</p>
      {payload.map((p) => (
        <p key={p.dataKey} style={{ color: p.color }} className="flex justify-between gap-4">
          <span>{p.name}</span>
          <span className="font-semibold">{(+p.value).toFixed(1)}%</span>
        </p>
      ))}
    </div>
  );
}

// ─── Componente principal ──────────────────────────────────────────────────────
export default function AuditAnalysisPage() {
  const { id }   = useParams();
  const navigate = useNavigate();

  // ── Análisis principal ────────────────────────────────────────────────────
  const { data: analysis, isLoading, isError } = useQuery({
    queryKey: ["audit-analysis", id],
    queryFn:  () => auditsService.getAnalysis(id),
    staleTime: 120_000,
    retry: 1,
  });

  // ── Tendencia histórica ───────────────────────────────────────────────────
  const { data: trend } = useQuery({
    queryKey: ["branch-trend", analysis?.branch, analysis?.audit_type],
    queryFn:  () => auditsService.getBranchTrend({
      branch:        analysis.branch,
      audit_type_id: id,   // el service resolverá el type_id desde el analysis
    }),
    enabled:   !!analysis?.branch,
    staleTime: 120_000,
  });

  // ── Datos para radar ──────────────────────────────────────────────────────
  const radarData = useMemo(() => {
    if (!analysis?.s_analysis) return [];
    return analysis.s_analysis.map((s) => ({
      s:     s.short,
      value: safe(s.percentage),
      prev:  analysis.vs_previous?.s_deltas?.[s.s_index] != null
             ? safe(s.percentage) - safe(analysis.vs_previous.s_deltas[s.s_index])
             : null,
    }));
  }, [analysis]);

  // ── Datos para gráfica de evolución ──────────────────────────────────────
  const trendData = useMemo(() => {
    if (!trend?.series?.length) return [];
    return trend.series.map((p) => ({
      label:    fmt.date(p.audit_date),
      Total:    safe(p.percentage),
      Seiri:    safe(p.seiri),
      Seiton:   safe(p.seiton),
      Seiso:    safe(p.seiso),
      Seiketsu: safe(p.seiketsu),
      Shitsuke: safe(p.shitsuke),
    }));
  }, [trend]);

  // ─────────────────────────────────────────────────────────────────────────
  if (isLoading) return (
    <div className="min-h-screen relative z-10 flex items-center justify-center">
      <div className="text-center">
        <Loader2 size={32} className="animate-spin text-primary/40 mx-auto mb-3" />
        <p className="text-sm text-ink/40">Analizando auditoría…</p>
      </div>
    </div>
  );

  if (isError || !analysis) return (
    <div className="min-h-screen relative z-10">
      <GlassCard className="text-center py-12">
        <AlertCircle size={28} className="text-danger/50 mx-auto mb-3" />
        <p className="text-sm text-ink/50">No se pudo cargar el análisis.</p>
        <button onClick={() => navigate("/audits")} className="mt-4 btn-secondary text-sm">
          Volver al listado
        </button>
      </GlassCard>
    </div>
  );

  const { percentage, status } = analysis;

  return (
    <div className="min-h-screen relative z-10">

      {/* ── Header ──────────────────────────────────────────────────────────── */}
      <div className="mb-2">
        <button onClick={() => navigate("/audits")}
                className="btn-ghost flex items-center gap-2 text-sm mb-4">
          <ArrowLeft size={15} /> Volver al listado
        </button>
      </div>

      <Header
        title={`Análisis: ${analysis.audit_type} · ${analysis.branch}`}
        subtitle={`${fmt.date(analysis.audit_date)} · ${analysis.history_count} auditorías anteriores comparadas`}
      />

      {/* ══ 1. RESUMEN EJECUTIVO + SCORE ══════════════════════════════════════ */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5 mb-6">

        {/* Score global */}
        <div
          className="rounded-3xl p-6 flex flex-col items-center justify-center text-center border animate-fade-up"
          style={{ background: `${semColor(percentage)}10`, borderColor: `${semColor(percentage)}30` }}
        >
          <p className="text-xs font-semibold text-ink/50 uppercase tracking-wide mb-2">
            Puntaje Global
          </p>
          <p className="text-6xl font-bold mb-2" style={{ color: semColor(percentage) }}>
            {safe(percentage).toFixed(1)}%
          </p>
          <span className={`text-xs px-3 py-1 rounded-full border font-semibold ${semBadge(percentage)}`}>
            {semLabel(percentage)}
          </span>
          {analysis.vs_previous && (
            <div className="mt-3">
              <DeltaBadge delta={analysis.vs_previous.delta} />
              <p className="text-[10px] text-ink/40 mt-1">
                vs. auditoría anterior ({safe(analysis.vs_previous.percentage).toFixed(1)}%)
              </p>
            </div>
          )}
        </div>

        {/* Resumen ejecutivo */}
        <div className="lg:col-span-2 animate-fade-up">
          <GlassCard className="h-full">
            <SectionTitle icon={Info} title="Resumen Ejecutivo" color={COL.primary} />
            <p className="text-sm text-ink/80 leading-relaxed"
               dangerouslySetInnerHTML={{
                 __html: analysis.executive_summary
                   .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
               }}
            />
            {/* Mini radar */}
            {radarData.length > 0 && (
              <div className="mt-4">
                <ResponsiveContainer width="100%" height={160}>
                  <RadarChart data={radarData} margin={{ top: 4, right: 16, bottom: 4, left: 16 }}>
                    <PolarGrid stroke="rgba(30,30,47,0.08)" />
                    <PolarAngleAxis dataKey="s" tick={{ fontSize: 10, fill: "#1E1E2F" }} />
                    <PolarRadiusAxis domain={[0, 100]} tickCount={3} tick={{ fontSize: 8 }} axisLine={false} />
                    <Radar dataKey="value" name="Actual"
                      stroke={COL.primary} fill={COL.primary} fillOpacity={0.18}
                      dot={{ r: 3, fill: COL.primary, strokeWidth: 0 }} />
                    {radarData.some((d) => d.prev != null) && (
                      <Radar dataKey="prev" name="Anterior"
                        stroke={COL.secondary} fill={COL.secondary} fillOpacity={0.10}
                        dot={{ r: 2, fill: COL.secondary, strokeWidth: 0 }} strokeDasharray="4 3" />
                    )}
                    <Legend wrapperStyle={{ fontSize: 10 }} />
                    <Tooltip formatter={(v) => [`${(+v).toFixed(1)}%`]} />
                  </RadarChart>
                </ResponsiveContainer>
              </div>
            )}
          </GlassCard>
        </div>
      </div>

      {/* ══ 2. ANÁLISIS POR S ════════════════════════════════════════════════ */}
      <GlassCard className="mb-6 animate-fade-up">
        <SectionTitle
          icon={BarChart2}
          title="Análisis por Dimensión (S)"
          subtitle="Puntaje actual, tendencia histórica y comparativa vs anterior"
          color={COL.primary}
        />

        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[640px]">
            <thead>
              <tr className="border-b border-ink/10">
                {["Dimensión", "Puntaje", "Estado", "Tendencia", "vs Anterior", "Observación"].map((h) => (
                  <th key={h} className="text-left py-2.5 px-3 text-xs font-semibold text-ink/50 uppercase tracking-wide">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-ink/5">
              {analysis.s_analysis.map((s) => (
                <tr key={s.s_index}
                    className={`hover:bg-primary/[0.025] transition-colors ${
                      s.is_stagnant ? "bg-warning/[0.03]" : ""
                    }`}>
                  <td className="py-3 px-3 font-medium text-ink">
                    <div className="flex items-center gap-2">
                      {s.is_stagnant && (
                        <AlertTriangle size={12} className="text-warning shrink-0" title="Estancada" />
                      )}
                      {s.is_improving && (
                        <TrendingUp size={12} className="text-success shrink-0" title="Mejorando" />
                      )}
                      {s.name}
                    </div>
                  </td>
                  <td className="py-3 px-3 font-bold" style={{ color: semColor(safe(s.percentage)) }}>
                    {safe(s.percentage).toFixed(1)}%
                  </td>
                  <td className="py-3 px-3">
                    <span className={`text-xs px-2 py-0.5 rounded-full border font-semibold
                                     ${semBadge(safe(s.percentage))}`}>
                      {semLabel(safe(s.percentage))}
                    </span>
                  </td>
                  <td className="py-3 px-3">
                    <div className="flex items-center gap-1.5">
                      {s.trend === "mejorando"  && <TrendingUp  size={13} className="text-success" />}
                      {s.trend === "empeorando" && <TrendingDown size={13} className="text-danger" />}
                      {s.trend === "estancado"  && <Minus size={13} className="text-warning" />}
                      <span className={`text-[11px] font-medium ${
                        s.trend === "mejorando"  ? "text-success" :
                        s.trend === "empeorando" ? "text-danger"  :
                        s.trend === "estancado"  ? "text-warning" : "text-ink/40"
                      }`}>
                        {s.trend === "mejorando"    ? "Mejorando"
                         : s.trend === "empeorando" ? "Empeorando"
                         : s.trend === "estancado"  ? "Estancada"
                         : "Sin historial"}
                      </span>
                    </div>
                    {/* Mini sparkline de puntos */}
                    {s.history?.length > 1 && (
                      <div className="flex items-end gap-0.5 mt-1 h-4">
                        {s.history.slice(-5).map((v, i) => (
                          <div
                            key={i}
                            className="flex-1 rounded-sm transition-all"
                            style={{
                              height:     `${Math.max((safe(v) / 100) * 16, 2)}px`,
                              background: semColor(safe(v)),
                              opacity:    0.7,
                            }}
                            title={`${safe(v).toFixed(1)}%`}
                          />
                        ))}
                      </div>
                    )}
                  </td>
                  <td className="py-3 px-3">
                    <DeltaBadge delta={s.delta_vs_prev} />
                  </td>
                  <td className="py-3 px-3 text-xs text-ink/50 max-w-[200px]">
                    {s.observation?.text
                      ? <span className={
                          s.observation.sentiment === "negativo" ? "text-danger/70" :
                          s.observation.sentiment === "positivo" ? "text-success/70" :
                          "text-ink/50"
                        }>
                          {s.observation.text.slice(0, 70)}{s.observation.text.length > 70 ? "…" : ""}
                        </span>
                      : <span className="text-ink/25">Sin observación</span>
                    }
                    {s.observation?.is_recurrent && (
                      <span className="ml-1 text-[9px] bg-warning/15 text-warning px-1.5 py-0.5 rounded-full">
                        Recurrente
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </GlassCard>

      {/* ══ 3. ESTANCAMIENTO ════════════════════════════════════════════════ */}
      {analysis.stagnant_s?.length > 0 && (
        <div className="mb-6 animate-fade-up">
          <SectionTitle
            icon={AlertTriangle}
            title="Dimensiones Estancadas"
            subtitle="Sin mejora significativa en las últimas auditorías"
            color={COL.warning}
          />
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {analysis.stagnant_s.map((s) => (
              <div key={s.s_index}
                   className="rounded-2xl p-4 border animate-fade-up"
                   style={{ background: `${COL.warning}08`, borderColor: `${COL.warning}25` }}>
                <div className="flex items-center gap-2 mb-2">
                  <AlertTriangle size={14} style={{ color: COL.warning }} />
                  <p className="text-sm font-semibold text-ink">{s.short}</p>
                  <span className="text-lg font-bold ml-auto"
                        style={{ color: semColor(safe(s.percentage)) }}>
                    {safe(s.percentage).toFixed(1)}%
                  </span>
                </div>
                <p className="text-xs text-ink/60 leading-snug">{s.message}</p>
                <div className="mt-2 text-[10px] text-warning/70">
                  Variación últimas 3 auditorías: ±{safe(s.variation).toFixed(1)} pp
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ══ 4. PREGUNTAS CRÍTICAS ════════════════════════════════════════════ */}
      {analysis.critical_questions?.length > 0 && (
        <GlassCard className="mb-6 animate-fade-up">
          <SectionTitle
            icon={AlertCircle}
            title="Preguntas Críticas (0% de cumplimiento)"
            subtitle="Ordenadas por peso — mayor impacto en el puntaje total"
            color={COL.danger}
          />
          <div className="space-y-3">
            {analysis.critical_questions.map((q, i) => (
              <div key={i}
                   className="flex items-start gap-3 p-3 rounded-xl border"
                   style={{ background: `${COL.danger}06`, borderColor: `${COL.danger}20` }}>
                <div className="w-6 h-6 rounded-full bg-danger/15 flex items-center justify-center
                                text-danger font-bold text-xs shrink-0 mt-0.5">
                  {i + 1}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-ink leading-snug">{q.question_text}</p>
                  <div className="flex items-center gap-2 mt-1 flex-wrap">
                    <span className="text-[10px] bg-ink/8 px-2 py-0.5 rounded-full text-ink/50">
                      {q.s_name}
                    </span>
                    <span className="text-[10px] text-danger font-semibold">
                      Peso: {safe(q.weight).toFixed(1)}%
                    </span>
                    {q.observation?.text && (
                      <span className="text-[10px] text-ink/40 italic truncate max-w-[200px]">
                        "{q.observation.text.slice(0, 60)}{q.observation.text.length > 60 ? "…" : ""}"
                      </span>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </GlassCard>
      )}

      {/* ══ 5. ANÁLISIS DE COMENTARIOS ══════════════════════════════════════ */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 mb-6">

        {/* Temas frecuentes */}
        {analysis.comment_topics?.length > 0 && (
          <GlassCard className="animate-fade-up">
            <SectionTitle
              icon={MessageSquare}
              title="Temas en Comentarios"
              subtitle="Palabras clave más frecuentes en las observaciones"
              color={COL.secondary}
            />
            <div className="space-y-2">
              {analysis.comment_topics.slice(0, 8).map(({ tema, frecuencia }) => {
                const maxFreq = analysis.comment_topics[0]?.frecuencia || 1;
                return (
                  <div key={tema}>
                    <div className="flex items-center justify-between mb-0.5">
                      <span className="text-xs text-ink capitalize">{tema}</span>
                      <span className="text-xs font-semibold text-ink/50">
                        {frecuencia}×
                      </span>
                    </div>
                    <div className="h-1.5 bg-ink/8 rounded-full overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all duration-700"
                        style={{
                          width:      `${(frecuencia / maxFreq) * 100}%`,
                          background: COL.secondary,
                        }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </GlassCard>
        )}

        {/* Hallazgos recurrentes */}
        {analysis.recurrent_findings?.length > 0 && (
          <GlassCard className="animate-fade-up">
            <SectionTitle
              icon={History}
              title="Hallazgos Recurrentes"
              subtitle="Observaciones que se repiten en múltiples auditorías"
              color={COL.warning}
            />
            <div className="space-y-3">
              {analysis.recurrent_findings.map(({ text, count }, i) => (
                <div key={i}
                     className="p-3 rounded-xl border"
                     style={{ background: `${COL.warning}08`, borderColor: `${COL.warning}20` }}>
                  <div className="flex items-start gap-2">
                    <span className="text-xs font-bold px-1.5 py-0.5 rounded-md shrink-0"
                          style={{ background: `${COL.warning}20`, color: COL.warning }}>
                      {count}×
                    </span>
                    <p className="text-xs text-ink/80 leading-snug">{text}</p>
                  </div>
                </div>
              ))}
            </div>
          </GlassCard>
        )}
      </div>

      {/* ══ 6. RECOMENDACIONES ══════════════════════════════════════════════ */}
      {analysis.recommendations?.length > 0 && (
        <GlassCard className="mb-6 animate-fade-up">
          <SectionTitle
            icon={Lightbulb}
            title="Recomendaciones"
            subtitle="Acciones prioritarias generadas automáticamente"
            color={COL.success}
          />
          <div className="space-y-3">
            {analysis.recommendations.map((rec, i) => (
              <div key={i} className="flex items-start gap-3">
                <div className="w-6 h-6 rounded-full flex items-center justify-center shrink-0 mt-0.5"
                     style={{ background: `${COL.success}20` }}>
                  <span className="text-[10px] font-bold" style={{ color: COL.success }}>
                    {i + 1}
                  </span>
                </div>
                <p className="text-sm text-ink/80 leading-snug"
                   dangerouslySetInnerHTML={{
                     __html: rec.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
                   }}
                />
              </div>
            ))}
          </div>
        </GlassCard>
      )}

      {/* ══ 7. EVOLUCIÓN HISTÓRICA ══════════════════════════════════════════ */}
      {trendData.length >= 2 && (
        <GlassCard className="animate-fade-up">
          <SectionTitle
            icon={Activity}
            title="Evolución Histórica"
            subtitle={`${trend?.total_audits} auditorías · ${analysis.branch} · ${analysis.audit_type}`}
            color={COL.primary}
          />

          <div className="overflow-x-auto">
            <div style={{ minWidth: Math.max(trendData.length * 100, 400) }}>
              <ResponsiveContainer width="100%" height={280}>
                <LineChart data={trendData} margin={{ top: 8, right: 16, left: -8, bottom: 8 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(30,30,47,0.06)" />
                  <XAxis dataKey="label" tick={{ fontSize: 10 }} axisLine={false} tickLine={false} />
                  <YAxis domain={[0, 100]} tickFormatter={(v) => `${v}%`}
                    tick={{ fontSize: 10 }} axisLine={false} tickLine={false} />
                  <Tooltip content={<GTooltip />} />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  {[
                    { key: "Total",    name: "Total",     color: COL.primary, width: 2.5 },
                    { key: "Seiri",    name: "Seiri",     color: "#5B8FBF",   width: 1.5 },
                    { key: "Seiton",   name: "Seiton",    color: COL.secondary, width: 1.5 },
                    { key: "Seiso",    name: "Seiso",     color: COL.success, width: 1.5 },
                    { key: "Seiketsu", name: "Seiketsu",  color: COL.warning, width: 1.5 },
                    { key: "Shitsuke", name: "Shitsuke",  color: COL.danger,  width: 1.5 },
                  ].map(({ key, name, color, width }) => (
                    <Line
                      key={key}
                      type="monotone"
                      dataKey={key}
                      name={name}
                      stroke={color}
                      strokeWidth={width}
                      dot={key === "Total" ? { r: 4, fill: color, strokeWidth: 0 } : { r: 2, fill: color, strokeWidth: 0 }}
                      activeDot={{ r: 5 }}
                      connectNulls
                      strokeDasharray={key === "Total" ? undefined : "0"}
                      strokeOpacity={key === "Total" ? 1 : 0.65}
                    />
                  ))}
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>

          {trend?.trend && (
            <div className="flex items-center gap-2 mt-3">
              {trend.trend === "mejorando"  && <TrendingUp size={14} className="text-success" />}
              {trend.trend === "empeorando" && <TrendingDown size={14} className="text-danger" />}
              {trend.trend === "estancado"  && <Minus size={14} className="text-warning" />}
              <p className="text-xs text-ink/50">
                Tendencia histórica:{" "}
                <strong className={
                  trend.trend === "mejorando"  ? "text-success" :
                  trend.trend === "empeorando" ? "text-danger" : "text-warning"
                }>
                  {trend.trend === "mejorando"  ? "Mejorando"
                   : trend.trend === "empeorando" ? "Empeorando"
                   : "Estancada"}
                </strong>
                {trend.overall_delta != null && (
                  <> · Delta histórico: {trend.overall_delta > 0 ? "+" : ""}{(+trend.overall_delta).toFixed(1)} pp</>
                )}
              </p>
            </div>
          )}
        </GlassCard>
      )}

    </div>
  );
}