/**
 * PasosASeguir.jsx — SECCIÓN 7: Pasos a Seguir.
 */
import { Plus, Trash2 } from "lucide-react";

export default function PasosASeguir({ items = [], onChangeItem, onAddItem, onRemoveItem, deptColor }) {
  return (
    <section id="pasos-a-seguir" className="report-section" style={{ minHeight: "100vh", padding: "60px 56px", background: "#fff" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 32 }}>
        <h2 style={{ margin: 0, fontSize: 24, fontWeight: 800, color: "#1a1a2e", textTransform: "uppercase" }}>
          Pasos a Seguir
        </h2>
        <img src="/logo-cecomsa-blanco.png" alt="Cecomsa" style={{ height: 28, objectFit: "contain", filter: "invert(1) grayscale(1) brightness(0.3)" }} />
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        {items.map((text, i) => (
          <div
            key={i}
            style={{
              display: "flex", alignItems: "flex-start", gap: 10,
              background: deptColor, color: "#fff", borderRadius: 14,
              padding: "14px 18px",
            }}
          >
            <span style={{ fontWeight: 800, flexShrink: 0 }}>{i + 1}.</span>
            <div
              contentEditable
              suppressContentEditableWarning
              onBlur={(e) => onChangeItem(i, e.currentTarget.textContent)}
              dangerouslySetInnerHTML={{ __html: text || "" }}
              style={{ flex: 1, outline: "none", fontSize: 14, lineHeight: 1.5 }}
            />
            <button
              onClick={() => onRemoveItem(i)}
              className="add-item-button"
              title="Eliminar paso"
              style={{ background: "rgba(255,255,255,0.18)", border: "none", borderRadius: 8, padding: 6, color: "#fff", cursor: "pointer", flexShrink: 0 }}
            >
              <Trash2 size={14} />
            </button>
          </div>
        ))}
      </div>

      <button
        onClick={onAddItem}
        className="add-item-button"
        style={{
          marginTop: 16, display: "flex", alignItems: "center", gap: 6,
          padding: "8px 14px", borderRadius: 10, border: `1px dashed ${deptColor}`,
          background: "transparent", color: deptColor, fontSize: 12, fontWeight: 600, cursor: "pointer",
        }}
      >
        <Plus size={14} /> Agregar paso
      </button>
    </section>
  );
}
