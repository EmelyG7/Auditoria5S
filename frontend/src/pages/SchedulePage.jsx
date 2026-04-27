/**
 * SchedulePage.jsx — Calendario de Planificación
 *
 * FIX: datesSet usaba info.start (puede ser del mes anterior por relleno de celdas).
 *      Ahora usa info.view.currentStart que siempre apunta al 1° del mes visible.
 *
 * FIX: El backend filtra eventos por mes (YYYY-MM). Si el mes calculado estaba
 *      un mes atrás, los eventos del mes actual no aparecían.
 */

import { useState, useCallback, useRef }    from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate }               from "react-router-dom";
import FullCalendar                  from "@fullcalendar/react";
import dayGridPlugin                 from "@fullcalendar/daygrid";
import interactionPlugin             from "@fullcalendar/interaction";
import esLocale                      from "@fullcalendar/core/locales/es";
import {
  Plus, X, Loader2, CheckCircle, XCircle,
  CalendarCheck, Calendar, Clock, MapPin,
  User, AlertTriangle, Pencil, ChevronRight,
  ClipboardList, RefreshCw,
} from "lucide-react";
import { scheduleService } from "../services/schedule";
import { auditsService }   from "../services/audits";
import { authService }     from "../services/auth";
import { useAuth }         from "../store/AuthContext";
import Header              from "../components/Layout/Header";
import GlassCard           from "../components/Layout/GlassCard";
import CreateEventModal    from "../components/Schedule/CreateEventModal";
import { fmt }             from "../utils/format";

// ─── Paleta de prioridades ─────────────────────────────────────────────────────
const PRIO_COLORS = {
  Alta:  { bg: "#DF4585", border: "#c73070" },
  Media: { bg: "#EA9947", border: "#d4832f" },
  Baja:  { bg: "#98C062", border: "#7aab44" },
};
const PRIO_BADGE = {
  Alta:  "bg-danger/10  text-danger  border-danger/20",
  Media: "bg-warning/10 text-warning border-warning/20",
  Baja:  "bg-success/10 text-success border-success/20",
};
const STATUS_BADGE = {
  Pendiente:  "bg-primary/10  text-primary  border-primary/20",
  Completada: "bg-success/10  text-success  border-success/20",
  Cancelada:  "bg-ink/10      text-ink/50   border-ink/10",
};

// ─── Helper: YYYY-MM del mes visible ──────────────────────────────────────────
function monthKey(date) {
  // date es un objeto Date apuntando al 1° del mes visible
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
}

// ─── Helper: mes actual como "YYYY-MM" ────────────────────────────────────────
function currentMonthKey() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

// ─── Sub: fila de info en el modal ────────────────────────────────────────────
function InfoRow({ icon: Icon, label, value, color = "#0A4F79" }) {
  if (!value) return null;
  return (
    <div className="flex items-start gap-2.5">
      <div
        className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0 mt-0.5"
        style={{ background: `${color}18` }}
      >
        <Icon size={13} style={{ color }} />
      </div>
      <div className="min-w-0">
        <p className="text-[10px] text-ink/40 uppercase tracking-wide font-semibold leading-tight">
          {label}
        </p>
        <p className="text-sm text-ink font-medium leading-snug">{value}</p>
      </div>
    </div>
  );
}

