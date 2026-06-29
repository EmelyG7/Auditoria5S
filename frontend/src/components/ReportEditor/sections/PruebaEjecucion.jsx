/**
 * PruebaEjecucion.jsx — SECCIÓN 4c: Prueba de Ejecución.
 * Cuadrícula de imágenes seleccionadas + (solo Almacenes) bloque editable
 * de datos de Odoo.
 */
import ImageGrid from "../ImageGrid";

export default function PruebaEjecucion({ audit, department, deptColor, images = [], odooCounts, odooText, onChangeOdoo }) {
  const isAlmacenes = department === "Almacenes";
  const transferencias = odooCounts?.transferencias ?? 0;
  const conduces        = odooCounts?.conduces ?? 0;

  return (
    <section id={`prueba-${audit._slug}`} className="report-section" style={{ minHeight: "100vh", padding: "60px 56px", background: "#fff" }}>
      <h2 style={{ margin: 0, fontSize: 20, fontWeight: 800, color: "#1a1a2e", textTransform: "uppercase" }}>
        {department} {audit.sucursal}
      </h2>
      <p style={{ margin: "4px 0 24px", fontSize: 12, color: "#777" }}>
        Prueba de Ejecución — {audit.audit_date}
      </p>

      <ImageGrid images={images} columns={5} />

      {isAlmacenes && (
        <div style={{ marginTop: 28 }}>
          <p style={{ margin: "0 0 6px", fontSize: 11, fontWeight: 700, color: deptColor, textTransform: "uppercase", letterSpacing: 1 }}>
            Auditoría de procesos en Odoo
          </p>
          <div
            contentEditable
            suppressContentEditableWarning
            onBlur={(e) => onChangeOdoo(e.currentTarget.textContent)}
            dangerouslySetInnerHTML={{
              __html: odooText ||
                `Transferencias ${audit.sucursal}: ${transferencias} abiertas.<br/>Conduces: ${conduces} abiertos.`,
            }}
            style={{
              fontSize: 13, lineHeight: 1.7, color: "#2b2b3a", outline: "none",
              padding: "10px 14px", borderRadius: 10, background: "#f7f7fa", maxWidth: 420,
            }}
          />
        </div>
      )}
    </section>
  );
}
