/**
 * ControlBar.jsx — Barra superior fija del editor de reporte (no se imprime).
 */
import { Sparkles, Save, FileDown, Loader2 } from "lucide-react";

export default function ControlBar({
  department,
  deptColor,
  periodLabel,
  onGenerateAI,
  generatingAI,
  aiProgress,
  onSaveDraft,
  savingDraft,
  onExportPDF,
}) {
  return (
    <div
      className="control-bar"
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        height: 60,
        zIndex: 50,
        display: "flex",
        alignItems: "center",
        gap: 16,
        padding: "0 20px",
        background: "#ffffff",
        borderBottom: "1px solid #e5e5ea",
        boxShadow: "0 2px 12px rgba(0,0,0,0.06)",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
        <span style={{ width: 12, height: 12, borderRadius: "50%", background: deptColor, flexShrink: 0 }} />
        <div style={{ minWidth: 0 }}>
          <p style={{ margin: 0, fontSize: 13, fontWeight: 700, color: "#1a1a2e", whiteSpace: "nowrap" }}>
            {department}
          </p>
          <p style={{ margin: 0, fontSize: 11, color: "#888" }}>{periodLabel}</p>
        </div>
      </div>

      <div style={{ flex: 1 }} />

      {generatingAI && aiProgress?.total > 0 && (
        <span style={{ fontSize: 11, color: "#888" }}>
          Generando {aiProgress.current}/{aiProgress.total}…
        </span>
      )}

      <button
        onClick={onGenerateAI}
        disabled={generatingAI}
        style={{
          display: "flex", alignItems: "center", gap: 6,
          padding: "8px 14px", borderRadius: 10, border: "none",
          background: deptColor, color: "#fff", fontSize: 12, fontWeight: 600,
          cursor: generatingAI ? "default" : "pointer",
          opacity: generatingAI ? 0.7 : 1,
        }}
      >
        {generatingAI ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />}
        Generar textos con IA
      </button>

      <button
        onClick={onSaveDraft}
        disabled={savingDraft}
        style={{
          display: "flex", alignItems: "center", gap: 6,
          padding: "8px 14px", borderRadius: 10,
          border: "1px solid #d8d8e0", background: "#fff",
          color: "#1a1a2e", fontSize: 12, fontWeight: 600,
          cursor: savingDraft ? "default" : "pointer",
        }}
      >
        {savingDraft ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
        Guardar borrador
      </button>

      <button
        onClick={onExportPDF}
        style={{
          display: "flex", alignItems: "center", gap: 6,
          padding: "8px 14px", borderRadius: 10, border: "none",
          background: "#1a1a2e", color: "#fff", fontSize: 12, fontWeight: 600,
          cursor: "pointer",
        }}
      >
        <FileDown size={14} />
        Exportar PDF
      </button>
    </div>
  );
}
