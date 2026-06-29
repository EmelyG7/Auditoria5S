/**
 * SucursalChecklist.jsx — SECCIÓN 4a: Resultados del checklist por sucursal.
 * Tabla completa puntuada por S / por pregunta. Solo lectura.
 */
import { Fragment } from "react";

const S_INFO = [
  { key: "seiri",    n: "1S", name: "Clasificar" },
  { key: "seiton",   n: "2S", name: "Ordenar" },
  { key: "seiso",    n: "3S", name: "Limpiar" },
  { key: "seiketsu", n: "4S", name: "Estandarizar" },
  { key: "shitsuke", n: "5S", name: "Disciplina" },
];

function Mark({ active, color }) {
  return (
    <span style={{ fontWeight: 800, color: active ? color : "transparent" }}>
      {active ? "x" : "—"}
    </span>
  );
}

export default function SucursalChecklist({ audit, department, deptColor, quarterLabel, year }) {
  return (
    <section id={`sucursal-${audit._slug}`} className="report-section" style={{ minHeight: "100vh", padding: "60px 56px", background: "#fff" }}>
      <h2 style={{ margin: 0, fontSize: 22, fontWeight: 800, color: "#1a1a2e", textTransform: "uppercase" }}>
        {department} {audit.sucursal}
      </h2>
      <p style={{ margin: "4px 0 24px", fontSize: 12, color: "#777" }}>
        Periodo auditado: {quarterLabel}, {year} / Fecha de Auditoría: {audit.audit_date}
      </p>

      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11 }}>
        <thead>
          <tr>
            {["5S%", "Criterio", "SI = 100%", "PARCIAL = 50%", "NO = 0%", "Score"].map((h) => (
              <th key={h} style={{ padding: "6px 8px", background: "#1a1a2e", color: "#fff", textAlign: h === "Criterio" ? "left" : "center" }}>
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {S_INFO.map((s) => {
            const block = audit.scores?.[s.key];
            if (!block) return null;
            return (
              <Fragment key={s.key}>
                <tr>
                  <td colSpan={5} style={{ padding: "6px 8px", background: deptColor, color: "#fff", fontWeight: 700 }}>
                    {s.n} – {s.name} ({block.max}%)
                  </td>
                  <td style={{ padding: "6px 8px", background: deptColor, color: "#fff", fontWeight: 700, textAlign: "center" }}>
                    {block.pct.toFixed(1)}%
                  </td>
                </tr>
                {block.questions.map((q, i) => (
                  <tr key={i} style={{ background: i % 2 === 0 ? "#fff" : "#f7f7fa" }}>
                    <td style={{ padding: "5px 8px", textAlign: "center", borderBottom: "1px solid #eee", color: "#666" }}>{q.weight}%</td>
                    <td style={{ padding: "5px 8px", borderBottom: "1px solid #eee", color: "#2b2b3a" }}>{q.text}</td>
                    <td style={{ padding: "5px 8px", textAlign: "center", borderBottom: "1px solid #eee" }}>
                      <Mark active={q.s_label === "SI"} color="#16a34a" />
                    </td>
                    <td style={{ padding: "5px 8px", textAlign: "center", borderBottom: "1px solid #eee" }}>
                      <Mark active={q.s_label === "PARCIAL"} color="#d97706" />
                    </td>
                    <td style={{ padding: "5px 8px", textAlign: "center", borderBottom: "1px solid #eee" }}>
                      <Mark active={q.s_label === "NO"} color="#dc2626" />
                    </td>
                    <td style={{ padding: "5px 8px", textAlign: "center", borderBottom: "1px solid #eee", fontWeight: 700 }}>
                      {q.points.toFixed(2)}
                    </td>
                  </tr>
                ))}
              </Fragment>
            );
          })}
        </tbody>
      </table>

      <div style={{ marginTop: 18, textAlign: "right" }}>
        <span style={{ fontSize: 14, fontWeight: 800, color: deptColor }}>
          Puntaje Total: {audit.total_pct.toFixed(2)}%
        </span>
      </div>
    </section>
  );
}
