/**
 * TaskModal.jsx
 * Modal de detalle de tarea con edición inline, comentarios y time tracking.
 */

import { useState, useRef }                      from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  X, Clock, Calendar, User, ChevronDown,
  MessageSquare, Send, Plus, CheckCircle2,
  AlertCircle, Loader2, Edit2, Trash2, Timer,
} from "lucide-react";
import { projectsService } from "../../services/projects";
import { useAuth }         from "../../store/AuthContext";
import { fmt }             from "../../utils/format";

const PRIO_OPTS = [
  { value: "critica", label: "🔴 Crítica"  },
  { value: "alta",    label: "🟠 Alta"     },
  { value: "media",   label: "🔵 Media"    },
  { value: "baja",    label: "⚪ Baja"     },
];
const STATUS_OPTS = [
  { value: "backlog",      label: "Backlog"      },
  { value: "por_hacer",    label: "Por Hacer"    },
  { value: "en_progreso",  label: "En Progreso"  },
  { value: "en_revision",  label: "En Revisión"  },
  { value: "completada",   label: "Completada"   },
  { value: "cancelada",    label: "Cancelada"    },
];

const STATUS_COLOR = {
  backlog:      "#94a3b8",
  por_hacer:    "#0A4F79",
  en_progreso:  "#EA9947",
  en_revision:  "#B4427F",
  completada:   "#98C062",
  cancelada:    "#DF4585",
};

