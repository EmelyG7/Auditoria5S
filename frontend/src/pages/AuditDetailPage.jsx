import { useState }                      from "react";
import { useParams, useNavigate }        from "react-router-dom";
import { useQuery }                      from "@tanstack/react-query";
import {
  ArrowLeft, Loader2, Brain, TrendingUp, TrendingDown,
  Minus, AlertTriangle, CheckCircle2, Lightbulb,
  MessageSquare, RotateCcw, ChevronDown, ChevronUp,
} from "lucide-react";
import { auditsService }  from "../services/audits";
import Header             from "../components/Layout/Header";
import GlassCard          from "../components/Layout/GlassCard";
import RadarChartS        from "../components/Dashboard/RadarChartS";
import { fmt }            from "../utils/format";

const S_KEYS   = ["seiri", "seiton", "seiso", "seiketsu", "shitsuke"];
const S_LABELS = ["Seiri", "Seiton", "Seiso", "Seiketsu", "Shitsuke"];

const COL = {
  primary:  "#0A4F79",
  success:  "#98C062",
  warning:  "#EA9947",
  danger:   "#DF4585",
};

function semColor(pct) {
  const n = Number(pct);
  if (n >= 80) return COL.success;
  if (n >= 60) return COL.warning;
  return COL.danger;
}

// Convierte **texto** a <strong>texto</strong>
function RichText({ text, className = "" }) {
  const parts = text.split(/\*\*(.+?)\*\*/g);
  return (
    <span className={className}>
      {parts.map((part, i) =>
        i % 2 === 1 ? <strong key={i}>{part}</strong> : part
      )}
    </span>
  );
}

function DeltaBadge({ delta }) {
  const abs = Math.abs(delta).toFixed(1);
  if (delta >= 3)  return (
    <span className="inline-flex items-center gap-1 text-xs font-bold px-2 py-0.5 rounded-full"
          style={{ background: `${COL.success}18`, color: COL.success }}>
      <TrendingUp size={11} /> +{abs} pp
    </span>
  );
  if (delta <= -3) return (
    <span className="inline-flex items-center gap-1 text-xs font-bold px-2 py-0.5 rounded-full"
          style={{ background: `${COL.danger}18`, color: COL.danger }}>
      <TrendingDown size={11} /> -{abs} pp
    </span>
  );
  return (
    <span className="inline-flex items-center gap-1 text-xs font-bold px-2 py-0.5 rounded-full bg-ink/8 text-ink/50">
      <Minus size={11} /> {delta > 0 ? "+" : ""}{delta.toFixed(1)} pp
    </span>
  );
}

function TrendIcon({ trend }) {
  if (trend === "mejorando")  return <TrendingUp  size={13} style={{ color: COL.success }} />;
  if (trend === "empeorando") return <TrendingDown size={13} style={{ color: COL.danger }} />;
  return <Minus size={13} className="text-ink/30" />;
}

// ── Sección: Resumen ejecutivo ───────────────────────────────────────────────
function ExecutiveSummary({ summary, history_count }) {
  return (
    <GlassCard className="animate-fade-up">
      <div className="flex items-start gap-3">
        <div className="w-8 h-8 rounded-xl flex items-center justify-center shrink-0"
             style={{ background: `${COL.primary}15` }}>
          <Brain size={15} style={{ color: COL.primary }} />
        </div>
        <div>
          <p className="text-xs font-semibold text-ink/50 uppercase tracking-wide mb-2">
            Resumen ejecutivo · basado en {history_count} auditoría{history_count !== 1 ? "s" : ""} anteriores
          </p>
          <p className="text-sm text-ink/80 leading-relaxed">
            <RichText text={summary} />
          </p>
        </div>
      </div>
    </GlassCard>
  );
}

// ── Sección: Comparativa vs anterior ────────────────────────────────────────
function VsPrevious({ vp }) {
  if (!vp) return null;
  return (
    <GlassCard className="animate-fade-up">
      <h3 className="text-xs font-semibold text-ink/50 uppercase tracking-wide mb-3">
        Comparativa con auditoría anterior
      </h3>
      <div className="flex items-center gap-4">
        <div className="text-center">
          <p className="text-xs text-ink/40 mb-0.5">Anterior</p>
          <p className="text-xl font-bold" style={{ color: semColor(vp.percentage) }}>
            {vp.percentage.toFixed(1)}%
          </p>
          <p className="text-[10px] text-ink/30">{fmt.date(vp.audit_date)}</p>
        </div>
        <div className="flex-1 flex flex-col items-center gap-1">
          <DeltaBadge delta={vp.delta} />
          <p className="text-[10px] text-ink/40">{vp.delta_label}</p>
        </div>
        <div className="text-center">
          <p className="text-xs text-ink/40 mb-0.5">Actual</p>
          <p className="text-xl font-bold" style={{ color: semColor(vp.percentage + vp.delta) }}>
            {(vp.percentage + vp.delta).toFixed(1)}%
          </p>
        </div>
      </div>
    </GlassCard>
  );
}

