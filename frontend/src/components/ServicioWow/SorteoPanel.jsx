/**
 * SorteoPanel.jsx — Sorteo de evaluadores dentro de la app (Fase 2).
 *
 * Flujo: elegir evaluaciones → "Generar vista previa" (no guarda nada) →
 * revisar resumen, alertas, carga y quién entra/sale de cada lista →
 * "Confirmar y guardar". El backend exige el token de la vista previa: si
 * algo cambió entretanto (respuestas, configuración, otra persona sorteó),
 * rechaza la confirmación y hay que regenerar la vista previa.
 *
 * Listas cerradas o con respuestas completadas no se pueden re-sortear.
 */

import { useState, useMemo } from "react";
import { createPortal } from "react-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Shuffle, Loader2, AlertTriangle, CheckCircle2, ChevronDown, Lock, Info, Save,
} from "lucide-react";
import { evaluatorsService } from "../../services/evaluators";
import ConfirmModal from "../Common/ConfirmModal";
import { fmtShortDate } from "./wowUtils";

const CAMBIO_STYLE = {
  entra:         "bg-success/15 text-success",
  sale:          "bg-danger/15 text-danger",
  "se mantiene": "bg-ink/5 text-ink/50",
};

function errorMsg(e, fallback) {
  const d = e?.response?.data?.detail;
  return typeof d === "string" ? d : fallback;
}

