/**
 * ConclusionDepartamento.jsx — SECCIÓN 5: Conclusión del Informe (nivel departamento).
 */

function Card({ audit, deptColor, summary, onChangeSummary }) {
  return (
    <div style={{
      background: "#fff", border: "1px solid #e8e8ee", borderRadius: 14,
      borderTop: `4px solid ${deptColor}`, padding: 18,
      boxShadow: "0 2px 10px rgba(0,0,0,0.04)",
    }}>
      <p style={{ margin: "0 0 8px", fontSize: 14, fontWeight: 800, color: "#1a1a2e" }}>
        {audit.sucursal}
      </p>
      <div
        contentEditable
        suppressContentEditableWarning
        onBlur={(e) => onChangeSummary(e.currentTarget.textContent)}
        dangerouslySetInnerHTML={{ __html: summary || "" }}
        style={{ fontSize: 12, lineHeight: 1.55, color: "#555", outline: "none", minHeight: 60 }}
      />
      <p style={{ margin: "12px 0 0", fontSize: 13, fontWeight: 800, color: deptColor }}>
        Cumplimiento: {audit.total_pct.toFixed(2)}%
      </p>
    </div>
  );
}

export default function ConclusionDepartamento({ audits, department, monthLabel, quarterLabel, deptColor, texts, onChangeCardSummary }) {
  return (
    <section id="conclusion-departamento" className="report-section" style={{ minHeight: "100vh", padding: "60px 56px", background: "#fafafc" }}>
      <h2 style={{ margin: 0, fontSize: 22, fontWeight: 800, color: "#1a1a2e", textTransform: "uppercase" }}>
        Conclusión del Informe {monthLabel?.toUpperCase()}
      </h2>
      <p style={{ margin: "4px 0 4px", fontSize: 13, fontWeight: 700, color: deptColor, textTransform: "uppercase" }}>
        Auditorías en {department?.toUpperCase()} Cecomsa
      </p>
      <p style={{ margin: "0 0 28px", fontSize: 12, color: "#888" }}>
        Auditorías del mes de {monthLabel} del {quarterLabel} en {department}
      </p>

      <h3 style={{ margin: "0 0 18px", fontSize: 14, fontWeight: 700, color: "#1a1a2e", textTransform: "uppercase" }}>
        Resultados por {department}
      </h3>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 16 }}>
        {audits.map((audit) => (
          <Card
            key={audit.sucursal + (audit.is_mobiliario ? "-mob" : "")}
            audit={audit}
            deptColor={deptColor}
            summary={texts?.[audit.sucursal]?.card_summary}
            onChangeSummary={(v) => onChangeCardSummary(audit.sucursal, v)}
          />
        ))}
      </div>
    </section>
  );
}
