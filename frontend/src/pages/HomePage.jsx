/**
 * HomePage.jsx — Página de inicio / Home Dashboard
 *
 * Secciones:
 *   1. Saludo personalizado con fecha y resumen del día
 *   2. KPIs rápidos (auditorías, encuestas, pendientes)
 *   3. Widget: Auditorías próximas (5–7 días) con acciones
 *   4. Actividad reciente (últimas auditorías completadas)
 *   5. Estado de satisfacción global (gauge mini)
 *   6. Accesos rápidos
 */

import { useMemo }                              from "react";
import { useQuery }                             from "@tanstack/react-query";
import { useNavigate }                          from "react-router-dom";
import {
  CalendarCheck, ClipboardList, Star, AlertTriangle,
  Clock, MapPin, User, ChevronRight, Plus,
  TrendingUp, Bell, ArrowRight, Activity,
  CheckCircle2, XCircle, Loader2,
} from "lucide-react";
import { useAuth }         from "../store/AuthContext";
import { scheduleService } from "../services/schedule";
import { auditsService }   from "../services/audits";
import { surveysService }  from "../services/surveys";
import Header              from "../components/Layout/Header";
import GlassCard           from "../components/Layout/GlassCard";
import { fmt }             from "../utils/format";

// ─── Paleta ───────────────────────────────────────────────────────────────────
const COL = {
  primary:   "#0A4F79",
  secondary: "#B4427F",
  success:   "#98C062",
  warning:   "#EA9947",
  danger:    "#DF4585",
};

const PRIO_COLORS = {
  Alta:  { bg: "#DF4585", badge: "bg-danger/10  text-danger  border-danger/20"  },
  Media: { bg: "#EA9947", badge: "bg-warning/10 text-warning border-warning/20" },
  Baja:  { bg: "#98C062", badge: "bg-success/10 text-success border-success/20" },
};

// ─── Helpers ──────────────────────────────────────────────────────────────────
const safe = (v, fb = 0) => (v != null && !Number.isNaN(+v) ? +v : fb);
const fmtPct = (v) => v != null ? `${(safe(v) * 100).toFixed(1)}%` : "—";

function semColor(v) {
  if (v == null) return COL.primary;
  const p = safe(v) * 100;
  if (p >= 80) return COL.success;
  if (p >= 60) return COL.warning;
  return COL.danger;
}

function greeting(name) {
  const h = new Date().getHours();
  const saludo = h < 12 ? "Buenos días" : h < 18 ? "Buenas tardes" : "Buenas noches";
  return `${saludo}, ${name?.split(" ")[0] || ""}`;
}

function todayStr() {
  return new Date().toLocaleDateString("es-DO", {
    weekday: "long", year: "numeric", month: "long", day: "numeric",
  });
}

// Cuántos días faltan hasta una fecha
function daysUntil(dateStr) {
  if (!dateStr) return null;
  const today  = new Date(); today.setHours(0,0,0,0);
  const target = new Date(dateStr); target.setHours(0,0,0,0);
  return Math.round((target - today) / 86_400_000);
}

// ─── Componentes ──────────────────────────────────────────────────────────────

function QuickKPI({ label, value, icon: Icon, color, sub, onClick }) {
  return (
    <div
      className={`glass-card flex items-start gap-3 animate-fade-up ${onClick ? "cursor-pointer hover:scale-[1.02] transition-transform" : ""}`}
      onClick={onClick}
    >
      <div className="w-10 h-10 rounded-2xl flex items-center justify-center shrink-0"
           style={{ background: `${color}20` }}>
        <Icon size={17} style={{ color }} />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-xs font-semibold text-ink/50 uppercase tracking-wide mb-0.5">{label}</p>
        <p className="text-2xl font-bold leading-tight" style={{ color }}>{value}</p>
        {sub && <p className="text-xs text-ink/40 mt-0.5">{sub}</p>}
      </div>
      {onClick && <ChevronRight size={14} className="text-ink/25 mt-1 shrink-0" />}
    </div>
  );
}

