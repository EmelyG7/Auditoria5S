/**
 * wowReportAI.js — Redacción con IA de los textos del reporte del Servicio WOW.
 *
 * Reutiliza el proxy seguro del reporte de presentación 5S
 * (POST /reports/presentation/ai-generate): el backend reenvía el prompt a
 * Claude con la API key del servidor, que nunca llega al navegador.
 * Solo se envían resultados agregados y comentarios anónimos.
 */

import api from "./api";

const cleanJSON = (raw) => raw.trim().replace(/^```(?:json)?\s*/, "").replace(/```\s*$/, "");
const pct = (v) => (v == null ? "sin datos" : `${Math.round(v)}%`);

export async function generateWowReportTexts(model, { cycleName, branch }) {
  const lineas = [
    ...model.interno.cards.map((c) => `- [Interno] ${c.text}: ${pct(c.porcentaje)}`),
    ...model.externo.groups.flatMap((g) => g.cards.map((c) => `- [Externo${g.title ? ` · ${g.title}` : ""}] ${c.text}: ${pct(c.porcentaje)}`)),
  ];
  const comentarios = [...model.comments.interno, ...model.comments.externo].slice(0, 40).map((c) => `- ${c.text}`);

  const prompt = `Eres redactor de informes de satisfacción del programa "${cycleName}" de Cecomsa (Mejora Continua & Auditoría). Escribe en español profesional, cálido y conciso.

Departamento: ${model.department}${branch ? ` — ${branch}` : ""}
Resultado cliente interno: ${model.hasInterno ? pct(model.interno.porcentaje) : "no aplica"}
Resultado cliente externo: ${model.hasExterno ? pct(model.externo.porcentaje) : "no aplica"}
Resultado general: ${model.general != null ? pct(model.general) : "no aplica"}
Escala: % = puntos / (respuestas × 5). Semáforo: ≥90% Excelente, ≥80% Aceptable, <80% Crítico.

Resultado por pregunta:
${lineas.join("\n") || "- (sin datos)"}

Comentarios abiertos (anónimos):
${comentarios.join("\n") || "- (sin comentarios)"}

Responde SOLO con JSON válido:
{
  "general_text": "1-2 oraciones para la sección Resultado general (menciona el % general y, si aplica, interno y externo)",
  "summary_paragraph": "1-2 oraciones para el resumen ejecutivo que se publica al personal",
  "action_items": ["3 acciones concretas de mejora basadas en las preguntas más bajas y los comentarios"]
}`;

  const { data } = await api.post("/reports/presentation/ai-generate", { prompt, max_tokens: 900 });
  return JSON.parse(cleanJSON(data.text));
}