// ─── Modal de detalle del evento ──────────────────────────────────────────────
function EventDetailModal({ event, users, types, onClose, onEdit, onComplete, onCancel }) {
  const isPending   = event.status === "Pendiente";
  const isCompleted = event.status === "Completada";
  const isCancelled = event.status === "Cancelada";

  const typeName     = types.find((t) => t.id === event.audit_type_id)?.name
                    || event.audit_type || "—";
  const auditorUser  = users.find((u) => u.id === event.assigned_auditor_id);
  const prioBadge    = PRIO_BADGE[event.priority]  || PRIO_BADGE.Media;
  const statusBadge  = STATUS_BADGE[event.status]  || STATUS_BADGE.Pendiente;
  const prioColor    = PRIO_COLORS[event.priority]?.bg || "#EA9947";

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: "rgba(10,20,40,0.45)", backdropFilter: "blur(8px)" }}
      onClick={onClose}
    >
      <div
        className="glass rounded-3xl w-full max-w-md shadow-2xl animate-fade-up overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Franja de color */}
        <div className="h-1.5 w-full" style={{ background: prioColor }} />

        <div className="p-6">
          {/* Badges */}
          <div className="flex items-center gap-2 mb-4 flex-wrap">
            <span className={`text-[11px] font-semibold px-2.5 py-0.5 rounded-full border ${prioBadge}`}>
              {event.priority || "Sin prioridad"}
            </span>
            <span className={`text-[11px] font-semibold px-2.5 py-0.5 rounded-full border ${statusBadge}`}>
              {event.status}
            </span>
            {event.is_overdue && (
              <span className="text-[11px] font-semibold px-2.5 py-0.5 rounded-full border
              bg-danger/10 text-danger border-danger/20 flex items-center gap-1">
                <AlertTriangle size={10} /> Vencida
              </span>
            )}
            {isCompleted && (
              <span className="text-[11px] px-2 py-0.5 rounded-full bg-success/8 text-success/60">
                ✓ Auditoría completada
              </span>
            )}
          </div>

          {/* Título */}
          <h2 className="text-lg font-semibold text-ink mb-5 leading-snug">{event.title}</h2>

          {/* Info */}
          <div className="space-y-3 mb-6">
            <InfoRow icon={ClipboardList} label="Tipo de auditoría" value={typeName}        color="#0A4F79" />
            <InfoRow icon={MapPin}        label="Sucursal"          value={event.branch}    color="#B4427F" />
            <InfoRow icon={Calendar}      label="Fecha programada"
              value={fmt.date(event.scheduled_date || event.start)}  color="#0A4F79" />
            {event.scheduled_time && (
              <InfoRow icon={Clock} label="Hora"
                value={event.scheduled_time?.slice(0, 5)} color="#EA9947" />
            )}
            <InfoRow
              icon={User}
              label="Auditor asignado"
              value={
                auditorUser
                  ? `${auditorUser.full_name} · ${auditorUser.email}`
                  : event.assigned_auditor_name || "Sin asignar"
              }
              color="#98C062"
            />
            {event.is_overdue && event.days_until != null && (
              <div className="flex items-center gap-2 bg-danger/8 border border-danger/20 rounded-xl px-3 py-2">
                <AlertTriangle size={13} className="text-danger shrink-0" />
                <p className="text-xs text-danger">
                  Vencida hace {Math.abs(event.days_until)} día{Math.abs(event.days_until) !== 1 ? "s" : ""}
                </p>
              </div>
            )}
          </div>

          {/* Acciones */}
          <div className="space-y-2.5">
            {/* Completar — solo pendiente con tipo y sucursal */}
            {isPending && event.audit_type_id && event.branch && (
              <button
                onClick={() => onComplete(event)}
                className="w-full flex items-center justify-between gap-2 text-sm py-3 px-4
                          rounded-xl text-white font-semibold transition-all active:scale-[0.98]"
                style={{ background: "linear-gradient(135deg, #0A4F79, #185F9A)" }}
              >
                <div className="flex items-center gap-2">
                  <CalendarCheck size={16} />
                  Completar Auditoría
                </div>
                <div className="flex items-center gap-1 text-white/70 text-xs">
                  <span>Ir al formulario</span>
                  <ChevronRight size={13} />
                </div>
              </button>
            )}

            {/* Editar */}
            {!isCompleted && !isCancelled && (
              <button
                onClick={() => onEdit(event)}
                className="w-full flex items-center gap-2 text-sm py-2.5 px-4 rounded-xl
                          glass text-ink/70 hover:text-ink border border-ink/10
                          hover:border-ink/20 transition-colors"
              >
                <Pencil size={14} /> Editar evento
              </button>
            )}

            {/* Cancelar */}
            {isPending && (
              <button
                onClick={() => onCancel(event)}
                className="w-full flex items-center gap-2 text-sm py-2.5 px-4 rounded-xl
                        text-danger/70 hover:text-danger bg-danger/5 hover:bg-danger/10
                        border border-danger/15 hover:border-danger/25 transition-colors"
              >
                <XCircle size={14} /> Cancelar evento
              </button>
            )}

            {/* Cerrar */}
            <button onClick={onClose} className="w-full btn-ghost text-xs py-1.5">
              Cerrar
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Componente principal ──────────────────────────────────────────────────────
export default function SchedulePage() {
  const { isAdmin, user } = useAuth();
  const qc                = useQueryClient();
  const navigate          = useNavigate();
  const calendarRef       = useRef(null);

  // ✅ FIX: Inicializar con el mes REAL de hoy
  const [currentMonth, setCurrentMonth] = useState(currentMonthKey);

  const [selectedEvent, setSelectedEvent] = useState(null);
  const [editingEvent,  setEditingEvent]  = useState(null);
  const [showCreate,    setShowCreate]    = useState(false);
  const [newEventDate,  setNewEventDate]  = useState("");

  // ── Datos ────────────────────────────────────────────────────────────────────
  const { data: calData, isLoading, isFetching, refetch } = useQuery({
    queryKey: ["calendar", currentMonth],
    queryFn:  () => scheduleService.getCalendar(currentMonth),
    keepPreviousData: true,
    staleTime: 30_000,
  });

  const { data: types = [] } = useQuery({
    queryKey: ["audit-types"],
    queryFn:  auditsService.getTypes,
  });

  const { data: users = [] } = useQuery({
    queryKey: ["users"],
    queryFn:  authService.listUsers,
  });

  // ── Mutaciones ───────────────────────────────────────────────────────────────
  const cancelMut = useMutation({
    mutationFn: (id) => scheduleService.cancel(id),
    onSuccess:  () => {
      qc.invalidateQueries(["calendar"]);
      setSelectedEvent(null);
    },
  });

  // ── Eventos FullCalendar ─────────────────────────────────────────────────────
  const fcEvents = (calData?.events || []).map((ev) => ({
    id:              String(ev.id),
    title:           ev.title,
    // ✅ Usar scheduled_date si existe, sino start
    start:           ev.scheduled_date || ev.start,
    backgroundColor: PRIO_COLORS[ev.priority]?.bg    || "#0A4F79",
    borderColor:     PRIO_COLORS[ev.priority]?.border || "#0A4F79",
    textColor:       "#fff",
    extendedProps:   ev,
  }));

  // ── Render de evento personalizado ───────────────────────────────────────────
  const renderEventContent = useCallback((info) => {
    const ev       = info.event.extendedProps;
    const branch   = ev.branch
      ? ev.branch.length > 16 ? ev.branch.slice(0, 14) + "…" : ev.branch
      : "";
    const cancelled = ev.status === "Cancelada";
    const completed = ev.status === "Completada";

    return (
      <div
        className="px-1.5 py-0.5 w-full overflow-hidden"
        style={{ opacity: cancelled ? 0.4 : completed ? 0.75 : 1 }}
      >
        <p className="text-[11px] font-semibold leading-tight truncate text-white">
          {cancelled ? "✕ " : completed ? "✓ " : ""}
          {info.event.title}
        </p>
        {branch && (
          <p className="text-[10px] leading-tight text-white/80 truncate">{branch}</p>
        )}
      </div>
    );
  }, []);

  // ── ✅ FIX: datesSet usa view.currentStart (1° del mes visible) ──────────────
  const handleDatesSet = useCallback((info) => {
    // info.view.currentStart siempre es el 1° del mes que el usuario está viendo,
    // a diferencia de info.start que puede ser del mes anterior por los días de relleno
    const key = monthKey(info.view.currentStart);
    setCurrentMonth((prev) => (prev !== key ? key : prev));
  }, []);

  // ── Handlers ─────────────────────────────────────────────────────────────────
  const handleEventClick = (info) => {
    setSelectedEvent(info.event.extendedProps);
  };

  const handleDateClick = (info) => {
    if (isAdmin) {
      setNewEventDate(info.dateStr);
      setShowCreate(true);
    }
  };

  const handleComplete = (ev) => {
    const auditorUser = users.find((u) => u.id === ev.assigned_auditor_id);
    navigate("/audits/new", {
      state: {
        prefilled: {
          schedule_id:          ev.id,
          audit_type_id:        ev.audit_type_id,
          branch:               ev.branch             || "",
          scheduled_date:       ev.scheduled_date     || ev.start,
          auditor_name:         auditorUser?.full_name || ev.assigned_auditor_name  || "",
          auditor_email:        auditorUser?.email     || ev.assigned_auditor_email || "",
          assigned_auditor_id:  ev.assigned_auditor_id,
          general_observations: ev.title ? `Auditoría planificada: ${ev.title}` : "",
        },
      },
    });
    setSelectedEvent(null);
  };

  const handleEdit = (ev) => {
    setEditingEvent(ev);
    setSelectedEvent(null);
  };

  const handleCancel = (ev) => {
    if (window.confirm(`¿Cancelar el evento "${ev.title}"?\n\nEsta acción no se puede deshacer.`)) {
      cancelMut.mutate(ev.id);
    }
  };

  // ─────────────────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen relative z-10">
      <Header
        title="Calendario de Planificación"
        subtitle={`Mes: ${currentMonth} · ${calData?.total || 0} eventos`}
        onRefresh={refetch}
      />

      {/* Stats + botón crear */}
      <div className="flex gap-3 mb-5 flex-wrap items-center">
        {[
          { label: "Pendientes",  value: calData?.pendientes  ?? 0, color: "text-warning", bg: "bg-warning/8  border-warning/20"  },
          { label: "Completadas", value: calData?.completadas ?? 0, color: "text-success", bg: "bg-success/8  border-success/20"  },
          { label: "Canceladas",  value: calData?.canceladas  ?? 0, color: "text-ink/40",  bg: "bg-ink/5     border-ink/10"       },
        ].map((s) => (
          <div key={s.label}
            className={`flex items-center gap-2.5 px-4 py-2.5 rounded-2xl border ${s.bg}`}>
            <span className={`text-xl font-bold ${s.color}`}>{s.value}</span>
            <span className="text-xs text-ink/50 font-medium">{s.label}</span>
          </div>
        ))}

        <div className="ml-auto flex items-center gap-2">
          {isFetching && !isLoading && (
            <Loader2 size={14} className="animate-spin text-primary/40" />
          )}
          {isAdmin && (
            <button
              onClick={() => setShowCreate(true)}
              className="btn-primary flex items-center gap-2 text-sm"
            >
              <Plus size={16} /> Nueva Auditoría Planificada
            </button>
          )}
        </div>
      </div>

      {/* Leyenda */}
      <div className="flex gap-4 mb-4 flex-wrap">
        {Object.entries(PRIO_COLORS).map(([lbl, { bg }]) => (
          <div key={lbl} className="flex items-center gap-1.5">
            <div className="w-3 h-3 rounded-sm" style={{ background: bg }} />
            <span className="text-[11px] text-ink/50">Prioridad {lbl}</span>
          </div>
        ))}
        <div className="flex items-center gap-1.5 ml-4">
          <span className="text-[11px] text-ink/30">✓ Completada</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="text-[11px] text-ink/30">✕ Cancelada</span>
        </div>
      </div>

      {/* Calendario */}
      <GlassCard>
        {isLoading ? (
          <div className="flex items-center justify-center h-64">
            <Loader2 size={28} className="animate-spin text-primary/40" />
          </div>
        ) : (
          <FullCalendar
            ref={calendarRef}
            plugins={[dayGridPlugin, interactionPlugin]}
            initialView="dayGridMonth"
            locale={esLocale}
            // ✅ FIX: initialDate fuerza que FullCalendar arranque en el mes correcto
            initialDate={new Date()}
            headerToolbar={{
              left:   "prev,next today",
              center: "title",
              right:  "dayGridMonth",
            }}
            events={fcEvents}
            eventContent={renderEventContent}
            eventClick={handleEventClick}
            dateClick={handleDateClick}
            // ✅ FIX: datesSet con view.currentStart
            datesSet={handleDatesSet}
            height={580}
            eventDisplay="block"
            dayMaxEvents={4}
            moreLinkText={(n) => `+${n} más`}
            eventClassNames="cursor-pointer rounded-lg overflow-hidden shadow-sm"
            // Tooltip nativo al hover
            eventMouseEnter={(info) => {
              const ev = info.event.extendedProps;
              info.el.title = [
                info.event.title,
                ev.branch ? `📍 ${ev.branch}` : "",
                ev.scheduled_time ? `🕐 ${ev.scheduled_time?.slice(0, 5)}` : "",
                `Estado: ${ev.status}`,
              ].filter(Boolean).join("\n");
            }}
          />
        )}
      </GlassCard>

      {/* Modal: detalle */}
      {selectedEvent && (
        <EventDetailModal
          event={selectedEvent}
          users={users}
          types={types}
          onClose={() => setSelectedEvent(null)}
          onEdit={handleEdit}
          onComplete={handleComplete}
          onCancel={handleCancel}
        />
      )}

      {/* Modal: crear */}
      {showCreate && (
        <CreateEventModal
          initialData={newEventDate ? { scheduled_date: newEventDate } : null}
          onClose={() => { setShowCreate(false); setNewEventDate(""); }}
          onSuccess={() => {
            qc.invalidateQueries(["calendar"]);
            setShowCreate(false);
            setNewEventDate("");
          }}
        />
      )}

      {/* Modal: editar */}
      {editingEvent && (
        <CreateEventModal
          initialData={editingEvent}
          onClose={() => setEditingEvent(null)}
          onSuccess={() => {
            qc.invalidateQueries(["calendar"]);
            setEditingEvent(null);
          }}
        />
      )}
    </div>
  );
}