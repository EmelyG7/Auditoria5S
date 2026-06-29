/**
 * ReportSidebar.jsx — Sidebar fijo de navegación del editor de reporte
 * (no se imprime). Botones circulares con label que hacen scrollIntoView
 * a la sección correspondiente del documento.
 */
import { Circle } from "lucide-react";

export default function ReportSidebar({ sections = [], activeSectionId, deptColor, onNavigate }) {
  function handleClick(id) {
    const el = document.getElementById(id);
    if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
    onNavigate?.(id);
  }

  return (
    <aside
      className="report-sidebar"
      style={{
        position: "fixed",
        top: 60,
        left: 0,
        bottom: 0,
        width: 220,
        background: "#0A2540",
        overflowY: "auto",
        zIndex: 40,
        padding: "18px 12px",
      }}
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        {sections.map((s) => {
          const Icon = s.icon || Circle;
          const active = s.id === activeSectionId;
          return (
            <button
              key={s.id}
              onClick={() => handleClick(s.id)}
              title={s.label}
              style={{
                display: "flex", alignItems: "center", gap: 10,
                padding: "8px 10px", borderRadius: 12, border: "none",
                background: active ? deptColor : "transparent",
                color: active ? "#fff" : "rgba(255,255,255,0.62)",
                fontSize: 12, fontWeight: 500, textAlign: "left",
                cursor: "pointer", transition: "all 0.15s ease",
              }}
            >
              <span
                style={{
                  width: 28, height: 28, borderRadius: "50%", flexShrink: 0,
                  display: "flex", alignItems: "center", justifyContent: "center",
                  background: active ? "rgba(255,255,255,0.18)" : "rgba(255,255,255,0.08)",
                }}
              >
                <Icon size={14} />
              </span>
              <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {s.label}
              </span>
            </button>
          );
        })}
      </div>
    </aside>
  );
}