// ── Sección: Análisis por S ──────────────────────────────────────────────────
function SAnalysis({ sAnalysis }) {
  return (
    <GlassCard className="animate-fade-up">
      <h3 className="text-xs font-semibold text-ink/50 uppercase tracking-wide mb-4">
        Análisis por dimensión (5S)
      </h3>
      <div className="space-y-3">
        {sAnalysis.map((s) => {
          const c = semColor(s.percentage);
          return (
            <div key={s.s_index} className="rounded-xl p-3 border border-ink/8"
                 style={{ background: `${c}06` }}>
              <div className="flex items-center gap-2 mb-2">
                <span className="text-sm font-semibold" style={{ color: c }}>{s.short}</span>
                <span className="text-xs text-ink/40 flex-1">{s.name}</span>
                <TrendIcon trend={s.trend} />
                <DeltaBadge delta={s.delta_vs_prev} />
              </div>
              {/* Barra de progreso */}
              <div className="h-1.5 bg-ink/8 rounded-full overflow-hidden mb-1">
                <div className="h-full rounded-full transition-all duration-700"
                     style={{ width: `${Math.min(s.percentage, 100)}%`, background: c }} />
              </div>
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold" style={{ color: c }}>
                  {s.percentage.toFixed(1)}%
                </span>
                <div className="flex gap-1">
                  {s.is_stagnant && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded-full"
                          style={{ background: `${COL.warning}18`, color: COL.warning }}>
                      Estancado
                    </span>
                  )}
                  {s.is_improving && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded-full"
                          style={{ background: `${COL.success}18`, color: COL.success }}>
                      Mejorando
                    </span>
                  )}
                </div>
              </div>
              {/* Observación con sentimiento */}
              {s.observation?.text && (
                <p className="text-[11px] text-ink/45 mt-1.5 italic leading-snug line-clamp-2">
                  "{s.observation.text}"
                </p>
              )}
            </div>
          );
        })}
      </div>
    </GlassCard>
  );
}

// ── Sección: Recomendaciones ─────────────────────────────────────────────────
function Recommendations({ items }) {
  if (!items?.length) return null;
  return (
    <GlassCard className="animate-fade-up">
      <div className="flex items-center gap-2 mb-3">
        <Lightbulb size={14} style={{ color: COL.warning }} />
        <h3 className="text-xs font-semibold text-ink/50 uppercase tracking-wide">
          Recomendaciones
        </h3>
      </div>
      <ol className="space-y-2">
        {items.map((rec, i) => (
          <li key={i} className="flex items-start gap-2.5">
            <span className="w-5 h-5 rounded-full text-[10px] font-bold flex items-center justify-center shrink-0 mt-0.5"
                  style={{ background: `${COL.warning}18`, color: COL.warning }}>
              {i + 1}
            </span>
            <p className="text-sm text-ink/70 leading-snug">
              <RichText text={rec} />
            </p>
          </li>
        ))}
      </ol>
    </GlassCard>
  );
}

// ── Sección: Preguntas críticas del análisis (0%) ────────────────────────────
function CriticalQuestionsAnalysis({ items }) {
  if (!items?.length) return null;
  return (
    <GlassCard className="animate-fade-up">
      <div className="flex items-center gap-2 mb-3">
        <AlertTriangle size={14} style={{ color: COL.danger }} />
        <h3 className="text-xs font-semibold text-ink/50 uppercase tracking-wide">
          Preguntas con 0% de cumplimiento
        </h3>
        <span className="ml-auto text-xs font-bold px-2 py-0.5 rounded-full"
              style={{ background: `${COL.danger}15`, color: COL.danger }}>
          {items.length}
        </span>
      </div>
      <div className="space-y-2">
        {items.map((q, i) => (
          <div key={i} className="rounded-xl p-3 border border-danger/15 bg-danger/[0.04]">
            <div className="flex items-start gap-2">
              <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full shrink-0 mt-0.5"
                    style={{ background: `${COL.danger}15`, color: COL.danger }}>
                {q.s_name?.split(" ")[0]}
              </span>
              <div className="flex-1 min-w-0">
                <p className="text-sm text-ink leading-snug">{q.question_text}</p>
                <p className="text-[11px] text-ink/40 mt-0.5">Peso: {q.weight?.toFixed(1)}%</p>
              </div>
            </div>
          </div>
        ))}
      </div>
    </GlassCard>
  );
}

