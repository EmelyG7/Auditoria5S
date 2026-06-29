/**
 * ConclusionGeneral.jsx — SECCIÓN 6: Conclusión General (nivel departamento).
 */
import { RadarChart5SMulti } from "../RadarChart5S";

const DIMENSION_LABELS = {
  seiri:    "Clasificacion",
  seiton:   "Organizacion",
  seiso:    "Limpieza",
  seiketsu: "Estandarizacion",
  shitsuke: "Disciplina",
};

const SERIES_COLORS = ["#7B2D6E", "#E05A1E", "#6BAF3C", "#1e4fc7", "#d97706", "#0A2540", "#900052", "#16a34a"];

function buildMultiRadarData(audits, criteriaTemplate) {
  return Object.entries(DIMENSION_LABELS).map(([key, label]) => {
    const entry = criteriaTemplate.find((g) => g.s_key === key);
    const weight = entry ? entry.s_weight_pct : "";
    const row = { dimension: `${label} (${weight}%)` };
    audits.forEach((a) => { row[a.sucursal] = a.scores?.[key]?.pct ?? 0; });
    return row;
  });
}

function EditableBullet({ label, value, onBlurValue, deptColor }) {
  return (
    <div style={{ marginBottom: 14 }}>
      <span style={{ fontWeight: 700, color: deptColor, fontSize: 13 }}>{label} </span>
      <span
        contentEditable
        suppressContentEditableWarning
        onBlur={(e) => onBlurValue(e.currentTarget.textContent)}
        dangerouslySetInnerHTML={{ __html: value || "" }}
        style={{ outline: "none", fontSize: 13, color: "#2b2b3a" }}
      />
    </div>
  );
}

export default function ConclusionGeneral({ audits, criteriaTemplate = [], department, monthLabel, deptColor, summary, globalTexts, onChangeGlobalText }) {
  const radarData = buildMultiRadarData(audits, criteriaTemplate);
  const series = audits.map((a, i) => ({ key: a.sucursal, color: SERIES_COLORS[i % SERIES_COLORS.length] }));

  const sum = audits.reduce((acc, a) => acc + a.total_pct, 0);
  const n   = audits.length || 1;
  const avg = summary?.avg_pct ?? (sum / n);

  return (
    <section id="conclusion-general" className="report-section" style={{ minHeight: "100vh", padding: "60px 56px", background: "#fff" }}>
      <h2 style={{ margin: "0 0 28px", fontSize: 22, fontWeight: 800, color: "#1a1a2e", textTransform: "uppercase" }}>
        Conclusión General {monthLabel?.toUpperCase()}
      </h2>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 32, marginBottom: 32 }}>
        <div>
          <table style={{ width: "100%", borderCollapse: "collapse", marginBottom: 20 }}>
            <thead>
              <tr>
                <th style={{ textAlign: "left", padding: "6px 8px", background: "#1a1a2e", color: "#fff", fontSize: 11 }}>Sucursal</th>
                <th style={{ textAlign: "right", padding: "6px 8px", background: "#1a1a2e", color: "#fff", fontSize: 11 }}>Cumplimiento</th>
              </tr>
            </thead>
            <tbody>
              {audits.map((a, i) => (
                <tr key={a.sucursal} style={{ background: i % 2 === 0 ? "#fff" : "#f7f7fa" }}>
                  <td style={{ padding: "5px 8px", fontSize: 12, borderBottom: "1px solid #eee" }}>{a.sucursal}</td>
                  <td style={{ padding: "5px 8px", fontSize: 12, textAlign: "right", borderBottom: "1px solid #eee", fontWeight: 600 }}>
                    {a.total_pct.toFixed(2)}%
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          <p style={{ fontSize: 12, color: "#666", margin: "0 0 4px" }}>
            Promedio = {audits.map((a) => a.total_pct.toFixed(2)).join(" + ")} = {sum.toFixed(2)}
          </p>
          <p style={{ fontSize: 12, color: "#666", margin: "0 0 14px" }}>
            {sum.toFixed(2)} / {n} = {avg.toFixed(2)}
          </p>
          <p style={{ fontSize: 18, fontWeight: 800, color: deptColor, margin: 0 }}>
            Puntuación general promedio: {avg.toFixed(2)}/100
          </p>
        </div>

        <div>
          <RadarChart5SMulti data={radarData} series={series} height={320} />
        </div>
      </div>

      <EditableBullet
        label="Nivel general:"
        value={globalTexts?.nivel_general}
        deptColor={deptColor}
        onBlurValue={(v) => onChangeGlobalText("nivel_general", v)}
      />
      <EditableBullet
        label="Fortalezas:"
        value={globalTexts?.fortalezas}
        deptColor={deptColor}
        onBlurValue={(v) => onChangeGlobalText("fortalezas", v)}
      />
      <EditableBullet
        label="Tendencia:"
        value={globalTexts?.tendencia}
        deptColor={deptColor}
        onBlurValue={(v) => onChangeGlobalText("tendencia", v)}
      />
    </section>
  );
}
