/**
 * HallazgosSection.jsx — SECCIÓN 4b / 4d: Hallazgos y Conclusiones.
 * Se reutiliza tanto para "Hallazgos y Conclusiones" (4b) como para
 * "Conclusión del informe" por sucursal (4d) — ambas instancias reciben
 * el mismo `texts` / `onChangeText` (mismo estado en ReportEditor), por
 * lo que editar en una actualiza la otra automáticamente.
 */
import RadarChart5S from "../RadarChart5S";

const DIMENSION_LABELS = {
  seiri:    "Clasificacion",
  seiton:   "Organizacion",
  seiso:    "Limpieza",
  seiketsu: "Estandarizacion",
  shitsuke: "Disciplina",
};

function weightFor(criteriaTemplate, key) {
  const entry = criteriaTemplate.find((g) => g.s_key === key);
  return entry ? entry.s_weight_pct : null;
}

function buildRadarData(audit, criteriaTemplate) {
  return Object.entries(DIMENSION_LABELS).map(([key, label]) => {
    const weight = weightFor(criteriaTemplate, key) ?? audit.scores?.[key]?.max ?? 0;
    return {
      dimension: `${label} (${weight}%)`,
      value: audit.scores?.[key]?.pct ?? 0,
    };
  });
}

function EditableBlock({ value, onBlurValue }) {
  return (
    <div
      contentEditable
      suppressContentEditableWarning
      onBlur={(e) => onBlurValue(e.currentTarget.textContent)}
      dangerouslySetInnerHTML={{ __html: value || "" }}
      style={{
        minHeight: 60, fontSize: 13, lineHeight: 1.6, color: "#2b2b3a",
        outline: "none", padding: "6px 0",
      }}
    />
  );
}

export default function HallazgosSection({ id, title, audit, deptColor, criteriaTemplate = [], texts, onChangeText }) {
  const radarData = buildRadarData(audit, criteriaTemplate);

  return (
    <section id={id} className="report-section" style={{ minHeight: "100vh", padding: "60px 56px", background: "#fff" }}>
      <h2 style={{ margin: 0, fontSize: 20, fontWeight: 800, color: "#1a1a2e", textTransform: "uppercase" }}>
        {title || `${audit.sucursal}`}
      </h2>
      <p style={{ margin: "4px 0 28px", fontSize: 12, color: "#777" }}>
        Periodo auditado: {audit.audit_date}
      </p>

      <div style={{ display: "grid", gridTemplateColumns: "60% 40%", gap: 32 }}>
        <div>
          <p style={{ margin: "0 0 4px", fontSize: 11, fontWeight: 700, color: deptColor, textTransform: "uppercase", letterSpacing: 1 }}>
            Hallazgos
          </p>
          <EditableBlock
            value={texts?.hallazgos}
            onBlurValue={(v) => onChangeText(audit.sucursal, "hallazgos", v)}
          />

          <p style={{ margin: "20px 0 4px", fontSize: 11, fontWeight: 700, color: deptColor, textTransform: "uppercase", letterSpacing: 1 }}>
            Conclusiones Generales
          </p>
          <EditableBlock
            value={texts?.conclusiones_generales}
            onBlurValue={(v) => onChangeText(audit.sucursal, "conclusiones_generales", v)}
          />
        </div>

        <div>
          <RadarChart5S data={radarData} color={deptColor} height={260} />
          <p style={{ textAlign: "center", marginTop: 8, fontSize: 15, fontWeight: 800, color: deptColor }}>
            Puntaje Obtenido: {audit.total_pct.toFixed(2)}%
          </p>
        </div>
      </div>
    </section>
  );
}
