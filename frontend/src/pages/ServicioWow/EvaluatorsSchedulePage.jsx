/**
 * EvaluatorsSchedulePage.jsx — Cronograma y evaluadores del Servicio WOW 2026.
 *
 * VISTAS:
 *   Cronograma   → una fila por lista de evaluación, con avance de respuestas (admin puede ajustar fechas)
 *   Asignaciones → quién evalúa qué lista, titular/suplente, pendiente/completo.
 *                  Con una lista elegida: quiénes faltan por responder (copiar nombres),
 *                  agregar evaluadores a una lista ya enviada y marcar/quitar a mano (admin)
 *   Resumen      → replica la hoja Resumen_Muestra (calculado en el backend)
 *   Matriz       → replica la hoja Matriz_Participacion (calculado en el backend)
 *   Sorteo       → motor de asignar_evaluadores_wow.py dentro de la app (vista previa → confirmar)
 *   Configuración→ parámetros, personas excluidas y reglas de no repetición
 *
 * El sorteo necesita el listado de personal ("Importar listado") y los nominados de
 * cada formulario (se cargan desde Formularios). El Excel del script sigue pudiéndose
 * importar ("Importar Excel").
 */

import { useState } from "react";
import { createPortal } from "react-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Upload, Loader2, Pencil, Lock, CalendarDays, Users, ClipboardList, Grid3x3,
  ChevronLeft, ChevronRight, Filter, X, Search, AlertTriangle, Shuffle, Settings2, Users2,
  UserPlus, Copy, Check, Trash2,
} from "lucide-react";
import { evaluatorsService } from "../../services/evaluators";
import { useFilters } from "../../hooks/useFilters";
import { useAuth } from "../../store/AuthContext";
import Header from "../../components/Layout/Header";
import GlassCard from "../../components/Layout/GlassCard";
import WowImportModal from "../../components/ServicioWow/WowImportModal";
import SorteoPanel from "../../components/ServicioWow/SorteoPanel";
import SamplingConfigPanel from "../../components/ServicioWow/SamplingConfigPanel";
import AddEvaluatorsModal from "../../components/ServicioWow/AddEvaluatorsModal";
import ConfirmModal from "../../components/Common/ConfirmModal";
import { fmtShortDate, paginator } from "../../components/ServicioWow/wowUtils";
import { fmt } from "../../utils/format";

const VISTAS = [
  { id: "cronograma",   label: "Cronograma",   icon: CalendarDays  },
  { id: "asignaciones", label: "Asignaciones", icon: Users         },
  { id: "resumen",      label: "Resumen de muestra", icon: ClipboardList },
  { id: "matriz",       label: "Matriz de participación", icon: Grid3x3 },
  { id: "sorteo",       label: "Sorteo",        icon: Shuffle   },
  { id: "config",       label: "Configuración", icon: Settings2 },
];
// Vistas que no dependen de que ya exista un cronograma importado
const VISTAS_SIN_CRONOGRAMA = ["config"];

const PAGE_SIZE = 50;

function Th({ children, className = "" }) {
  return (
    <th className={`text-left py-3.5 px-4 text-xs font-semibold text-ink/50 uppercase tracking-wide whitespace-nowrap ${className}`}>
      {children}
    </th>
  );
}

function Loading() {
  return (
    <div className="flex items-center justify-center h-48">
      <Loader2 size={28} className="animate-spin text-primary/40" />
    </div>
  );
}

function EmptyState({ isAdmin }) {
  return (
    <div className="flex flex-col items-center justify-center h-48 gap-2 text-ink/30">
      <p className="text-sm">Aún no se ha importado el Excel de Evaluadores.</p>
      {isAdmin && <p className="text-xs">Usa el botón “Importar Excel”.</p>}
    </div>
  );
}

function Progress({ value, total }) {
  const pct = total ? Math.min(100, (value / total) * 100) : 0;
  return (
    <div className="flex items-center gap-2 min-w-[110px]">
      <div className="flex-1 h-1.5 rounded-full bg-ink/5 overflow-hidden">
        <div className="h-full rounded-full bg-success" style={{ width: `${pct}%` }} />
      </div>
      <span className="text-xs text-ink/60 w-12 text-right">{value}/{total}</span>
    </div>
  );
}

