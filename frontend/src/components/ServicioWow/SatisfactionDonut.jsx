/**
 * SatisfactionDonut.jsx — Dona de % de satisfacción del Servicio WOW.
 *
 * Componente único que comparten el dashboard (DashboardServicioWow.jsx) y los
 * reportes (WowReportDetailed.jsx, WowReportSummary.jsx). NO calcula nada:
 * recibe el `porcentaje` que ya devuelven los endpoints del dashboard
 * (puntos / (respuestas × 5) × 100) y lo dibuja; el resto del anillo es la
 * insatisfacción.
 *
 * Medidas del diseño ("Componentes reutilizables" · B):
 *   sm → 120×120, trazo 10, número 24px   (tarjeta de pregunta)
 *   lg → 168×168, trazo 14, número 32px   (resultado general)
 *   o un número (px) para otros tamaños (p. ej. 180 en el resumen con una sola dona).
 * Track #E8ECEF, arco #98C062 con cap redondeado, origen a las 12 en punto.
 *
 * El giro de -90° va como atributo SVG (no CSS) y el número es HTML encima del
 * SVG: así html2canvas lo captura igual que en pantalla al exportar a PDF.
 */

import { WOW_TOKENS } from "./wowReportTokens";

const PRESETS = {
  sm: { size: 120, stroke: 10, font: 24 },
  lg: { size: 168, stroke: 14, font: 32 },
};

function dims(size) {
  if (PRESETS[size]) return PRESETS[size];
  const px = Number(size) || 120;
  return { size: px, stroke: Math.max(4, Math.round(px / 12)), font: Math.max(12, Math.round(px * 0.19)) };
}

export default function SatisfactionDonut({
  percentage,
  label,
  size = "sm",
  color = WOW_TOKENS.green,
  trackColor = WOW_TOKENS.track,
  showValue = true,
  decimals = 0,
  labelStyle,
}) {
  const { size: px, stroke, font } = dims(size);
  const r = (px - stroke) / 2;
  const c = px / 2;
  const circ = 2 * Math.PI * r;
  const pct = percentage == null ? null : Math.max(0, Math.min(100, Number(percentage)));
  const arc = pct == null ? 0 : (pct / 100) * circ;

  return (
    <div style={{ display: "inline-flex", flexDirection: "column", alignItems: "center", gap: 8 }}>
      <div style={{ position: "relative", width: px, height: px, flexShrink: 0 }}>
        <svg width={px} height={px} viewBox={`0 0 ${px} ${px}`} style={{ display: "block" }}>
          <circle cx={c} cy={c} r={r} fill="none" stroke={trackColor} strokeWidth={stroke} />
          {arc > 0 && (
            <circle
              cx={c} cy={c} r={r} fill="none" stroke={color} strokeWidth={stroke}
              strokeLinecap="round" strokeDasharray={`${arc} ${circ}`}
              transform={`rotate(-90 ${c} ${c})`}
            />
          )}
        </svg>
        {showValue && (
          <div
            style={{
              position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center",
              fontFamily: WOW_TOKENS.font, fontWeight: 700, fontSize: font, lineHeight: 1,
              color: pct == null ? WOW_TOKENS.slate : "currentColor",
            }}
          >
            {pct == null ? "—" : `${pct.toFixed(decimals)}%`}
          </div>
        )}
      </div>
      {label && (
        <div style={{ fontFamily: WOW_TOKENS.font, fontSize: 12, color: WOW_TOKENS.slate, textAlign: "center", ...labelStyle }}>
          {label}
        </div>
      )}
    </div>
  );
}
