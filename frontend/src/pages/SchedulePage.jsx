import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import FullCalendar from "@fullcalendar/react";
import dayGridPlugin from "@fullcalendar/daygrid";
import interactionPlugin from "@fullcalendar/interaction";
import esLocale from "@fullcalendar/core/locales/es";
import { Plus, X, Loader2, CheckCircle, XCircle } from "lucide-react";
import { scheduleService } from "../services/schedule";
import { auditsService } from "../services/audits";
import { useAuth } from "../store/AuthContext";
import Header from "../components/Layout/Header";
import GlassCard from "../components/Layout/GlassCard";
import { fmt } from "../utils/format";

export default function SchedulePage() {
  const { isAdmin, user } = useAuth();
  const qc = useQueryClient();
  const [currentMonth, setCurrentMonth]   = useState(() => {
    const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  });
  const [selectedEvent, setSelectedEvent] = useState(null);
  const [showCreate,    setShowCreate]    = useState(false);
  const [newEventDate,  setNewEventDate]  = useState("");

  const { data: calData, isLoading, refetch } = useQuery({
    queryKey: ["calendar", currentMonth],
    queryFn:  () => scheduleService.getCalendar(currentMonth),
  });
  const { data: types = [] } = useQuery({ queryKey: ["audit-types"], queryFn: auditsService.getTypes });

  const completeMut = useMutation({
    mutationFn: ({ id }) => scheduleService.complete(id, {}),
    onSuccess:  () => { qc.invalidateQueries(["calendar"]); setSelectedEvent(null); },
  });
  const cancelMut = useMutation({
    mutationFn: ({ id }) => scheduleService.cancel(id),
    onSuccess:  () => { qc.invalidateQueries(["calendar"]); setSelectedEvent(null); },
  });

  const fcEvents = (calData?.events || []).map((ev) => ({
    id:    String(ev.id),
    title: ev.title,
    start: ev.start,
    backgroundColor: ev.color,
    borderColor:     "transparent",
    extendedProps:   ev,
  }));

  return (
    <div className="min-h-screen relative z-10">
      <Header title="Calendario de Planificación" subtitle="Gestiona auditorías programadas" onRefresh={refetch} />

      {/* Stats rápidas */}
      {calData && (
        <div className="flex gap-4 mb-6 flex-wrap">
          {[
            { label: "Pendientes",  value: calData.pendientes,  color: "text-warning" },
            { label: "Completadas", value: calData.completadas, color: "text-success" },
            { label: "Canceladas",  value: calData.canceladas,  color: "text-ink/40" },
          ].map((s) => (
            <div key={s.label} className="glass px-5 py-3 rounded-2xl flex items-center gap-3">
              <span className={`text-2xl font-bold ${s.color}`}>{s.value}</span>
              <span className="text-xs text-ink/50 font-medium">{s.label}</span>
            </div>
          ))}
          {isAdmin && (
            <button onClick={() => setShowCreate(true)}
              className="btn-primary flex items-center gap-2 text-sm ml-auto">
              <Plus size={16} /> Nueva Auditoría
            </button>
          )}
        </div>
      )}

      {/* Calendario */}
      <GlassCard>
        {isLoading ? (
          <div className="flex items-center justify-center h-64">
            <Loader2 size={28} className="animate-spin text-primary/40" />
          </div>
        ) : (
          <FullCalendar
            plugins={[dayGridPlugin, interactionPlugin]}
            initialView="dayGridMonth"
            locale={esLocale}
            headerToolbar={{ left: "prev,next today", center: "title", right: "dayGridMonth" }}
            events={fcEvents}
            eventClick={(info) => setSelectedEvent(info.event.extendedProps)}
            dateClick={(info) => { if (isAdmin) { setNewEventDate(info.dateStr); setShowCreate(true); } }}
            datesSet={(info) => {
              const d = info.start; d.setDate(15);
              setCurrentMonth(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
            }}
            height={520}
            eventDisplay="block"
          />
        )}
      </GlassCard>

      {/* Modal detalle evento */}
      {selectedEvent && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-ink/30 backdrop-blur-sm" onClick={() => setSelectedEvent(null)} />
          <div className="glass rounded-3xl p-6 w-full max-w-sm relative animate-fade-up shadow-glass-hover">
            <button onClick={() => setSelectedEvent(null)} className="absolute top-4 right-4 btn-ghost p-1.5"><X size={16} /></button>

            {/* Badge prioridad */}
            <div className="flex items-center gap-2 mb-3">
              <span className={`text-xs font-semibold px-2 py-0.5 rounded-full border ${
                selectedEvent.priority === "Alta"  ? "bg-danger/10 text-danger border-danger/20" :
                selectedEvent.priority === "Media" ? "bg-warning/10 text-warning border-warning/20" :
                                                     "bg-success/10 text-success border-success/20"
              }`}>
                {selectedEvent.priority}
              </span>
              <span className={`text-xs font-semibold px-2 py-0.5 rounded-full border ${
                selectedEvent.status === "Completada" ? "bg-success/10 text-success border-success/20" :
                selectedEvent.status === "Cancelada"  ? "bg-ink/10 text-ink/50 border-ink/10" :
                                                        "bg-primary/10 text-primary border-primary/20"
              }`}>
                {selectedEvent.status}
              </span>
            </div>

            <h3 className="text-lg font-semibold text-ink mb-1">{selectedEvent.title}</h3>
            <p className="text-sm text-ink/50 mb-4">
              {selectedEvent.branch} · {selectedEvent.audit_type}
            </p>
            <div className="bg-ink/5 rounded-xl px-4 py-3 mb-5">
              <p className="text-xs text-ink/50 mb-0.5">Fecha programada</p>
              <p className="text-sm font-semibold text-ink">{fmt.date(selectedEvent.start)}</p>
              {selectedEvent.is_overdue && (
                <p className="text-xs text-danger mt-1">⚠️ Vencida hace {Math.abs(selectedEvent.days_until)} días</p>
              )}
            </div>

            {selectedEvent.status === "Pendiente" && (
              <div className="flex gap-2">
                <button
                  onClick={() => completeMut.mutate({ id: parseInt(selectedEvent.id || selectedEvent.id) })}
                  disabled={completeMut.isPending}
                  className="btn-primary flex-1 flex items-center justify-center gap-2 text-sm"
                >
                  {completeMut.isPending ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle size={14} />}
                  Completar
                </button>
                <button
                  onClick={() => cancelMut.mutate({ id: parseInt(selectedEvent.id || selectedEvent.id) })}
                  disabled={cancelMut.isPending}
                  className="btn-danger flex-1 flex items-center justify-center gap-2 text-sm"
                >
                  <XCircle size={14} />
                  Cancelar
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Create event modal (simplificado) */}
      {showCreate && (
        <CreateEventModal
          types={types}
          defaultDate={newEventDate}
          onClose={() => { setShowCreate(false); setNewEventDate(""); }}
          onSuccess={() => { qc.invalidateQueries(["calendar"]); setShowCreate(false); setNewEventDate(""); }}
        />
      )}
    </div>
  );
}

function CreateEventModal({ types, defaultDate, onClose, onSuccess }) {
  const { user }    = useAuth();
  const [form, set] = useState({ title: "", audit_type_id: types[0]?.id || "", branch: "", scheduled_date: defaultDate, priority: "Media" });
  const [loading, setL] = useState(false);
  const [error, setE]   = useState("");

  const setField = (k, v) => set((p) => ({ ...p, [k]: v }));

  const handleSubmit = async (e) => {
    e.preventDefault(); setL(true); setE("");
    try {
      await scheduleService.create({ ...form, audit_type_id: Number(form.audit_type_id) });
      onSuccess();
    } catch (err) {
      setE(err.response?.data?.detail || "Error al crear el evento.");
    } finally { setL(false); }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-ink/30 backdrop-blur-sm" onClick={onClose} />
      <div className="glass rounded-3xl p-6 w-full max-w-sm relative animate-fade-up shadow-glass-hover">
        <button onClick={onClose} className="absolute top-4 right-4 btn-ghost p-1.5"><X size={16} /></button>
        <h2 className="text-lg font-semibold text-ink mb-5">Nueva Auditoría Planificada</h2>

        <form onSubmit={handleSubmit} className="space-y-4">
          {[
            { label: "Título", key: "title", type: "text", placeholder: "Auditoría 5S – Almacén..." },
            { label: "Sucursal", key: "branch", type: "text", placeholder: "Oficina Principal" },
            { label: "Fecha", key: "scheduled_date", type: "date" },
          ].map(({ label, key, type, placeholder }) => (
            <div key={key}>
              <label className="text-xs font-semibold text-ink/60 uppercase tracking-wide mb-1.5 block">{label}</label>
              <input type={type} required value={form[key]} placeholder={placeholder}
                onChange={(e) => setField(key, e.target.value)} className="input-glass text-sm" />
            </div>
          ))}

          <div>
            <label className="text-xs font-semibold text-ink/60 uppercase tracking-wide mb-1.5 block">Tipo</label>
            <select value={form.audit_type_id} onChange={(e) => setField("audit_type_id", e.target.value)} className="input-glass text-sm">
              {types.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
          </div>

          <div>
            <label className="text-xs font-semibold text-ink/60 uppercase tracking-wide mb-1.5 block">Prioridad</label>
            <select value={form.priority} onChange={(e) => setField("priority", e.target.value)} className="input-glass text-sm">
              {["Alta", "Media", "Baja"].map((p) => <option key={p} value={p}>{p}</option>)}
            </select>
          </div>

          {error && <div className="bg-danger/10 border border-danger/20 text-danger text-xs rounded-xl px-3 py-2">{error}</div>}

          <div className="flex gap-3 justify-end pt-1">
            <button type="button" onClick={onClose} className="btn-secondary text-sm">Cancelar</button>
            <button type="submit" disabled={loading} className="btn-primary flex items-center gap-2 text-sm">
              {loading && <Loader2 size={14} className="animate-spin" />}
              {loading ? "Guardando..." : "Guardar"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}