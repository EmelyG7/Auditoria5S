import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  X, Loader2, ClipboardCheck, Calendar, FolderKanban,
  CheckSquare, User, Shield, ShieldOff, Activity,
} from "lucide-react";
import { authService } from "../../services/auth";
import { cn } from "../../utils/cn";

// ── Helpers ──────────────────────────────────────────────────────────────────

const STATUS_AUDIT = {
  "Cumple":       "bg-success/10 text-success border-success/20",
  "Por mejorar":  "bg-warning/10 text-warning border-warning/20",
  "Crítico":      "bg-danger/10  text-danger  border-danger/20",
};

const STATUS_SCHEDULE = {
  "Pendiente":   "bg-primary/10  text-primary  border-primary/20",
  "Completada":  "bg-success/10  text-success  border-success/20",
  "Cancelada":   "bg-danger/10   text-danger   border-danger/20",
};

const STATUS_TASK = {
  backlog:      "bg-ink/10     text-ink/60   border-ink/10",
  por_hacer:    "bg-primary/10 text-primary  border-primary/20",
  en_progreso:  "bg-warning/10 text-warning  border-warning/20",
  en_revision:  "bg-secondary/10 text-secondary border-secondary/20",
  completada:   "bg-success/10 text-success  border-success/20",
  cancelada:    "bg-danger/10  text-danger   border-danger/20",
};

const PRIORITY_COLORS = {
  critica: "text-danger",
  alta:    "text-warning",
  media:   "text-primary",
  baja:    "text-ink/40",
  Alta:    "text-warning",
  Media:   "text-primary",
  Baja:    "text-ink/40",
};

const STATUS_PROJECT = {
  activo:     "bg-success/10 text-success border-success/20",
  pausado:    "bg-warning/10 text-warning border-warning/20",
  completado: "bg-primary/10 text-primary border-primary/20",
  archivado:  "bg-ink/10    text-ink/50  border-ink/10",
};

const ROLE_LABELS = {
  owner:   "Propietario",
  manager: "Manager",
  member:  "Miembro",
  viewer:  "Lector",
};

function fmt(dateStr) {
  if (!dateStr) return "—";
  return new Date(dateStr + "T00:00:00").toLocaleDateString("es-MX", {
    day: "2-digit", month: "short", year: "numeric",
  });
}

function Badge({ className, children }) {
  return (
    <span className={cn("text-xs font-semibold px-2 py-0.5 rounded-full border", className)}>
      {children}
    </span>
  );
}

function StatCard({ icon: Icon, label, value, color = "primary" }) {
  const colors = {
    primary:   "bg-primary/10 text-primary",
    secondary: "bg-secondary/10 text-secondary",
    success:   "bg-success/10 text-success",
    warning:   "bg-warning/10 text-warning",
  };
  return (
    <div className="flex flex-col items-center gap-1 p-3 rounded-2xl bg-white/40 border border-white/30">
      <div className={cn("w-8 h-8 rounded-xl flex items-center justify-center mb-1", colors[color])}>
        <Icon size={15} />
      </div>
      <span className="text-xl font-bold text-ink">{value}</span>
      <span className="text-[10px] text-ink/50 text-center leading-tight">{label}</span>
    </div>
  );
}

// ── Tabs ─────────────────────────────────────────────────────────────────────

const TABS = [
  { id: "audits",    label: "Auditorías",  icon: ClipboardCheck },
  { id: "schedules", label: "Calendario",  icon: Calendar },
  { id: "projects",  label: "Proyectos",   icon: FolderKanban },
  { id: "tasks",     label: "Tareas",      icon: CheckSquare },
];

// ── Sección: Auditorías ───────────────────────────────────────────────────────

