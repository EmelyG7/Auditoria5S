/**
 * ProjectsListPage.jsx
 * Lista de proyectos con tarjetas, filtros, creación y acceso rápido.
 */

import { useState }                              from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate }                           from "react-router-dom";
import {
  Plus, Search, Folder, Loader2, ChevronRight,
  Users, CheckCircle2, Clock, AlertTriangle,
  BarChart2, Calendar, Lock, Globe, X, AlertCircle,
} from "lucide-react";
import { projectsService } from "../../services/projects";
import { useAuth }         from "../../store/AuthContext";
import Header              from "../../components/Layout/Header";
import GlassCard           from "../../components/Layout/GlassCard";

// ─── Constantes ───────────────────────────────────────────────────────────────
const STATUS_OPTS = [
  { value: "",           label: "Todos"      },
  { value: "activo",     label: "Activos"    },
  { value: "pausado",    label: "Pausados"   },
  { value: "completado", label: "Completados"},
  { value: "archivado",  label: "Archivados" },
];

const STATUS_BADGE = {
  activo:     "bg-success/15 text-success border-success/30",
  pausado:    "bg-warning/15 text-warning border-warning/30",
  completado: "bg-primary/15 text-primary border-primary/20",
  archivado:  "bg-ink/10    text-ink/50   border-ink/10",
};

const ICON_COLORS = ["#0A4F79","#B4427F","#98C062","#EA9947","#DF4585","#8172B2","#2E9E8F"];

