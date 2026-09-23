/**
 * SamplingConfigPanel.jsx — Parámetros del sorteo de evaluadores (SamplingConfig).
 *
 * Reemplaza las constantes de asignar_evaluadores_wow.py: semilla, topes,
 * antigüedad mínima, áreas excluidas, personas excluidas, excepciones a la
 * no repetición y reglas de no repetición entre listas. Los nombres propios
 * viven solo aquí (en la BD), nunca en el código.
 *
 * Solo administradores pueden guardar; el resto la ve en modo lectura.
 */

import { useState, useEffect, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Loader2, Save, X, Plus, Search, CheckCircle2, AlertTriangle } from "lucide-react";
import { evaluatorsService } from "../../services/evaluators";

const NUMEROS = [
  ["seed", "Semilla", "Cambiarla genera otra combinación válida con las mismas reglas"],
  ["titular_cap", "Tope de encuestas como titular", "Por persona; se supera solo si el área se agota"],
  ["suplentes_por_departamento", "Suplentes por lista", "Caja: 1 por entidad si sobra alguien"],
  ["antiguedad_minima_dias", "Antigüedad mínima (días)", "A la fecha de envío de cada encuesta"],
  ["carga_alerta", "Alerta de carga alta", "Se marca a quien tenga más encuestas titulares que esto"],
];

function Chips({ items, onRemove, readOnly, empty }) {
  if (!items.length) return <p className="text-xs text-ink/30 py-1">{empty}</p>;
  return (
    <div className="flex flex-wrap gap-1.5">
      {items.map((x) => (
        <span key={x} className="inline-flex items-center gap-1 text-xs bg-ink/5 text-ink/80 rounded-lg pl-2.5 pr-1.5 py-1">
          {x}
          {!readOnly && (
            <button onClick={() => onRemove(x)} className="text-ink/40 hover:text-danger" title="Quitar"><X size={12} /></button>
          )}
        </span>
      ))}
    </div>
  );
}

