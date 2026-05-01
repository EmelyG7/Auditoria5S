/**
 * ProjectDetailPage.jsx
 * Página principal del proyecto con pestañas:
 *   Tablero (Kanban) | Sprints | Lista | KPIs
 */

import { useState }                              from "react";
import { useParams, useNavigate }                from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft, LayoutGrid, Zap, List, BarChart2,
  Plus, Loader2, Settings, Users, Lock, Globe,
  AlertTriangle, CheckCircle2, Clock, Calendar,
  TrendingUp, X, AlertCircle, Play, Square,
} from "lucide-react";
import { projectsService } from "../../services/projects";
import { auditsService }   from "../../services/audits";
import { useAuth }         from "../../store/AuthContext";
import Header              from "../../components/Layout/Header";
import GlassCard           from "../../components/Layout/GlassCard";
import KanbanBoard         from "../../components/Projects/KanbanBoard";
import BurndownChart       from "../../components/Projects/BurndownChart";
import TaskModal           from "../../components/Projects/TaskModal";
import { fmt }             from "../../utils/format";

// ─── Paleta ───────────────────────────────────────────────────────────────────
const COL = { primary: "#0A4F79", secondary: "#B4427F", success: "#98C062", warning: "#EA9947", danger: "#DF4585" };

const PRIO_BADGE = {
  critica: "bg-danger/15  text-danger  border-danger/25",
  alta:    "bg-warning/15 text-warning border-warning/25",
  media:   "bg-primary/10 text-primary border-primary/20",
  baja:    "bg-ink/8      text-ink/50  border-ink/15",
};
const STATUS_COLOR = {
  backlog:"#94a3b8",por_hacer:"#0A4F79",en_progreso:"#EA9947",en_revision:"#B4427F",completada:"#98C062",cancelada:"#DF4585",
};

const TABS = [
  { id: "board",   label: "Tablero",  icon: LayoutGrid },
  { id: "sprints", label: "Sprints",  icon: Zap        },
  { id: "list",    label: "Lista",    icon: List        },
  { id: "kpis",    label: "KPIs",     icon: BarChart2   },
];