// ── Sección: Hallazgos recurrentes + temas ───────────────────────────────────
function FindingsAndTopics({ recurrent, topics }) {
  const hasRecurrent = recurrent?.length > 0;
  const hasTopics    = topics?.length > 0;
  if (!hasRecurrent && !hasTopics) return null;

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
      {hasRecurrent && (
        <GlassCard className="animate-fade-up">
          <div className="flex items-center gap-2 mb-3">
            <RotateCcw size={13} style={{ color: COL.danger }} />
            <h3 className="text-xs font-semibold text-ink/50 uppercase tracking-wide">
              Hallazgos recurrentes
            </h3>
          </div>
          <div className="space-y-2">
            {recurrent.map((f, i) => (
              <div key={i} className="flex items-start gap-2 rounded-lg p-2.5 bg-ink/4">
                <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full shrink-0"
                      style={{ background: `${COL.danger}15`, color: COL.danger }}>
                  ×{f.count}
                </span>
                <p className="text-xs text-ink/70 leading-snug">{f.text}</p>
              </div>
            ))}
          </div>
        </GlassCard>
      )}

      {hasTopics && (
        <GlassCard className="animate-fade-up">
          <div className="flex items-center gap-2 mb-3">
            <MessageSquare size={13} style={{ color: COL.primary }} />
            <h3 className="text-xs font-semibold text-ink/50 uppercase tracking-wide">
              Temas en comentarios
            </h3>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {topics.map((t, i) => (
              <span key={i}
                    className="text-xs px-2.5 py-1 rounded-full border border-ink/10"
                    style={{
                      background: `${COL.primary}${Math.max(10, Math.round(12 - i)).toString(16).padStart(2, "0")}`,
                      color: COL.primary,
                    }}>
                {t.tema}
                <span className="ml-1 opacity-50">×{t.frecuencia}</span>
              </span>
            ))}
          </div>
        </GlassCard>
      )}
    </div>
  );
}

