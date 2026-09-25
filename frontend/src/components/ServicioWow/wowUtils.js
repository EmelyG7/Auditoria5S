/**
 * wowUtils.js — Helpers compartidos del módulo Servicio WOW 2026.
 *
 * Cada respuesta Likert vale 1-5 puntos y los resultados se muestran en %:
 * puntos obtenidos / (respuestas × 5) × 100. El semáforo usa los cortes que
 * define el backend (survey_wow_service.py) y llegan en `escala`; los valores
 * por defecto de aquí solo se usan mientras llega la respuesta.
 */

export const DEFAULT_ESCALA = { unidad: "%", puntaje_max: 5, excelente: 90, aceptable: 80 };

export function wowEstado(pct, escala = DEFAULT_ESCALA) {
  if (pct == null) return "Sin datos";
  if (pct >= escala.excelente) return "Excelente";
  if (pct >= escala.aceptable) return "Aceptable";
  return "Crítico";
}

// Semánticos fijos (no dependen de la paleta), igual que el resto de la app.
export const WOW_SEM = {
  Excelente:   { color: "#98C062", badge: "bg-success/15 text-success" },
  Aceptable:   { color: "#EA9947", badge: "bg-warning/15 text-warning" },
  "Crítico":   { color: "#DF4585", badge: "bg-danger/15 text-danger" },
  "Sin datos": { color: "rgba(120,120,140,0.6)", badge: "bg-ink/5 text-ink/40" },
};

export function wowColor(pct, escala) {
  return WOW_SEM[wowEstado(pct, escala)].color;
}

// Una respuesta individual 1-5 expresada en % (5 → 100 %, 4 → 80 %...).
export const scoreToPct = (score) => (score == null ? null : (score / 5) * 100);

export const fmtShortDate = (d) => {
  if (!d) return "—";
  const parsed = /^\d{4}-\d{2}-\d{2}$/.test(d) ? new Date(`${d}T00:00:00`) : new Date(d);
  return parsed.toLocaleDateString("es-DO", { day: "2-digit", month: "short" });
};

export const fmtPct = (v) => (v == null ? "—" : `${Number(v).toFixed(1)}%`);

// Forms exporta cada fila de una matriz Likert como "<pregunta>:.<afirmación>"
export const statementOf = (text) => (text.includes(":.") ? text.split(":.").pop().trim() : text);

export const SURVEY_TYPE_LABEL = { interno: "Interno", externo: "Externo" };

export function paginator(current, total) {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
  const delta = 2;
  const range = [];
  for (let i = Math.max(2, current - delta); i <= Math.min(total - 1, current + delta); i++) range.push(i);
  if (current - delta > 2) range.unshift("...");
  if (current + delta < total - 1) range.push("...");
  return [1, ...range, total];
}