function AuditsTab({ audits }) {
  if (!audits.length) return <Empty text="No hay auditorías registradas con este email." />;
  return (
    <div className="space-y-2">
      {audits.map((a) => (
        <div key={a.id} className="flex items-center gap-3 p-3 rounded-xl bg-white/30 border border-white/20 hover:bg-white/50 transition-colors">
          <div className="w-8 h-8 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
            <ClipboardCheck size={14} className="text-primary" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-ink truncate">{a.branch}</p>
            <p className="text-xs text-ink/50">{a.audit_type} · {fmt(a.audit_date)}</p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {a.percentage != null && (
              <span className="text-xs font-semibold text-ink/70">{a.percentage.toFixed(1)}%</span>
            )}
            {a.status && (
              <Badge className={STATUS_AUDIT[a.status] ?? "bg-ink/10 text-ink/50 border-ink/10"}>
                {a.status}
              </Badge>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

// ── Sección: Calendario ───────────────────────────────────────────────────────

function SchedulesTab({ schedules }) {
  if (!schedules.length) return <Empty text="No tiene eventos de calendario asignados ni creados." />;
  return (
    <div className="space-y-2">
      {schedules.map((s) => (
        <div key={`${s.id}-${s.role}`} className="flex items-center gap-3 p-3 rounded-xl bg-white/30 border border-white/20 hover:bg-white/50 transition-colors">
          <div className="w-8 h-8 rounded-xl bg-secondary/10 flex items-center justify-center shrink-0">
            <Calendar size={14} className="text-secondary" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-ink truncate">{s.title}</p>
            <p className="text-xs text-ink/50">{s.branch} · {s.audit_type} · {fmt(s.scheduled_date)}</p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <Badge className="bg-ink/5 text-ink/50 border-ink/10">
              {s.role === "assigned" ? "Asignado" : "Creador"}
            </Badge>
            <Badge className={STATUS_SCHEDULE[s.status] ?? "bg-ink/10 text-ink/50 border-ink/10"}>
              {s.status}
            </Badge>
          </div>
        </div>
      ))}
    </div>
  );
}

// ── Sección: Proyectos ────────────────────────────────────────────────────────

function ProjectsTab({ projects }) {
  if (!projects.length) return <Empty text="No participa en ningún proyecto." />;
  return (
    <div className="space-y-2">
      {projects.map((p) => (
        <div key={`${p.id}-${p.role}`} className="flex items-center gap-3 p-3 rounded-xl bg-white/30 border border-white/20 hover:bg-white/50 transition-colors">
          <div
            className="w-8 h-8 rounded-xl flex items-center justify-center shrink-0 text-white text-xs font-bold"
            style={{ background: p.color ?? "#0A4F79" }}
          >
            {p.key.slice(0, 2)}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-ink truncate">{p.name}</p>
            <p className="text-xs text-ink/50 font-mono">{p.key}</p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <Badge className="bg-ink/5 text-ink/50 border-ink/10">
              {ROLE_LABELS[p.role] ?? p.role}
            </Badge>
            <Badge className={STATUS_PROJECT[p.status] ?? "bg-ink/10 text-ink/50 border-ink/10"}>
              {p.status}
            </Badge>
          </div>
        </div>
      ))}
    </div>
  );
}

// ── Sección: Tareas ───────────────────────────────────────────────────────────

function TasksTab({ tasks }) {
  if (!tasks.length) return <Empty text="No tiene tareas asignadas." />;
  return (
    <div className="space-y-2">
      {tasks.map((t) => (
        <div key={t.id} className="flex items-center gap-3 p-3 rounded-xl bg-white/30 border border-white/20 hover:bg-white/50 transition-colors">
          <div className="w-8 h-8 rounded-xl bg-success/10 flex items-center justify-center shrink-0">
            <CheckSquare size={14} className="text-success" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <span className="text-xs font-mono text-ink/40">{t.task_key}</span>
              <span className={cn("text-xs font-semibold", PRIORITY_COLORS[t.priority] ?? "text-ink/50")}>
                ●
              </span>
            </div>
            <p className="text-sm font-medium text-ink truncate">{t.title}</p>
            <p className="text-xs text-ink/50">{t.project_name} {t.due_date ? `· Vence ${fmt(t.due_date)}` : ""}</p>
          </div>
          <Badge className={STATUS_TASK[t.status] ?? "bg-ink/10 text-ink/50 border-ink/10"}>
            {t.status.replace(/_/g, " ")}
          </Badge>
        </div>
      ))}
    </div>
  );
}

function Empty({ text }) {
  return (
    <div className="flex flex-col items-center justify-center py-12 text-center">
      <Activity size={32} className="text-ink/20 mb-3" />
      <p className="text-sm text-ink/40">{text}</p>
    </div>
  );
}

// ── Modal principal ───────────────────────────────────────────────────────────

export default function UserActivityModal({ user, onClose }) {
  const [activeTab, setActiveTab] = useState("audits");

  const { data, isLoading, isError } = useQuery({
    queryKey: ["user-activity", user.id],
    queryFn: () => authService.getUserActivity(user.id),
    staleTime: 30_000,
  });

  const stats = data?.stats;
  const tabCounts = {
    audits:    stats?.audits_performed   ?? 0,
    schedules: (stats?.schedules_assigned ?? 0) + (stats?.schedules_created ?? 0),
    projects:  stats?.projects_count     ?? 0,
    tasks:     stats?.tasks_assigned     ?? 0,
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: "rgba(10,20,40,0.50)", backdropFilter: "blur(6px)" }}
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="glass rounded-3xl w-full max-w-2xl max-h-[90vh] flex flex-col shadow-2xl animate-fade-up">

        {/* ── Header ─────────────────────────────────────────────────── */}
        <div className="flex items-center gap-4 p-5 border-b border-white/20 shrink-0">
          <div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-primary to-secondary flex items-center justify-center text-white font-bold text-base shrink-0">
            {user.full_name.charAt(0).toUpperCase()}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <h2 className="text-base font-semibold text-ink truncate">{user.full_name}</h2>
              <span
                className={cn(
                  "text-xs font-semibold px-2 py-0.5 rounded-full border",
                  user.role === "admin"
                    ? "bg-primary/10 text-primary border-primary/20"
                    : "bg-secondary/10 text-secondary border-secondary/20"
                )}
              >
                {user.role}
              </span>
              <span
                className={cn(
                  "text-xs font-semibold px-2 py-0.5 rounded-full border",
                  user.is_active
                    ? "bg-success/10 text-success border-success/20"
                    : "bg-danger/10 text-danger border-danger/20"
                )}
              >
                {user.is_active ? "Activo" : "Inactivo"}
              </span>
            </div>
            <p className="text-xs text-ink/50 truncate">{user.email}</p>
          </div>
          <button onClick={onClose} className="btn-ghost p-1.5 shrink-0">
            <X size={16} />
          </button>
        </div>

        {/* ── Body ───────────────────────────────────────────────────── */}
        <div className="flex-1 overflow-y-auto p-5 min-h-0">
          {isLoading && (
            <div className="flex items-center justify-center py-20">
              <Loader2 size={28} className="animate-spin text-primary/40" />
            </div>
          )}

          {isError && (
            <div className="flex items-center justify-center py-20">
              <p className="text-sm text-danger/70">Error al cargar la actividad. Intenta de nuevo.</p>
            </div>
          )}

          {data && (
            <>
              {/* Stats */}
              <div className="grid grid-cols-5 gap-3 mb-5">
                <StatCard icon={ClipboardCheck} label="Auditorías"   value={stats.audits_performed}   color="primary" />
                <StatCard icon={Calendar}       label="Asignado"     value={stats.schedules_assigned} color="secondary" />
                <StatCard icon={Calendar}       label="Planificó"    value={stats.schedules_created}  color="secondary" />
                <StatCard icon={FolderKanban}   label="Proyectos"    value={stats.projects_count}     color="success" />
                <StatCard icon={CheckSquare}    label="Tareas"       value={stats.tasks_assigned}     color="warning" />
              </div>

              {/* Tabs */}
              <div className="flex gap-1 mb-4 p-1 bg-white/30 rounded-2xl border border-white/20">
                {TABS.map((tab) => (
                  <button
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id)}
                    className={cn(
                      "flex-1 flex items-center justify-center gap-1.5 py-2 px-2 rounded-xl text-xs font-semibold transition-all",
                      activeTab === tab.id
                        ? "bg-white text-primary shadow-sm"
                        : "text-ink/50 hover:text-ink"
                    )}
                  >
                    <tab.icon size={13} />
                    <span className="hidden sm:inline">{tab.label}</span>
                    {tabCounts[tab.id] > 0 && (
                      <span className={cn(
                        "text-[10px] font-bold px-1.5 py-0.5 rounded-full",
                        activeTab === tab.id ? "bg-primary/10 text-primary" : "bg-ink/10 text-ink/50"
                      )}>
                        {tabCounts[tab.id]}
                      </span>
                    )}
                  </button>
                ))}
              </div>

              {/* Tab content */}
              {activeTab === "audits"    && <AuditsTab    audits={data.audits} />}
              {activeTab === "schedules" && <SchedulesTab schedules={data.schedules} />}
              {activeTab === "projects"  && <ProjectsTab  projects={data.projects} />}
              {activeTab === "tasks"     && <TasksTab     tasks={data.tasks} />}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