export default function TaskModal({ taskId, projectId, onClose, onUpdated }) {
  const { user }  = useAuth();
  const qc        = useQueryClient();
  const commentRef = useRef();

  const [comment,      setComment]      = useState("");
  const [hoursInput,   setHoursInput]   = useState("");
  const [hoursDesc,    setHoursDesc]    = useState("");
  const [editingTitle, setEditingTitle] = useState(false);
  const [titleVal,     setTitleVal]     = useState("");
  const [showTimeLog,  setShowTimeLog]  = useState(false);

  const { data: task, isLoading } = useQuery({
    queryKey: ["task", projectId, taskId],
    queryFn:  () => projectsService.getTask(projectId, taskId),
    enabled:  !!taskId,
  });

  const invalidate = () => {
    qc.invalidateQueries(["task", projectId, taskId]);
    qc.invalidateQueries(["board", projectId]);
    qc.invalidateQueries(["tasks", projectId]);
    onUpdated?.();
  };

  const updateMut = useMutation({
    mutationFn: (payload) => projectsService.updateTask(projectId, taskId, payload),
    onSuccess:  invalidate,
  });

  const commentMut = useMutation({
    mutationFn: (content) => projectsService.addComment(projectId, taskId, content),
    onSuccess:  () => { setComment(""); invalidate(); },
  });

  const logTimeMut = useMutation({
    mutationFn: (payload) => projectsService.logTime(projectId, taskId, payload),
    onSuccess:  () => { setHoursInput(""); setHoursDesc(""); invalidate(); },
  });

  if (isLoading || !task) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center"
           style={{ background: "rgba(10,20,40,0.45)", backdropFilter: "blur(8px)" }}>
        <Loader2 size={28} className="animate-spin text-primary/40" />
      </div>
    );
  }

  const isDone     = task.status === "completada";
  const statusColor = STATUS_COLOR[task.status] || "#0A4F79";
  const loggedPct   = task.estimated_hours
    ? Math.min((parseFloat(task.logged_hours || 0) / parseFloat(task.estimated_hours)) * 100, 100)
    : 0;

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center p-4 pt-8"
      style={{ background: "rgba(10,20,40,0.45)", backdropFilter: "blur(8px)" }}
      onClick={onClose}
    >
      <div
        className="glass rounded-3xl w-full max-w-2xl shadow-2xl animate-fade-up
                   max-h-[88vh] overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* ── Header ──────────────────────────────────────────────────────────── */}
        <div className="flex items-start justify-between p-6 pb-4 border-b border-ink/8">
          <div className="flex items-start gap-3 flex-1 min-w-0 pr-4">
            {/* Status indicator */}
            <div className="w-3 h-3 rounded-full mt-1.5 shrink-0"
                 style={{ background: statusColor }} />

            {/* Título editable */}
            {editingTitle ? (
              <input
                autoFocus
                value={titleVal}
                onChange={(e) => setTitleVal(e.target.value)}
                onBlur={() => {
                  if (titleVal.trim() && titleVal !== task.title) {
                    updateMut.mutate({ title: titleVal.trim() });
                  }
                  setEditingTitle(false);
                }}
                onKeyDown={(e) => e.key === "Enter" && e.target.blur()}
                className="text-base font-semibold text-ink bg-transparent border-b border-primary/40
                           outline-none w-full pb-0.5"
              />
            ) : (
              <button
                onClick={() => { setTitleVal(task.title); setEditingTitle(true); }}
                className="text-base font-semibold text-ink text-left hover:text-primary
                           transition-colors group flex items-center gap-1.5"
              >
                {task.title}
                <Edit2 size={12} className="opacity-0 group-hover:opacity-40 shrink-0" />
              </button>
            )}
          </div>

          <div className="flex items-center gap-2">
            <span className="text-[10px] font-mono text-ink/30">{task.task_key}</span>
            <button onClick={onClose} className="btn-ghost p-1.5">
              <X size={16} />
            </button>
          </div>
        </div>

        {/* ── Cuerpo (2 columnas) ──────────────────────────────────────────── */}
        <div className="flex flex-1 overflow-hidden">

          {/* Columna izquierda: descripción + comentarios */}
          <div className="flex-1 overflow-y-auto p-6 space-y-5 border-r border-ink/6">

            {/* Descripción */}
            <div>
              <p className="text-xs font-semibold text-ink/40 uppercase tracking-wide mb-2">
                Descripción
              </p>
              <p className="text-sm text-ink/70 leading-relaxed whitespace-pre-wrap">
                {task.description || <span className="text-ink/25 italic">Sin descripción</span>}
              </p>
            </div>

            {/* Progreso de tiempo */}
            {task.estimated_hours && (
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <p className="text-xs font-semibold text-ink/40 uppercase tracking-wide">
                    Progreso de tiempo
                  </p>
                  <span className="text-xs text-ink/60">
                    {parseFloat(task.logged_hours || 0).toFixed(1)}h / {parseFloat(task.estimated_hours).toFixed(1)}h
                  </span>
                </div>
                <div className="h-2 bg-ink/8 rounded-full overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all duration-700"
                    style={{
                      width:      `${loggedPct}%`,
                      background: loggedPct > 100 ? "#DF4585" : loggedPct > 80 ? "#EA9947" : "#98C062",
                    }}
                  />
                </div>
              </div>
            )}

            {/* Registro de tiempo */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <p className="text-xs font-semibold text-ink/40 uppercase tracking-wide">
                  Time Tracking
                </p>
                <button
                  onClick={() => setShowTimeLog((p) => !p)}
                  className="flex items-center gap-1 text-xs text-primary/70 hover:text-primary"
                >
                  <Plus size={11} /> Registrar tiempo
                </button>
              </div>

              {showTimeLog && (
                <div className="glass rounded-xl p-3 mb-3 space-y-2 animate-fade-up">
                  <div className="flex gap-2">
                    <input
                      type="number" step="0.25" min="0.25" max="24"
                      placeholder="Horas (ej: 1.5)"
                      value={hoursInput}
                      onChange={(e) => setHoursInput(e.target.value)}
                      className="input-glass text-sm flex-1"
                    />
                    <input
                      type="text" placeholder="¿Qué trabajaste?"
                      value={hoursDesc}
                      onChange={(e) => setHoursDesc(e.target.value)}
                      className="input-glass text-sm flex-[2]"
                    />
                  </div>
                  <div className="flex justify-end">
                    <button
                      onClick={() => {
                        const h = parseFloat(hoursInput);
                        if (!h || h <= 0) return;
                        logTimeMut.mutate({
                          hours:       h,
                          description: hoursDesc || null,
                          date_worked: new Date().toISOString().split("T")[0],
                        });
                      }}
                      disabled={!hoursInput || logTimeMut.isPending}
                      className="btn-primary text-xs flex items-center gap-1.5 disabled:opacity-50"
                    >
                      {logTimeMut.isPending
                        ? <><Loader2 size={11} className="animate-spin" /> Guardando…</>
                        : <><Timer size={11} /> Guardar</>
                      }
                    </button>
                  </div>
                </div>
              )}

              {/* Logs existentes */}
              {task.time_logs?.length > 0 && (
                <div className="space-y-1.5 max-h-32 overflow-y-auto">
                  {task.time_logs.map((l) => (
                    <div key={l.id} className="flex items-center gap-2 text-xs text-ink/60">
                      <div className="w-5 h-5 rounded-full bg-primary/15 flex items-center justify-center
                                      text-primary font-bold text-[9px] shrink-0">
                        {l.user?.full_name?.charAt(0)}
                      </div>
                      <span className="font-semibold text-ink">{l.hours}h</span>
                      <span className="text-ink/40">·</span>
                      <span>{l.description || "Sin descripción"}</span>
                      <span className="text-ink/30 ml-auto">{fmt.date(l.date_worked)}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Subtareas */}
            {task.subtasks?.length > 0 && (
              <div>
                <p className="text-xs font-semibold text-ink/40 uppercase tracking-wide mb-2">
                  Subtareas ({task.subtasks.filter(t=>t.status==="completada").length}/{task.subtasks.length})
                </p>
                <div className="space-y-1.5">
                  {task.subtasks.map((st) => (
                    <div key={st.id} className="flex items-center gap-2 text-xs">
                      <CheckCircle2
                        size={13}
                        className={st.status === "completada" ? "text-success" : "text-ink/20"}
                      />
                      <span className={st.status === "completada" ? "line-through text-ink/40" : "text-ink"}>
                        {st.title}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Comentarios */}
            <div>
              <p className="text-xs font-semibold text-ink/40 uppercase tracking-wide mb-3">
                Comentarios ({task.comments?.filter(c=>!c.is_deleted).length || 0})
              </p>

              <div className="space-y-3 mb-3 max-h-48 overflow-y-auto">
                {task.comments?.filter(c => !c.is_deleted).map((c) => (
                  <div key={c.id} className="flex items-start gap-2.5">
                    <div className="w-6 h-6 rounded-full bg-primary/20 flex items-center justify-center
                                    text-primary font-bold text-[9px] shrink-0 mt-0.5">
                      {c.user?.full_name?.charAt(0)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-0.5">
                        <span className="text-[11px] font-semibold text-ink">{c.user?.full_name}</span>
                        <span className="text-[10px] text-ink/30">{fmt.date(c.created_at)}</span>
                      </div>
                      <p className="text-xs text-ink/70 leading-snug">{c.content}</p>
                    </div>
                  </div>
                ))}
              </div>

              {/* Input de comentario */}
              <div className="flex gap-2">
                <div className="w-6 h-6 rounded-full bg-primary/20 flex items-center justify-center
                                text-primary font-bold text-[9px] shrink-0 mt-1">
                  {user?.full_name?.charAt(0)}
                </div>
                <div className="flex-1 flex gap-2">
                  <textarea
                    ref={commentRef}
                    rows={2}
                    value={comment}
                    onChange={(e) => setComment(e.target.value)}
                    placeholder="Agrega un comentario…"
                    className="input-glass text-sm flex-1 resize-none"
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && (e.metaKey || e.ctrlKey) && comment.trim()) {
                        commentMut.mutate(comment.trim());
                      }
                    }}
                  />
                  <button
                    onClick={() => comment.trim() && commentMut.mutate(comment.trim())}
                    disabled={!comment.trim() || commentMut.isPending}
                    className="btn-primary p-2 self-end disabled:opacity-50"
                  >
                    {commentMut.isPending
                      ? <Loader2 size={14} className="animate-spin" />
                      : <Send size={14} />
                    }
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* Columna derecha: metadatos */}
          <div className="w-52 shrink-0 overflow-y-auto p-4 space-y-4">

            {/* Estado */}
            <div>
              <p className="text-[10px] font-semibold text-ink/40 uppercase tracking-wide mb-1.5">Estado</p>
              <select
                value={task.status}
                onChange={(e) => updateMut.mutate({ status: e.target.value })}
                className="input-glass text-xs w-full"
                style={{ color: statusColor, fontWeight: 600 }}
              >
                {STATUS_OPTS.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </div>

            {/* Prioridad */}
            <div>
              <p className="text-[10px] font-semibold text-ink/40 uppercase tracking-wide mb-1.5">Prioridad</p>
              <select
                value={task.priority}
                onChange={(e) => updateMut.mutate({ priority: e.target.value })}
                className="input-glass text-xs w-full"
              >
                {PRIO_OPTS.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </div>

            {/* Asignados */}
            <div>
              <p className="text-[10px] font-semibold text-ink/40 uppercase tracking-wide mb-1.5">Asignados</p>
              <div className="space-y-1.5">
                {task.assignees?.map((a) => (
                  <div key={a.id} className="flex items-center gap-2">
                    <div className="w-6 h-6 rounded-full bg-primary/20 flex items-center justify-center
                                    text-primary font-bold text-[9px]">
                      {a.full_name?.charAt(0)}
                    </div>
                    <span className="text-[11px] text-ink">{a.full_name}</span>
                  </div>
                ))}
                {!task.assignees?.length && (
                  <p className="text-[11px] text-ink/30 italic">Sin asignar</p>
                )}
              </div>
            </div>

            {/* Story points */}
            <div>
              <p className="text-[10px] font-semibold text-ink/40 uppercase tracking-wide mb-1.5">
                Story Points
              </p>
              <input
                type="number" min="0" step="0.5"
                defaultValue={task.story_points || ""}
                onBlur={(e) => {
                  const v = parseFloat(e.target.value);
                  if (!isNaN(v)) updateMut.mutate({ story_points: v });
                }}
                className="input-glass text-xs w-full"
                placeholder="—"
              />
            </div>

            {/* Horas estimadas */}
            <div>
              <p className="text-[10px] font-semibold text-ink/40 uppercase tracking-wide mb-1.5">
                Horas estimadas
              </p>
              <input
                type="number" min="0" step="0.5"
                defaultValue={task.estimated_hours || ""}
                onBlur={(e) => {
                  const v = parseFloat(e.target.value);
                  if (!isNaN(v)) updateMut.mutate({ estimated_hours: v });
                }}
                className="input-glass text-xs w-full"
                placeholder="—"
              />
            </div>

            {/* Fecha límite */}
            <div>
              <p className="text-[10px] font-semibold text-ink/40 uppercase tracking-wide mb-1.5">
                Fecha límite
              </p>
              <input
                type="date"
                defaultValue={task.due_date || ""}
                onChange={(e) => updateMut.mutate({ due_date: e.target.value || null })}
                className={`input-glass text-xs w-full ${task.is_overdue ? "text-danger" : ""}`}
              />
            </div>

            {/* Sprint */}
            {task.sprint_name && (
              <div>
                <p className="text-[10px] font-semibold text-ink/40 uppercase tracking-wide mb-1">Sprint</p>
                <p className="text-xs text-ink">{task.sprint_name}</p>
              </div>
            )}

            {/* Reportado por */}
            {task.reporter && (
              <div>
                <p className="text-[10px] font-semibold text-ink/40 uppercase tracking-wide mb-1">Reportado por</p>
                <p className="text-xs text-ink">{task.reporter.full_name}</p>
              </div>
            )}

            {/* Fechas */}
            <div className="space-y-1 text-[10px] text-ink/30 border-t border-ink/8 pt-3">
              <p>Creado: {fmt.date(task.created_at)}</p>
              {task.completed_at && <p>Completado: {fmt.date(task.completed_at)}</p>}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}