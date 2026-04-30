/**
 * SchedulePage.jsx — Calendario de Planificación
 *
 * Acciones disponibles por estado:
 *
 *   Pendiente  → Completar auditoría · Editar · Cancelar
 *   Cancelada  → Reactivar (vuelve a Pendiente) · Eliminar permanentemente
 *   Completada → Solo ver (sin acciones)
 */

import { useState, useCallback, useRef }         from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate }                           from "react-router-dom";
import FullCalendar                              from "@fullcalendar/react";
import dayGridPlugin                             from "@fullcalendar/daygrid";
import interactionPlugin                         from "@fullcalendar/interaction";
import esLocale                                  from "@fullcalendar/core/locales/es";
import {
  Plus, X, Loader2, XCircle, CalendarCheck,
  Calendar, Clock, MapPin, User, AlertTriangle,
  Pencil, ChevronRight, ClipboardList,
  RotateCcw, Trash2,
} from "lucide-react";
import { scheduleService } from "../services/schedule";
import { auditsService }   from "../services/audits";
import { authService }     from "../services/auth";
import { useAuth }         from "../store/AuthContext";
import Header              from "../components/Layout/Header";
import GlassCard           from "../components/Layout/GlassCard";
import CreateEventModal    from "../components/Schedule/CreateEventModal";
import { fmt }             from "../utils/format";

// ─── Paleta ───────────────────────────────────────────────────────────────────
const PRIO = {
  Alta:  { bg: "#DF4585", border: "#c73070", badge: "bg-danger/10  text-danger  border-danger/20"  },
  Media: { bg: "#EA9947", border: "#d4832f", badge: "bg-warning/10 text-warning border-warning/20" },
  Baja:  { bg: "#98C062", border: "#7aab44", badge: "bg-success/10 text-success border-success/20" },
};
const STATUS_BADGE = {
  Pendiente:  "bg-primary/10  text-primary  border-primary/20",
  Completada: "bg-success/10  text-success  border-success/20",
  Cancelada:  "bg-ink/10      text-ink/50   border-ink/10",
};

function monthKey(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}
function todayMonthKey() { return monthKey(new Date()); }

// ─── InfoRow ──────────────────────────────────────────────────────────────────
function InfoRow({ icon: Icon, label, value, color = "#0A4F79" }) {
  if (!value) return null;
  return (
    <div className="flex items-start gap-2.5">
      <div className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0 mt-0.5"
           style={{ background: `${color}18` }}>
        <Icon size={13} style={{ color }} />
      </div>
      <div className="min-w-0">
        <p className="text-[10px] text-ink/40 uppercase tracking-wide font-semibold leading-tight">{label}</p>
        <p className="text-sm text-ink font-medium leading-snug">{value}</p>
      </div>
    </div>
  );
}

