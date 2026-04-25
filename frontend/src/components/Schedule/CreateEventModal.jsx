/**
 * CreateEventModal.jsx
 * Modal para crear / editar eventos del calendario.
 * Lote 2: campo "Auditor asignado" es SELECT de usuarios.
 */

import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { X, CalendarPlus, Loader2, AlertCircle } from "lucide-react";
import { scheduleService } from "../../services/schedule";
import { auditsService }   from "../../services/audits";
import { authService }     from "../../services/auth";
import { useAuth }         from "../../store/AuthContext";

const SUCURSALES = [
  "Oficina Principal",
  "Tienda Gurabo",
  "Tienda El Portal",
  "Tienda Tiradentes",
  "Tienda Rómulo",
  "Almacén Finca",
];

const PRIORIDADES = ["Alta", "Media", "Baja"];
const ESTADOS     = ["Pendiente", "Completada", "Cancelada"];

const EMPTY = {
  title:               "",
  audit_type_id:       "",
  branch:              "",
  scheduled_date:      new Date().toISOString().split("T")[0],
  scheduled_time:      "09:00",
  priority:            "Media",
  status:              "Pendiente",
  assigned_auditor_id: "",
};

export default function CreateEventModal({ onClose, onSuccess, initialData = null }) {
  const { user, isAdmin } = useAuth();
  const isEdit            = Boolean(initialData?.id);

  const [form,  setForm]  = useState(EMPTY);
  const [error, setError] = useState("");
  const [saving, setSave] = useState(false);

  // Poblar si es edición
  useEffect(() => {
    if (initialData) {
      setForm({
        title:               initialData.title               || "",
        audit_type_id:       initialData.audit_type_id       || "",
        branch:              initialData.branch               || "",
        scheduled_date:      initialData.scheduled_date       || EMPTY.scheduled_date,
        scheduled_time:      initialData.scheduled_time?.slice(0, 5) || "09:00",
        priority:            initialData.priority             || "Media",
        status:              initialData.status               || "Pendiente",
        assigned_auditor_id: initialData.assigned_auditor_id || "",
      });
    }
  }, [initialData]);

  // Tipos de auditoría
  const { data: types = [] } = useQuery({
    queryKey: ["audit-types"],
    queryFn:  auditsService.getTypes,
  });

  // Usuarios (solo para seleccionar auditor)
  const { data: users = [], isLoading: loadingUsers } = useQuery({
    queryKey: ["users"],
    queryFn:  authService.listUsers,
  });

  const set = (k, v) => setForm((p) => ({ ...p, [k]: v }));

  // Auto-título al seleccionar tipo + sucursal
  useEffect(() => {
    if (!form.title && form.audit_type_id && form.branch) {
      const t = types.find((t) => String(t.id) === String(form.audit_type_id));
      if (t) set("title", `Auditoría 5S – ${t.name} · ${form.branch}`);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.audit_type_id, form.branch]);

  const handleSubmit = async () => {
    if (!form.title.trim() || !form.scheduled_date) {
      setError("El título y la fecha son obligatorios.");
      return;
    }
    setSave(true);
    setError("");
    try {
      const payload = {
        ...form,
        audit_type_id:       form.audit_type_id       ? Number(form.audit_type_id)       : null,
        assigned_auditor_id: form.assigned_auditor_id ? Number(form.assigned_auditor_id) : null,
        scheduled_time:      form.scheduled_time ? `${form.scheduled_time}:00` : null,
      };
      if (isEdit) {
        await scheduleService.update(initialData.id, payload);
      } else {
        await scheduleService.create(payload);
      }
      onSuccess?.();
      onClose();
    } catch (e) {
      setError(e.response?.data?.detail || "Error al guardar el evento.");
    } finally {
      setSave(false);
    }
  };

  // Auditor seleccionado para mostrar info
  const auditorSeleccionado = users.find(
    (u) => String(u.id) === String(form.assigned_auditor_id)
  );

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: "rgba(10,20,40,0.45)", backdropFilter: "blur(6px)" }}
    >
      <div className="glass rounded-3xl p-6 w-full max-w-lg shadow-2xl animate-fade-up max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-2xl bg-primary/15 flex items-center justify-center">
              <CalendarPlus size={16} className="text-primary" />
            </div>
            <div>
              <h2 className="text-base font-semibold text-ink">
                {isEdit ? "Editar Evento" : "Nueva Auditoría Planificada"}
              </h2>
              <p className="text-xs text-ink/50">Agrega al calendario de planificación</p>
            </div>
          </div>
          <button onClick={onClose} className="btn-ghost p-1.5">
            <X size={16} />
          </button>
        </div>

        <div className="space-y-4">
          {/* Tipo de auditoría */}
          <div>
            <label className="field-label">Tipo de Auditoría</label>
            <select
              value={form.audit_type_id}
              onChange={(e) => set("audit_type_id", e.target.value)}
              className="input-glass text-sm"
            >
              <option value="">Sin tipo específico</option>
              {types.map((t) => (
                <option key={t.id} value={t.id}>{t.name}</option>
              ))}
            </select>
          </div>

          {/* Sucursal */}
          <div>
            <label className="field-label">Sucursal *</label>
            <select
              value={form.branch}
              onChange={(e) => set("branch", e.target.value)}
              className="input-glass text-sm"
            >
              <option value="">Selecciona una sucursal…</option>
              {SUCURSALES.map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          </div>

          {/* Título */}
          <div>
            <label className="field-label">Título del Evento *</label>
            <input
              type="text"
              placeholder="Ej: Auditoría 5S – Oficina Principal"
              value={form.title}
              onChange={(e) => set("title", e.target.value)}
              className="input-glass text-sm"
            />
          </div>

          {/* Fecha y hora */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="field-label">Fecha *</label>
              <input
                type="date"
                value={form.scheduled_date}
                onChange={(e) => set("scheduled_date", e.target.value)}
                className="input-glass text-sm"
              />
            </div>
            <div>
              <label className="field-label">Hora</label>
              <input
                type="time"
                value={form.scheduled_time}
                onChange={(e) => set("scheduled_time", e.target.value)}
                className="input-glass text-sm"
              />
            </div>
          </div>

          {/* Prioridad y estado */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="field-label">Prioridad</label>
              <select
                value={form.priority}
                onChange={(e) => set("priority", e.target.value)}
                className="input-glass text-sm"
              >
                {PRIORIDADES.map((p) => <option key={p} value={p}>{p}</option>)}
              </select>
            </div>
            <div>
              <label className="field-label">Estado</label>
              <select
                value={form.status}
                onChange={(e) => set("status", e.target.value)}
                className="input-glass text-sm"
              >
                {ESTADOS.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
          </div>

          {/* ── Auditor asignado (SELECT de usuarios) ── */}
          <div>
            <label className="field-label">Auditor Asignado</label>
            {loadingUsers ? (
              <div className="input-glass h-10 animate-pulse bg-ink/5" />
            ) : (
              <select
                value={form.assigned_auditor_id}
                onChange={(e) => set("assigned_auditor_id", e.target.value)}
                className="input-glass text-sm"
              >
                <option value="">Sin asignar</option>
                {users.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.full_name} — {u.email}
                  </option>
                ))}
              </select>
            )}
            {/* Confirmación visual del auditor seleccionado */}
            {auditorSeleccionado && (
              <div className="mt-1.5 flex items-center gap-2 text-xs text-ink/50 px-1">
                <div className="w-5 h-5 rounded-full bg-primary/20 flex items-center justify-center text-primary font-bold text-[10px]">
                  {auditorSeleccionado.full_name?.charAt(0)?.toUpperCase()}
                </div>
                <span>
                  {auditorSeleccionado.full_name}
                  <span className="ml-1 text-ink/30">·</span>
                  <span className={`ml-1 capitalize ${
                    auditorSeleccionado.role === "admin"
                      ? "text-primary" : "text-ink/50"
                  }`}>
                    {auditorSeleccionado.role}
                  </span>
                </span>
              </div>
            )}
          </div>
        </div>

        {/* Error */}
        {error && (
          <div className="flex items-center gap-2 bg-danger/10 border border-danger/20
                          text-danger text-xs rounded-xl px-3 py-2 mt-4">
            <AlertCircle size={13} /> {error}
          </div>
        )}

        {/* Acciones */}
        <div className="flex justify-end gap-3 mt-6">
          <button onClick={onClose} className="btn-secondary text-sm">
            Cancelar
          </button>
          <button
            onClick={handleSubmit}
            disabled={saving}
            className="btn-primary text-sm flex items-center gap-2 disabled:opacity-60"
          >
            {saving
              ? <><Loader2 size={14} className="animate-spin" /> Guardando…</>
              : isEdit ? "Guardar Cambios" : "Crear Evento"
            }
          </button>
        </div>
      </div>
    </div>
  );
}