// ─── Modal de edición de una lista del cronograma ─────────────────────────────
function EditEntryModal({ entry, onClose }) {
  const qc = useQueryClient();
  const [form, setForm] = useState({
    send_date:            entry.send_date || "",
    tabulation_date:      entry.tabulation_date || "",
    disclosure_date:      entry.disclosure_date || "",
    report_delivery_date: entry.report_delivery_date || "",
    internal_sample_size: entry.internal_sample_size ?? "",
    is_closed:            entry.is_closed,
  });
  const [error, setError] = useState("");

  const mut = useMutation({
    mutationFn: (payload) => evaluatorsService.updateScheduleEntry(entry.id, payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["wow-evaluators"] });
      onClose();
    },
    onError: (e) => {
      const d = e.response?.data?.detail;
      setError(typeof d === "string" ? d : d?.[0]?.msg?.replace("Value error, ", "") || "No se pudo guardar.");
    },
  });

  const save = () => {
    setError("");
    mut.mutate({
      send_date:            form.send_date || null,
      tabulation_date:      form.tabulation_date || null,
      disclosure_date:      form.disclosure_date || null,
      report_delivery_date: form.report_delivery_date || null,
      internal_sample_size: form.internal_sample_size === "" ? null : Number(form.internal_sample_size),
      is_closed:            form.is_closed,
    });
  };

  const field = (key, label, type = "date") => (
    <label className="block">
      <span className="text-xs font-medium text-ink/60">{label}</span>
      <input
        type={type}
        min={type === "number" ? 0 : undefined}
        value={form[key]}
        onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))}
        className="input-glass text-sm py-1.5 px-3 w-full mt-1"
      />
    </label>
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-ink/30 backdrop-blur-sm" onClick={onClose} />
      <div className="glass rounded-3xl p-6 w-full max-w-md relative animate-fade-up">
        <button onClick={onClose} className="absolute top-4 right-4 btn-ghost p-1.5"><X size={16} /></button>
        <h3 className="text-base font-semibold text-ink mb-0.5">Ajustar cronograma</h3>
        <p className="text-xs text-ink/50 mb-5">{entry.list_name}</p>

        <div className="grid grid-cols-2 gap-3 mb-4">
          {field("send_date", "Envío de encuesta")}
          {field("tabulation_date", "Tabulación")}
          {field("disclosure_date", "Divulgación")}
          {field("report_delivery_date", "Entrega informe")}
          {field("internal_sample_size", "Muestra requerida", "number")}
        </div>

        <label className="flex items-start gap-2.5 cursor-pointer mb-5 select-none">
          <input
            type="checkbox"
            checked={form.is_closed}
            onChange={(e) => setForm((f) => ({ ...f, is_closed: e.target.checked }))}
            className="w-4 h-4 mt-0.5 accent-primary rounded shrink-0"
          />
          <div>
            <p className="text-sm text-ink/80 font-medium">Encuesta cerrada</p>
            <p className="text-xs text-ink/40 mt-0.5 leading-snug">
              La lista ya no se vuelve a sortear (equivale a ENCUESTAS_CERRADAS del script).
            </p>
          </div>
        </label>

        {error && (
          <p className="text-xs text-danger bg-danger/10 border border-danger/20 rounded-xl px-3 py-2 mb-4">{error}</p>
        )}

        <div className="flex justify-end gap-3">
          <button onClick={onClose} className="btn-secondary text-sm">Cancelar</button>
          <button onClick={save} disabled={mut.isPending} className="btn-primary text-sm flex items-center gap-2 disabled:opacity-50">
            {mut.isPending && <Loader2 size={14} className="animate-spin" />} Guardar
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Cronograma ───────────────────────────────────────────────────────────────
function VistaCronograma({ schedule, isAdmin, onEdit, onOpenList }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm min-w-[860px]">
        <thead>
          <tr className="border-b border-ink/10">
            <Th>No.</Th><Th>Lista</Th><Th>Envío</Th><Th>Tabulación</Th><Th>Divulgación</Th>
            <Th>Muestra</Th><Th>Tit.</Th><Th>Sup.</Th><Th>Respondieron</Th><Th></Th>
          </tr>
        </thead>
        <tbody className="divide-y divide-ink/5">
          {schedule.map((e) => (
            <tr key={e.id} className="hover:bg-primary/[0.03] transition-colors group">
              <td className="py-3 px-4 text-ink/40">{e.schedule_number ?? "—"}</td>
              <td className="py-3 px-4">
                <button onClick={() => onOpenList(e.id)} className="text-left">
                  <p className="font-medium text-ink hover:text-primary transition-colors flex items-center gap-1.5">
                    {e.list_name}
                    {e.is_closed && <Lock size={12} className="text-ink/40" title="Encuesta cerrada" />}
                  </p>
                  <p className="text-xs text-ink/40 max-w-[220px] truncate" title={e.evaluator_areas_raw || ""}>
                    {e.evaluator_areas_raw || "—"}
                  </p>
                </button>
              </td>
              <td className="py-3 px-4 text-ink/70 whitespace-nowrap">{fmtShortDate(e.send_date)}</td>
              <td className="py-3 px-4 text-ink/60 whitespace-nowrap">{fmtShortDate(e.tabulation_date)}</td>
              <td className="py-3 px-4 text-ink/60 whitespace-nowrap">{fmtShortDate(e.disclosure_date)}</td>
              <td className="py-3 px-4 text-ink/60 whitespace-nowrap" title={e.internal_sample_raw || ""}>
                {e.internal_sample_size ?? "—"}
              </td>
              <td className={`py-3 px-4 font-medium ${e.internal_sample_size && e.titulares < e.internal_sample_size ? "text-danger" : "text-ink"}`}>
                {e.titulares}
              </td>
              <td className="py-3 px-4 text-ink/60">{e.suplentes}</td>
              <td className="py-3 px-4"><Progress value={e.completados} total={e.titulares} /></td>
              <td className="py-3 px-4">
                {isAdmin && (
                  <button onClick={() => onEdit(e)} className="btn-ghost p-1.5 opacity-60 group-hover:opacity-100 hover:bg-primary/10" title="Ajustar fechas">
                    <Pencil size={15} />
                  </button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ─── Seguimiento de una lista: quiénes faltan por responder ──────────────────
function SeguimientoLista({ entry, isAdmin, onVerFaltantes, onAgregar }) {
  const [copiado, setCopiado] = useState(null);
  const faltan = Math.max(0, entry.titulares - entry.completados);

  const copiarFaltantes = async () => {
    const r = await evaluatorsService.getAssignments({
      schedule_entry_id: entry.id, status: "pendiente", role: "titular", page_size: 200,
    });
    const nombres = r.items.map((a) => a.employee_name);
    await navigator.clipboard.writeText(nombres.join("\n"));
    setCopiado(nombres.length);
    setTimeout(() => setCopiado(null), 2500);
  };

  return (
    <div className="px-4 py-3 flex flex-wrap items-center gap-x-5 gap-y-2 border-b border-ink/10 bg-primary/[0.03]">
      <div className="min-w-[220px]">
        <p className="text-sm font-semibold text-ink flex items-center gap-1.5">
          {entry.list_name}
          {entry.is_closed && <Lock size={12} className="text-ink/40" title="Encuesta cerrada" />}
        </p>
        <p className="text-xs text-ink/50">
          {entry.completados} de {entry.titulares} titulares respondieron ·{" "}
          <span className={faltan ? "text-warning font-semibold" : "text-success font-semibold"}>
            {faltan ? `faltan ${faltan}` : "respondieron todos"}
          </span>
        </p>
      </div>
      <div className="w-40"><Progress value={entry.completados} total={entry.titulares} /></div>
      <div className="flex items-center gap-2 ml-auto">
        {faltan > 0 && (
          <>
            <button onClick={onVerFaltantes} className="btn-ghost text-xs flex items-center gap-1.5">
              <Filter size={13} /> Ver solo faltantes
            </button>
            <button onClick={copiarFaltantes} className="btn-secondary text-xs flex items-center gap-1.5"
                    title="Copia los nombres de quienes faltan, uno por línea">
              {copiado != null ? <><Check size={13} className="text-success" /> {copiado} copiados</> : <><Copy size={13} /> Copiar faltantes</>}
            </button>
          </>
        )}
        {isAdmin && (
          <button onClick={onAgregar} className="btn-primary text-xs flex items-center gap-1.5">
            <UserPlus size={13} /> Agregar evaluadores
          </button>
        )}
      </div>
    </div>
  );
}

// ─── Asignaciones ─────────────────────────────────────────────────────────────
function VistaAsignaciones({ schedule, initialEntryId, isAdmin }) {
  const DEFAULTS = { page: 1, page_size: PAGE_SIZE };
  const { filters, activeFilters, setFilter, resetFilters } = useFilters(
    initialEntryId ? { ...DEFAULTS, schedule_entry_id: initialEntryId } : DEFAULTS, DEFAULTS,
  );
  const setAndReset = (k, v) => { setFilter(k, v); setFilter("page", 1); };
  const qc = useQueryClient();
  const [agregar, setAgregar] = useState(false);
  const [quitar,  setQuitar]  = useState(null);
  const [accionError, setAccionError] = useState("");
  const entry = schedule.find((e) => e.id === filters.schedule_entry_id);

  const onAccionError = (e) => {
    const d = e.response?.data?.detail;
    setAccionError(typeof d === "string" ? d : "No se pudo completar la acción.");
  };
  const estadoMut = useMutation({
    mutationFn: ({ id, status }) => evaluatorsService.setAssignmentStatus(id, status),
    onSuccess:  () => { setAccionError(""); qc.invalidateQueries({ queryKey: ["wow-evaluators"] }); },
    onError:    onAccionError,
  });
  const quitarMut = useMutation({
    mutationFn: (id) => evaluatorsService.deleteAssignment(id),
    onSuccess:  () => { setAccionError(""); setQuitar(null); qc.invalidateQueries({ queryKey: ["wow-evaluators"] }); },
    onError:    (e) => { setQuitar(null); onAccionError(e); },
  });

  const { data, isLoading, isFetching } = useQuery({
    queryKey: ["wow-evaluators", "assignments", activeFilters],
    queryFn:  () => evaluatorsService.getAssignments(activeFilters),
    keepPreviousData: true,
  });

  const items = data?.items || [];
  const total = data?.total || 0;
  const currentPage = data?.page || 1;
  const totalPages = data?.total_pages || 1;
  const filtersActive = !!(filters.schedule_entry_id || filters.status || filters.role || filters.search);

  return (
    <>
      {entry && (
        <SeguimientoLista
          entry={entry}
          isAdmin={isAdmin}
          onVerFaltantes={() => { setAndReset("status", "pendiente"); setAndReset("role", "titular"); }}
          onAgregar={() => setAgregar(true)}
        />
      )}
      <div className="px-4 py-3 flex flex-wrap items-center gap-3 border-b border-ink/10">
        <Filter size={15} className="text-primary/60" />
        <select
          value={filters.schedule_entry_id || ""}
          onChange={(e) => setAndReset("schedule_entry_id", e.target.value ? Number(e.target.value) : undefined)}
          className="input-glass text-sm py-1.5 px-3 w-auto max-w-[280px]"
        >
          <option value="">Todas las listas</option>
          {schedule.map((e) => <option key={e.id} value={e.id}>{e.list_name}</option>)}
        </select>
        <select value={filters.status || ""} onChange={(e) => setAndReset("status", e.target.value)} className="input-glass text-sm py-1.5 px-3 w-auto">
          <option value="">Pendiente y completo</option>
          <option value="pendiente">Pendiente (faltan)</option>
          <option value="completo">Completo</option>
        </select>
        <select value={filters.role || ""} onChange={(e) => setAndReset("role", e.target.value)} className="input-glass text-sm py-1.5 px-3 w-auto">
          <option value="">Titular y suplente</option>
          <option value="titular">Titular</option>
          <option value="suplente">Suplente</option>
        </select>
        <div className="relative">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink/30" />
          <input
            value={filters.search || ""}
            onChange={(e) => setAndReset("search", e.target.value)}
            placeholder="Buscar colaborador…"
            className="input-glass text-sm py-1.5 pl-8 pr-3 w-52"
          />
        </div>
        {isFetching && !isLoading && <Loader2 size={14} className="animate-spin text-primary/40" />}
        <span className="text-xs text-ink/40 ml-auto">{total} asignaciones</span>
        {filtersActive && (
          <button onClick={resetFilters} className="btn-ghost flex items-center gap-1.5 text-xs text-secondary">
            <X size={13} /> Limpiar
          </button>
        )}
      </div>

      {accionError && (
        <p className="text-xs text-danger bg-danger/10 border-b border-danger/20 px-4 py-2">{accionError}</p>
      )}

      {isLoading ? <Loading /> : items.length === 0 ? (
        <div className="flex items-center justify-center h-40 text-sm text-ink/30">Sin asignaciones para estos filtros.</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[820px]">
            <thead>
              <tr className="border-b border-ink/10">
                <Th>Lista</Th><Th>Colaborador</Th><Th>Puesto</Th><Th>Ubicación</Th><Th>Área evaluadora</Th><Th>Rol</Th><Th>Estado</Th>
                {isAdmin && <Th />}
              </tr>
            </thead>
            <tbody className="divide-y divide-ink/5">
              {items.map((a) => (
                <tr key={a.id} className="hover:bg-primary/[0.03] transition-colors group">
                  <td className="py-2.5 px-4 text-ink/60">{a.list_name}</td>
                  <td className="py-2.5 px-4 font-medium text-ink">{a.employee_name}</td>
                  <td className="py-2.5 px-4 text-ink/60 max-w-[170px] truncate" title={a.position || ""}>{a.position || "—"}</td>
                  <td className="py-2.5 px-4 text-ink/60 whitespace-nowrap">{a.location || "—"}</td>
                  <td className="py-2.5 px-4 text-ink/60 whitespace-nowrap">{a.evaluator_area || "—"}</td>
                  <td className="py-2.5 px-4">
                    <span className={`text-xs font-semibold px-2 py-0.5 rounded-lg ${
                      a.role === "titular" ? "bg-primary/10 text-primary" : "bg-ink/5 text-ink/50"
                    }`}>
                      {a.role === "titular" ? "Titular" : "Suplente"}
                    </span>
                  </td>
                  <td className="py-2.5 px-4">
                    <span className={`text-xs font-semibold px-2 py-0.5 rounded-lg ${
                      a.status === "completo" ? "bg-success/15 text-success" : "bg-warning/15 text-warning"
                    }`}>
                      {a.status === "completo" ? "Completo" : "Pendiente"}
                    </span>
                  </td>
                  {isAdmin && (
                    <td className="py-2.5 px-4 whitespace-nowrap text-right">
                      <button
                        onClick={() => estadoMut.mutate({ id: a.id, status: a.status === "completo" ? "pendiente" : "completo" })}
                        disabled={estadoMut.isPending}
                        className="btn-ghost p-1.5 opacity-50 group-hover:opacity-100 hover:bg-primary/10"
                        title={a.status === "completo" ? "Marcar como pendiente" : "Marcar que ya respondió (si el import no lo asoció)"}
                      >
                        <Check size={15} className={a.status === "completo" ? "text-success" : ""} />
                      </button>
                      {a.status !== "completo" && (
                        <button onClick={() => setQuitar(a)} className="btn-ghost p-1.5 opacity-50 group-hover:opacity-100 hover:bg-danger/10 hover:text-danger"
                                title="Quitar de la lista">
                          <Trash2 size={15} />
                        </button>
                      )}
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {totalPages > 1 && (
        <div className="flex items-center justify-end gap-1 px-4 py-3 border-t border-ink/10">
          <button disabled={!data?.has_prev} onClick={() => setFilter("page", currentPage - 1)}
            className="w-8 h-8 flex items-center justify-center rounded-lg glass text-ink/60 hover:text-ink disabled:opacity-30">
            <ChevronLeft size={14} />
          </button>
          {paginator(currentPage, totalPages).map((p, i) =>
            p === "..." ? <span key={`e${i}`} className="w-8 text-center text-xs text-ink/30">…</span> : (
              <button key={p} onClick={() => setFilter("page", p)}
                className={`w-8 h-8 rounded-lg text-xs font-medium ${p === currentPage ? "bg-primary text-white" : "glass text-ink/60 hover:text-ink"}`}>
                {p}
              </button>
            )
          )}
          <button disabled={!data?.has_next} onClick={() => setFilter("page", currentPage + 1)}
            className="w-8 h-8 flex items-center justify-center rounded-lg glass text-ink/60 hover:text-ink disabled:opacity-30">
            <ChevronRight size={14} />
          </button>
        </div>
      )}

      {/* Portal: dentro de la GlassCard (backdrop-filter) un `fixed` quedaría anclado a la tarjeta */}
      {createPortal(
        <>
          {agregar && entry && <AddEvaluatorsModal entry={entry} onClose={() => setAgregar(false)} />}
          <ConfirmModal
            open={!!quitar}
            title="Quitar de la lista"
            message={quitar ? `¿Quitar a ${quitar.employee_name} de ${quitar.list_name}? No ha respondido todavía.` : ""}
            confirmLabel={quitarMut.isPending ? "Quitando…" : "Quitar"}
            onConfirm={() => quitarMut.mutate(quitar.id)}
            onCancel={() => setQuitar(null)}
          />
        </>,
        document.body,
      )}
    </>
  );
}

// ─── Resumen de muestra ───────────────────────────────────────────────────────
function VistaResumen() {
  const { data, isLoading } = useQuery({
    queryKey: ["wow-evaluators", "sample-summary"],
    queryFn:  () => evaluatorsService.getSampleSummary(),
  });
  if (isLoading) return <Loading />;
  if (!data?.filas.length) return <EmptyState />;

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm min-w-[900px]">
        <thead>
          <tr className="border-b border-ink/10">
            <Th>Lista</Th><Th>Muestra requerida</Th><Th>Titulares</Th><Th>Suplentes</Th>
            <Th>Respondieron</Th><Th>% respuesta</Th><Th>Áreas representadas</Th>
          </tr>
        </thead>
        <tbody className="divide-y divide-ink/5">
          {data.filas.map((f) => (
            <tr key={f.schedule_entry_id} className={f.alerta ? "bg-danger/5" : ""}>
              <td className="py-2.5 px-4 font-medium text-ink whitespace-nowrap">
                <span className="flex items-center gap-1.5">
                  {f.alerta && <AlertTriangle size={13} className="text-danger" title="Titulares por debajo de la muestra requerida" />}
                  {f.list_name}
                </span>
              </td>
              <td className="py-2.5 px-4 text-ink/70">{f.muestra_requerida ?? "—"}</td>
              <td className={`py-2.5 px-4 font-medium ${f.alerta ? "text-danger" : "text-ink"}`}>{f.titulares}</td>
              <td className="py-2.5 px-4 text-ink/60">{f.suplentes}</td>
              <td className="py-2.5 px-4 text-ink/70">{f.respondieron}</td>
              <td className="py-2.5 px-4 text-ink/70">{f.pct_respuesta == null ? "—" : fmt.score01(f.pct_respuesta, 0)}</td>
              <td className="py-2.5 px-4 text-xs text-ink/50 max-w-[240px] truncate" title={f.areas_representadas.join(", ")}>
                {f.areas_representadas.join(", ") || "—"}
              </td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr className="border-t border-ink/15 font-semibold text-ink">
            <td className="py-3 px-4">Total</td>
            <td className="py-3 px-4">{data.total_requerida}</td>
            <td className="py-3 px-4">{data.total_titulares}</td>
            <td className="py-3 px-4">{data.total_suplentes}</td>
            <td className="py-3 px-4">{data.total_respondieron}</td>
            <td className="py-3 px-4">
              {data.total_titulares ? fmt.score01(data.total_respondieron / data.total_titulares, 0) : "—"}
            </td>
            <td />
          </tr>
        </tfoot>
      </table>
    </div>
  );
}

// ─── Matriz de participación ──────────────────────────────────────────────────
function VistaMatriz() {
  const [search, setSearch] = useState("");
  const { data, isLoading } = useQuery({
    queryKey: ["wow-evaluators", "participation-matrix"],
    queryFn:  () => evaluatorsService.getParticipationMatrix(),
  });
  if (isLoading) return <Loading />;
  if (!data?.filas.length) return <EmptyState />;

  const q = search.trim().toLowerCase();
  const filas = q ? data.filas.filter((f) => [f.colaborador, f.area, f.ubicacion].some((v) => v?.toLowerCase().includes(q))) : data.filas;
  const altas = data.filas.filter((f) => f.carga_alta).length;

  return (
    <>
      <div className="px-4 py-3 flex flex-wrap items-center gap-3 border-b border-ink/10">
        <div className="relative">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink/30" />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar colaborador, área o ubicación…" className="input-glass text-sm py-1.5 pl-8 pr-3 w-72" />
        </div>
        <span className="text-xs text-ink/50 ml-auto">
          {data.filas.length} colaboradores · <span className="text-danger font-medium">{altas} con carga alta</span> (más de {data.carga_alerta} como titular) · “S” = suplente
        </span>
      </div>
      <div className="overflow-auto max-h-[65vh]">
        <table className="text-xs border-separate border-spacing-0">
          <thead className="sticky top-0 z-10">
            <tr>
              <th className="sticky left-0 z-20 bg-surface text-left py-3 px-4 font-semibold text-ink/50 uppercase tracking-wide border-b border-ink/10 min-w-[220px]">Colaborador</th>
              <th className="bg-surface text-left py-3 px-3 font-semibold text-ink/50 uppercase tracking-wide border-b border-ink/10">Área</th>
              {data.columnas.map((c) => (
                <th key={c} className="bg-surface py-3 px-2 font-semibold text-ink/50 border-b border-ink/10 whitespace-nowrap text-center">{c}</th>
              ))}
              <th className="bg-surface py-3 px-3 font-semibold text-ink/50 uppercase border-b border-ink/10 text-center">Tit.</th>
              <th className="bg-surface py-3 px-3 font-semibold text-ink/50 uppercase border-b border-ink/10 text-center">Sup.</th>
            </tr>
          </thead>
          <tbody>
            {filas.map((f) => (
              <tr key={f.employee_id} className="hover:bg-primary/[0.03]">
                <td className="sticky left-0 bg-surface py-2 px-4 font-medium text-ink whitespace-nowrap border-b border-ink/5">{f.colaborador}</td>
                <td className="py-2 px-3 text-ink/50 whitespace-nowrap border-b border-ink/5">{f.area || "—"}{f.ubicacion ? ` · ${f.ubicacion}` : ""}</td>
                {data.columnas.map((c) => {
                  const cell = f.celdas[c];
                  return (
                    <td key={c} className="py-2 px-2 text-center border-b border-ink/5">
                      {cell ? (
                        <span className={cell.titular ? "font-semibold text-primary" : "text-ink/40"}>
                          {cell.titular || ""}{cell.suplente ? `${cell.titular ? "+" : ""}${cell.suplente}S` : ""}
                        </span>
                      ) : ""}
                    </td>
                  );
                })}
                <td className={`py-2 px-3 text-center font-semibold border-b border-ink/5 ${f.carga_alta ? "bg-danger/15 text-danger" : "text-ink"}`}>{f.total_titular}</td>
                <td className="py-2 px-3 text-center text-ink/50 border-b border-ink/5">{f.total_suplente}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

// ─── Página ───────────────────────────────────────────────────────────────────
export default function EvaluatorsSchedulePage() {
  const { isAdmin } = useAuth();
  const qc = useQueryClient();
  const [vista,      setVista]      = useState("cronograma");
  const [showImport, setShowImport] = useState(false);
  const [showRoster, setShowRoster] = useState(false);
  const [editEntry,  setEditEntry]  = useState(null);
  const [listFilter, setListFilter] = useState(null);

  const { data: schedule = [], isLoading, refetch } = useQuery({
    queryKey: ["wow-evaluators", "schedule"],
    queryFn:  () => evaluatorsService.getSchedule(),
  });

  const totalTit  = schedule.reduce((a, e) => a + e.titulares, 0);
  const totalComp = schedule.reduce((a, e) => a + e.completados, 0);

  const openList = (entryId) => { setListFilter(entryId); setVista("asignaciones"); };

  return (
    <div className="min-h-screen relative z-10">
      <Header
        title="Evaluadores — Servicio WOW 2026"
        subtitle={schedule.length
          ? `${schedule.length} listas · ${totalComp} de ${totalTit} titulares han respondido`
          : "Sin cronograma importado"}
        onRefresh={() => { refetch(); qc.invalidateQueries({ queryKey: ["wow-evaluators"] }); }}
      />

      <div className="flex flex-wrap items-center gap-2 mb-6">
        {VISTAS.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            onClick={() => { setVista(id); if (id !== "asignaciones") setListFilter(null); }}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-all duration-200 border ${
              vista === id
                ? "bg-primary text-white border-primary shadow-sm"
                : "glass text-ink/60 border-transparent hover:text-ink hover:border-white/50"
            }`}
          >
            <Icon size={14} /> {label}
          </button>
        ))}
        {isAdmin && (
          <div className="flex items-center gap-2 ml-auto">
            <button onClick={() => setShowRoster(true)} className="btn-secondary flex items-center gap-2 text-sm"
                    title="LISTADO_DE_PERSONAL_2026.xlsx — lo usa el sorteo">
              <Users2 size={15} /> Importar listado
            </button>
            <button onClick={() => setShowImport(true)} className="btn-secondary flex items-center gap-2 text-sm"
                    title="Servicio_WOW_2026_Evaluadores.xlsx (cronograma y listas)">
              <Upload size={15} /> Importar Excel
            </button>
          </div>
        )}
      </div>

      <GlassCard padding={false} hover={false} className="relative">
        {isLoading ? <Loading /> : !schedule.length && !VISTAS_SIN_CRONOGRAMA.includes(vista) ? <EmptyState isAdmin={isAdmin} /> : (
          <>
            {vista === "cronograma" && (
              <VistaCronograma schedule={schedule} isAdmin={isAdmin} onEdit={setEditEntry} onOpenList={openList} />
            )}
            {vista === "asignaciones" && (
              <VistaAsignaciones key={listFilter ?? "all"} schedule={schedule} initialEntryId={listFilter} isAdmin={isAdmin} />
            )}
            {vista === "resumen" && <VistaResumen />}
            {vista === "matriz" && <VistaMatriz />}
            {vista === "sorteo" && <SorteoPanel isAdmin={isAdmin} />}
            {vista === "config" && <SamplingConfigPanel isAdmin={isAdmin} />}
          </>
        )}
      </GlassCard>

      {editEntry && <EditEntryModal entry={editEntry} onClose={() => setEditEntry(null)} />}

      {showRoster && (
        <WowImportModal
          title="Importar listado de personal"
          subtitle="LISTADO_DE_PERSONAL_2026.xlsx"
          hint={
            <>
              <p className="font-semibold text-ink/70 mb-0.5">Columnas (en este orden)</p>
              <p className="leading-relaxed">
                Nombre · Primera fecha del contrato · Puesto de trabajo · Departamento (ruta) · Ubicación de trabajo.
                Quien ya no aparezca deja de participar en el sorteo; sus asignaciones actuales no se tocan.
              </p>
            </>
          }
          onImport={(file) => evaluatorsService.importRoster(file)}
          stats={(r) => [
            { label: "Colaboradores",      value: r.total,             tone: "primary" },
            { label: "Nuevos",             value: r.creados,           tone: "success" },
            { label: "Actualizados",       value: r.actualizados,      tone: "primary" },
            { label: "Ya no están",        value: r.fuera_del_listado, tone: "warning" },
          ]}
          onClose={() => setShowRoster(false)}
          onSuccess={() => qc.invalidateQueries({ queryKey: ["wow-evaluators"] })}
        />
      )}

      {showImport && (
        <WowImportModal
          title="Importar evaluadores"
          subtitle="Servicio_WOW_2026_Evaluadores.xlsx"
          hint={
            <>
              <p className="font-semibold text-ink/70 mb-0.5">Excel generado por asignar_evaluadores_wow.py</p>
              <p className="leading-relaxed">
                Se leen las hojas Cronograma y Evaluadores (y la muestra requerida de Resumen_Muestra).
                Reemplaza las asignaciones pendientes; las ya completadas se conservan.
              </p>
            </>
          }
          onImport={(file) => evaluatorsService.importExcel(file)}
          stats={(r) => [
            { label: "Listas",                 value: r.listas_creadas + r.listas_actualizadas, tone: "primary" },
            { label: "Asignaciones nuevas",    value: r.asignaciones_creadas,    tone: "success" },
            { label: "Asignaciones eliminadas", value: r.asignaciones_eliminadas, tone: "warning" },
            { label: "Colaboradores nuevos",   value: r.colaboradores_creados,   tone: "primary" },
          ]}
          onClose={() => setShowImport(false)}
          onSuccess={() => qc.invalidateQueries({ queryKey: ["wow-evaluators"] })}
        />
      )}
    </div>
  );
}