function ListaCambios({ lista }) {
  const [open, setOpen] = useState(lista.entran + lista.salen + lista.cambian_rol > 0 && lista.filas.length <= 20);
  return (
    <div className="border-b border-ink/5 last:border-0">
      <button onClick={() => setOpen((o) => !o)} className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-primary/[0.03]">
        <ChevronDown size={14} className={`text-ink/40 transition-transform ${open ? "" : "-rotate-90"}`} />
        <span className="font-medium text-ink text-sm flex-1">{lista.lista}</span>
        <span className="text-xs text-success font-semibold">+{lista.entran}</span>
        <span className="text-xs text-danger font-semibold">−{lista.salen}</span>
        {lista.cambian_rol > 0 && <span className="text-xs text-warning font-semibold">⇄{lista.cambian_rol}</span>}
        <span className="text-xs text-ink/40 w-24 text-right">{lista.se_mantienen} se mantienen</span>
      </button>
      {open && (
        <div className="overflow-x-auto pb-2">
          <table className="w-full text-sm min-w-[720px]">
            <tbody className="divide-y divide-ink/5">
              {lista.filas.map((f) => (
                <tr key={`${f.employee_id}-${f.cambio}`} className={f.cambio === "sale" ? "opacity-60" : ""}>
                  <td className="py-2 pl-11 pr-3 w-32">
                    <span className={`text-xs font-semibold px-2 py-0.5 rounded-lg ${CAMBIO_STYLE[f.cambio] || "bg-warning/15 text-warning"}`}>
                      {f.cambio}
                    </span>
                  </td>
                  <td className={`py-2 px-3 font-medium text-ink ${f.cambio === "sale" ? "line-through" : ""}`}>{f.colaborador}</td>
                  <td className="py-2 px-3 text-ink/60 max-w-[220px] truncate" title={f.puesto || ""}>{f.puesto || "—"}</td>
                  <td className="py-2 px-3 text-ink/50 whitespace-nowrap">{f.area_evaluadora}</td>
                  <td className="py-2 px-3 text-ink/50">{f.rol === "titular" ? "Titular" : "Suplente"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export default function SorteoPanel({ isAdmin }) {
  const qc = useQueryClient();
  const [seleccion, setSeleccion] = useState([]);
  const [preview,   setPreview]   = useState(null);
  const [previewDe, setPreviewDe] = useState([]);
  const [confirmar, setConfirmar] = useState(false);
  const [resultado, setResultado] = useState(null);
  const [error,     setError]     = useState("");

  const { data: evaluaciones = [], isLoading } = useQuery({
    queryKey: ["wow-evaluators", "sorteo-evaluaciones"],
    queryFn:  evaluatorsService.getSorteoEvaluaciones,
  });
  const recalculables = evaluaciones.filter((e) => e.recalculable);
  const vigente = preview && JSON.stringify([...previewDe].sort()) === JSON.stringify([...seleccion].sort());

  const toggle = (clave) => {
    setSeleccion((s) => (s.includes(clave) ? s.filter((c) => c !== clave) : [...s, clave]));
    setResultado(null);
  };

  const previewMut = useMutation({
    mutationFn: () => evaluatorsService.sorteoPreview(seleccion),
    onSuccess:  (data) => { setPreview(data); setPreviewDe(seleccion); setError(""); setResultado(null); },
    onError:    (e) => { setPreview(null); setError(errorMsg(e, "No se pudo calcular el sorteo.")); },
  });
  const applyMut = useMutation({
    mutationFn: () => evaluatorsService.sorteoApply(previewDe, preview.token),
    onSuccess:  (data) => {
      setResultado(data); setPreview(null); setSeleccion([]); setConfirmar(false); setError("");
      qc.invalidateQueries({ queryKey: ["wow-evaluators"] });
    },
    onError: (e) => { setConfirmar(false); setError(errorMsg(e, "No se pudo guardar el sorteo.")); },
  });

  const totales = useMemo(() => preview && preview.cambios.reduce(
    (acc, l) => ({ entran: acc.entran + l.entran, salen: acc.salen + l.salen, rol: acc.rol + l.cambian_rol }),
    { entran: 0, salen: 0, rol: 0 },
  ), [preview]);

  if (isLoading) {
    return <div className="flex justify-center py-16"><Loader2 size={24} className="animate-spin text-primary/40" /></div>;
  }

  return (
    <div className="p-5 space-y-5">
      <div className="flex items-start gap-2 bg-primary/5 border border-primary/15 rounded-xl px-3 py-2.5 text-xs text-ink/60">
        <Info size={13} className="text-primary/60 mt-0.5 shrink-0" />
        <p className="leading-relaxed">
          Mismo motor y mismas reglas que <span className="font-mono">asignar_evaluadores_wow.py</span>: se re-sortean solo las
          evaluaciones marcadas; las demás se conservan y su carga cuenta para repartir. Primero se genera una vista previa
          y nada se guarda hasta confirmar. Las listas cerradas o con respuestas completadas no se pueden re-sortear.
        </p>
      </div>

      {/* Selección */}
      <div>
        <div className="flex flex-wrap items-center gap-2 mb-3">
          <h3 className="text-sm font-semibold text-ink mr-auto">Evaluaciones a re-sortear</h3>
          <button onClick={() => setSeleccion(recalculables.map((e) => e.clave))} className="btn-ghost text-xs" disabled={!isAdmin}>
            Todas las disponibles ({recalculables.length})
          </button>
          <button onClick={() => setSeleccion([])} className="btn-ghost text-xs" disabled={!seleccion.length}>Ninguna</button>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-2">
          {evaluaciones.map((e) => {
            const checked = seleccion.includes(e.clave);
            return (
              <label
                key={e.clave}
                title={e.motivo_bloqueo || e.listas.join(" · ")}
                className={`flex items-start gap-2.5 px-3 py-2.5 rounded-xl border transition-colors ${
                  !e.recalculable ? "border-ink/5 opacity-50 cursor-not-allowed"
                  : checked ? "border-primary/40 bg-primary/5 cursor-pointer" : "border-ink/10 hover:border-primary/30 cursor-pointer"
                }`}
              >
                <input
                  type="checkbox"
                  className="w-4 h-4 mt-0.5 accent-primary shrink-0"
                  checked={checked}
                  disabled={!e.recalculable || !isAdmin}
                  onChange={() => toggle(e.clave)}
                />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-ink truncate flex items-center gap-1.5">
                    {!e.recalculable && <Lock size={12} className="shrink-0" />}
                    {e.clave}
                  </p>
                  <p className="text-xs text-ink/40">
                    {e.numero ? `No. ${e.numero} · ` : ""}{fmtShortDate(e.envio)} · {e.titulares} titulares
                    {e.listas.length > 1 ? ` · ${e.listas.length} listas` : ""}
                    {e.motivo_bloqueo ? ` · ${e.motivo_bloqueo}` : ""}
                  </p>
                </div>
              </label>
            );
          })}
        </div>
      </div>

      {isAdmin && (
        <div className="flex flex-wrap items-center gap-3">
          <button
            onClick={() => previewMut.mutate()}
            disabled={!seleccion.length || previewMut.isPending}
            className="btn-primary flex items-center gap-2 text-sm disabled:opacity-50"
          >
            {previewMut.isPending ? <Loader2 size={15} className="animate-spin" /> : <Shuffle size={15} />}
            Generar vista previa
          </button>
          {preview && vigente && (
            <button onClick={() => setConfirmar(true)} className="btn-secondary flex items-center gap-2 text-sm">
              <Save size={15} /> Confirmar y guardar
            </button>
          )}
          {preview && !vigente && (
            <span className="text-xs text-warning">Cambiaste la selección: genera la vista previa de nuevo.</span>
          )}
        </div>
      )}

      {error && (
        <div className="flex items-start gap-2 bg-danger/10 border border-danger/20 text-danger text-sm rounded-xl px-3 py-2.5">
          <AlertTriangle size={15} className="shrink-0 mt-0.5" /> <span>{error}</span>
        </div>
      )}

      {resultado && (
        <div className="flex items-start gap-2 bg-success/10 border border-success/20 rounded-xl px-3 py-2.5 text-sm text-ink/80">
          <CheckCircle2 size={15} className="shrink-0 mt-0.5 text-success" />
          <div>
            <p className="font-medium">{resultado.message}</p>
            <p className="text-xs text-ink/50 mt-0.5">
              Re-sorteadas: {resultado.recalculadas.join(", ")}
              {resultado.ajustadas.length ? ` · Ajustadas: ${resultado.ajustadas.join(", ")}` : ""}
            </p>
          </div>
        </div>
      )}

      {/* Vista previa */}
      {preview && (
        <div className={`space-y-4 ${vigente ? "" : "opacity-50"}`}>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            {[
              ["Listas afectadas", preview.cambios.length],
              ["Entran", `+${totales.entran}`],
              ["Salen", `−${totales.salen}`],
              ["Cambian de rol", totales.rol],
            ].map(([label, v]) => (
              <div key={label} className="rounded-xl border border-ink/10 px-4 py-3">
                <p className="text-xs text-ink/50 uppercase tracking-wide">{label}</p>
                <p className="text-2xl font-semibold text-ink mt-0.5">{v}</p>
              </div>
            ))}
          </div>

          {preview.ajustadas.length > 0 && (
            <p className="text-xs text-ink/60">
              También se ajustan (reemplazo puntual por excluidos o no repetición): <b>{preview.ajustadas.join(", ")}</b>
            </p>
          )}

          <div className="rounded-xl border border-ink/10 px-4 py-3">
            <p className="text-xs font-semibold text-ink/60 uppercase tracking-wide mb-2">Carga resultante (encuestas como titular)</p>
            <div className="flex flex-wrap gap-2">
              {Object.entries(preview.carga).map(([n, personas]) => (
                <span key={n} className={`text-xs px-2.5 py-1 rounded-lg ${Number(n) > 4 ? "bg-danger/10 text-danger" : "bg-ink/5 text-ink/70"}`}>
                  {n} encuesta{n === "1" ? "" : "s"}: <b>{personas}</b> persona{personas === 1 ? "" : "s"}
                </span>
              ))}
            </div>
          </div>

          {preview.alertas.length > 0 && (
            <div className="bg-warning/10 border border-warning/20 rounded-xl p-3 space-y-1 max-h-48 overflow-y-auto">
              {preview.alertas.map((a, i) => (
                <p key={i} className="text-xs text-ink/70 flex gap-1.5">
                  <AlertTriangle size={12} className="text-warning shrink-0 mt-0.5" /> {a}
                </p>
              ))}
            </div>
          )}

          <div className="rounded-xl border border-ink/10 overflow-hidden">
            <div className="px-4 py-2.5 bg-ink/[0.02] border-b border-ink/10 flex items-center justify-between">
              <p className="text-xs font-semibold text-ink/60 uppercase tracking-wide">Cambios por lista</p>
              <p className="text-xs text-ink/40">
                {preview.resumen.filter((r) => r.requerida && r.titulares < r.requerida).length
                  ? "⚠ hay listas con menos titulares que la muestra requerida" : "todas las listas cubren su muestra"}
              </p>
            </div>
            {preview.cambios.map((l) => <ListaCambios key={l.lista} lista={l} />)}
          </div>
        </div>
      )}

      {/* Portal: dentro de la GlassCard (backdrop-filter) un `fixed` quedaría anclado a la tarjeta */}
      {createPortal(
        <ConfirmModal
          open={confirmar}
          danger={false}
          title="Guardar el sorteo"
          message={`Se reemplazarán las asignaciones pendientes de ${preview?.cambios.length ?? 0} lista(s): entran ${totales?.entran ?? 0} y salen ${totales?.salen ?? 0} personas. Las respuestas completadas no se tocan.`}
          confirmLabel={applyMut.isPending ? "Guardando…" : "Guardar sorteo"}
          onConfirm={() => applyMut.mutate()}
          onCancel={() => setConfirmar(false)}
        />,
        document.body,
      )}
    </div>
  );
}
