/**
 * TaskDetailModal.jsx
 * Modal completo de detalle de tarea.
 */

import { useState, useRef, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  X, Clock, User, MessageSquare, Send, Plus, Loader2,
  Timer, Paperclip, Activity, Link2, Tag, Download, Trash,
} from "lucide-react";
import { projectsService } from "../../services/projects";
import { useAuth } from "../../store/AuthContext";
import { fmt } from "../../utils/format";
import GlassCard from "../Layout/GlassCard";

const PRIO_OPTS = [
  { value: "critica", label: "🔴 Crítica" },
  { value: "alta",    label: "🟠 Alta"    },
  { value: "media",   label: "🔵 Media"   },
  { value: "baja",    label: "⚪ Baja"    },
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
  backlog:     "#94a3b8",
  por_hacer:   "#0A4F79",
  en_progreso: "#EA9947",
  en_revision: "#B4427F",
  completada:  "#98C062",
  cancelada:   "#DF4585",
};

const RELATION_TYPES = [
  { value: "depends_on",    label: "Depende de"    },
  { value: "blocks",        label: "Bloquea"       },
  { value: "relates_to",    label: "Se relaciona"  },
  { value: "duplicates",    label: "Duplica"       },
  { value: "is_subtask_of", label: "Es subtarea de"},
];

const TABS = [
  { id: "details",     label: "Detalles",   icon: "📋" },
  { id: "activity",    label: "Actividad",  icon: "📜" },
  { id: "attachments", label: "Adjuntos",   icon: "📎" },
  { id: "relations",   label: "Relaciones", icon: "🔗" },
  { id: "time",        label: "Tiempo",     icon: "⏱️" },
];