const DEFAULT_COLUMNS = [
  { name: "Backlog",     color: "#94a3b8", order: 0, is_done: false },
  { name: "Por Hacer",   color: "#0A4F79", order: 1, is_done: false },
  { name: "En Progreso", color: "#EA9947", order: 2, is_done: false },
  { name: "En Revisión", color: "#B4427F", order: 3, is_done: false },
  { name: "Completada",  color: "#98C062", order: 4, is_done: true  },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────
function daysLeft(endDate) {
  if (!endDate) return null;
  return Math.round((new Date(endDate) - new Date()) / 86_400_000);
}

// ─── Modal de creación ────────────────────────────────────────────────────────
function CreateProjectModal({ onClose, onSuccess }) {
  const { user } = useAuth();
  const [form, setForm] = useState({
    name: "", key: "", description: "",
    visibility: "privado", color: "#0A4F79",
    start_date: "", end_date: "",
  });
  const [error,  setError]  = useState("");
  const [saving, setSaving] = useState(false);

  const set = (k, v) => setForm((p) => ({ ...p, [k]: v }));

  // Auto-generar key desde el nombre
  const handleNameChange = (v) => {
    set("name", v);
    if (!form.key || form.key === autoKey(form.name)) {
      set("key", autoKey(v));
    }
  };
  const autoKey = (name) =>
    name.replace(/[^a-zA-Z0-9\s]/g, "").split(/\s+/).map((w) => w[0] || "").join("").toUpperCase().slice(0, 6) || "";

  const handleSubmit = async () => {
    if (!form.name.trim() || !form.key.trim()) {
      setError("El nombre y la clave son obligatorios.");
      return;
    }
    setSaving(true);
    setError("");
    try {
      await projectsService.create({
        ...form,
        key:        form.key.toUpperCase(),
        start_date: form.start_date || null,
        end_date:   form.end_date   || null,
      });
      onSuccess();
      onClose();
    } catch (e) {
      setError(e.response?.data?.detail || "Error al crear el proyecto.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: "rgba(10,20,40,0.45)", backdropFilter: "blur(8px)" }}
    >
      <div className="glass rounded-3xl p-6 w-full max-w-lg shadow-2xl animate-fade-up max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-2xl flex items-center justify-center"
                 style={{ background: `${form.color}20` }}>
              <Folder size={16} style={{ color: form.color }} />
            </div>
            <div>
              <h2 className="text-base font-semibold text-ink">Nuevo Proyecto</h2>
              <p className="text-xs text-ink/50">Configura tu espacio de trabajo</p>
            </div>
          </div>
          <button onClick={onClose} className="btn-ghost p-1.5"><X size={16} /></button>
        </div>

        <div className="space-y-4">
          {/* Nombre */}
          <div>
            <label className="field-label">Nombre del proyecto *</label>
            <input type="text" value={form.name} placeholder="Ej: Plan de Mejora 5S 2026"
              onChange={(e) => handleNameChange(e.target.value)}
              className="input-glass text-sm" />
          </div>

          {/* Clave + Color */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="field-label">Clave *
                <span className="text-ink/30 font-normal ml-1">(máx 6 chars)</span>
              </label>
              <input type="text" value={form.key} maxLength={6} placeholder="MEJ5S"
                onChange={(e) => set("key", e.target.value.toUpperCase())}
                className="input-glass text-sm font-mono" />
              {form.key && (
                <p className="text-[10px] text-ink/40 mt-1">
                  Las tareas se identificarán como <b>{form.key}-1</b>, <b>{form.key}-2</b>…
                </p>
              )}
            </div>
            <div>
              <label className="field-label">Color del proyecto</label>
              <div className="flex gap-2 flex-wrap mt-1">
                {ICON_COLORS.map((c) => (
                  <button key={c} onClick={() => set("color", c)}
                    className={`w-7 h-7 rounded-full transition-all ${form.color === c ? "ring-2 ring-offset-1 ring-primary scale-110" : "opacity-70 hover:opacity-100"}`}
                    style={{ background: c }} />
                ))}
              </div>
            </div>
          </div>

          {/* Descripción */}
          <div>
            <label className="field-label">Descripción</label>
            <textarea rows={2} value={form.description} placeholder="Objetivo y alcance del proyecto…"
              onChange={(e) => set("description", e.target.value)}
              className="input-glass text-sm resize-none" />
          </div>

          {/* Visibilidad */}
          <div>
            <label className="field-label">Visibilidad</label>
            <div className="flex gap-3">
              {[
                { val: "privado", icon: Lock,  label: "Privado", desc: "Solo miembros" },
                { val: "publico", icon: Globe, label: "Público", desc: "Todos lo ven"  },
              ].map(({ val, icon: Icon, label, desc }) => (
                <button key={val} onClick={() => set("visibility", val)}
                  className={`flex-1 flex items-center gap-2 px-3 py-2.5 rounded-xl border text-sm transition-all ${
                    form.visibility === val
                      ? "bg-primary/10 border-primary/30 text-primary"
                      : "glass text-ink/50 border-ink/10 hover:text-ink"
                  }`}>
                  <Icon size={13} />
                  <div className="text-left">
                    <p className="font-medium text-xs">{label}</p>
                    <p className="text-[10px] opacity-60">{desc}</p>
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* Fechas */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="field-label">Fecha de inicio</label>
              <input type="date" value={form.start_date}
                onChange={(e) => set("start_date", e.target.value)}
                className="input-glass text-sm" />
            </div>
            <div>
              <label className="field-label">Fecha de entrega</label>
              <input type="date" value={form.end_date}
                onChange={(e) => set("end_date", e.target.value)}
                className="input-glass text-sm" />
            </div>
          </div>
        </div>

        {error && (
          <div className="flex items-center gap-2 bg-danger/10 border border-danger/20
                          text-danger text-xs rounded-xl px-3 py-2 mt-4">
            <AlertCircle size={13} /> {error}
          </div>
        )}

        <div className="flex justify-end gap-3 mt-6">
          <button onClick={onClose} className="btn-secondary text-sm">Cancelar</button>
          <button onClick={handleSubmit} disabled={saving}
            className="btn-primary text-sm flex items-center gap-2 disabled:opacity-60">
            {saving
              ? <><Loader2 size={14} className="animate-spin" /> Creando…</>
              : <><Plus size={14} /> Crear Proyecto</>
            }
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Tarjeta de proyecto ──────────────────────────────────────────────────────
function ProjectCard({ project, onClick }) {
  const days        = daysLeft(project.end_date);
  const progress    = project.progress_pct || 0;
  const color       = project.color || "#0A4F79";
  const statusBadge = STATUS_BADGE[project.status] || STATUS_BADGE.activo;

  const daysColor = days == null ? "" : days < 0 ? "text-danger" : days <= 7 ? "text-warning" : "text-ink/40";

  return (
    <div
      onClick={onClick}
      className="glass rounded-3xl p-5 cursor-pointer group hover:scale-[1.015]
                 transition-all duration-200 hover:shadow-lg border border-white/50
                 hover:border-white/80 animate-fade-up flex flex-col gap-4"
    >
      {/* Header */}
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl flex items-center justify-center shrink-0"
               style={{ background: `${color}20` }}>
            <Folder size={17} style={{ color }} />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <p className="text-sm font-semibold text-ink group-hover:text-primary transition-colors">
                {project.name}
              </p>
              {project.visibility === "privado"
                ? <Lock size={11} className="text-ink/30" />
                : <Globe size={11} className="text-ink/30" />
              }
            </div>
            <p className="text-[11px] font-mono text-ink/40 mt-0.5">{project.key}</p>
          </div>
        </div>
        <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${statusBadge}`}>
          {project.status}
        </span>
      </div>

      {/* Descripción */}
      {project.description && (
        <p className="text-xs text-ink/50 leading-snug line-clamp-2 -mt-1">
          {project.description}
        </p>
      )}

      {/* Barra de progreso */}
      <div>
        <div className="flex items-center justify-between mb-1.5">
          <span className="text-[10px] text-ink/40 font-medium uppercase tracking-wide">
            Progreso
          </span>
          <span className="text-[11px] font-bold" style={{ color }}>
            {progress.toFixed(0)}%
          </span>
        </div>
        <div className="h-1.5 bg-ink/8 rounded-full overflow-hidden">
          <div
            className="h-full rounded-full transition-all duration-700"
            style={{ width: `${progress}%`, background: color }}
          />
        </div>
      </div>

      {/* Stats */}
      <div className="flex items-center gap-4 flex-wrap">
        {[
          { icon: CheckCircle2, value: `${project.completed_tasks ?? 0}/${project.total_tasks ?? 0}`, label: "tareas", color: "#98C062" },
          { icon: Users,        value: project.member_count ?? 0,   label: "miembros", color: "#0A4F79" },
        ].map(({ icon: Icon, value, label, color: c }) => (
          <div key={label} className="flex items-center gap-1.5">
            <Icon size={12} style={{ color: c }} />
            <span className="text-xs text-ink/60">
              <b className="text-ink">{value}</b> {label}
            </span>
          </div>
        ))}

        {project.active_sprint && (
          <div className="flex items-center gap-1.5">
            <Clock size={12} className="text-warning" />
            <span className="text-[11px] text-warning font-medium truncate max-w-[100px]">
              {project.active_sprint}
            </span>
          </div>
        )}

        {/* Días restantes */}
        {days != null && (
          <div className={`ml-auto flex items-center gap-1 text-[11px] font-medium ${daysColor}`}>
            <Calendar size={11} />
            {days < 0
              ? `Venció hace ${Math.abs(days)}d`
              : days === 0
              ? "Vence hoy"
              : `${days}d restantes`
            }
          </div>
        )}
      </div>

      {/* Flecha */}
      <div className="flex justify-end -mt-2">
        <ChevronRight size={14} className="text-ink/20 group-hover:text-primary/60 transition-colors" />
      </div>
    </div>
  );
}

// ─── Componente principal ──────────────────────────────────────────────────────
export default function ProjectsListPage() {
  const qc          = useQueryClient();
  const navigate    = useNavigate();
  const { isAdmin } = useAuth();

  const [search,      setSearch]      = useState("");
  const [statusFilter,setStatusFilter]= useState("");
  const [showCreate,  setShowCreate]  = useState(false);

  const { data, isLoading, refetch } = useQuery({
    queryKey: ["projects", { search, status: statusFilter }],
    queryFn:  () => projectsService.list({
      search:    search  || undefined,
      status:    statusFilter || undefined,
      page_size: 50,
    }),
    keepPreviousData: true,
    staleTime: 30_000,
  });

  const projects = data?.items || [];

  return (
    <div className="min-h-screen relative z-10">
      <Header
        title="Gestión de Proyectos"
        subtitle={`${data?.total ?? 0} proyectos · Estilo Jira`}
        onRefresh={refetch}
      />

      {/* Barra de herramientas */}
      <div className="flex items-center gap-3 mb-6 flex-wrap">
        {/* Búsqueda */}
        <div className="relative flex-1 min-w-48 max-w-72">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink/35 pointer-events-none" />
          <input
            type="text"
            placeholder="Buscar proyectos…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="input-glass text-sm pl-9 w-full"
          />
        </div>

        {/* Filtro estado */}
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="input-glass text-sm w-36"
        >
          {STATUS_OPTS.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>

        <button
          onClick={() => setShowCreate(true)}
          className="btn-primary flex items-center gap-2 text-sm ml-auto"
        >
          <Plus size={15} /> Nuevo Proyecto
        </button>
      </div>

      {/* Grid de proyectos */}
      {isLoading ? (
        <div className="flex items-center justify-center h-48">
          <Loader2 size={28} className="animate-spin text-primary/40" />
        </div>
      ) : projects.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-64 gap-3">
          <div className="w-16 h-16 rounded-3xl bg-primary/10 flex items-center justify-center">
            <Folder size={28} className="text-primary/40" />
          </div>
          <p className="text-sm font-medium text-ink/50">No hay proyectos todavía</p>
          <button onClick={() => setShowCreate(true)} className="btn-primary text-sm flex items-center gap-2">
            <Plus size={14} /> Crear tu primer proyecto
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4 stagger">
          {projects.map((p) => (
            <ProjectCard
              key={p.id}
              project={p}
              onClick={() => navigate(`/projects/${p.id}`)}
            />
          ))}
        </div>
      )}

      {showCreate && (
        <CreateProjectModal
          onClose={() => setShowCreate(false)}
          onSuccess={() => qc.invalidateQueries(["projects"])}
        />
      )}
    </div>
  );
}