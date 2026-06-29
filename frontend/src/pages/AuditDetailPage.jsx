import { useState }                      from "react";
import { useParams, useNavigate }        from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft, Loader2, Brain, TrendingUp, TrendingDown,
  Minus, AlertTriangle, CheckCircle2, Lightbulb,
  MessageSquare, RotateCcw, ChevronDown, ChevronUp,
  Sparkles, Plus, Save, Trash2, Copy, ClipboardCheck,
} from "lucide-react";
import { auditsService }        from "../services/audits";
import { auditAnalysisService }  from "../services/auditAnalysis";
import Header               from "../components/Layout/Header";
import GlassCard            from "../components/Layout/GlassCard";
import ConfirmModal         from "../components/Common/ConfirmModal";
import RadarChartS          from "../components/Dashboard/RadarChartS";
import AuditImageGallery    from "../components/Audits/AuditImageGallery";
import { fmt }              from "../utils/format";

const S_KEYS   = ["seiri", "seiton", "seiso", "seiketsu", "shitsuke"];
const S_LABELS = ["Clasificar", "Ordenar", "Limpiar", "Estandarizar", "Disciplina"];

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

// ── Sección: Panel de análisis con IA ────────────────────────────────────────
function AIAnalysisPanel({ auditId, current, auditType }) {
  const [hallazgos, setHallazgos]       = useState("");
  const [conclusiones, setConclusiones] = useState("");
  const [generating, setGenerating]     = useState(false);
  const [genError, setGenError]         = useState(null);
  const [copied, setCopied]             = useState(false);

  function buildPrompt() {
    if (!current) return "";
    return `Eres un redactor de informes de auditoría 5S para Cecomsa. Basándote en los siguientes datos, genera en español profesional:

1. HALLAZGOS: 2-4 oraciones describiendo lo encontrado. Si el puntaje es ≥95% sin observaciones críticas, redacta positivamente. Si hay áreas < 80%, descríbelas específicamente.

2. CONCLUSIONES GENERALES: párrafo de 4-5 oraciones evaluando madurez 5S, mencionando fortalezas y áreas de oportunidad.

Datos:
- Sucursal: ${current.sucursal}
- Tipo: ${auditType}
- Fecha: ${current.audit_date}
- Seiri: ${current.scores.seiri.pct}%
- Seiton: ${current.scores.seiton.pct}%
- Seiso: ${current.scores.seiso.pct}%
- Seiketsu: ${current.scores.seiketsu.pct}%
- Shitsuke: ${current.scores.shitsuke.pct}%
- Puntaje total: ${current.total_pct}%
- Observaciones: ${JSON.stringify(current.observations_by_s)}

Tono de referencia: profesional, directo, sin dramatizar.

Responde en este formato exacto (sin JSON, sin comillas extra):

HALLAZGOS:
[texto de hallazgos aquí]

CONCLUSIONES GENERALES:
[texto de conclusiones aquí]`;
  }

  async function handleCopy() {
    const prompt = buildPrompt();
    if (!prompt) return;
    await navigator.clipboard.writeText(prompt);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  }

  async function handleGenerate() {
    if (!current) return;
    setGenerating(true);
    setGenError(null);

    const aiPrompt = `Eres un redactor de informes de auditoría 5S para Cecomsa. Basándote en los siguientes datos, genera en español profesional:

1. HALLAZGOS: 2-4 oraciones describiendo lo encontrado. Si el puntaje es ≥95% sin observaciones críticas, redacta positivamente mencionando el contexto operativo si aplica. Si hay áreas < 80%, descríbelas específicamente.

2. CONCLUSIONES GENERALES: párrafo de 4-5 oraciones evaluando madurez 5S, mencionando fortalezas y áreas de oportunidad.

Datos:
- Sucursal: ${current.sucursal}
- Tipo: ${auditType}
- Fecha: ${current.audit_date}
- Seiri: ${current.scores.seiri.pct}%
- Seiton: ${current.scores.seiton.pct}%
- Seiso: ${current.scores.seiso.pct}%
- Seiketsu: ${current.scores.seiketsu.pct}%
- Shitsuke: ${current.scores.shitsuke.pct}%
- Puntaje total: ${current.total_pct}%
- Observaciones: ${JSON.stringify(current.observations_by_s)}

Usa este tono exacto como referencia:
"Este RMA demuestra un alto nivel de madurez en la implementación de las 5S. La clasificación, el orden, la limpieza, la estandarización y la disciplina están completamente consolidados."
"Área de oportunidad: Seiso (Limpiar) – puntual."

Responde SOLO con JSON válido:
{"hallazgos": "...", "conclusiones_generales": "..."}`;

    try {
      const raw = await auditAnalysisService.generateAI(auditId, aiPrompt, 1000);
      const cleaned = raw.trim().replace(/^```(?:json)?\s*/, "").replace(/```$/, "");
      const parsed = JSON.parse(cleaned);
      setHallazgos(parsed.hallazgos || "");
      setConclusiones(parsed.conclusiones_generales || "");
    } catch (e) {
      setGenError(
        e.response?.data?.detail || "No se pudo generar el análisis con IA. Intenta de nuevo."
      );
    } finally {
      setGenerating(false);
    }
  }

  return (
    <GlassCard>
      <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
        <h3 className="text-sm font-semibold text-ink/70 uppercase tracking-wide">
          Análisis de esta Auditoría
        </h3>
        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={handleCopy}
            disabled={!current}
            className="btn-secondary text-xs flex items-center gap-1.5 px-3 py-1.5 disabled:opacity-50"
            title="Copia el prompt al portapapeles y pégalo en claude.ai"
          >
            {copied ? <ClipboardCheck size={13} /> : <Copy size={13} />}
            {copied ? "¡Copiado!" : "Copiar para Claude.ai"}
          </button>
          <button
            onClick={handleGenerate}
            disabled={generating || !current}
            className="btn-primary text-xs flex items-center gap-1.5 px-3 py-1.5 disabled:opacity-50"
          >
            {generating ? <Loader2 size={13} className="animate-spin" /> : <Sparkles size={13} />}
            {generating ? "Generando…" : "Generar con IA"}
          </button>
        </div>
      </div>

      {copied && (
        <p className="text-xs mb-3 px-3 py-2 rounded-xl" style={{ background: `${COL.primary}0D`, color: COL.primary }}>
          Prompt copiado. Pégalo en <strong>claude.ai</strong>, obtén la respuesta y copia el texto de cada sección en los campos de abajo.
        </p>
      )}

      {genError && <p className="text-xs text-danger mb-3">{genError}</p>}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <p className="field-label">Hallazgos</p>
          <textarea
            value={hallazgos}
            onChange={(e) => setHallazgos(e.target.value)}
            rows={6}
            placeholder="Los hallazgos generados por IA aparecerán aquí. También puedes escribirlos manualmente."
            className="input-glass w-full text-sm resize-none"
          />
        </div>
        <div>
          <p className="field-label">Conclusiones Generales</p>
          <textarea
            value={conclusiones}
            onChange={(e) => setConclusiones(e.target.value)}
            rows={6}
            placeholder="Las conclusiones generales aparecerán aquí. También puedes escribirlas manualmente."
            className="input-glass w-full text-sm resize-none"
          />
        </div>
      </div>
    </GlassCard>
  );
}

