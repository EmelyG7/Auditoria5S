/**
 * WowCommentsPicker.jsx — Elegir qué comentarios abiertos van en "Resultados
 * cualitativos" del informe detallado.
 *
 * Lista todos los comentarios del departamento (model.allComments), incluidos
 * los breves/genéricos que no se preseleccionan. Los cambios se aplican al
 * momento sobre `selected` (lista de keys, en el borrador como `selected_comments`).
 */

import { useMemo, useState } from "react";
import { X, Search } from "lucide-react";
import { WOW_TOKENS as T, CAP } from "./wowReportTokens";

const TABS = [["interno", "Cliente Interno"], ["externo", "Cliente Externo"]];

export default function WowCommentsPicker({ model, selected, onChange, onClose }) {
  const tabs = TABS.filter(([k]) => model.allComments[k].length > 0);
  const [tab, setTab] = useState(tabs[0]?.[0] || "interno");
  const [query, setQuery] = useState("");
  const sel = useMemo(() => new Set(selected), [selected]);

  const lista = model.allComments[tab] || [];
  const q = query.trim().toLowerCase();
  const visibles = q
    ? lista.filter((c) => c.text.toLowerCase().includes(q) || (c.branch || "").toLowerCase().includes(q))
    : lista;

  // Mantiene el orden del modelo (el mismo del reporte)
  const commit = (next) => {
    const orden = [...model.allComments.interno, ...model.allComments.externo].map((c) => c.key);
    onChange(orden.filter((k) => next.has(k)));
  };
  const toggle = (key) => {
    const next = new Set(sel);
    next.has(key) ? next.delete(key) : next.add(key);
    commit(next);
  };
  const setMany = (items, on) => {
    const next = new Set(sel);
    items.forEach((c) => (on ? next.add(c.key) : next.delete(c.key)));
    commit(next);
  };
  const soloRelevantes = () => {
    const next = new Set(sel);
    lista.forEach((c) => (c.trivial ? next.delete(c.key) : next.add(c.key)));
    commit(next);
  };

  const nSel = (k) => model.allComments[k].filter((c) => sel.has(c.key)).length;

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed", inset: 0, zIndex: 100, background: "rgba(28,43,54,.45)",
        display: "flex", alignItems: "center", justifyContent: "center", padding: 24, fontFamily: T.font,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "100%", maxWidth: 760, maxHeight: "85vh", background: T.surface, borderRadius: 16,
          boxShadow: "0 12px 40px rgba(10,79,121,.25)", display: "flex", flexDirection: "column", color: T.ink,
        }}
      >
        <div style={{ padding: "20px 24px 12px", borderBottom: `1px solid ${T.line}` }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div>
              <div style={CAP}>Resultados cualitativos</div>
              <div style={{ fontSize: 20, fontWeight: 700, color: T.navy, marginTop: 2 }}>Elegir comentarios del reporte</div>
            </div>
            <button onClick={onClose} title="Cerrar" style={{ border: "none", background: "transparent", color: T.slate, cursor: "pointer" }}>
              <X size={20} />
            </button>
          </div>

          {tabs.length > 1 && (
            <div style={{ display: "flex", gap: 8, marginTop: 14 }}>
              {tabs.map(([k, label]) => (
                <button
                  key={k} onClick={() => setTab(k)}
                  style={{
                    padding: "6px 12px", borderRadius: 10, fontSize: 12, fontWeight: 600, cursor: "pointer",
                    border: `1px solid ${tab === k ? T.navy : T.line}`,
                    background: tab === k ? T.navy : "#fff", color: tab === k ? "#fff" : T.ink,
                  }}
                >
                  {label} · {nSel(k)}/{model.allComments[k].length}
                </button>
              ))}
            </div>
          )}

          <div style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 12, flexWrap: "wrap" }}>
            <div style={{ position: "relative", flex: 1, minWidth: 200 }}>
              <Search size={14} color={T.slate} style={{ position: "absolute", left: 10, top: 9 }} />
              <input
                value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Buscar en los comentarios…"
                style={{
                  width: "100%", boxSizing: "border-box", padding: "7px 10px 7px 30px", borderRadius: 10,
                  border: `1px solid ${T.line}`, fontSize: 13, color: T.ink, outline: "none",
                }}
              />
            </div>
            <button style={chip} onClick={() => setMany(visibles, true)}>Marcar {q ? "resultados" : "todos"}</button>
            <button style={chip} onClick={() => setMany(visibles, false)}>Desmarcar {q ? "resultados" : "todos"}</button>
            <button style={chip} onClick={soloRelevantes} title="Marca los que aportan y desmarca los breves o genéricos">Solo relevantes</button>
          </div>
        </div>

        <div style={{ overflowY: "auto", padding: "8px 12px" }}>
          {visibles.length === 0 && (
            <div style={{ padding: 24, textAlign: "center", fontSize: 13, color: T.slate }}>
              {lista.length ? "Ningún comentario coincide con la búsqueda." : "No hay comentarios abiertos."}
            </div>
          )}
          {visibles.map((c) => (
            <label
              key={c.key}
              style={{
                display: "flex", gap: 10, alignItems: "flex-start", padding: "10px 12px", borderRadius: 10,
                cursor: "pointer", background: sel.has(c.key) ? "rgba(10,79,121,.05)" : "transparent",
                opacity: c.trivial && !sel.has(c.key) ? 0.7 : 1,
              }}
            >
              <input type="checkbox" checked={sel.has(c.key)} onChange={() => toggle(c.key)} style={{ marginTop: 3, accentColor: T.navy }} />
              <span style={{ fontSize: 13, lineHeight: 1.5, flex: 1 }}>
                {c.text}
                {c.branch && <span style={{ color: T.slate, fontSize: 11 }}> — {c.branch}</span>}
                {c.trivial && (
                  <span style={{ marginLeft: 6, fontSize: 10, fontWeight: 600, color: T.slate, background: T.surfaceAlt, borderRadius: 999, padding: "1px 8px" }}>
                    breve / genérico
                  </span>
                )}
              </span>
            </label>
          ))}
        </div>

        <div style={{ padding: "12px 24px", borderTop: `1px solid ${T.line}`, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <span style={{ fontSize: 12, color: T.slate }}>
            {selected.length} comentario(s) seleccionados en el reporte
          </span>
          <button
            onClick={onClose}
            style={{ padding: "8px 18px", borderRadius: 10, border: "none", background: T.navy, color: "#fff", fontSize: 13, fontWeight: 600, cursor: "pointer" }}
          >
            Listo
          </button>
        </div>
      </div>
    </div>
  );
}

const chip = {
  padding: "6px 10px", borderRadius: 10, border: `1px solid ${T.line}`, background: "#fff",
  color: T.navy, fontSize: 12, fontWeight: 600, cursor: "pointer",
};