// ─── Modal de tarea rápida ────────────────────────────────────────────────────
function QuickTaskModal({ projectId, columnId, sprintId, onClose, onSuccess, members }) {
  const [form, setForm] = useState({
    title: "", priority: "media", estimated_hours: "", story_points: "",
    due_date: "", assignee_ids: [],
  });
  const [saving, setSaving] = useState(false);
  const [error,  setError]  = useState("");

  const set = (k, v) => setForm((p) => ({ ...p, [k]: v }));

  const handleSubmit = async () => {
    if (!form.title.trim()) { setError("El título es obligatorio."); return; }
    setSaving(true);
    try {
      await projectsService.createTask(projectId, {
        title:           form.title.trim(),
        priority:        form.priority,
        estimated_hours: form.estimated_hours ? parseFloat(form.estimated_hours) : null,
        story_points:    form.story_points    ? parseFloat(form.story_points)    : null,
        due_date:        form.due_date || null,
        assignee_ids:    form.assignee_ids,
        column_id:       columnId || null,
        sprint_id:       sprintId || null,
      });
      onSuccess();
      onClose();
    } catch (e) {
      setError(e.response?.data?.detail || "Error al crear la tarea.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
         style={{ background: "rgba(10,20,40,0.45)", backdropFilter: "blur(8px)" }}>
      <div className="glass rounded-3xl p-6 w-full max-w-md shadow-2xl animate-fade-up">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-base font-semibold text-ink">Nueva Tarea</h2>
          <button onClick={onClose} className="btn-ghost p-1.5"><X size={16} /></button>
        </div>
        <div className="space-y-3">
          <input type="text" autoFocus placeholder="Título de la tarea…"
            value={form.title} onChange={(e) => set("title", e.target.value)}
            className="input-glass text-sm" />
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="field-label">Prioridad</label>
              <select value={form.priority} onChange={(e) => set("priority", e.target.value)} className="input-glass text-sm">
                {["critica","alta","media","baja"].map((p) => (
                  <option key={p} value={p}>{p.charAt(0).toUpperCase()+p.slice(1)}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="field-label">Story Points</label>
              <input type="number" placeholder="—" value={form.story_points}
                onChange={(e) => set("story_points", e.target.value)}
                className="input-glass text-sm" />
            </div>
            <div>
              <label className="field-label">Horas estimadas</label>
              <input type="number" step="0.5" placeholder="—" value={form.estimated_hours}
                onChange={(e) => set("estimated_hours", e.target.value)}
                className="input-glass text-sm" />
            </div>
            <div>
              <label className="field-label">Fecha límite</label>
              <input type="date" value={form.due_date} onChange={(e) => set("due_date", e.target.value)}
                className="input-glass text-sm" />
            </div>
          </div>
          {members?.length > 0 && (
            <div>
              <label className="field-label">Asignar a</label>
              <select
                multiple
                value={form.assignee_ids.map(String)}
                onChange={(e) => set("assignee_ids", Array.from(e.target.selectedOptions).map(o=>+o.value))}
                className="input-glass text-sm min-h-[60px]"
              >
                {members.map((m) => (
                  <option key={m.user_id} value={m.user_id}>{m.user?.full_name || `Usuario ${m.user_id}`}</option>
                ))}
              </select>
            </div>
          )}
        </div>
        {error && (
          <div className="flex items-center gap-2 bg-danger/10 border border-danger/20 text-danger text-xs rounded-xl px-3 py-2 mt-3">
            <AlertCircle size={13} /> {error}
          </div>
        )}
        <div className="flex justify-end gap-3 mt-5">
          <button onClick={onClose} className="btn-secondary text-sm">Cancelar</button>
          <button onClick={handleSubmit} disabled={saving}
            className="btn-primary text-sm flex items-center gap-2 disabled:opacity-60">
            {saving ? <><Loader2 size={14} className="animate-spin" /> Creando…</> : <><Plus size={14} /> Crear</>}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Vista: Lista de tareas ───────────────────────────────────────────────────
function TaskListView({ tasks, onTaskClick }) {
  return (
    <GlassCard padding={false}>
      {tasks.length === 0 ? (
        <div className="flex items-center justify-center h-32 text-sm text-ink/30">
          Sin tareas en este proyecto.
        </div>
      ) : (
        <div className="divide-y divide-ink/5">
          {tasks.map((t) => (
            <div key={t.id}
                 onClick={() => onTaskClick(t)}
                 className="flex items-center gap-3 px-4 py-3 hover:bg-primary/[0.025]
                            transition-colors cursor-pointer group">
              {/* Status dot */}
              <div className="w-2.5 h-2.5 rounded-full shrink-0"
                   style={{ background: STATUS_COLOR[t.status] || "#94a3b8" }} />
              {/* Key */}
              <span className="text-[10px] font-mono text-ink/30 w-16 shrink-0">{t.task_key}</span>
              {/* Título */}
              <p className="text-sm text-ink flex-1 truncate group-hover:text-primary transition-colors">
                {t.title}
              </p>
              {/* Prioridad */}
              <span className={`text-[10px] px-2 py-0.5 rounded-full border hidden sm:block ${PRIO_BADGE[t.priority]||""}`}>
                {t.priority}
              </span>
              {/* Asignados */}
              <div className="flex -space-x-1 shrink-0">
                {t.assignees?.slice(0,2).map((a) => (
                  <div key={a.id} title={a.full_name}
                       className="w-6 h-6 rounded-full bg-primary/20 border border-white
                                  flex items-center justify-center text-[9px] font-bold text-primary">
                    {a.full_name?.charAt(0)}
                  </div>
                ))}
              </div>
              {/* Fecha */}
              {t.due_date && (
                <span className={`text-[10px] shrink-0 ${t.is_overdue ? "text-danger" : "text-ink/40"}`}>
                  {fmt.date(t.due_date)}
                </span>
              )}
              {/* Horas */}
              {t.estimated_hours && (
                <span className="text-[10px] text-ink/40 shrink-0 hidden md:block">
                  {parseFloat(t.logged_hours||0).toFixed(1)}h/{parseFloat(t.estimated_hours).toFixed(1)}h
                </span>
              )}
            </div>
          ))}
        </div>
      )}
    </GlassCard>
  );
}

// ─── Vista: Sprints ───────────────────────────────────────────────────────────
function SprintsView({ projectId, sprints, tasks, onRefresh, members }) {
  const qc = useQueryClient();
  const [showCreate, setShowCreate] = useState(false);
  const [newSprint, setNewSprint]   = useState({ name: "", goal: "", start_date: "", end_date: "", planned_points: "" });

  const createMut = useMutation({
    mutationFn: (d) => projectsService.createSprint(projectId, d),
    onSuccess:  () => { qc.invalidateQueries(["sprints", projectId]); setShowCreate(false); },
  });
  const startMut = useMutation({
    mutationFn: (sid) => projectsService.startSprint(projectId, sid),
    onSuccess:  () => qc.invalidateQueries(["sprints", projectId]),
  });
  const completeMut = useMutation({
    mutationFn: (sid) => projectsService.completeSprint(projectId, sid),
    onSuccess:  () => qc.invalidateQueries(["sprints", projectId]),
  });

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <button onClick={() => setShowCreate(true)} className="btn-primary text-sm flex items-center gap-2">
          <Plus size={14} /> Nuevo Sprint
        </button>
      </div>

      {showCreate && (
        <GlassCard className="animate-fade-up">
          <h3 className="text-sm font-semibold text-ink mb-4">Nuevo Sprint</h3>
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2">
              <label className="field-label">Nombre *</label>
              <input value={newSprint.name} onChange={(e) => setNewSprint(p=>({...p,name:e.target.value}))}
                placeholder="Sprint 1" className="input-glass text-sm" />
            </div>
            <div className="col-span-2">
              <label className="field-label">Objetivo</label>
              <input value={newSprint.goal} onChange={(e) => setNewSprint(p=>({...p,goal:e.target.value}))}
                placeholder="¿Qué quieres lograr en este sprint?" className="input-glass text-sm" />
            </div>
            <div><label className="field-label">Inicio</label>
              <input type="date" value={newSprint.start_date} onChange={(e) => setNewSprint(p=>({...p,start_date:e.target.value}))} className="input-glass text-sm" /></div>
            <div><label className="field-label">Fin</label>
              <input type="date" value={newSprint.end_date} onChange={(e) => setNewSprint(p=>({...p,end_date:e.target.value}))} className="input-glass text-sm" /></div>
            <div><label className="field-label">Story Points planificados</label>
              <input type="number" value={newSprint.planned_points} onChange={(e) => setNewSprint(p=>({...p,planned_points:e.target.value}))}
                placeholder="20" className="input-glass text-sm" /></div>
          </div>
          <div className="flex justify-end gap-3 mt-4">
            <button onClick={() => setShowCreate(false)} className="btn-secondary text-sm">Cancelar</button>
            <button onClick={() => createMut.mutate({
              name:           newSprint.name,
              goal:           newSprint.goal || null,
              start_date:     newSprint.start_date || null,
              end_date:       newSprint.end_date   || null,
              planned_points: newSprint.planned_points ? parseFloat(newSprint.planned_points) : null,
            })} disabled={!newSprint.name || createMut.isPending}
              className="btn-primary text-sm flex items-center gap-2 disabled:opacity-60">
              {createMut.isPending ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
              Crear Sprint
            </button>
          </div>
        </GlassCard>
      )}

      {sprints.length === 0 && !showCreate && (
        <div className="flex flex-col items-center justify-center h-40 gap-2 text-ink/30">
          <Zap size={24} className="opacity-40" />
          <p className="text-sm">No hay sprints. Crea el primero.</p>
        </div>
      )}

      {sprints.map((sprint) => {
        const sprintTasks = tasks.filter((t) => t.sprint_id === sprint.id);
        const done        = sprintTasks.filter((t) => t.status === "completada").length;
        const progress    = sprintTasks.length > 0 ? Math.round(done / sprintTasks.length * 100) : 0;
        const daysLeft    = sprint.end_date
          ? Math.round((new Date(sprint.end_date) - new Date()) / 86_400_000) : null;

        const statusColor = sprint.status === "activo"   ? COL.success
                          : sprint.status === "completado" ? COL.primary
                          : "#94a3b8";

        return (
          <GlassCard key={sprint.id} className="animate-fade-up">
            <div className="flex items-start justify-between mb-4">
              <div className="flex items-start gap-3">
                <div className="w-2 h-2 rounded-full mt-1.5 shrink-0" style={{ background: statusColor }} />
                <div>
                  <h3 className="text-sm font-semibold text-ink">{sprint.name}</h3>
                  {sprint.goal && <p className="text-xs text-ink/50 mt-0.5">{sprint.goal}</p>}
                </div>
              </div>
              <div className="flex items-center gap-2">
                {sprint.status === "planificado" && (
                  <button onClick={() => startMut.mutate(sprint.id)}
                    disabled={startMut.isPending}
                    className="flex items-center gap-1.5 text-xs btn-primary py-1.5 px-3">
                    <Play size={12} /> Iniciar
                  </button>
                )}
                {sprint.status === "activo" && (
                  <button onClick={() => completeMut.mutate(sprint.id)}
                    disabled={completeMut.isPending}
                    className="flex items-center gap-1.5 text-xs btn-secondary py-1.5 px-3">
                    <Square size={12} /> Completar
                  </button>
                )}
                <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${
                  sprint.status === "activo"      ? "bg-success/15 text-success border-success/30" :
                  sprint.status === "completado"  ? "bg-primary/10 text-primary border-primary/20" :
                  "bg-ink/8 text-ink/50 border-ink/15"
                }`}>
                  {sprint.status}
                </span>
              </div>
            </div>

            {/* Stats */}
            <div className="grid grid-cols-3 gap-3 mb-4">
              {[
                { label: "Tareas", value: `${done}/${sprintTasks.length}` },
                { label: "Story Points", value: sprint.planned_points ? `${sprint.completed_points||0}/${sprint.planned_points}` : "—" },
                { label: daysLeft != null ? (daysLeft < 0 ? "Venció" : "Días restantes") : "Fechas", value: daysLeft != null ? Math.abs(daysLeft) : "—" },
              ].map(({ label, value }) => (
                <div key={label} className="glass rounded-xl p-2.5 text-center">
                  <p className="text-xs font-bold text-ink">{value}</p>
                  <p className="text-[10px] text-ink/40">{label}</p>
                </div>
              ))}
            </div>

            {/* Barra de progreso */}
            <div className="mb-3">
              <div className="flex justify-between mb-1">
                <span className="text-[10px] text-ink/40">Progreso</span>
                <span className="text-[10px] font-bold text-ink">{progress}%</span>
              </div>
              <div className="h-1.5 bg-ink/8 rounded-full overflow-hidden">
                <div className="h-full rounded-full transition-all duration-700"
                     style={{ width: `${progress}%`, background: statusColor }} />
              </div>
            </div>

            {/* Fechas */}
            {(sprint.start_date || sprint.end_date) && (
              <div className="flex items-center gap-3 text-[10px] text-ink/40">
                {sprint.start_date && <span>Inicio: {fmt.date(sprint.start_date)}</span>}
                {sprint.end_date   && <span>Fin: {fmt.date(sprint.end_date)}</span>}
                {sprint.is_overdue && (
                  <span className="flex items-center gap-1 text-danger">
                    <AlertTriangle size={10} /> Vencido
                  </span>
                )}
              </div>
            )}

            {sprint.status === "activo" && (
              <div className="mt-4">
                <BurndownChart sprint={sprint} tasks={sprintTasks} height={220} />
              </div>
            )}
          </GlassCard>
        );
      })}
    </div>
  );
}

// ─── Componente principal ──────────────────────────────────────────────────────
export default function ProjectDetailPage() {
  const { projectId }  = useParams();
  const navigate       = useNavigate();
  const qc             = useQueryClient();
  const { user }       = useAuth();

  const [activeTab,       setActiveTab]       = useState("board");
  const [selectedTask,    setSelectedTask]    = useState(null);
  const [showQuickTask,   setShowQuickTask]   = useState(false);
  const [quickTaskColumn, setQuickTaskColumn] = useState(null);
  const [activeSprint,    setActiveSprint]    = useState(null);

  // ── Queries ──────────────────────────────────────────────────────────────────
  const { data: project, isLoading: loadingProject } = useQuery({
    queryKey: ["project", projectId],
    queryFn:  () => projectsService.getById(projectId),
    staleTime: 30_000,
  });

  const { data: boardData, refetch: refetchBoard } = useQuery({
    queryKey: ["board", projectId, activeSprint],
    queryFn:  () => projectsService.getBoard(projectId, activeSprint),
    enabled:  activeTab === "board",
    staleTime: 10_000,
  });

  const { data: sprints = [] } = useQuery({
    queryKey: ["sprints", projectId],
    queryFn:  () => projectsService.getSprints(projectId),
    enabled:  activeTab === "sprints" || activeTab === "board",
    staleTime: 30_000,
  });

  const { data: tasks = [] } = useQuery({
    queryKey: ["tasks", projectId],
    queryFn:  () => projectsService.getTasks(projectId),
    enabled:  activeTab === "list" || activeTab === "sprints",
    staleTime: 15_000,
  });

  const { data: members = [] } = useQuery({
    queryKey: ["members", projectId],
    queryFn:  () => projectsService.getMembers(projectId),
    staleTime: 60_000,
  });

  const invalidateAll = () => {
    qc.invalidateQueries(["board", projectId]);
    qc.invalidateQueries(["tasks", projectId]);
    qc.invalidateQueries(["project", projectId]);
    qc.invalidateQueries(["projects"]);
  };

  if (loadingProject || !project) {
    return (
      <div className="flex items-center justify-center h-48">
        <Loader2 size={28} className="animate-spin text-primary/40" />
      </div>
    );
  }

  const color         = project.color || COL.primary;
  const activeSprintObj = sprints.find((s) => s.status === "activo");

  return (
    <div className="min-h-screen relative z-10">

      {/* ── Navegación de regreso ─────────────────────────────────────────── */}
      <button onClick={() => navigate("/projects")}
              className="btn-ghost flex items-center gap-2 text-sm mb-4">
        <ArrowLeft size={14} /> Proyectos
      </button>

      {/* ── Header del proyecto ───────────────────────────────────────────── */}
      <div className="flex items-start justify-between mb-6 flex-wrap gap-4">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-2xl flex items-center justify-center"
               style={{ background: `${color}20` }}>
            <span className="text-2xl">📁</span>
          </div>
          <div>
            <div className="flex items-center gap-2 mb-0.5">
              <h1 className="text-xl font-semibold text-ink">{project.name}</h1>
              {project.visibility === "privado"
                ? <Lock size={13} className="text-ink/30" />
                : <Globe size={13} className="text-ink/30" />
              }
            </div>
            <div className="flex items-center gap-3 text-xs text-ink/50">
              <span className="font-mono">{project.key}</span>
              <span>·</span>
              <span>{project.member_count} miembros</span>
              <span>·</span>
              <span>{project.completed_tasks}/{project.total_tasks} tareas</span>
              {activeSprintObj && (
                <>
                  <span>·</span>
                  <span className="text-success flex items-center gap-1">
                    <Zap size={11} /> {activeSprintObj.name}
                  </span>
                </>
              )}
            </div>
          </div>
        </div>

        {/* Barra de progreso compacta */}
        <div className="flex items-center gap-3">
          <div className="w-40">
            <div className="flex justify-between text-[10px] text-ink/40 mb-1">
              <span>Progreso</span>
              <span style={{ color }}>{(project.progress_pct || 0).toFixed(0)}%</span>
            </div>
            <div className="h-1.5 bg-ink/8 rounded-full overflow-hidden">
              <div className="h-full rounded-full" style={{ width: `${project.progress_pct||0}%`, background: color }} />
            </div>
          </div>
          <button onClick={() => setShowQuickTask(true)}
                  className="btn-primary flex items-center gap-2 text-sm">
            <Plus size={14} /> Nueva Tarea
          </button>
        </div>
      </div>

      {/* ── Pestañas ──────────────────────────────────────────────────────── */}
      <div className="flex items-center gap-1 mb-5 border-b border-ink/8 pb-1">
        {TABS.map(({ id, label, icon: Icon }) => (
          <button key={id} onClick={() => setActiveTab(id)}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium
                        transition-all duration-200 ${
              activeTab === id
                ? "text-primary bg-primary/10"
                : "text-ink/50 hover:text-ink hover:bg-ink/5"
            }`}>
            <Icon size={14} /> {label}
          </button>
        ))}

        {/* Filtro de sprint para el tablero */}
        {activeTab === "board" && sprints.length > 0 && (
          <div className="ml-auto">
            <select
              value={activeSprint || ""}
              onChange={(e) => setActiveSprint(e.target.value ? +e.target.value : null)}
              className="input-glass text-xs w-44"
            >
              <option value="">Todas las tareas</option>
              {sprints.map((s) => (
                <option key={s.id} value={s.id}>{s.name} ({s.status})</option>
              ))}
            </select>
          </div>
        )}
      </div>

      {/* ════════════════════════════════════════════════════════════════════
          TABLERO KANBAN
          ════════════════════════════════════════════════════════════════════ */}
      {activeTab === "board" && (
        boardData
          ? <KanbanBoard
              boardData={boardData}
              projectId={projectId}
              sprintId={activeSprint}
              onTaskClick={(task) => setSelectedTask(task.id)}
              onAddTask={(colId) => { setQuickTaskColumn(colId); setShowQuickTask(true); }}
              onBoardChange={refetchBoard}
            />
          : <div className="flex items-center justify-center h-40">
              <Loader2 size={24} className="animate-spin text-primary/40" />
            </div>
      )}

      {/* ════════════════════════════════════════════════════════════════════
          SPRINTS
          ════════════════════════════════════════════════════════════════════ */}
      {activeTab === "sprints" && (
        <SprintsView
          projectId={projectId}
          sprints={sprints}
          tasks={tasks}
          onRefresh={invalidateAll}
          members={members}
        />
      )}

      {/* ════════════════════════════════════════════════════════════════════
          LISTA
          ════════════════════════════════════════════════════════════════════ */}
      {activeTab === "list" && (
        <TaskListView
          tasks={tasks}
          onTaskClick={(task) => setSelectedTask(task.id)}
        />
      )}

      {/* ════════════════════════════════════════════════════════════════════
          KPIs — se carga desde ProjectKPIsView
          ════════════════════════════════════════════════════════════════════ */}
      {activeTab === "kpis" && (
        <ProjectKPIsView projectId={projectId} color={color} />
      )}

      {/* ── Modales ──────────────────────────────────────────────────────── */}
      {selectedTask && (
        <TaskModal
          taskId={selectedTask}
          projectId={projectId}
          onClose={() => setSelectedTask(null)}
          onUpdated={invalidateAll}
        />
      )}

      {showQuickTask && (
        <QuickTaskModal
          projectId={projectId}
          columnId={quickTaskColumn}
          sprintId={activeSprint}
          members={members}
          onClose={() => { setShowQuickTask(false); setQuickTaskColumn(null); }}
          onSuccess={invalidateAll}
        />
      )}
    </div>
  );
}

// ─── Vista de KPIs del proyecto ───────────────────────────────────────────────
function ProjectKPIsView({ projectId, color }) {
  const { data: kpis, isLoading } = useQuery({
    queryKey: ["project-kpis", projectId],
    queryFn:  () => projectsService.getKPIs(projectId),
    staleTime: 60_000,
  });

  if (isLoading) return (
    <div className="flex items-center justify-center h-48">
      <Loader2 size={24} className="animate-spin text-primary/40" />
    </div>
  );
  if (!kpis) return null;

  const semColor = (pct) => pct >= 80 ? COL.success : pct >= 60 ? COL.warning : COL.danger;

  return (
    <div className="space-y-6 animate-fade-up">
      {/* KPIs globales */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 stagger">
        {[
          { label: "Progreso",       value: `${kpis.progress_pct.toFixed(1)}%`,       color, icon: TrendingUp  },
          { label: "Tareas totales", value: kpis.total_tasks,                          color: COL.primary, icon: CheckCircle2 },
          { label: "Horas loggeadas",value: `${kpis.total_hours_logged.toFixed(1)}h`,  color: COL.secondary, icon: Clock },
          { label: "Varianza horas", value: `${kpis.hours_variance > 0 ? "+" : ""}${kpis.hours_variance.toFixed(1)}h`,
            color: kpis.hours_variance > 0 ? COL.danger : COL.success, icon: AlertTriangle },
        ].map(({ label, value, color: c, icon: Icon }) => (
          <GlassCard key={label} className="flex items-start gap-3">
            <div className="w-9 h-9 rounded-2xl flex items-center justify-center shrink-0"
                 style={{ background: `${c}18` }}>
              <Icon size={16} style={{ color: c }} />
            </div>
            <div>
              <p className="text-xs text-ink/50 font-semibold uppercase tracking-wide">{label}</p>
              <p className="text-xl font-bold" style={{ color: c }}>{value}</p>
            </div>
          </GlassCard>
        ))}
      </div>

      {/* Sprint activo */}
      {kpis.active_sprint && (
        <GlassCard>
          <div className="flex items-center gap-2 mb-4">
            <Zap size={14} className="text-success" />
            <h3 className="text-sm font-semibold text-ink">Sprint Activo — {kpis.active_sprint.sprint_name}</h3>
          </div>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            {[
              { label: "Velocidad",       value: kpis.active_sprint.velocity != null ? `${kpis.active_sprint.velocity.toFixed(0)}%` : "—" },
              { label: "Tareas",          value: `${kpis.active_sprint.completed_tasks}/${kpis.active_sprint.total_tasks}` },
              { label: "Horas loggeadas", value: `${kpis.active_sprint.total_hours_logged.toFixed(1)}h` },
              { label: "Días restantes",  value: kpis.active_sprint.days_remaining != null ? kpis.active_sprint.days_remaining : "—" },
            ].map(({ label, value }) => (
              <div key={label} className="glass rounded-xl p-3 text-center">
                <p className="text-sm font-bold text-ink">{value}</p>
                <p className="text-[10px] text-ink/40">{label}</p>
              </div>
            ))}
          </div>
        </GlassCard>
      )}

      {/* Productividad por miembro */}
      <GlassCard>
        <h3 className="text-xs font-semibold text-ink/50 uppercase tracking-wide mb-4">
          Productividad por Colaborador
        </h3>
        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[640px]">
            <thead>
              <tr className="border-b border-ink/10">
                {["Colaborador","Tareas","Completadas","Tasa cierre","Horas loggeadas","Prom h/tarea","Story Points","Vencidas"].map((h) => (
                  <th key={h} className="text-left py-2.5 px-3 text-xs font-semibold text-ink/50 uppercase tracking-wide">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-ink/5">
              {kpis.member_productivity.map((m) => (
                <tr key={m.user_id} className="hover:bg-primary/[0.025] transition-colors">
                  <td className="py-3 px-3">
                    <div className="flex items-center gap-2">
                      <div className="w-7 h-7 rounded-full bg-primary/20 flex items-center justify-center
                                      text-primary font-bold text-[10px]">
                        {m.full_name?.charAt(0)}
                      </div>
                      <div>
                        <p className="text-sm font-medium text-ink">{m.full_name}</p>
                        <p className="text-[10px] text-ink/40">{m.email}</p>
                      </div>
                    </div>
                  </td>
                  <td className="py-3 px-3 text-ink/60">{m.total_tasks}</td>
                  <td className="py-3 px-3 text-success font-semibold">{m.completed_tasks}</td>
                  <td className="py-3 px-3">
                    <span className="font-bold" style={{ color: semColor(m.completion_rate) }}>
                      {m.completion_rate.toFixed(1)}%
                    </span>
                  </td>
                  <td className="py-3 px-3 text-ink/60">{m.total_hours_logged.toFixed(1)}h</td>
                  <td className="py-3 px-3 text-ink/60">{m.avg_hours_per_task.toFixed(1)}h</td>
                  <td className="py-3 px-3 text-ink/60">{m.story_points_completed.toFixed(1)}</td>
                  <td className="py-3 px-3">
                    {m.overdue_tasks > 0
                      ? <span className="text-danger font-semibold flex items-center gap-1"><AlertTriangle size={11}/>{m.overdue_tasks}</span>
                      : <span className="text-success">—</span>
                    }
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </GlassCard>
    </div>
  );
}