export default function TaskDetailModal({ taskId, projectId, members = [], onClose, onUpdated }) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const fileInputRef = useRef();

  const [activeTab,        setActiveTab]        = useState("details");
  const [comment,          setComment]          = useState("");
  const [hoursInput,       setHoursInput]       = useState("");
  const [hoursDesc,        setHoursDesc]        = useState("");
  const [localDesc,        setLocalDesc]        = useState("");
  const [localEstHours,    setLocalEstHours]    = useState("");
  const [localDueDate,     setLocalDueDate]     = useState("");
  const [localCustomVals,  setLocalCustomVals]  = useState({});  // { field_id: value }
  const [labelInput,       setLabelInput]       = useState("");
  const [showLabelInput,   setShowLabelInput]   = useState(false);

  // Relation form state
  const [showRelationForm, setShowRelationForm] = useState(false);
  const [relTargetId,      setRelTargetId]      = useState("");
  const [relType,          setRelType]          = useState("relates_to");

  // ── Queries ────────────────────────────────────────────────────────────────
  const { data: task, isLoading: loadingTask } = useQuery({
    queryKey: ["task", projectId, taskId],
    queryFn:  () => projectsService.getTask(projectId, taskId),
    enabled:  !!taskId,
  });

  const { data: attachments = [] } = useQuery({
    queryKey: ["task-attachments", projectId, taskId],
    queryFn:  () => projectsService.getTaskAttachments(projectId, taskId),
    enabled:  !!taskId,
  });

  const { data: activity = [] } = useQuery({
    queryKey: ["task-activity", projectId, taskId],
    queryFn:  () => projectsService.getTaskActivity(projectId, taskId),
    enabled:  !!taskId,
  });

  const { data: relations = [] } = useQuery({
    queryKey: ["task-relations", projectId, taskId],
    queryFn:  () => projectsService.getTaskRelations(projectId, taskId),
    enabled:  !!taskId,
  });

  const { data: customValues = [] } = useQuery({
    queryKey: ["task-custom-values", projectId, taskId],
    queryFn:  () => projectsService.getTaskCustomValues(projectId, taskId),
    enabled:  !!taskId,
  });

  // Task list para selector de relaciones
  const { data: projectTasks = [] } = useQuery({
    queryKey: ["tasks", projectId],
    queryFn:  () => projectsService.getTasks(projectId),
    enabled:  showRelationForm,
    staleTime: 30_000,
  });

  // Sync estados locales cuando carga la tarea por primera vez
  useEffect(() => {
    if (!task) return;
    setLocalDesc(task.description || "");
    setLocalEstHours(task.estimated_hours != null ? String(parseFloat(task.estimated_hours)) : "");
    setLocalDueDate(task.due_date || "");
  }, [task?.id]);

  // Sync custom values cuando llegan del server
  useEffect(() => {
    if (!customValues.length) return;
    const map = {};
    customValues.forEach((cv) => { map[cv.field_id] = cv.value || ""; });
    setLocalCustomVals(map);
  }, [customValues]);

  // Debounce 600ms — descripción
  useEffect(() => {
    if (!task || localDesc === (task.description || "")) return;
    const t = setTimeout(() => updateMut.mutate({ description: localDesc }), 600);
    return () => clearTimeout(t);
  }, [localDesc]);

  // Debounce 600ms — horas estimadas
  useEffect(() => {
    if (!task) return;
    const current = task.estimated_hours != null ? String(parseFloat(task.estimated_hours)) : "";
    if (localEstHours === current) return;
    const t = setTimeout(() => {
      updateMut.mutate({ estimated_hours: localEstHours ? parseFloat(localEstHours) : null });
    }, 600);
    return () => clearTimeout(t);
  }, [localEstHours]);

  // Inmediato — fecha de vencimiento
  useEffect(() => {
    if (!task) return;
    if (localDueDate === (task.due_date || "")) return;
    updateMut.mutate({ due_date: localDueDate || null });
  }, [localDueDate]);

  // ── Mutations ──────────────────────────────────────────────────────────────
  function invalidateAll() {
    qc.invalidateQueries({ queryKey: ["task", projectId, taskId] });
    qc.invalidateQueries({ queryKey: ["task-attachments", projectId, taskId] });
    qc.invalidateQueries({ queryKey: ["task-activity", projectId, taskId] });
    qc.invalidateQueries({ queryKey: ["task-relations", projectId, taskId] });
    qc.invalidateQueries({ queryKey: ["board", projectId] });
    qc.invalidateQueries({ queryKey: ["tasks", projectId] });
    onUpdated?.();
  }

  const updateMut = useMutation({
    mutationFn: (payload) => projectsService.updateTask(projectId, taskId, payload),
    onSuccess: invalidateAll,
  });

  const commentMut = useMutation({
    mutationFn: (content) => projectsService.addComment(projectId, taskId, content),
    onSuccess: () => { setComment(""); invalidateAll(); },
  });

  const logTimeMut = useMutation({
    mutationFn: (payload) => projectsService.logTime(projectId, taskId, payload),
    onSuccess: () => { setHoursInput(""); setHoursDesc(""); invalidateAll(); },
  });

  const uploadMut = useMutation({
    mutationFn: (file) => projectsService.uploadTaskAttachment(projectId, taskId, file),
    onSuccess: () => {
      invalidateAll();
      qc.invalidateQueries({ queryKey: ["project-attachments", projectId] });
    },
  });

  const deleteAttachmentMut = useMutation({
    mutationFn: (id) => projectsService.deleteTaskAttachment(projectId, taskId, id),
    onSuccess: () => {
      invalidateAll();
      qc.invalidateQueries({ queryKey: ["project-attachments", projectId] });
    },
  });

  const addRelationMut = useMutation({
    mutationFn: (payload) => projectsService.addTaskRelation(projectId, taskId, payload),
    onSuccess: () => {
      setShowRelationForm(false);
      setRelTargetId("");
      setRelType("relates_to");
      invalidateAll();
    },
  });

  const deleteRelationMut = useMutation({
    mutationFn: (relId) => projectsService.deleteTaskRelation(projectId, taskId, relId),
    onSuccess: invalidateAll,
  });

  const setCustomValueMut = useMutation({
    mutationFn: (payload) => projectsService.setTaskCustomValue(projectId, taskId, payload),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["task-custom-values", projectId, taskId] }),
  });

  // ── Helpers de asignados ──────────────────────────────────────────────────
  function addAssignee(userId) {
    const current = (task.assignees || []).map((a) => a.id);
    if (current.includes(userId)) return;
    updateMut.mutate({ assignee_ids: [...current, userId] });
  }

  function removeAssignee(userId) {
    const next = (task.assignees || []).map((a) => a.id).filter((id) => id !== userId);
    updateMut.mutate({ assignee_ids: next });
  }

  // ── Helpers de etiquetas ───────────────────────────────────────────────────
  function addLabel() {
    const trimmed = labelInput.trim();
    if (!trimmed) return;
    const next = [...(task.labels || []), trimmed];
    updateMut.mutate({ labels: next });
    setLabelInput("");
    setShowLabelInput(false);
  }

  function removeLabel(label) {
    const next = (task.labels || []).filter((l) => l !== label);
    updateMut.mutate({ labels: next });
  }

  if (loadingTask || !task) {
    return (
      <div
        className="fixed inset-0 z-50 flex items-center justify-center"
        style={{ background: "rgba(10,20,40,0.45)", backdropFilter: "blur(8px)" }}
      >
        <Loader2 size={28} className="animate-spin text-primary/40" />
      </div>
    );
  }

  const statusColor = STATUS_COLOR[task.status] || "#0A4F79";
  const assignedIds  = new Set((task.assignees || []).map((a) => a.id));
  const availableMembers = members.filter((m) => !assignedIds.has(m.user_id));

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center p-4 pt-6 overflow-y-auto"
      style={{ background: "rgba(10,20,40,0.45)", backdropFilter: "blur(8px)" }}
      onClick={onClose}
    >
      <GlassCard className="w-full max-w-3xl mb-8 shadow-2xl" onClick={(e) => e.stopPropagation()}>

        {/* Header */}
        <div className="flex items-start justify-between mb-6 pb-4 border-b border-ink/10">
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-2">
              <span className="text-xs font-mono text-ink/50 bg-ink/5 px-2 py-1 rounded">
                {task.task_key}
              </span>
              <span
                className="text-xs px-2 py-1 rounded"
                style={{ background: `${statusColor}15`, color: statusColor }}
              >
                {task.status}
              </span>
            </div>
            <h2 className="text-xl font-bold text-ink">{task.title}</h2>
            <p className="text-xs text-ink/50 mt-1">Creado: {fmt.date(task.created_at)}</p>
          </div>
          <button onClick={onClose} className="btn-ghost p-2 hover:bg-ink/10">
            <X size={20} />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 mb-6 border-b border-ink/8 pb-1 overflow-x-auto">
          {TABS.map(({ id, label, icon }) => (
            <button
              key={id}
              onClick={() => setActiveTab(id)}
              className={`flex items-center gap-2 px-3 py-2 rounded text-sm font-medium transition-all whitespace-nowrap ${
                activeTab === id ? "text-primary bg-primary/10" : "text-ink/50 hover:text-ink"
              }`}
            >
              <span>{icon}</span> {label}
            </button>
          ))}
        </div>

        {/* ─── DETALLES ──────────────────────────────────────────────────── */}
        {activeTab === "details" && (
          <div className="space-y-4">
            {/* Estado y Prioridad */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="field-label">Estado</label>
                <select
                  value={task.status}
                  onChange={(e) => updateMut.mutate({ status: e.target.value })}
                  disabled={updateMut.isPending}
                  className="input-glass"
                >
                  {STATUS_OPTS.map((o) => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="field-label">Prioridad</label>
                <select
                  value={task.priority}
                  onChange={(e) => updateMut.mutate({ priority: e.target.value })}
                  disabled={updateMut.isPending}
                  className="input-glass"
                >
                  {PRIO_OPTS.map((o) => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </select>
              </div>
            </div>

            {/* Asignados */}
            <div>
              <label className="field-label">Asignados</label>
              <div className="flex flex-wrap gap-2">
                {(task.assignees || []).map((assignee) => (
                  <div
                    key={assignee.id}
                    className="flex items-center gap-2 bg-primary/10 rounded-lg px-3 py-2 text-sm"
                  >
                    <User size={14} className="text-primary" />
                    {assignee.full_name}
                    <button
                      onClick={() => removeAssignee(assignee.id)}
                      className="ml-1 hover:text-danger"
                      disabled={updateMut.isPending}
                    >
                      <X size={12} />
                    </button>
                  </div>
                ))}
                {availableMembers.length > 0 && (
                  <select
                    value=""
                    onChange={(e) => e.target.value && addAssignee(parseInt(e.target.value))}
                    disabled={updateMut.isPending}
                    className="btn-secondary text-sm px-3 py-2 cursor-pointer"
                  >
                    <option value="">+ Agregar</option>
                    {availableMembers.map((m) => (
                      <option key={m.user_id} value={m.user_id}>
                        {m.user?.full_name || `Usuario ${m.user_id}`}
                      </option>
                    ))}
                  </select>
                )}
              </div>
            </div>

            {/* Horas */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="field-label">Horas Estimadas</label>
                <input
                  type="number"
                  value={localEstHours}
                  onChange={(e) => setLocalEstHours(e.target.value)}
                  placeholder="0"
                  className="input-glass"
                  step="0.5"
                  min="0"
                />
              </div>
              <div>
                <label className="field-label">Horas Registradas</label>
                <div className="flex items-center gap-2 mt-2">
                  <span className="font-bold text-primary">
                    {parseFloat(task.logged_hours || 0).toFixed(1)}h
                  </span>
                  <div className="flex-1 h-2 bg-ink/8 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-primary rounded-full transition-all"
                      style={{
                        width: `${
                          task.estimated_hours
                            ? Math.min(
                                (parseFloat(task.logged_hours || 0) /
                                  parseFloat(task.estimated_hours)) * 100,
                                100
                              )
                            : 0
                        }%`,
                      }}
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* Etiquetas */}
            <div>
              <label className="field-label">Etiquetas</label>
              <div className="flex flex-wrap gap-2">
                {(task.labels || []).map((label) => (
                  <span
                    key={label}
                    className="bg-ink/10 text-ink/70 text-xs font-medium px-2 py-1 rounded-full flex items-center gap-1"
                  >
                    <Tag size={12} /> {label}
                    <button
                      onClick={() => removeLabel(label)}
                      className="hover:text-ink ml-1"
                      disabled={updateMut.isPending}
                    >
                      <X size={10} />
                    </button>
                  </span>
                ))}
                {showLabelInput ? (
                  <div className="flex items-center gap-1">
                    <input
                      autoFocus
                      value={labelInput}
                      onChange={(e) => setLabelInput(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") addLabel();
                        if (e.key === "Escape") { setShowLabelInput(false); setLabelInput(""); }
                      }}
                      placeholder="Nombre..."
                      className="input-glass text-xs w-28 py-1"
                    />
                    <button onClick={addLabel} className="btn-primary text-xs px-2 py-1">
                      OK
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => setShowLabelInput(true)}
                    className="btn-secondary text-xs px-2 py-1"
                  >
                    + Etiqueta
                  </button>
                )}
              </div>
            </div>

            {/* Fecha Vencimiento */}
            <div>
              <label className="field-label">Fecha de Vencimiento</label>
              <input
                type="date"
                value={localDueDate}
                onChange={(e) => setLocalDueDate(e.target.value)}
                className="input-glass"
              />
            </div>

            {/* Campos personalizados */}
            {customValues.length > 0 && (
              <div className="pt-4 border-t border-ink/10">
                <h3 className="text-sm font-semibold text-ink mb-3">Campos Personalizados</h3>
                {customValues.map((cv) => (
                  <div key={cv.id} className="mb-3">
                    <label className="field-label">{cv.field?.name}</label>
                    <input
                      type="text"
                      value={localCustomVals[cv.field_id] ?? ""}
                      onChange={(e) =>
                        setLocalCustomVals((prev) => ({ ...prev, [cv.field_id]: e.target.value }))
                      }
                      onBlur={(e) =>
                        setCustomValueMut.mutate({ field_id: cv.field_id, value: e.target.value })
                      }
                      placeholder="—"
                      className="input-glass"
                    />
                  </div>
                ))}
              </div>
            )}

            {/* Descripción — con debounce de 600 ms */}
            <div>
              <label className="field-label">Descripción</label>
              <textarea
                value={localDesc}
                onChange={(e) => setLocalDesc(e.target.value)}
                placeholder="Agregar descripción..."
                className="input-glass"
                rows={4}
              />
            </div>
          </div>
        )}

        {/* ─── ACTIVIDAD ─────────────────────────────────────────────────── */}
        {activeTab === "activity" && (
          <div className="space-y-3 max-h-96 overflow-y-auto">
            {activity.length === 0 ? (
              <p className="text-sm text-ink/40">Sin cambios registrados</p>
            ) : (
              activity.map((act) => (
                <div key={act.id} className="flex gap-3 text-sm">
                  <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0 mt-1">
                    <Activity size={14} className="text-primary" />
                  </div>
                  <div>
                    <p className="text-ink/80">
                      <span className="font-semibold">{act.action}</span>
                      {act.field_name && ` en ${act.field_name}`}
                    </p>
                    <p className="text-xs text-ink/40">{fmt.date(act.created_at)}</p>
                    {act.description && (
                      <p className="text-xs text-ink/60 mt-1">{act.description}</p>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        )}

        {/* ─── ADJUNTOS ──────────────────────────────────────────────────── */}
        {activeTab === "attachments" && (
          <div className="space-y-4">
            <div
              onClick={() => fileInputRef.current?.click()}
              className="border-2 border-dashed border-primary/30 rounded-xl p-6 text-center cursor-pointer hover:border-primary/60 hover:bg-primary/5 transition-all"
            >
              <Paperclip size={24} className="mx-auto text-primary/50 mb-2" />
              <p className="text-sm font-medium text-ink">
                Arrastra archivos aquí o haz clic para seleccionar
              </p>
              {uploadMut.isPending && (
                <p className="text-xs text-primary mt-1 flex items-center justify-center gap-1">
                  <Loader2 size={12} className="animate-spin" /> Subiendo…
                </p>
              )}
              <input
                ref={fileInputRef}
                type="file"
                multiple
                className="hidden"
                onChange={(e) => {
                  Array.from(e.target.files || []).forEach((f) => uploadMut.mutate(f));
                  e.target.value = "";
                }}
              />
            </div>

            {attachments.length === 0 ? (
              <p className="text-sm text-ink/40">Sin archivos adjuntos</p>
            ) : (
              <div className="space-y-2">
                {attachments.map((att) => (
                  <div key={att.id} className="flex items-center justify-between p-3 bg-ink/5 rounded-lg">
                    <div className="flex items-center gap-3 flex-1 min-w-0">
                      <Paperclip size={16} className="text-ink/50 flex-shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-ink truncate">{att.file_name}</p>
                        <p className="text-xs text-ink/40">{(att.file_size / 1024).toFixed(1)} KB</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      {att.file_url && (
                        <a
                          href={att.file_url}
                          download={att.file_name}
                          target="_blank"
                          rel="noreferrer"
                          className="btn-ghost p-1.5 hover:text-primary"
                        >
                          <Download size={14} />
                        </a>
                      )}
                      <button
                        onClick={() => deleteAttachmentMut.mutate(att.id)}
                        disabled={deleteAttachmentMut.isPending}
                        className="btn-ghost p-1.5 hover:text-danger"
                      >
                        <Trash size={14} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ─── RELACIONES ────────────────────────────────────────────────── */}
        {activeTab === "relations" && (
          <div className="space-y-4">
            {relations.length === 0 && !showRelationForm && (
              <p className="text-sm text-ink/40">Sin relaciones</p>
            )}

            {relations.map((rel) => {
              const isSource  = rel.source_task_id === taskId;
              const otherKey  = isSource ? rel.target_task_key  : rel.source_task_key;
              const otherName = isSource ? rel.target_task_title : rel.source_task_title;
              const typeLabel = RELATION_TYPES.find((t) => t.value === rel.relation_type)?.label || rel.relation_type;
              return (
                <div key={rel.id} className="flex items-center gap-3 p-3 bg-ink/5 rounded-lg text-sm">
                  <Link2 size={14} className="text-primary flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-ink">
                      {typeLabel}{" "}
                      <span className="font-mono text-xs text-ink/50">{otherKey}</span>
                    </p>
                    <p className="text-xs text-ink/50 truncate">{otherName}</p>
                  </div>
                  <button
                    onClick={() => deleteRelationMut.mutate(rel.id)}
                    disabled={deleteRelationMut.isPending}
                    className="btn-ghost p-1 hover:text-danger flex-shrink-0"
                  >
                    <X size={14} />
                  </button>
                </div>
              );
            })}

            {showRelationForm ? (
              <div className="p-4 bg-primary/5 rounded-lg border border-primary/20 space-y-3">
                <h4 className="text-sm font-semibold text-ink">Nueva Relación</h4>
                <div>
                  <label className="field-label">Tipo</label>
                  <select
                    value={relType}
                    onChange={(e) => setRelType(e.target.value)}
                    className="input-glass text-sm"
                  >
                    {RELATION_TYPES.map((t) => (
                      <option key={t.value} value={t.value}>{t.label}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="field-label">Tarea destino</label>
                  <select
                    value={relTargetId}
                    onChange={(e) => setRelTargetId(e.target.value)}
                    className="input-glass text-sm"
                  >
                    <option value="">Seleccionar tarea…</option>
                    {projectTasks
                      .filter((t) => t.id !== taskId)
                      .map((t) => (
                        <option key={t.id} value={t.id}>
                          [{t.task_key}] {t.title}
                        </option>
                      ))}
                  </select>
                </div>
                <div className="flex gap-2 justify-end">
                  <button
                    onClick={() => { setShowRelationForm(false); setRelTargetId(""); }}
                    className="btn-secondary text-sm"
                  >
                    Cancelar
                  </button>
                  <button
                    onClick={() =>
                      addRelationMut.mutate({
                        target_task_id: parseInt(relTargetId),
                        relation_type:  relType,
                      })
                    }
                    disabled={!relTargetId || addRelationMut.isPending}
                    className="btn-primary text-sm flex items-center gap-1"
                  >
                    {addRelationMut.isPending
                      ? <Loader2 size={12} className="animate-spin" />
                      : <Plus size={12} />}
                    Crear
                  </button>
                </div>
              </div>
            ) : (
              <button
                onClick={() => setShowRelationForm(true)}
                className="btn-primary text-sm w-full flex items-center justify-center gap-2"
              >
                <Plus size={14} /> Agregar Relación
              </button>
            )}
          </div>
        )}

        {/* ─── TIEMPO ────────────────────────────────────────────────────── */}
        {activeTab === "time" && (
          <div className="space-y-4">
            <div className="p-4 bg-primary/5 rounded-lg border border-primary/20">
              <h3 className="text-sm font-semibold text-ink mb-3">Registrar Tiempo</h3>
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <input
                    type="number"
                    placeholder="Horas"
                    value={hoursInput}
                    onChange={(e) => setHoursInput(e.target.value)}
                    step="0.5"
                    min="0"
                    className="input-glass"
                  />
                  <input
                    type="date"
                    defaultValue={new Date().toISOString().split("T")[0]}
                    className="input-glass"
                  />
                </div>
                <textarea
                  placeholder="¿En qué trabajaste?"
                  value={hoursDesc}
                  onChange={(e) => setHoursDesc(e.target.value)}
                  className="input-glass text-sm"
                  rows={2}
                />
                <button
                  onClick={() =>
                    logTimeMut.mutate({ hours: parseFloat(hoursInput), description: hoursDesc })
                  }
                  disabled={!hoursInput || logTimeMut.isPending}
                  className="btn-primary text-sm w-full flex items-center justify-center gap-2"
                >
                  {logTimeMut.isPending
                    ? <Loader2 size={14} className="animate-spin" />
                    : <Timer size={14} />}
                  Registrar
                </button>
              </div>
            </div>

            {(task.time_logs || []).length === 0 ? (
              <p className="text-sm text-ink/40">Sin registros de tiempo</p>
            ) : (
              <div className="space-y-2">
                {task.time_logs.map((log) => (
                  <div
                    key={log.id}
                    className="flex items-center justify-between p-3 bg-ink/5 rounded-lg text-sm"
                  >
                    <div>
                      <p className="font-medium text-ink">
                        {log.hours}h — {log.description}
                      </p>
                      <p className="text-xs text-ink/40">{fmt.date(log.date_worked)}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ─── Comentarios (siempre visible al fondo) ────────────────────── */}
        <div className="mt-6 pt-4 border-t border-ink/10">
          <h3 className="text-sm font-semibold text-ink mb-3 flex items-center gap-2">
            <MessageSquare size={14} /> Comentarios
          </h3>
          <div className="space-y-3 max-h-48 overflow-y-auto mb-4">
            {(task.comments || []).map((c) => (
              <div key={c.id} className="flex gap-2 text-sm">
                <div className="w-7 h-7 rounded-full bg-primary/10 flex-shrink-0" />
                <div className="flex-1">
                  <p className="text-ink/80">{c.content}</p>
                  <p className="text-xs text-ink/40">{fmt.date(c.created_at)}</p>
                </div>
              </div>
            ))}
          </div>
          <div className="flex gap-2">
            <input
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              placeholder="Agregar comentario... (Ctrl+Enter)"
              className="input-glass text-sm flex-1"
              onKeyDown={(e) => {
                if (e.key === "Enter" && e.ctrlKey) commentMut.mutate(comment);
              }}
            />
            <button
              onClick={() => commentMut.mutate(comment)}
              disabled={!comment.trim() || commentMut.isPending}
              className="btn-primary p-2"
            >
              <Send size={16} />
            </button>
          </div>
        </div>
      </GlassCard>
    </div>
  );
}
