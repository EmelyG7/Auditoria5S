/**
 * reportPresentationAI.js — Generación de textos narrativos con IA para el
 * Reporte de Presentación departamental.
 *
 * NOTA DE SEGURIDAD: las llamadas NO van directo a api.anthropic.com desde
 * el navegador (eso requeriría exponer la API key en el cliente). En su
 * lugar se reutiliza el mismo proxy seguro que ya usa el módulo de
 * auditorías (ver auditAnalysis.js → POST /audits/{id}/ai-generate):
 * el backend reenvía el prompt a Claude usando la key del servidor.
 */

import api from "./api";

async function callAI(prompt, maxTokens = 1000) {
  const { data } = await api.post("/reports/presentation/ai-generate", {
    prompt,
    max_tokens: maxTokens,
  });
  return data.text;
}

function cleanJSON(raw) {
  return raw.trim().replace(/^```(?:json)?\s*/, "").replace(/```\s*$/, "");
}

export async function generateSucursalTexts(audit, department) {
  const prompt = `Eres redactor de informes de auditoría 5S para Cecomsa. Genera en español profesional y conciso.

Sucursal: ${audit.sucursal}
Departamento: ${department}
Fecha: ${audit.audit_date}
Seiri: ${audit.scores.seiri.pct}%
Seiton: ${audit.scores.seiton.pct}%
Seiso: ${audit.scores.seiso.pct}%
Seiketsu: ${audit.scores.seiketsu.pct}%
Shitsuke: ${audit.scores.shitsuke.pct}%
Total: ${audit.total_pct}%
Observaciones: ${JSON.stringify(audit.observations_by_s)}

Genera exactamente en este tono (ejemplos reales):
- "No se identificaron hallazgos. Las piezas se clasificaron correctamente en el área de trabajo."
- "Este RMA demuestra un alto nivel de madurez en la implementación de las 5S."
- "Área de oportunidad: Seiso (Limpiar) – puntual."
- "El personal refleja una cultura genuina de organización."

Responde SOLO con JSON válido:
{
  "hallazgos": "2-3 oraciones",
  "conclusiones_generales": "4-5 oraciones",
  "card_summary": "3-4 oraciones para tarjeta de resumen",
  "cumplimiento_label": "Cumplimiento total o Área de oportunidad: [S]"
}`;

  const raw = await callAI(prompt, 1000);
  return JSON.parse(cleanJSON(raw));
}

export async function generateGlobalConclusion(allAudits, department, avgPct) {
  const resumen = allAudits
    .map((a) => `${a.sucursal}: ${a.total_pct}%`)
    .join(", ");

  const prompt = `Eres redactor de informes de auditoría 5S para Cecomsa. Genera en español profesional y conciso, basado en los resultados de TODAS las sucursales auditadas de ${department} en este período.

Promedio general: ${avgPct}%
Resultados por sucursal: ${resumen}

Responde SOLO con JSON válido:
{
  "nivel_general": "1-2 oraciones describiendo el nivel general de cumplimiento",
  "fortalezas": "1-2 oraciones sobre las fortalezas detectadas",
  "tendencia": "1-2 oraciones sobre la tendencia observada",
  "pasos_a_seguir": ["paso 1", "paso 2", "paso 3"]
}`;

  const raw = await callAI(prompt, 1200);
  return JSON.parse(cleanJSON(raw));
}
