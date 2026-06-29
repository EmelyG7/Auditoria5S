/**
 * ImageGrid.jsx — Cuadrícula de imágenes para "Prueba de Ejecución".
 * Las imágenes ya vienen filtradas/seleccionadas desde ReportPreparation.
 */

export default function ImageGrid({ images = [], columns = 5 }) {
  if (!images.length) {
    return (
      <p style={{ fontSize: 12, color: "#888", fontStyle: "italic" }}>
        Sin imágenes seleccionadas para esta sucursal.
      </p>
    );
  }

  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: `repeat(${columns}, 1fr)`,
        gap: 8,
      }}
    >
      {images.map((img, i) => (
        <div
          key={img.id ?? img.url ?? i}
          style={{
            aspectRatio: "4 / 3",
            borderRadius: 10,
            overflow: "hidden",
            background: "#e9e9ee",
          }}
        >
          {/* Los links externos (SharePoint/OneDrive) no siempre se pueden
              incrustar como <img>; si falla la carga, mostramos un enlace. */}
          <img
            src={img.url}
            alt={img.filename || `imagen-${i}`}
            style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
            onError={(e) => {
              e.currentTarget.style.display = "none";
              e.currentTarget.nextSibling.style.display = "flex";
            }}
          />
          <a
            href={img.url}
            target="_blank"
            rel="noopener noreferrer"
            style={{
              display: "none", width: "100%", height: "100%",
              alignItems: "center", justifyContent: "center",
              fontSize: 10, color: "#7B2D6E", textAlign: "center", padding: 6,
            }}
          >
            {img.filename || "Ver imagen"}
          </a>
        </div>
      ))}
    </div>
  );
}