// Tarjeta de evento próximo
function UpcomingCard({ event, onComplete, onView, types }) {
  const days  = daysUntil(event.scheduled_date || event.start);
  const prio  = PRIO_COLORS[event.priority] || PRIO_COLORS.Media;
  const type  = types.find((t) => t.id === event.audit_type_id)?.name || event.audit_type || "";

  const urgencyLabel = days === 0 ? "¡Hoy!"
    : days === 1                   ? "Mañana"
    : days != null                 ? `En ${days} días`
    : "";
  const urgencyColor = days === 0 ? COL.danger
    : days === 1                   ? COL.warning
    : COL.primary;

  return (
    <div className="glass rounded-2xl p-4 border border-white/60 hover:border-white/80
                    transition-all duration-200 hover:shadow-md animate-fade-up">
      {/* Header */}
      <div className="flex items-start justify-between gap-2 mb-3">
        <div className="flex items-center gap-2 flex-wrap">
          <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${prio.badge}`}>
            {event.priority}
          </span>
          {urgencyLabel && (
            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full"
                  style={{ background: `${urgencyColor}15`, color: urgencyColor }}>
              {urgencyLabel}
            </span>
          )}
        </div>
        {/* Barra lateral de color */}
        <div className="w-1 h-8 rounded-full shrink-0" style={{ background: prio.bg }} />
      </div>

      {/* Título */}
      <p className="text-sm font-semibold text-ink mb-2 leading-snug">{event.title}</p>

      {/* Datos */}
      <div className="space-y-1 mb-3">
        {type && (
          <div className="flex items-center gap-1.5 text-xs text-ink/50">
            <ClipboardList size={11} /> {type}
          </div>
        )}
        {event.branch && (
          <div className="flex items-center gap-1.5 text-xs text-ink/50">
            <MapPin size={11} /> {event.branch}
          </div>
        )}
        {(event.scheduled_date || event.start) && (
          <div className="flex items-center gap-1.5 text-xs text-ink/50">
            <Clock size={11} />
            {fmt.date(event.scheduled_date || event.start)}
            {event.scheduled_time && ` · ${String(event.scheduled_time).slice(0, 5)}`}
          </div>
        )}
        {(event.assigned_auditor_name) && (
          <div className="flex items-center gap-1.5 text-xs text-ink/50">
            <User size={11} /> {event.assigned_auditor_name}
          </div>
        )}
      </div>

      {/* Acciones */}
      <div className="flex gap-2">
        {event.audit_type_id && event.branch && (
          <button
            onClick={() => onComplete(event)}
            className="flex-1 text-xs py-1.5 px-3 rounded-lg font-semibold text-white
                       transition-all active:scale-95"
            style={{ background: COL.primary }}
          >
            Completar
          </button>
        )}
        <button
          onClick={() => onView()}
          className="text-xs py-1.5 px-3 rounded-lg glass text-ink/60
                     hover:text-ink border border-ink/10 transition-colors"
        >
          Ver
        </button>
      </div>
    </div>
  );
}

// Acceso rápido
function QuickAction({ label, desc, icon: Icon, color, onClick }) {
  return (
    <button
      onClick={onClick}
      className="glass-card text-left group hover:scale-[1.02] transition-all duration-200
                 flex items-center gap-3 animate-fade-up"
    >
      <div className="w-10 h-10 rounded-2xl flex items-center justify-center shrink-0"
           style={{ background: `${color}20` }}>
        <Icon size={17} style={{ color }} />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-ink">{label}</p>
        <p className="text-xs text-ink/45 truncate">{desc}</p>
      </div>
      <ArrowRight size={14} className="text-ink/20 group-hover:text-ink/40 transition-colors shrink-0" />
    </button>
  );
}

// ─── Componente principal ──────────────────────────────────────────────────────
export default function HomePage() {
  const { user }  = useAuth();
  const navigate  = useNavigate();

  // Mes actual para el calendario
  const monthKey = (() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  })();

  // ── Queries ──────────────────────────────────────────────────────────────────
  const { data: calData } = useQuery({
    queryKey: ["calendar", monthKey],
    queryFn:  () => scheduleService.getCalendar(monthKey),
    staleTime: 60_000,
  });

  const { data: auditKpis } = useQuery({
    queryKey: ["audit-kpis"],
    queryFn:  () => auditsService.getKPIs({}),
    staleTime: 60_000,
  });

  const { data: surveyKpis } = useQuery({
    queryKey: ["survey-kpis", {}],
    queryFn:  () => surveysService.getKPIs({}),
    staleTime: 60_000,
  });

  const { data: recentAudits } = useQuery({
    queryKey: ["audits-recent"],
    queryFn:  () => auditsService.list({ page: 1, page_size: 5, order_by: "audit_date", order_dir: "desc" }),
    staleTime: 60_000,
  });

  const { data: types = [] } = useQuery({
    queryKey: ["audit-types"],
    queryFn:  auditsService.getTypes,
  });

  // ── Auditorías próximas (0–7 días) ───────────────────────────────────────────
  const upcoming = useMemo(() => {
    const events = calData?.events || [];
    return events
      .filter((ev) => {
        if (ev.status !== "Pendiente") return false;
        const d = daysUntil(ev.scheduled_date || ev.start);
        return d != null && d >= 0 && d <= 7;
      })
      .sort((a, b) => {
        const da = daysUntil(a.scheduled_date || a.start);
        const db = daysUntil(b.scheduled_date || b.start);
        return da - db;
      });
  }, [calData]);

  // ── Auditorías vencidas (pendiente, fecha pasada) ─────────────────────────────
  const overdue = useMemo(() => {
    return (calData?.events || []).filter((ev) => {
      if (ev.status !== "Pendiente") return false;
      const d = daysUntil(ev.scheduled_date || ev.start);
      return d != null && d < 0;
    });
  }, [calData]);

  // ── Ir al formulario de completar ────────────────────────────────────────────
  const handleComplete = (ev) => {
    navigate("/audits/new", {
      state: {
        prefilled: {
          schedule_id:    ev.id,
          audit_type_id:  ev.audit_type_id  || null,
          branch:         ev.branch          || "",
          scheduled_date: ev.scheduled_date  || ev.start || "",
          auditor_name:   ev.assigned_auditor_name  || "",
          auditor_email:  ev.assigned_auditor_email || "",
          assigned_auditor_id: ev.assigned_auditor_id || null,
          general_observations: ev.title ? `Originada de auditoría planificada: "${ev.title}"` : "",
        },
      },
    });
  };

  const siGlobal = surveyKpis?.sat_interna_global;
  const seGlobal = surveyKpis?.sat_externa_global;

  return (
    <div className="min-h-screen relative z-10">

      {/* ── Header ──────────────────────────────────────────────────────────── */}
      <div className="mb-8">
        <p className="text-xs font-medium text-ink/40 uppercase tracking-wider mb-1">
          {todayStr()}
        </p>
        <h1 className="text-2xl font-semibold text-ink leading-tight">
          {greeting(user?.full_name)}
        </h1>
        <p className="text-sm text-ink/50 mt-1">
          Sistema de Gestión de Auditorías 5S y Satisfacción
        </p>
      </div>

      {/* ── Alerta de vencidas ───────────────────────────────────────────────── */}
      {overdue.length > 0 && (
        <div
          className="flex items-center gap-3 rounded-2xl px-4 py-3 mb-6 border animate-fade-up cursor-pointer"
          style={{ background: `${COL.danger}10`, borderColor: `${COL.danger}30` }}
          onClick={() => navigate("/schedule")}
        >
          <AlertTriangle size={16} style={{ color: COL.danger }} className="shrink-0" />
          <div className="flex-1">
            <p className="text-sm font-semibold" style={{ color: COL.danger }}>
              {overdue.length} auditoría{overdue.length !== 1 ? "s" : ""} vencida{overdue.length !== 1 ? "s" : ""}
            </p>
            <p className="text-xs text-ink/50">
              {overdue.map((e) => e.branch || e.title).join(" · ")}
            </p>
          </div>
          <ChevronRight size={14} style={{ color: COL.danger }} />
        </div>
      )}

      {/* ── KPIs rápidos ─────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8 stagger">
        <QuickKPI
          label="Auditorías"
          value={auditKpis?.total_audits ?? "—"}
          icon={ClipboardList}
          color={COL.primary}
          sub="Total registradas"
          onClick={() => navigate("/audits")}
        />
        <QuickKPI
          label="Pendientes"
          value={calData?.pendientes ?? "—"}
          icon={Clock}
          color={upcoming.length > 0 ? COL.warning : COL.success}
          sub="En el calendario"
          onClick={() => navigate("/schedule")}
        />
        <QuickKPI
          label="Sat. Interna"
          value={fmtPct(siGlobal)}
          icon={Star}
          color={semColor(siGlobal)}
          sub={siGlobal != null ? (safe(siGlobal)*100 >= 80 ? "Nivel aceptable" : "Requiere atención") : "Sin datos"}
          onClick={() => navigate("/dashboard/surveys")}
        />
        <QuickKPI
          label="Cumplimiento 5S"
          value={auditKpis?.avg_percentage != null ? `${auditKpis.avg_percentage.toFixed(1)}%` : "—"}
          icon={TrendingUp}
          color={auditKpis?.avg_percentage != null ? semColor(auditKpis.avg_percentage / 100) : COL.primary}
          sub="Promedio general"
          onClick={() => navigate("/dashboard/audits")}
        />
      </div>

      {/* ── Fila principal ────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">

        {/* Auditorías próximas — 2/3 del ancho */}
        <div className="lg:col-span-2">
          <div className="flex items-center justify-between mb-3">
            <div>
              <h2 className="text-sm font-semibold text-ink">Auditorías próximas</h2>
              <p className="text-xs text-ink/40">Próximos 7 días · Solo pendientes</p>
            </div>
            <button
              onClick={() => navigate("/schedule")}
              className="flex items-center gap-1 text-xs text-primary/70 hover:text-primary transition-colors"
            >
              Ver todas <ChevronRight size={12} />
            </button>
          </div>

          {upcoming.length === 0 ? (
            <GlassCard className="flex flex-col items-center justify-center py-10 gap-2">
              <CalendarCheck size={28} className="text-success/50" />
              <p className="text-sm font-medium text-ink/50">Sin auditorías próximas</p>
              <p className="text-xs text-ink/30">No hay eventos pendientes en los próximos 7 días</p>
              <button
                onClick={() => navigate("/schedule")}
                className="mt-2 btn-secondary text-xs flex items-center gap-1.5"
              >
                <Plus size={13} /> Planificar auditoría
              </button>
            </GlassCard>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 stagger">
              {upcoming.map((ev) => (
                <UpcomingCard
                  key={ev.id}
                  event={ev}
                  types={types}
                  onComplete={handleComplete}
                  onView={() => navigate("/schedule")}
                />
              ))}
            </div>
          )}
        </div>

        {/* Panel lateral — 1/3 */}
        <div className="space-y-4">

          {/* Satisfacción global mini */}
          <GlassCard className="animate-fade-up">
            <h3 className="text-xs font-semibold text-ink/50 uppercase tracking-wide mb-3">
              Satisfacción Global
            </h3>
            <div className="space-y-3">
              {[
                { label: "Clientes Internos", value: siGlobal },
                { label: "Clientes Externos", value: seGlobal },
              ].map(({ label, value }) => {
                const pct = value != null ? safe(value) * 100 : null;
                const c   = semColor(value);
                return (
                  <div key={label}>
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs text-ink/60">{label}</span>
                      <span className="text-xs font-bold" style={{ color: c }}>
                        {pct != null ? `${pct.toFixed(1)}%` : "—"}
                      </span>
                    </div>
                    <div className="h-1.5 bg-ink/8 rounded-full overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all duration-700"
                        style={{ width: `${Math.min(pct || 0, 100)}%`, background: c }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
            <button
              onClick={() => navigate("/dashboard/surveys")}
              className="mt-4 w-full text-xs text-primary/70 hover:text-primary flex items-center
                         justify-center gap-1 transition-colors"
            >
              Ver dashboard completo <ArrowRight size={11} />
            </button>
          </GlassCard>

          {/* Estado de auditorías */}
          <GlassCard className="animate-fade-up">
            <h3 className="text-xs font-semibold text-ink/50 uppercase tracking-wide mb-3">
              Estado del Mes
            </h3>
            <div className="space-y-2.5">
              {[
                { label: "Pendientes",  value: calData?.pendientes  ?? 0, c: COL.warning, icon: Clock       },
                { label: "Completadas", value: calData?.completadas ?? 0, c: COL.success, icon: CheckCircle2 },
                { label: "Canceladas",  value: calData?.canceladas  ?? 0, c: COL.danger,  icon: XCircle      },
              ].map(({ label, value, c, icon: Icon }) => (
                <div key={label} className="flex items-center gap-2.5">
                  <div className="w-6 h-6 rounded-lg flex items-center justify-center shrink-0"
                       style={{ background: `${c}15` }}>
                    <Icon size={12} style={{ color: c }} />
                  </div>
                  <span className="text-xs text-ink/60 flex-1">{label}</span>
                  <span className="text-sm font-bold" style={{ color: c }}>{value}</span>
                </div>
              ))}
            </div>
          </GlassCard>

        </div>
      </div>

      {/* ── Actividad reciente ────────────────────────────────────────────────── */}
      {recentAudits?.items?.length > 0 && (
        <div className="mb-8">
          <div className="flex items-center justify-between mb-3">
            <div>
              <h2 className="text-sm font-semibold text-ink">Actividad reciente</h2>
              <p className="text-xs text-ink/40">Últimas auditorías registradas</p>
            </div>
            <button
              onClick={() => navigate("/audits")}
              className="text-xs text-primary/70 hover:text-primary flex items-center gap-1 transition-colors"
            >
              Ver todas <ChevronRight size={12} />
            </button>
          </div>

          <GlassCard padding={false}>
            <div className="divide-y divide-ink/5">
              {recentAudits.items.map((a) => (
                <div key={a.id}
                     className="flex items-center gap-3 px-4 py-3 hover:bg-primary/[0.025]
                                transition-colors cursor-pointer"
                     onClick={() => navigate("/audits")}>
                  {/* Icono de estado */}
                  <div className="w-7 h-7 rounded-xl flex items-center justify-center shrink-0"
                       style={{ background: `${semColor(a.percentage / 100)}18` }}>
                    <Activity size={13} style={{ color: semColor(a.percentage / 100) }} />
                  </div>

                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-ink truncate">
                      {a.audit_type_name} · {a.branch}
                    </p>
                    <p className="text-xs text-ink/40">
                      {fmt.date(a.audit_date)}
                      {a.auditor_name ? ` · ${a.auditor_name}` : ""}
                    </p>
                  </div>

                  <div className="text-right shrink-0">
                    <p className="text-sm font-bold"
                       style={{ color: semColor(a.percentage / 100) }}>
                      {a.percentage != null ? `${a.percentage.toFixed(1)}%` : "—"}
                    </p>
                    <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${
                      a.percentage >= 80 ? "bg-success/10 text-success"
                      : a.percentage >= 60 ? "bg-warning/10 text-warning"
                      : "bg-danger/10 text-danger"
                    }`}>
                      {a.percentage >= 80 ? "Cumple" : a.percentage >= 60 ? "Por mejorar" : "Crítico"}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </GlassCard>
        </div>
      )}

      {/* ── Accesos rápidos ──────────────────────────────────────────────────── */}
      <div>
        <h2 className="text-sm font-semibold text-ink mb-3">Accesos rápidos</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 stagger">
          <QuickAction
            label="Nueva Auditoría"
            desc="Iniciar un checklist 5S"
            icon={Plus}
            color={COL.primary}
            onClick={() => navigate("/audits/new")}
          />
          <QuickAction
            label="Planificar Auditoría"
            desc="Agregar al calendario"
            icon={CalendarCheck}
            color={COL.secondary}
            onClick={() => navigate("/schedule")}
          />
          <QuickAction
            label="Dashboard 5S"
            desc="Ver KPIs de auditorías"
            icon={TrendingUp}
            color={COL.success}
            onClick={() => navigate("/dashboard/audits")}
          />
          <QuickAction
            label="Satisfacción"
            desc="Encuestas internas y externas"
            icon={Star}
            color={COL.warning}
            onClick={() => navigate("/dashboard/surveys")}
          />
        </div>
      </div>

    </div>
  );
}