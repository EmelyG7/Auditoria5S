/**
 * AddEvaluatorsModal.jsx — Ampliar una lista ya enviada (ej. Gestión Humana).
 *
 * No re-sortea: el backend sugiere N personas elegibles con las reglas del sorteo
 * (nominados, excluidos, no repetición, antigüedad, puestos sin interacción), solo
 * de las áreas que evalúan ese departamento y repartidas entre ellas; el admin
 * marca/desmarca, puede buscar a alguien puntual,
 * y se agregan como titulares pendientes. Funciona también en listas cerradas.
 */

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { X, UserPlus, Loader2, Search, AlertTriangle, CheckCircle2, AlertCircle, Plus } from "lucide-react";
import { evaluatorsService } from "../../services/evaluators";

function errorMsg(e, fallback) {
  const d = e?.response?.data?.detail;
  return typeof d === "string" ? d : fallback;
}

export default function AddEvaluatorsModal({ entry, onClose }) {
  const qc = useQueryClient();
  const [n,           setN]           = useState(8);
  const [soloLideres, setSoloLideres] = useState(true);
  const [selected,    setSelected]    = useState(null);   // null = las sugeridas
  const [extras,      setExtras]      = useState([]);     // buscadas a mano
  const [search,      setSearch]      = useState("");
  const [result,      setResult]      = useState(null);
  const [error,       setError]       = useState("");

  const { data, isLoading, isFetching } = useQuery({
    queryKey: ["wow-evaluators", "candidatos", entry.id, n, soloLideres],
    queryFn:  () => evaluatorsService.getCandidatos(entry.id, { n, solo_lideres: soloLideres }),
    keepPreviousData: true,
  });
  const candidatos = data?.candidatos || [];
  const sel = selected ?? new Set(candidatos.filter((c) => c.sugerido).map((c) => c.employee_id));

  const q = search.trim();
  const { data: encontrados = [], isFetching: buscando } = useQuery({
    queryKey: ["wow-evaluators", "employees", q],
    queryFn:  () => evaluatorsService.searchEmployees(q),
    enabled:  q.length >= 2,
  });

  const cambiarParams = (fn) => { fn(); setSelected(null); };
  const toggle = (id) => {
    const s = new Set(sel);
    s.has(id) ? s.delete(id) : s.add(id);
    setSelected(s);
  };
  const addExtra = (emp) => {
    if (!extras.some((e) => e.id === emp.id)) setExtras((x) => [...x, emp]);
    setSearch("");
  };

  const ids = [...extras.map((e) => e.id), ...[...sel].filter((id) => !extras.some((e) => e.id === id))];

  const mut = useMutation({
    mutationFn: () => evaluatorsService.addAssignments(entry.id, ids),
    onSuccess: (r) => {
      setResult(r);
      qc.invalidateQueries({ queryKey: ["wow-evaluators"] });
    },
    onError: (e) => setError(errorMsg(e, "No se pudieron agregar los evaluadores.")),
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-ink/30 backdrop-blur-sm" onClick={onClose} />
      <div className="glass rounded-3xl p-6 w-full max-w-4xl relative animate-fade-up max-h-[90vh] flex flex-col">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-9 h-9 rounded-2xl bg-primary/15 flex items-center justify-center">
            <UserPlus size={16} className="text-primary" />
          </div>
          <div>
            <h3 className="text-base font-semibold text-ink">Agregar evaluadores</h3>
            <p className="text-xs text-ink/50">{entry.list_name} · {data?.en_lista ?? entry.titulares} en la lista</p>
          </div>
          <button onClick={onClose} className="btn-ghost p-1.5 ml-auto"><X size={16} /></button>
        </div>

        {result ? (
          <div className="space-y-4">
            <div className="flex items-center gap-2.5">
              <CheckCircle2 size={18} className="text-success" />
              <p className="font-semibold text-ink text-sm">{result.message}</p>
            </div>
            {result.omitidos.length > 0 && (
              <p className="text-xs text-ink/60">Ya estaban en la lista: {result.omitidos.join(", ")}</p>
            )}
            {result.advertencias.length > 0 && (
              <div className="bg-warning/10 border border-warning/20 rounded-xl p-3 space-y-0.5">
                {result.advertencias.map((a) => <p key={a} className="text-xs text-ink/70">· {a}</p>)}
              </div>
            )}
            <p className="text-xs text-ink/50">
              Recuerda enviarles el formulario. Al importar las respuestas se marcarán como “Completo”.
            </p>
            <button onClick={onClose} className="btn-primary w-full text-sm">Cerrar</button>
          </div>
        ) : (
          <>
            <div className="flex flex-wrap items-center gap-3 mb-3">
              <label className="flex items-center gap-2 text-sm text-ink/70">
                Sugerir
                <input type="number" min={1} max={100} value={n}
                  onChange={(e) => cambiarParams(() => setN(Math.max(1, Math.min(100, Number(e.target.value) || 1))))}
                  className="input-glass text-sm py-1 px-2 w-16" />
              </label>
              <label className="flex items-center gap-2 text-sm text-ink/70 cursor-pointer select-none">
                <input type="checkbox" checked={soloLideres} className="w-4 h-4 accent-primary"
                  onChange={(e) => cambiarParams(() => setSoloLideres(e.target.checked))} />
                Solo líderes (gerentes, encargados, coordinadores…)
              </label>
              {isFetching && <Loader2 size={14} className="animate-spin text-primary/40" />}
            </div>

            {data?.areas_evaluadoras?.length > 0 && (
              <p className="text-xs text-ink/50 mb-1.5 leading-relaxed">
                <span className="font-semibold text-ink/60">Áreas que evalúan esta lista: </span>
                {data.areas_evaluadoras.join(" · ")}
              </p>
            )}
            {data && Object.keys(data.representacion).length > 0 && (
              <p className="text-xs text-ink/50 mb-3 leading-relaxed">
                <span className="font-semibold text-ink/60">Ya en la lista: </span>
                {Object.entries(data.representacion).map(([a, c]) => `${a} ${c}`).join(" · ")}
              </p>
            )}

            <div className="relative mb-3">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink/30" />
              <input value={search} onChange={(e) => setSearch(e.target.value)}
                placeholder="Agregar a otra persona por nombre…"
                className="input-glass text-sm py-1.5 pl-8 pr-3 w-full" />
              {q.length >= 2 && (
                <div className="absolute z-10 left-0 right-0 mt-1 glass rounded-xl shadow-lg max-h-56 overflow-y-auto">
                  {buscando ? <p className="text-xs text-ink/40 px-3 py-2">Buscando…</p> :
                    encontrados.length === 0 ? <p className="text-xs text-ink/40 px-3 py-2">Sin resultados.</p> :
                    encontrados.map((emp) => (
                      <button key={emp.id} onClick={() => addExtra(emp)}
                        className="w-full text-left px-3 py-2 hover:bg-primary/5 flex items-center gap-2">
                        <Plus size={13} className="text-primary shrink-0" />
                        <span className="text-sm text-ink">{emp.full_name}</span>
                        <span className="text-xs text-ink/40 truncate">{emp.position} · {emp.area || "—"}</span>
                      </button>
                    ))}
                </div>
              )}
            </div>

            {extras.length > 0 && (
              <div className="flex flex-wrap gap-2 mb-3">
                {extras.map((e) => (
                  <span key={e.id} className="text-xs bg-primary/10 text-primary rounded-lg pl-2.5 pr-1 py-1 flex items-center gap-1">
                    {e.full_name}
                    <button onClick={() => setExtras((x) => x.filter((y) => y.id !== e.id))} className="p-0.5 hover:bg-primary/10 rounded">
                      <X size={11} />
                    </button>
                  </span>
                ))}
              </div>
            )}

            <div className="overflow-y-auto border border-ink/10 rounded-2xl flex-1 min-h-[160px]">
              {isLoading ? (
                <div className="flex items-center justify-center h-40"><Loader2 size={22} className="animate-spin text-primary/40" /></div>
              ) : candidatos.length === 0 ? (
                <p className="text-sm text-ink/40 text-center py-10">No hay personas elegibles con estos criterios.</p>
              ) : (
                <table className="w-full text-sm">
                  <thead className="sticky top-0 bg-surface">
                    <tr className="border-b border-ink/10 text-left text-xs text-ink/50 uppercase tracking-wide">
                      <th className="py-2 px-3 w-8" /><th className="py-2 px-3">Colaborador</th><th className="py-2 px-3">Puesto</th>
                      <th className="py-2 px-3">Área evaluadora</th><th className="py-2 px-3">Ubicación</th>
                      <th className="py-2 px-3 text-center" title="Listas que ya evalúa como titular">Carga</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-ink/5">
                    {candidatos.map((c) => (
                      <tr key={c.employee_id} onClick={() => toggle(c.employee_id)}
                        className={`cursor-pointer hover:bg-primary/[0.03] ${sel.has(c.employee_id) ? "bg-primary/[0.05]" : ""}`}>
                        <td className="py-2 px-3">
                          <input type="checkbox" readOnly checked={sel.has(c.employee_id)} className="w-4 h-4 accent-primary pointer-events-none" />
                        </td>
                        <td className="py-2 px-3 font-medium text-ink min-w-[260px]">
                          {c.colaborador}
                          {c.sugerido && <span className="ml-2 text-[10px] font-semibold uppercase text-primary/70">sugerido</span>}
                        </td>
                        <td className="py-2 px-3 text-ink/60 max-w-[200px] truncate" title={c.puesto || ""}>{c.puesto || "—"}</td>
                        <td className="py-2 px-3 text-ink/60 whitespace-nowrap" title={c.area || ""}>{c.area_evaluadora || c.area || "—"}</td>
                        <td className="py-2 px-3 text-ink/60 whitespace-nowrap">{c.ubicacion || "—"}</td>
                        <td className="py-2 px-3 text-center text-ink/60">{c.carga_titular}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>

            {data?.alertas?.map((a) => (
              <p key={a} className="text-xs text-warning flex items-center gap-1.5 mt-2"><AlertTriangle size={12} /> {a}</p>
            ))}
            {error && (
              <div className="flex items-start gap-2 bg-danger/10 border border-danger/20 text-danger text-xs rounded-xl px-3 py-2.5 mt-3">
                <AlertCircle size={13} className="shrink-0 mt-0.5" /> <span>{error}</span>
              </div>
            )}

            <div className="flex items-center justify-end gap-3 mt-4">
              <span className="text-xs text-ink/50 mr-auto">
                Se agregan como titulares pendientes; las reglas de nominados y exclusiones se validan al guardar.
              </span>
              <button onClick={onClose} className="btn-secondary text-sm">Cancelar</button>
              <button onClick={() => { setError(""); mut.mutate(); }} disabled={!ids.length || mut.isPending}
                className="btn-primary text-sm flex items-center gap-2 disabled:opacity-50 whitespace-nowrap">
                {mut.isPending ? <Loader2 size={14} className="animate-spin" /> : <UserPlus size={14} />}
                Agregar {ids.length}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