// ─── Modal de detalle ─────────────────────────────────────────────────────────
function EventDetailModal({
  event, users, types,
  onClose, onEdit, onComplete, onCancel, onReactivate, onDelete,
  isReactivating, isDeleting,
}) {
  const isPending   = event.status === "Pendiente";
  const isCompleted = event.status === "Completada";
  const isCancelled = event.status === "Cancelada";

  const typeName    = types.find((t) => t.id === event.audit_type_id)?.name
                      || event.audit_type || "—";
  const auditorUser = users.find((u) => u.id === event.assigned_auditor_id);
  const prioColors  = PRIO[event.priority] || PRIO.Media;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: "rgba(10,20,40,0.45)", backdropFilter: "blur(8px)" }}
      onClick={onClose}
    >
      <div
        className="glass rounded-3xl w-full max-w-md shadow-2xl animate-fade-up overflow-hidden relative"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Franja de color según prioridad / estado */}
        <div
          className="h-1.5 w-full"
          style={{ background: isCancelled ? "#94a3b8" : isCompleted ? "#98C062" : prioColors.bg }}
        />

        <div className="p-6">
          {/* Botón cerrar */}
          <button onClick={onClose} className="absolute top-4 right-4 btn-ghost p-1.5">
            <X size={16} />
          </button>

          {/* Badges */}
          <div className="flex items-center gap-2 mb-4 flex-wrap pr-8">
            {event.priority && !isCancelled && !isCompleted && (
              <span className={`text-[11px] font-semibold px-2.5 py-0.5 rounded-full border ${prioColors.badge}`}>
                Prioridad {event.priority}
              </span>
            )}
            <span className={`text-[11px] font-semibold px-2.5 py-0.5 rounded-full border ${STATUS_BADGE[event.status] || ""}`}>
              {event.status}
            </span>
            {event.is_overdue && (
              <span className="text-[11px] font-semibold px-2.5 py-0.5 rounded-full border
                               bg-danger/10 text-danger border-danger/20 flex items-center gap-1">
                <AlertTriangle size={10} /> Vencida
              </span>
            )}
          </div>

          {/* Título */}
          <h2 className={`text-lg font-semibold mb-5 leading-snug ${isCancelled ? "text-ink/50 line-through" : "text-ink"}`}>
            {event.title}
          </h2>

          {/* Datos del evento */}
          <div className="space-y-3 mb-6">
            <InfoRow icon={ClipboardList} label="Tipo de auditoría" value={typeName}      color="#0A4F79" />
            <InfoRow icon={MapPin}        label="Sucursal"          value={event.branch}  color="#B4427F" />
            <InfoRow
              icon={Calendar}
              label="Fecha programada"
              value={fmt.date(event.scheduled_date || event.start)}
              color="#0A4F79"
            />
            {event.scheduled_time && (
              <InfoRow icon={Clock} label="Hora"
                value={String(event.scheduled_time).slice(0, 5)} color="#EA9947" />
            )}
            <InfoRow
              icon={User}
              label="Auditor asignado"
              value={
                auditorUser
                  ? `${auditorUser.full_name} · ${auditorUser.email}`
                  : event.assigned_auditor_name
                  ? `${event.assigned_auditor_name}${event.assigned_auditor_email ? ` · ${event.assigned_auditor_email}` : ""}`
                  : null
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

          {/* ── Acciones según estado ────────────────────────────────────── */}
          <div className="space-y-2.5">

            {/* PENDIENTE: Completar + Editar + Cancelar */}
            {isPending && (
              <>
                {event.audit_type_id && event.branch && (
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
                <button
                  onClick={() => onEdit(event)}
                  className="w-full flex items-center gap-2 text-sm py-2.5 px-4 rounded-xl
                             glass text-ink/70 hover:text-ink border border-ink/10 hover:border-ink/20 transition-colors"
                >
                  <Pencil size={14} /> Editar evento
                </button>
                <button
                  onClick={() => onCancel(event)}
                  className="w-full flex items-center gap-2 text-sm py-2.5 px-4 rounded-xl
                             text-danger/70 hover:text-danger bg-danger/5 hover:bg-danger/10
                             border border-danger/15 hover:border-danger/25 transition-colors"
                >
                  <XCircle size={14} /> Cancelar evento
                </button>
              </>
            )}

            {/* CANCELADA: Reactivar + Eliminar */}
            {isCancelled && (
              <>
                {/* Aviso visual */}
                <div className="flex items-center gap-2 bg-ink/5 border border-ink/10 rounded-xl px-3 py-2.5 mb-1">
                  <XCircle size={13} className="text-ink/40 shrink-0" />
                  <p className="text-xs text-ink/50">
                    Este evento fue cancelado. Puedes reactivarlo o eliminarlo definitivamente.
                  </p>
                </div>

                {/* Reactivar */}
                <button
                  onClick={() => onReactivate(event)}
                  disabled={isReactivating}
                  className="w-full flex items-center gap-2 text-sm py-2.5 px-4 rounded-xl
                             bg-warning/10 hover:bg-warning/15 text-warning border border-warning/25
                             hover:border-warning/40 transition-colors disabled:opacity-50"
                >
                  {isReactivating
                    ? <><Loader2 size={14} className="animate-spin" /> Reactivando…</>
                    : <><RotateCcw size={14} /> Reactivar evento (volver a Pendiente)</>
                  }
                </button>

                {/* Eliminar — solo admin */}
                <button
                  onClick={() => onDelete(event)}
                  disabled={isDeleting}
                  className="w-full flex items-center gap-2 text-sm py-2.5 px-4 rounded-xl
                             text-danger/80 hover:text-danger bg-danger/8 hover:bg-danger/15
                             border border-danger/20 hover:border-danger/35 transition-colors disabled:opacity-50"
                >
                  {isDeleting
                    ? <><Loader2 size={14} className="animate-spin" /> Eliminando…</>
                    : <><Trash2 size={14} /> Eliminar definitivamente</>
                  }
                </button>
              </>
            )}

            {/* COMPLETADA: sin acciones destructivas */}
            {isCompleted && (
              <div className="flex items-center gap-2 bg-success/8 border border-success/20
                              rounded-xl px-3 py-2.5">
                <CalendarCheck size={13} className="text-success shrink-0" />
                <p className="text-xs text-success/80">
                  Auditoría completada. No se pueden realizar más acciones sobre este evento.
                </p>
              </div>
            )}

            <button onClick={onClose} className="w-full btn-ghost text-xs py-1.5 text-ink/40">
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
  const { isAdmin }   = useAuth();
  const qc            = useQueryClient();
  const navigate      = useNavigate();
  const calendarRef   = useRef(null);

  const [currentMonth,  setCurrentMonth]  = useState(todayMonthKey);
  const [selectedEvent, setSelectedEvent] = useState(null);
  const [editingEvent,  setEditingEvent]  = useState(null);
  const [showCreate,    setShowCreate]    = useState(false);
  const [newEventDate,  setNewEventDate]  = useState("");

  // ── Queries ──────────────────────────────────────────────────────────────────
  const { data: calData, isLoading, isFetching, refetch } = useQuery({
    queryKey: ["calendar", currentMonth],
    queryFn:  () => scheduleService.getCalendar(currentMonth),
    keepPreviousData: true,
    staleTime: 30_000,
  });
  const { data: types = [] } = useQuery({ queryKey: ["audit-types"], queryFn: auditsService.getTypes });
  const { data: users = [] } = useQuery({ queryKey: ["users"],       queryFn: authService.listUsers  });

  // ── Mutaciones ───────────────────────────────────────────────────────────────
  const invalidate = () => qc.invalidateQueries(["calendar"]);

  const cancelMut = useMutation({
    mutationFn: (id) => scheduleService.cancel(id),
    onSuccess:  () => { invalidate(); setSelectedEvent(null); },
  });

  const reactivateMut = useMutation({
    mutationFn: (id) => scheduleService.reactivate(id),
    onSuccess:  () => { invalidate(); setSelectedEvent(null); },
    onError:    (e) => alert(e.response?.data?.detail || "Error al reactivar."),
  });

  const deleteMut = useMutation({
    mutationFn: (id) => scheduleService.delete(id),
    onSuccess:  () => { invalidate(); setSelectedEvent(null); },
    onError:    (e) => alert(e.response?.data?.detail || "Error al eliminar."),
  });

  // ── FullCalendar events ───────────────────────────────────────────────────────
  const fcEvents = (calData?.events || []).map((ev) => ({
    id:              String(ev.id),
    title:           ev.title,
    start:           ev.scheduled_date || ev.start,
    backgroundColor: ev.status === "Cancelada"  ? "#94a3b8"
                   : ev.status === "Completada" ? "#98C062"
                   : (PRIO[ev.priority]?.bg || "#0A4F79"),
    borderColor:     "transparent",
    textColor:       "#fff",
    extendedProps:   ev,
  }));

  const renderEventContent = useCallback((info) => {
    const ev        = info.event.extendedProps;
    const branch    = ev.branch ? (ev.branch.length > 16 ? ev.branch.slice(0, 14) + "…" : ev.branch) : "";
    const cancelled = ev.status === "Cancelada";
    const completed = ev.status === "Completada";
    return (
      <div className="px-1.5 py-0.5 w-full overflow-hidden"
           style={{ opacity: cancelled ? 0.5 : completed ? 0.8 : 1 }}>
        <p className="text-[11px] font-semibold leading-tight truncate text-white">
          {cancelled ? "✕ " : completed ? "✓ " : ""}{info.event.title}
        </p>
        {branch && <p className="text-[10px] leading-tight text-white/80 truncate">{branch}</p>}
      </div>
    );
  }, []);

  // ── datesSet FIX ─────────────────────────────────────────────────────────────
  const handleDatesSet = useCallback((info) => {
    const key = monthKey(info.view.currentStart);
    setCurrentMonth((prev) => prev !== key ? key : prev);
  }, []);

  // ── handleComplete ────────────────────────────────────────────────────────────
  const handleComplete = useCallback((ev) => {
    const auditorUser = users.find(
      (u) => u.id === ev.assigned_auditor_id || String(u.id) === String(ev.assigned_auditor_id)
    );
    navigate("/audits/new", {
      state: {
        prefilled: {
          schedule_id:          ev.id,
          audit_type_id:        ev.audit_type_id        || null,
          branch:               ev.branch               || "",
          scheduled_date:       ev.scheduled_date       || ev.start || "",
          auditor_name:         auditorUser?.full_name  || ev.assigned_auditor_name  || "",
          auditor_email:        auditorUser?.email       || ev.assigned_auditor_email || "",
          assigned_auditor_id:  ev.assigned_auditor_id  || null,
          general_observations: ev.title ? `Originada de auditoría planificada: "${ev.title}"` : "",
        },
      },
    });
    setSelectedEvent(null);
    setEditingEvent(null);
  }, [users, navigate]);

  const handleEdit    = (ev) => { setEditingEvent(ev);  setSelectedEvent(null); };
  const handleCancel  = (ev) => {
    if (window.confirm(`¿Cancelar "${ev.title}"?\n\nPodrás reactivarlo luego si lo necesitas.`)) {
      cancelMut.mutate(ev.id);
    }
  };
  const handleReactivate = (ev) => {
    if (window.confirm(`¿Reactivar "${ev.title}"?\n\nEl evento volverá a estado Pendiente.`)) {
      reactivateMut.mutate(ev.id);
    }
  };
  const handleDelete = (ev) => {
    if (window.confirm(
      `¿Eliminar definitivamente "${ev.title}"?\n\n⚠️ Esta acción no se puede deshacer.`
    )) {
      deleteMut.mutate(ev.id);
    }
  };

  const closeCreate = () => { setShowCreate(false); setNewEventDate(""); };

  // ── Conteos para stats ────────────────────────────────────────────────────────
  const events    = calData?.events || [];
  const nPending  = calData?.pendientes  ?? events.filter((e) => e.status === "Pendiente").length;
  const nDone     = calData?.completadas ?? events.filter((e) => e.status === "Completada").length;
  const nCancel   = calData?.canceladas  ?? events.filter((e) => e.status === "Cancelada").length;

  return (
    <div className="min-h-screen relative z-10">
      <Header
        title="Calendario de Planificación"
        subtitle={`${currentMonth} · ${events.length} eventos`}
        onRefresh={refetch}
      />

      {/* Stats + crear */}
      <div className="flex gap-3 mb-5 flex-wrap items-center">
        {[
          { label: "Pendientes",  value: nPending, color: "text-warning", bg: "bg-warning/8  border-warning/20" },
          { label: "Completadas", value: nDone,    color: "text-success", bg: "bg-success/8  border-success/20" },
          { label: "Canceladas",  value: nCancel,  color: "text-ink/40",  bg: "bg-ink/5     border-ink/10"      },
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
            <button onClick={() => setShowCreate(true)} className="btn-primary flex items-center gap-2 text-sm">
              <Plus size={16} /> Nueva Auditoría Planificada
            </button>
          )}
        </div>
      </div>

      {/* Leyenda */}
      <div className="flex gap-4 mb-4 flex-wrap items-center">
        {Object.entries(PRIO).map(([lbl, { bg }]) => (
          <div key={lbl} className="flex items-center gap-1.5">
            <div className="w-3 h-3 rounded-sm" style={{ background: bg }} />
            <span className="text-[11px] text-ink/50">Prioridad {lbl}</span>
          </div>
        ))}
        <div className="flex items-center gap-1.5">
          <div className="w-3 h-3 rounded-sm bg-success/60" />
          <span className="text-[11px] text-ink/40">✓ Completada</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-3 h-3 rounded-sm bg-slate-400/60" />
          <span className="text-[11px] text-ink/40">✕ Cancelada</span>
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
            initialDate={new Date()}
            headerToolbar={{ left: "prev,next today", center: "title", right: "dayGridMonth" }}
            events={fcEvents}
            eventContent={renderEventContent}
            eventClick={(info) => setSelectedEvent(info.event.extendedProps)}
            dateClick={(info) => {
              if (isAdmin) { setNewEventDate(info.dateStr); setShowCreate(true); }
            }}
            datesSet={handleDatesSet}
            height={580}
            eventDisplay="block"
            dayMaxEvents={4}
            moreLinkText={(n) => `+${n} más`}
            eventClassNames="cursor-pointer rounded-lg overflow-hidden shadow-sm"
            eventMouseEnter={(info) => {
              const ev = info.event.extendedProps;
              info.el.title = [
                info.event.title,
                ev.branch         ? `📍 ${ev.branch}` : "",
                ev.scheduled_time ? `🕐 ${String(ev.scheduled_time).slice(0, 5)}` : "",
                `Estado: ${ev.status}`,
              ].filter(Boolean).join("\n");
            }}
          />
        )}
      </GlassCard>

      {/* Modal: ver detalle */}
      {selectedEvent && (
        <EventDetailModal
          event={selectedEvent}
          users={users}
          types={types}
          onClose={() => setSelectedEvent(null)}
          onEdit={handleEdit}
          onComplete={handleComplete}
          onCancel={handleCancel}
          onReactivate={handleReactivate}
          onDelete={handleDelete}
          isReactivating={reactivateMut.isPending}
          isDeleting={deleteMut.isPending}
        />
      )}

      {/* Modal: crear */}
      {showCreate && (
        <CreateEventModal
          initialData={newEventDate ? { scheduled_date: newEventDate } : null}
          onClose={closeCreate}
          onSuccess={() => { invalidate(); closeCreate(); }}
        />
      )}

      {/* Modal: editar */}
      {editingEvent && (
        <CreateEventModal
          initialData={editingEvent}
          onClose={() => setEditingEvent(null)}
          onSuccess={() => { invalidate(); setEditingEvent(null); }}
          onComplete={handleComplete}
        />
      )}
    </div>
  );
}