function EmployeePicker({ onPick, exclude }) {
  const [q, setQ] = useState("");
  const [debounced, setDebounced] = useState("");
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => { const t = setTimeout(() => setDebounced(q.trim()), 250); return () => clearTimeout(t); }, [q]);
  useEffect(() => {
    const h = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, []);

  const { data = [], isFetching } = useQuery({
    queryKey: ["wow-employees", debounced],
    queryFn:  () => evaluatorsService.searchEmployees(debounced),
    enabled:  debounced.length >= 2,
  });
  const opciones = data.filter((e) => !exclude.some((x) => x.toLowerCase() === e.full_name.toLowerCase()));

  return (
    <div className="relative mt-2 max-w-sm" ref={ref}>
      <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink/30" />
      <input
        value={q}
        onChange={(e) => { setQ(e.target.value); setOpen(true); }}
        onFocus={() => setOpen(true)}
        placeholder="Buscar en el listado de personal…"
        className="input-glass text-sm py-1.5 pl-8 pr-3 w-full"
      />
      {open && debounced.length >= 2 && (
        <div className="absolute left-0 right-0 top-full mt-1 bg-surface border border-ink/10 rounded-xl shadow-lg py-1 z-30 max-h-60 overflow-y-auto">
          {isFetching && <p className="px-3 py-2 text-xs text-ink/40">Buscando…</p>}
          {!isFetching && !opciones.length && <p className="px-3 py-2 text-xs text-ink/40">Sin resultados</p>}
          {opciones.map((e) => (
            <button
              key={e.id}
              onClick={() => { onPick(e.full_name); setQ(""); setOpen(false); }}
              className="w-full text-left px-3 py-2 hover:bg-ink/5"
            >
              <p className="text-sm text-ink">{e.full_name}</p>
              <p className="text-xs text-ink/40">{[e.position, e.location].filter(Boolean).join(" · ")}</p>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export default function SamplingConfigPanel({ isAdmin }) {
  const qc = useQueryClient();
  const { data: cfg, isLoading } = useQuery({
    queryKey: ["wow-evaluators", "sampling-config"],
    queryFn:  () => evaluatorsService.getSamplingConfig(),
  });
  const { data: evaluaciones = [] } = useQuery({
    queryKey: ["wow-evaluators", "sorteo-evaluaciones"],
    queryFn:  evaluatorsService.getSorteoEvaluaciones,
  });
  const claves = evaluaciones.map((e) => e.clave);

  const [form, setForm] = useState(null);
  const [nuevaArea, setNuevaArea] = useState("");
  const [nuevaRegla, setNuevaRegla] = useState("");
  const [msg, setMsg] = useState(null);

  useEffect(() => { if (cfg) setForm(structuredClone(cfg)); }, [cfg]);

  const mut = useMutation({
    mutationFn: (payload) => evaluatorsService.updateSamplingConfig(payload),
    onSuccess: () => {
      setMsg({ ok: true, text: "Configuración guardada. Aplica al próximo sorteo." });
      qc.invalidateQueries({ queryKey: ["wow-evaluators"] });
    },
    onError: (e) => {
      const d = e.response?.data?.detail;
      setMsg({ ok: false, text: typeof d === "string" ? d : "No se pudo guardar la configuración." });
    },
  });

  if (isLoading || !form) {
    return <div className="flex justify-center py-16"><Loader2 size={24} className="animate-spin text-primary/40" /></div>;
  }

  const ro = !isAdmin;
  const set = (k, v) => { setForm((f) => ({ ...f, [k]: v })); setMsg(null); };
  const addTo = (k, v) => v && !form[k].some((x) => x.toLowerCase() === v.toLowerCase()) && set(k, [...form[k], v]);
  const removeFrom = (k, v) => set(k, form[k].filter((x) => x !== v));
  const reglas = form.evitar_repeticion || {};
  const setRegla = (lista, otras) => {
    const r = { ...reglas };
    if (otras === null) delete r[lista]; else r[lista] = otras;
    set("evitar_repeticion", r);
  };
  const cambios = cfg && JSON.stringify(form) !== JSON.stringify(cfg);

  const guardar = () => mut.mutate({
    seed: Number(form.seed), titular_cap: Number(form.titular_cap),
    suplentes_por_departamento: Number(form.suplentes_por_departamento),
    antiguedad_minima_dias: Number(form.antiguedad_minima_dias), carga_alerta: Number(form.carga_alerta),
    areas_excluidas: form.areas_excluidas, personas_excluidas: form.personas_excluidas,
    permitir_repetir: form.permitir_repetir, evitar_repeticion: form.evitar_repeticion,
    puestos_sin_interaccion_regex: form.puestos_sin_interaccion_regex,
  });

  return (
    <div className="p-5 space-y-6">
      {/* Parámetros */}
      <section>
        <h3 className="text-sm font-semibold text-ink mb-3">Parámetros</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-5 gap-3">
          {NUMEROS.map(([k, label, ayuda]) => (
            <label key={k} className="block">
              <span className="text-xs font-medium text-ink/60">{label}</span>
              <input
                type="number" min={0} value={form[k]} disabled={ro}
                onChange={(e) => set(k, e.target.value)}
                className="input-glass text-sm py-1.5 px-3 w-full mt-1 disabled:opacity-60"
              />
              <span className="text-[11px] text-ink/40 leading-snug block mt-1">{ayuda}</span>
            </label>
          ))}
        </div>
        <label className="block mt-3 max-w-xl">
          <span className="text-xs font-medium text-ink/60">Puestos sin interacción (no evalúan)</span>
          <input
            value={form.puestos_sin_interaccion_regex || ""} disabled={ro}
            onChange={(e) => set("puestos_sin_interaccion_regex", e.target.value)}
            className="input-glass text-sm py-1.5 px-3 w-full mt-1 font-mono disabled:opacity-60"
          />
          <span className="text-[11px] text-ink/40">Palabras separadas por “|”; se busca dentro del puesto.</span>
        </label>
      </section>

      {/* Áreas excluidas */}
      <section>
        <h3 className="text-sm font-semibold text-ink">Áreas que no evalúan</h3>
        <p className="text-xs text-ink/40 mb-2">Dirección y equipo organizador de la encuesta.</p>
        <Chips items={form.areas_excluidas} readOnly={ro} empty="Ninguna" onRemove={(v) => removeFrom("areas_excluidas", v)} />
        {!ro && (
          <div className="flex gap-2 mt-2 max-w-sm">
            <input value={nuevaArea} onChange={(e) => setNuevaArea(e.target.value)} placeholder="Nombre del área…" className="input-glass text-sm py-1.5 px-3 flex-1" />
            <button onClick={() => { addTo("areas_excluidas", nuevaArea.trim()); setNuevaArea(""); }} className="btn-ghost p-1.5"><Plus size={15} /></button>
          </div>
        )}
      </section>

      {/* Personas */}
      <section className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div>
          <h3 className="text-sm font-semibold text-ink">Personas excluidas</h3>
          <p className="text-xs text-ink/40 mb-2">No responden encuestas. En las listas donde estaban se reemplazan por alguien del mismo estrato.</p>
          <Chips items={form.personas_excluidas} readOnly={ro} empty="Nadie excluido" onRemove={(v) => removeFrom("personas_excluidas", v)} />
          {!ro && <EmployeePicker exclude={form.personas_excluidas} onPick={(n) => addTo("personas_excluidas", n)} />}
        </div>
        <div>
          <h3 className="text-sm font-semibold text-ink">Pueden repetir</h3>
          <p className="text-xs text-ink/40 mb-2">Exentos de las reglas de no repetición (sin alternativa real en su área).</p>
          <Chips items={form.permitir_repetir} readOnly={ro} empty="Sin excepciones" onRemove={(v) => removeFrom("permitir_repetir", v)} />
          {!ro && <EmployeePicker exclude={form.permitir_repetir} onPick={(n) => addTo("permitir_repetir", n)} />}
        </div>
      </section>

      {/* No repetición */}
      <section>
        <h3 className="text-sm font-semibold text-ink">No repetición entre listas</h3>
        <p className="text-xs text-ink/40 mb-3">Quien integra las listas de la derecha no puede evaluar la lista de la izquierda (ej. encuestas de la misma semana).</p>
        <div className="space-y-2">
          {Object.entries(reglas).map(([lista, otras]) => (
            <div key={lista} className="flex flex-wrap items-center gap-2 rounded-xl border border-ink/10 px-3 py-2">
              <span className="text-sm font-medium text-ink min-w-[180px]">{lista}</span>
              <span className="text-xs text-ink/40">no pueden repetir quienes están en</span>
              <Chips items={otras} readOnly={ro} empty="—" onRemove={(v) => setRegla(lista, otras.filter((x) => x !== v))} />
              {!ro && (
                <>
                  <select
                    value="" onChange={(e) => e.target.value && setRegla(lista, [...otras, e.target.value])}
                    className="input-glass text-xs py-1 px-2 w-auto"
                  >
                    <option value="">+ lista</option>
                    {claves.filter((c) => c !== lista && !otras.includes(c)).map((c) => <option key={c} value={c}>{c}</option>)}
                  </select>
                  <button onClick={() => setRegla(lista, null)} className="btn-ghost p-1 ml-auto text-danger/60 hover:text-danger" title="Quitar regla"><X size={14} /></button>
                </>
              )}
            </div>
          ))}
          {!Object.keys(reglas).length && <p className="text-xs text-ink/30">Sin reglas.</p>}
        </div>
        {!ro && (
          <div className="flex gap-2 mt-2 max-w-sm">
            <select value={nuevaRegla} onChange={(e) => setNuevaRegla(e.target.value)} className="input-glass text-sm py-1.5 px-3 flex-1">
              <option value="">Agregar regla para la lista…</option>
              {claves.filter((c) => !reglas[c]).map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
            <button onClick={() => { if (nuevaRegla) { setRegla(nuevaRegla, []); setNuevaRegla(""); } }} className="btn-ghost p-1.5"><Plus size={15} /></button>
          </div>
        )}
      </section>

      {!ro && (
        <div className="flex items-center gap-3 pt-2 border-t border-ink/10">
          <button onClick={guardar} disabled={!cambios || mut.isPending} className="btn-primary flex items-center gap-2 text-sm disabled:opacity-50">
            {mut.isPending ? <Loader2 size={15} className="animate-spin" /> : <Save size={15} />} Guardar configuración
          </button>
          {cambios && <button onClick={() => { setForm(structuredClone(cfg)); setMsg(null); }} className="btn-ghost text-sm">Descartar cambios</button>}
          {msg && (
            <span className={`text-sm flex items-center gap-1.5 ${msg.ok ? "text-success" : "text-danger"}`}>
              {msg.ok ? <CheckCircle2 size={14} /> : <AlertTriangle size={14} />} {msg.text}
            </span>
          )}
        </div>
      )}
    </div>
  );
}