// ── Componente principal ─────────────────────────────────────────────────────
export default function AuditDetailPage() {
  const { id }    = useParams();
  const navigate  = useNavigate();
  const [showAnalysis, setShowAnalysis] = useState(false);

  const { data: audit, isLoading, error } = useQuery({
    queryKey: ["audit", id],
    queryFn:  () => auditsService.getById(id),
    enabled:  !!id,
  });

  const { data: analysis, isLoading: loadingAnalysis } = useQuery({
    queryKey: ["audit-analysis", id],
    queryFn:  () => auditsService.getAnalysis(id),
    enabled:  !!id && showAnalysis,
    staleTime: 120_000,
  });

  const radarData = audit?.puntajes_por_s
    ? S_KEYS.map((key, i) => ({ s: S_LABELS[i], value: audit.puntajes_por_s[key] ?? 0 }))
    : [];

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 size={32} className="animate-spin text-primary/40" />
      </div>
    );
  }

  if (error || !audit) {
    return (
      <div className="text-center py-12">
        <p className="text-danger">No se pudo cargar la auditoría.</p>
        <button onClick={() => navigate("/audits")} className="btn-secondary mt-4">
          Volver al listado
        </button>
      </div>
    );
  }

  return (
    <div className="min-h-screen relative z-10">
      <Header
        title={`Detalle de Auditoría #${audit.id}`}
        subtitle={`${audit.branch} · ${fmt.date(audit.audit_date)}`}
      />

      <div className="mb-4">
        <button
          onClick={() => navigate("/audits")}
          className="btn-ghost flex items-center gap-2 text-sm"
        >
          <ArrowLeft size={16} />
          Volver al listado
        </button>
      </div>

      {/* ── Fila principal ────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <div className="space-y-5">
          <GlassCard>
            <h3 className="text-sm font-semibold text-ink/70 uppercase tracking-wide mb-4">
              Información General
            </h3>
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <p className="text-xs text-ink/40">Tipo</p>
                <p className="font-medium">{audit.audit_type_name || "—"}</p>
              </div>
              <div>
                <p className="text-xs text-ink/40">Sucursal</p>
                <p className="font-medium">{audit.branch}</p>
              </div>
              <div>
                <p className="text-xs text-ink/40">Fecha</p>
                <p className="font-medium">{fmt.date(audit.audit_date)}</p>
              </div>
              <div>
                <p className="text-xs text-ink/40">Auditor</p>
                <p className="font-medium">{audit.auditor_name || "—"}</p>
              </div>
              {audit.start_time && (
                <div>
                  <p className="text-xs text-ink/40">Hora inicio</p>
                  <p className="font-medium">{audit.start_time}</p>
                </div>
              )}
              {audit.end_time && (
                <div>
                  <p className="text-xs text-ink/40">Hora fin</p>
                  <p className="font-medium">{audit.end_time}</p>
                </div>
              )}
            </div>
            {audit.general_observations && (
              <div className="mt-4 pt-3 border-t border-ink/10">
                <p className="text-xs text-ink/40 mb-1">Observaciones generales</p>
                <p className="text-sm text-ink/70 whitespace-pre-wrap">
                  {audit.general_observations}
                </p>
              </div>
            )}
          </GlassCard>

          <GlassCard>
            <h3 className="text-sm font-semibold text-ink/70 uppercase tracking-wide mb-4">
              Puntaje General
            </h3>
            <div className="flex items-center gap-4 p-4 rounded-2xl bg-ink/5">
              <div className="text-4xl font-bold"
                   style={{ color: fmt.semaforoColor(audit.percentage) }}>
                {fmt.pct(audit.percentage)}
              </div>
              <div>
                <span className={fmt.badgeClass(audit.status)}>{audit.status}</span>
                <p className="text-ink/50 text-xs mt-1">
                  {audit.total_score} / {audit.max_score} pts
                </p>
              </div>
            </div>
          </GlassCard>
        </div>

        <GlassCard>
          <h3 className="text-sm font-semibold text-ink/70 uppercase tracking-wide mb-4">
            Desempeño por cada S
          </h3>
          <RadarChartS data={radarData} height={280} />
        </GlassCard>
      </div>

      {/* ── Preguntas críticas ────────────────────────────────────────────────── */}
      {audit.preguntas_criticas?.length > 0 && (
        <div className="mt-5">
          <GlassCard>
            <h3 className="text-sm font-semibold text-ink/70 uppercase tracking-wide mb-4">
              Preguntas Críticas ({audit.preguntas_criticas_n})
            </h3>
            <div className="space-y-3">
              {audit.preguntas_criticas.map((q) => (
                <div key={q.id}
                     className="flex items-start gap-3 bg-danger/5 border border-danger/15 rounded-xl p-4">
                  <span className="text-danger text-xs font-semibold shrink-0 mt-0.5">
                    {q.s_name?.split(" ")[0]}
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="text-ink text-sm leading-snug">{q.question_text}</p>
                    <p className="text-ink/50 text-xs mt-1">
                      Respuesta: {q.response_percent}% · Puntos perdidos: {q.points_lost}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </GlassCard>
        </div>
      )}

      {/* ── Botón de análisis inteligente ────────────────────────────────────── */}
      <div className="mt-6">
        <button
          onClick={() => setShowAnalysis((v) => !v)}
          className="w-full flex items-center justify-center gap-2 py-3 rounded-2xl border
                     border-dashed border-primary/30 text-primary/70 hover:text-primary
                     hover:border-primary/50 hover:bg-primary/[0.03] transition-all text-sm font-medium"
        >
          {loadingAnalysis
            ? <><Loader2 size={15} className="animate-spin" /> Generando análisis...</>
            : showAnalysis
              ? <><ChevronUp size={15} /> Ocultar análisis inteligente</>
              : <><Brain size={15} /> Ver análisis inteligente</>
          }
        </button>
      </div>

      {/* ── Sección de análisis ───────────────────────────────────────────────── */}
      {showAnalysis && analysis && (
        <div className="mt-5 space-y-5">
          <ExecutiveSummary
            summary={analysis.executive_summary}
            history_count={analysis.history_count}
          />

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            <VsPrevious vp={analysis.vs_previous} />
            <Recommendations items={analysis.recommendations} />
          </div>

          <SAnalysis sAnalysis={analysis.s_analysis} />

          <FindingsAndTopics
            recurrent={analysis.recurrent_findings}
            topics={analysis.comment_topics}
          />

          <CriticalQuestionsAnalysis items={analysis.critical_questions} />
        </div>
      )}
    </div>
  );
}
