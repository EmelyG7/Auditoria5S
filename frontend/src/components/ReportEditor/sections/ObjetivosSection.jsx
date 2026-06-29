/**
 * ObjetivosSection.jsx — SECCIÓN 2: Objetivos y Procedimiento.
 */

function EditableLi({ value, onBlurValue, deptColor }) {
  return (
    <li style={{ marginBottom: 10, fontSize: 14, lineHeight: 1.5, color: "#2b2b3a" }}>
      <span
        contentEditable
        suppressContentEditableWarning
        onBlur={(e) => onBlurValue(e.currentTarget.textContent)}
        dangerouslySetInnerHTML={{ __html: value || "" }}
        style={{ outline: "none", borderBottom: `1px dashed transparent` }}
        onFocus={(e) => (e.currentTarget.style.borderBottom = `1px dashed ${deptColor}`)}
      />
    </li>
  );
}

export default function ObjetivosSection({ objetivos, procedimiento, onChangeObjetivo, onChangeProcedimiento, deptColor }) {
  return (
    <section
      id="objetivos"
      className="report-section"
      style={{ minHeight: "100vh", padding: "70px 64px", background: "#fff" }}
    >
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 48 }}>
        <div>
          <h2 style={{
            margin: "0 0 22px", fontSize: 22, fontWeight: 800, color: deptColor,
            textTransform: "uppercase", letterSpacing: 1, borderBottom: `3px solid ${deptColor}`, paddingBottom: 10,
          }}>
            Objetivos
          </h2>
          <ul style={{ paddingLeft: 18, margin: 0 }}>
            {objetivos.map((text, i) => (
              <EditableLi key={i} value={text} deptColor={deptColor} onBlurValue={(v) => onChangeObjetivo(i, v)} />
            ))}
          </ul>
        </div>

        <div>
          <h2 style={{
            margin: "0 0 22px", fontSize: 22, fontWeight: 800, color: "#1a1a2e",
            textTransform: "uppercase", letterSpacing: 1, borderBottom: "3px solid #1a1a2e", paddingBottom: 10,
          }}>
            Procedimiento
          </h2>
          <ul style={{ paddingLeft: 18, margin: 0 }}>
            {procedimiento.map((text, i) => (
              <EditableLi key={i} value={text} deptColor={deptColor} onBlurValue={(v) => onChangeProcedimiento(i, v)} />
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}
