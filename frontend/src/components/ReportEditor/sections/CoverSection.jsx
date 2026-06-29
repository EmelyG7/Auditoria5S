/**
 * CoverSection.jsx — SECCIÓN 1: Portada del reporte.
 */
import { useRef } from "react";
import { ImagePlus } from "lucide-react";

export default function CoverSection({ department, year, monthLabel, deptColor, heroImage, onHeroImageChange }) {
  const inputRef = useRef(null);

  function handleFileChange(e) {
    const file = e.target.files?.[0];
    if (file) onHeroImageChange(URL.createObjectURL(file));
    e.target.value = "";
  }

  return (
    <section
      id="portada"
      className="report-section"
      style={{
        position: "relative",
        minHeight: "100vh",
        background: "#0A2540",
        color: "#fff",
        overflow: "hidden",
        display: "flex",
        alignItems: "stretch",
      }}
    >
      {/* Franjas diagonales decorativas */}
      <div style={{
        position: "absolute", top: 0, right: 0, width: 340, height: 340,
        background: deptColor, clipPath: "polygon(100% 0, 100% 100%, 0 0)", opacity: 0.92,
      }} />
      <div style={{
        position: "absolute", bottom: 0, left: 0, width: 280, height: 280,
        background: deptColor, clipPath: "polygon(0 100%, 100% 100%, 0 0)", opacity: 0.55,
      }} />

      {/* Columna izquierda */}
      <div style={{
        flex: "0 0 56%", position: "relative", zIndex: 2,
        display: "flex", flexDirection: "column", justifyContent: "center",
        padding: "0 64px",
      }}>
        <img src="/logo-cecomsa-blanco.png" alt="Cecomsa" style={{ height: 40, objectFit: "contain", marginBottom: 40 }} />

        <h1 style={{
          margin: 0, fontSize: 38, fontWeight: 800, lineHeight: 1.15,
          textTransform: "uppercase", letterSpacing: 1, maxWidth: 480,
        }}>
          Resultados de Auditoría {department} {year}
        </h1>

        <p style={{
          margin: "14px 0 32px", fontSize: 20, fontWeight: 700,
          color: deptColor, textTransform: "uppercase", letterSpacing: 2,
        }}>
          {monthLabel} {year}
        </p>

        <div style={{
          display: "inline-block", background: deptColor, borderRadius: 10,
          padding: "14px 22px", maxWidth: 320,
        }}>
          <p style={{ margin: 0, fontSize: 14, fontWeight: 700, color: "#fff" }}>
            Mejora Continua y Auditoría
          </p>
          <p style={{ margin: "2px 0 0", fontSize: 12, color: "rgba(255,255,255,0.8)" }}>
            Dirección Administrativa
          </p>
        </div>
      </div>

      {/* Columna derecha — imagen hero */}
      <div style={{ flex: "0 0 44%", position: "relative", zIndex: 1 }}>
        <input ref={inputRef} type="file" accept="image/*" className="hidden" style={{ display: "none" }} onChange={handleFileChange} />
        <div
          onClick={() => inputRef.current?.click()}
          title="Click para cambiar la imagen"
          style={{
            position: "absolute", inset: 0, cursor: "pointer",
            backgroundImage: heroImage ? `url(${heroImage})` : undefined,
            backgroundSize: "cover", backgroundPosition: "center",
            background: heroImage ? undefined : "rgba(255,255,255,0.06)",
            display: "flex", alignItems: "center", justifyContent: "center",
          }}
        >
          {!heroImage && (
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 8, color: "rgba(255,255,255,0.4)" }}>
              <ImagePlus size={36} />
              <span style={{ fontSize: 12 }}>Click para agregar imagen</span>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