// ── Sección: Comparación con auditoría anterior (tabla por S) ───────────────
function DeltaCell({ delta }) {
  if (delta == null) return <span className="text-ink/30 text-xs">—</span>;
  const color = delta > 0 ? COL.success : delta < 0 ? COL.danger : null;
  const sign  = delta > 0 ? "+" : "";
  return (
    <span className="font-semibold text-xs" style={color ? { color } : { color: "inherit", opacity: 0.5 }}>
      {sign}{delta.toFixed(1)} pp {delta > 0 ? "🟢" : delta < 0 ? "🔴" : ""}
    </span>
  );
}

function HistoricalComparison({ current, previous, delta }) {
  const rows = S_KEYS.map((key, i) => ({
    key,
    label:    S_LABELS[i],
    prevPct:  previous.scores[key]?.pct ?? 0,
    currPct:  current.scores[key]?.pct ?? 0,
    delta:    delta?.[key] ?? 0,
  }));

  return (
    <GlassCard>
      <h3 className="text-sm font-semibold text-ink/70 uppercase tracking-wide mb-1">
        Comparación con Auditoría Anterior
      </h3>
      <p className="text-xs text-ink/40 mb-4">
        Auditoría anterior: {fmt.date(previous.audit_date)} — {previous.total_pct.toFixed(1)}%
      </p>
      <div className="overflow-x-auto">
        <table className="w-full text-sm min-w-[420px]">
          <thead>
            <tr className="border-b border-ink/10">
              {["S", "Anterior", "Actual", "Δ"].map((h) => (
                <th key={h} className="text-left py-2 px-3 text-xs font-semibold text-ink/50 uppercase tracking-wide">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-ink/5">
            {rows.map((r) => (
              <tr key={r.key}>
                <td className="py-2 px-3 font-medium text-ink">{r.label}</td>
                <td className="py-2 px-3 text-ink/60">{r.prevPct.toFixed(1)}%</td>
                <td className="py-2 px-3 font-semibold" style={{ color: semColor(r.currPct) }}>
                  {r.currPct.toFixed(1)}%
                </td>
                <td className="py-2 px-3"><DeltaCell delta={r.delta} /></td>
              </tr>
            ))}
            <tr className="border-t border-ink/10 font-bold">
              <td className="py-2.5 px-3">TOTAL</td>
              <td className="py-2.5 px-3 text-ink/60">{previous.total_pct.toFixed(1)}%</td>
              <td className="py-2.5 px-3" style={{ color: semColor(current.total_pct) }}>
                {current.total_pct.toFixed(1)}%
              </td>
              <td className="py-2.5 px-3"><DeltaCell delta={delta?.total ?? 0} /></td>
            </tr>
          </tbody>
        </table>
      </div>
    </GlassCard>
  );
}

// ── Sección: Plan de acción ("Pasos a Seguir") ───────────────────────────────
const PLAN_STATUS_COLOR = {
  pendiente:    COL.warning,
  en_progreso:  COL.primary,
  completado:   COL.success,
};
const PLAN_STATUS_LABEL = {
  pendiente:   "Pendiente",
  en_progreso: "En progreso",
  completado:  "Completado",
};

function ActionPlanRow({ plan, isDraft, saving, onSave, onDelete }) {
  const [text, setText]               = useState(plan.item_text || "");
  const [responsible, setResponsible] = useState(plan.responsible || "");
  const [dueDate, setDueDate]         = useState(plan.due_date || "");
  const [statusVal, setStatusVal]     = useState(plan.status || "pendiente");
  const [dirty, setDirty]             = useState(false);

  function buildPayload(overrides = {}) {
    return {
      item_text:   text.trim(),
      responsible: responsible.trim() || null,
      due_date:    dueDate || null,
      status:      statusVal,
      ...overrides,
    };
  }

  function handleSave() {
    if (!text.trim()) return;
    onSave(buildPayload());
    setDirty(false);
  }

  function handleBlur() {
    if (dirty && text.trim()) handleSave();
  }

  function handleStatusChange(e) {
    const next = e.target.value;
    setStatusVal(next);
    if (text.trim()) onSave(buildPayload({ status: next }));
  }

  return (
    <div className="flex flex-wrap items-center gap-2 p-3 rounded-xl border border-ink/8 bg-ink/[0.02]">
      <input
        className="input-glass flex-1 min-w-[200px] text-sm"
        placeholder="Descripción del paso a seguir…"
        value={text}
        onChange={(e) => { setText(e.target.value); setDirty(true); }}
        onBlur={handleBlur}
      />
      <input
        className="input-glass w-40 text-sm"
        placeholder="Responsable"
        value={responsible}
        onChange={(e) => { setResponsible(e.target.value); setDirty(true); }}
        onBlur={handleBlur}
      />
      <input
        type="date"
        className="input-glass w-36 text-sm"
        value={dueDate || ""}
        onChange={(e) => { setDueDate(e.target.value); setDirty(true); }}
        onBlur={handleBlur}
      />
      <span
        className="inline-flex items-center gap-1.5 text-[10px] font-semibold px-2 py-1 rounded-full shrink-0"
        style={{ background: `${PLAN_STATUS_COLOR[statusVal]}18`, color: PLAN_STATUS_COLOR[statusVal] }}
      >
        <span className="w-1.5 h-1.5 rounded-full" style={{ background: PLAN_STATUS_COLOR[statusVal] }} />
        {PLAN_STATUS_LABEL[statusVal]}
      </span>
      <select
        className="input-glass w-36 text-sm"
        value={statusVal}
        onChange={handleStatusChange}
      >
        <option value="pendiente">Pendiente</option>
        <option value="en_progreso">En progreso</option>
        <option value="completado">Completado</option>
      </select>
      <button
        onClick={handleSave}
        disabled={!text.trim() || saving}
        className="icon-btn-glass disabled:opacity-40"
        title="Guardar"
      >
        <Save size={14} />
      </button>
      {!isDraft && (
        <button onClick={onDelete} className="icon-btn-glass hover:text-danger" title="Eliminar paso">
          <Trash2 size={14} />
        </button>
      )}
    </div>
  );
}

function ActionPlansSection({ auditId }) {
  const qc = useQueryClient();
  const [drafts, setDrafts]               = useState([]);
  const [confirmDeleteId, setConfirmDeleteId] = useState(null);

  const { data: plans = [], isLoading } = useQuery({
    queryKey: ["action-plans", auditId],
    queryFn:  () => auditAnalysisService.getActionPlans(auditId),
    enabled:  !!auditId,
  });

  const invalidate = () => qc.invalidateQueries({ queryKey: ["action-plans", auditId] });

  const createMut = useMutation({
    mutationFn: (payload) => auditAnalysisService.createActionPlan(auditId, payload),
    onSuccess:  invalidate,
  });
  const updateMut = useMutation({
    mutationFn: ({ planId, payload }) => auditAnalysisService.updateActionPlan(auditId, planId, payload),
    onSuccess:  invalidate,
  });
  const deleteMut = useMutation({
    mutationFn: (planId) => auditAnalysisService.deleteActionPlan(auditId, planId),
    onSuccess:  invalidate,
  });

  function addDraft() {
    setDrafts((d) => [...d, { _tempId: `draft-${Date.now()}-${d.length}` }]);
  }

  function saveDraft(tempId, payload) {
    createMut.mutate(payload, {
      onSuccess: () => setDrafts((d) => d.filter((x) => x._tempId !== tempId)),
    });
  }

  return (
    <GlassCard>
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-semibold text-ink/70 uppercase tracking-wide">
          Pasos a Seguir
        </h3>
        <button onClick={addDraft} className="btn-ghost flex items-center gap-1.5 text-xs">
          <Plus size={14} /> Agregar
        </button>
      </div>

      {isLoading ? (
        <p className="text-xs text-ink/40">Cargando plan de acción…</p>
      ) : plans.length === 0 && drafts.length === 0 ? (
        <p className="text-xs text-ink/30 italic">Sin pasos registrados todavía.</p>
      ) : (
        <div className="space-y-2">
          {plans.map((p, i) => (
            <div key={p.id} className="flex items-start gap-2">
              <span className="text-xs text-ink/30 font-semibold mt-3.5 w-4 text-right shrink-0">{i + 1}.</span>
              <div className="flex-1">
                <ActionPlanRow
                  plan={p}
                  saving={updateMut.isPending}
                  onSave={(payload) => updateMut.mutate({ planId: p.id, payload })}
                  onDelete={() => setConfirmDeleteId(p.id)}
                />
              </div>
            </div>
          ))}
          {drafts.map((d) => (
            <div key={d._tempId} className="flex items-start gap-2">
              <span className="text-xs text-ink/30 font-semibold mt-3.5 w-4 text-right shrink-0">
                {plans.length + 1}.
              </span>
              <div className="flex-1">
                <ActionPlanRow
                  plan={{ item_text: "", responsible: "", due_date: "", status: "pendiente" }}
                  isDraft
                  saving={createMut.isPending}
                  onSave={(payload) => saveDraft(d._tempId, payload)}
                />
              </div>
            </div>
          ))}
        </div>
      )}

      <ConfirmModal
        open={confirmDeleteId != null}
        title="Eliminar paso"
        message="¿Eliminar este paso del plan de acción? Esta acción no se puede deshacer."
        onCancel={() => setConfirmDeleteId(null)}
        onConfirm={() => {
          deleteMut.mutate(confirmDeleteId);
          setConfirmDeleteId(null);
        }}
      />
    </GlassCard>
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

  // Scorecard de comparación (current/previous/delta) — mismo endpoint que
  // arriba, pero cargado de inmediato para el panel de IA, la comparación
  // histórica y el plan de acción (no depende del toggle "showAnalysis").
  const { data: scorecard, isLoading: loadingScorecard } = useQuery({
    queryKey: ["audit-scorecard", id],
    queryFn:  () => auditAnalysisService.getAuditAnalysis(id),
    enabled:  !!id,
    staleTime: 60_000,
  });

  const radarData = audit?.puntajes_por_s
    ? S_KEYS.map((key, i) => ({ s: S_LABELS[i], value: audit.puntajes_por_s[key] ?? 0 }))
    : [];

  const sObservations = audit?.questions
    ? Object.values(
        audit.questions.reduce((acc, q) => {
          if (q.observation && !acc[q.s_index]) {
            acc[q.s_index] = { s_name: q.s_name, s_index: q.s_index, text: q.observation };
          }
          return acc;
        }, {})
      ).sort((a, b) => a.s_index - b.s_index)
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
              {(audit.period_month || audit.period_year) && (
                <div>
                  <p className="text-xs text-ink/40">Período</p>
                  <p className="font-medium">
                    {audit.period_month
                      ? ["Enero","Febrero","Marzo","Abril","Mayo","Junio","Julio","Agosto","Septiembre","Octubre","Noviembre","Diciembre"][audit.period_month - 1]
                      : "—"}
                    {audit.period_year ? ` ${audit.period_year}` : ""}
                  </p>
                </div>
              )}
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
                    {q.observation && (
                      <p className="text-ink/50 text-xs mt-1.5 italic leading-snug">
                        &ldquo;{q.observation}&rdquo;
                      </p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </GlassCard>
        </div>
      )}

      {/* ── Observaciones del auditor por S ──────────────────────────────────── */}
      {sObservations.length > 0 && (
        <div className="mt-5">
          <GlassCard>
            <div className="flex items-center gap-2 mb-4">
              <MessageSquare size={15} style={{ color: COL.primary }} />
              <h3 className="text-sm font-semibold text-ink/70 uppercase tracking-wide">
                Observaciones del Auditor por S
              </h3>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {sObservations.map((o) => (
                <div
                  key={o.s_index}
                  className="rounded-xl p-3 border border-ink/8"
                  style={{ background: `${COL.primary}06` }}
                >
                  <p className="text-xs font-semibold mb-1" style={{ color: COL.primary }}>
                    {o.s_name?.split(" ")[0]}
                  </p>
                  <p className="text-xs text-ink/60 leading-snug italic">
                    &ldquo;{o.text}&rdquo;
                  </p>
                </div>
              ))}
            </div>
          </GlassCard>
        </div>
      )}

      {/* ── Galería de imágenes ───────────────────────────────────────────────── */}
      <div className="mt-5">
        <GlassCard>
          <AuditImageGallery auditId={Number(id)} />
        </GlassCard>
      </div>

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

      {/* ── Análisis IA, comparación histórica y plan de acción ──────────────── */}
      <div className="mt-5 space-y-5">
        {loadingScorecard ? (
          <GlassCard>
            <div className="animate-pulse space-y-3">
              <div className="h-4 w-1/3 bg-ink/10 rounded-full" />
              <div className="h-24 bg-ink/5 rounded-xl" />
            </div>
          </GlassCard>
        ) : (
          <>
            <AIAnalysisPanel
              auditId={Number(id)}
              current={scorecard?.current}
              auditType={audit.audit_type_name}
            />

            {scorecard?.previous ? (
              <HistoricalComparison
                current={scorecard.current}
                previous={scorecard.previous}
                delta={scorecard.delta}
              />
            ) : (
              <GlassCard>
                <p className="text-xs text-ink/40 italic">
                  Primera auditoría registrada para esta sucursal — no hay datos anteriores para comparar.
                </p>
              </GlassCard>
            )}

            <ActionPlansSection auditId={Number(id)} />
          </>
        )}
      </div>
    </div>
  );
}
