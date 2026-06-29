/**
 * CriteriosSection.jsx — SECCIÓN 3: Criterios de Evaluación.
 * Tabla de criterios completa, dividida en dos sub-tablas
 * (Seiri+Seiton / Seiso+Seiketsu+Shitsuke) replicando el layout del PDF
 * original a dos diapositivas. Solo lectura.
 */
import { Fragment } from "react";

function CriteriaTable({ groups, deptColor }) {
  return (
    <table style={{ width: "100%", borderCollapse: "collapse", marginBottom: 28 }}>
      <thead>
        <tr>
          <th style={{ width: 90, padding: "8px 10px", background: "#1a1a2e", color: "#fff", fontSize: 11, textAlign: "left" }}>5S</th>
          <th style={{ padding: "8px 10px", background: "#1a1a2e", color: "#fff", fontSize: 11, textAlign: "left" }}>
            Criterios de Evaluación
          </th>
        </tr>
      </thead>
      <tbody>
        {groups.map((g) => (
          <Fragment key={g.s_key}>
            <tr>
              <td colSpan={2} style={{ padding: "6px 10px", background: deptColor, color: "#fff", fontSize: 12, fontWeight: 700 }}>
                {g.s_name} ({g.s_weight_pct}%)
              </td>
            </tr>
            {g.questions.map((q, i) => (
              <tr key={i} style={{ background: i % 2 === 0 ? "#fff" : "#f7f7fa" }}>
                <td style={{ padding: "6px 10px", fontSize: 11, color: "#555", borderBottom: "1px solid #eee" }}>
                  {q.weight_pct}%
                </td>
                <td style={{ padding: "6px 10px", fontSize: 12, color: "#2b2b3a", borderBottom: "1px solid #eee" }}>
                  {q.text}
                </td>
              </tr>
            ))}
          </Fragment>
        ))}
      </tbody>
    </table>
  );
}

export default function CriteriosSection({ criteriaTemplate = [], deptColor, dateRange, quarterLabel, year }) {
  const firstHalf  = criteriaTemplate.filter((g) => g.s_key === "seiri" || g.s_key === "seiton");
  const secondHalf = criteriaTemplate.filter((g) => g.s_key === "seiso" || g.s_key === "seiketsu" || g.s_key === "shitsuke");

  return (
    <section
      id="criterios"
      className="report-section"
      style={{ minHeight: "100vh", padding: "70px 64px", background: "#fff" }}
    >
      <h2 style={{
        margin: "0 0 6px", fontSize: 22, fontWeight: 800, color: "#1a1a2e",
        textTransform: "uppercase", letterSpacing: 1,
      }}>
        Criterios de Evaluación
      </h2>
      <p style={{ margin: "0 0 28px", fontSize: 13, color: "#777" }}>
        Periodo auditado: {dateRange} {quarterLabel}, {year}
      </p>

      <CriteriaTable groups={firstHalf} deptColor={deptColor} />
      <CriteriaTable groups={secondHalf} deptColor={deptColor} />
    </section>
  );
}
