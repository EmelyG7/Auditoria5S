/**
 * wowReportTokens.js — Tokens del sistema de diseño "Servicio WOW 2026 — Sistema
 * de Reportes Cecomsa" (Claude Design, artboards "Tokens del sistema" y
 * "Componentes reutilizables"). Valores exactos del diseño.
 *
 * Los reportes usan colores fijos de marca (no dependen de la paleta ni del
 * tema de la app): se imprimen / exportan a PDF siempre igual.
 */

export const WOW_TOKENS = {
  navy:       "#0A4F79",   // titulares, texto de marca, footers
  navyDark:   "#073C5C",   // degradados y barras de cierre
  magenta:    "#B4427F",   // etiquetas cortas, "Pregunta N"
  green:      "#98C062",   // arco de dona · satisfacción
  orange:     "#EA9947",   // alertas de nivel medio
  red:        "#DF4585",   // insatisfacción, riesgo
  ink:        "#1C2B36",   // texto
  slate:      "#5C7186",   // texto secundario
  line:       "#E3E8ED",   // bordes
  surface:    "#FFFFFF",
  surfaceAlt: "#F4F6F8",
  tableHead:  "#4E6E8E",
  track:      "#E8ECEF",   // fondo del anillo de la dona
  dashed:     "#C6CFD6",   // placeholders (foto)
  font:       "'DM Sans', system-ui, sans-serif",
  shadow:     "0 1px 3px rgba(10,79,121,.06)",
  gradient:   "linear-gradient(135deg,#0A4F79,#073C5C)",
  barGradient: "linear-gradient(90deg,#0A4F79,#073C5C)",
};

// Etiqueta en mayúsculas (11 / 700 / .08em / magenta)
export const CAP = {
  fontSize: 11, fontWeight: 700, letterSpacing: ".08em",
  textTransform: "uppercase", color: WOW_TOKENS.magenta,
};

export const LOGO_CECOMSA        = "/logo-cecomsa.png";
// Footer navy: logo blanco recortado a su contenido (el diseño aplica CSS filter al de color, pero html2canvas no lo soporta)
export const LOGO_CECOMSA_BLANCO = "/logo-cecomsa-blanco-recortado.png";
export const LOGO_SERVICIO_WOW   = "/logo-servicio-wow.jpg";
