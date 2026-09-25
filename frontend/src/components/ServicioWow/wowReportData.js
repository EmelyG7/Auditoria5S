/**
 * wowReportData.js — Arma el modelo que consumen las dos plantillas de reporte
 * (WowReportDetailed / WowReportSummary) a partir de las respuestas de los
 * endpoints del dashboard (ver services/wowReports.js).
 *
 * Aquí NO se recalcula ningún %: cada `porcentaje` es el que devuelve el
 * backend (puntos / (respuestas × 5) × 100). Lo único derivado es el
 * "Resultado General" cuando el departamento tiene cliente interno Y externo:
 * promedio simple de los dos % globales (ver `resultadoGeneral`).
 *
 * El layout es dinámico: las preguntas, formularios externos, sucursales y
 * comentarios varían por departamento, así que se paginan en hojas
 * (`paginarTarjetas`, `paginarComentarios`) en vez de forzarlos a un layout fijo.
 */

import { statementOf } from "./wowUtils";

// Tarjetas pregunta + dona por hoja: 3 filas de 3 (tarjeta mín. 236px en 872px útiles).
export const CARD_COLS = 3;
export const CARD_ROWS_PER_SHEET = 3;
// Comentarios por hoja de "Resultados cualitativos" (2 columnas × 8 filas).
export const COMMENTS_PER_SHEET = 16;
// Donas por hoja de "Resultados por sucursal".
export const BRANCHES_PER_SHEET = 12;

const MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto",
  "septiembre", "octubre", "noviembre", "diciembre"];

// Respuestas abiertas que no aportan (se descartan de la tabla cualitativa; el resto se
// puede quitar a mano en el editor). Solo respuestas cortas: nunca se descarta un comentario largo.
const TRIVIAL = /^(n ?a|no|nada|ok|excelentes?( todas?)?|ningun[oa]?( adicional| comentarios?)?|sin comentarios?( adicionales)?|no tengo( ningun)? comentarios?|no,? todo (bien|en orden)|todo bien(,? ningun comentario)?|no deseo .*|no por el momento|por el momento no)?$/;
const normalizar = (t) => t.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "")
  .replace(/[^a-z0-9ñ ]+/g, " ").replace(/\s+/g, " ").trim();
const esTrivial = (t) => t.length <= 45 && TRIVIAL.test(normalizar(t));

/** Promedio simple interno/externo; si solo hay uno, no hay "General" aparte. */
export function resultadoGeneral(pInterno, pExterno) {
  if (pInterno == null || pExterno == null) return null;
  return Math.round(((pInterno + pExterno) / 2) * 10) / 10;
}

function periodo(responses) {
  const fechas = responses.map((r) => r.completed_at).filter(Boolean).map((d) => new Date(d)).sort((a, b) => a - b);
  if (!fechas.length) return "";
  const [a, b] = [fechas[0], fechas[fechas.length - 1]];
  if (a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth()) return `${MESES[a.getMonth()]} ${a.getFullYear()}`;
  if (a.getFullYear() === b.getFullYear()) return `${MESES[a.getMonth()]} – ${MESES[b.getMonth()]} ${b.getFullYear()}`;
  return `${MESES[a.getMonth()]} ${a.getFullYear()} – ${MESES[b.getMonth()]} ${b.getFullYear()}`;
}

function comentarios(responses, tipo) {
  const out = [];
  for (const r of responses) {
    if (r.survey_type !== tipo) continue;
    for (const a of r.answers) {
      const t = (a.value_text || "").trim();
      if (a.question_type !== "text" || !t || esTrivial(t)) continue;
      out.push({ key: `${r.id}-${a.question_id}`, text: t, branch: r.branch });
    }
  }
  return out;
}

// El mismo nominado puede aparecer en varios formularios del departamento (sucursales)
function nominados(noms) {
  const g = new Map();
  for (const n of noms) {
    const k = n.nominee_name.trim().toLowerCase();
    const cur = g.get(k) || { name: n.nominee_name.trim(), votos: 0, motivos: [] };
    cur.votos += n.votos;
    cur.motivos.push(...n.motivos.filter((m) => m && m.trim()));
    g.set(k, cur);
  }
  return [...g.values()].sort((a, b) => b.votos - a.votos || a.name.localeCompare(b.name));
}

const titleOfForm = (f) => [f.subprocess, f.branch].filter(Boolean).join(" · ") || "General";

export function buildReportModel(raw, department) {
  const { interno, externo, nominaciones, responses, formInterno } = raw;

  // Interno: una pregunta por criterio de la rúbrica; el % es el del criterio en el dashboard.
  const textoPorCriterio = {};
  for (const q of formInterno?.questions || []) {
    if (q.question_type === "likert_5" && q.criteria_code && !textoPorCriterio[q.criteria_code]) {
      textoPorCriterio[q.criteria_code] = q.text;
    }
  }
  const cardsInterno = interno.criterios
    .filter((c) => c.n > 0)
    .map((c, i) => ({
      key: `i-${c.code}`, label: `Pregunta ${i + 1}`,
      text: textoPorCriterio[c.code] || c.label, porcentaje: c.porcentaje, n: c.n,
    }));

  const gruposExterno = externo.formularios.map((f) => ({
    key: `e-${f.form_id}`, title: titleOfForm(f), porcentaje: f.porcentaje, n: f.n_respuestas,
    cards: f.preguntas.filter((q) => q.n > 0).map((q, i) => ({
      key: `e-${q.question_id}`, label: `Pregunta ${i + 1}`,
      text: statementOf(q.text), porcentaje: q.porcentaje, n: q.n,
    })),
  })).filter((g) => g.cards.length);

  const hasInterno = interno.total_respuestas > 0;
  const hasExterno = externo.total_respuestas > 0;

  // Sucursales / formularios: solo si hay más de uno por tipo (si no, repite el resultado general)
  const sucursales = [];
  if (interno.por_formulario.length > 1) {
    interno.por_formulario.forEach((f) => sucursales.push({
      key: `si-${f.form_id}`, tipo: "Cliente Interno", title: f.branch || "General", porcentaje: f.porcentaje, n: f.n_respuestas,
    }));
  }
  if (externo.formularios.length > 1) {
    externo.formularios.forEach((f) => sucursales.push({
      key: `se-${f.form_id}`, tipo: "Cliente Externo", title: titleOfForm(f), porcentaje: f.porcentaje, n: f.n_respuestas,
    }));
  }

  const preguntasExterno = new Set(gruposExterno.flatMap((g) => g.cards.map((c) => c.text))).size;

  return {
    department,
    hasInterno, hasExterno,
    interno: { porcentaje: interno.porcentaje_global, n: interno.total_respuestas, cards: cardsInterno },
    externo: { porcentaje: externo.porcentaje_global, n: externo.total_respuestas, groups: gruposExterno },
    general: resultadoGeneral(hasInterno ? interno.porcentaje_global : null, hasExterno ? externo.porcentaje_global : null),
    sucursales,
    comments: { interno: comentarios(responses, "interno"), externo: comentarios(responses, "externo") },
    nominees: nominados(nominaciones),
    periodo: periodo(responses),
    totals: {
      respuestas: interno.total_respuestas + externo.total_respuestas,
      preguntasInterno: cardsInterno.length,
      preguntasExterno,
    },
  };
}

// ─── Paginación en hojas ──────────────────────────────────────────────────────

const chunk = (arr, size) => Array.from({ length: Math.ceil(arr.length / size) }, (_, i) => arr.slice(i * size, (i + 1) * size));

/**
 * Reparte grupos de tarjetas en hojas de hasta CARD_ROWS_PER_SHEET filas.
 * Un grupo grande se parte; grupos chicos (p. ej. 2-3 preguntas por formulario
 * externo) comparten hoja. Devuelve [[{title, cards}]] — una lista de bloques por hoja.
 */
export function paginarTarjetas(grupos) {
  const hojas = [];
  let actual = [], filas = 0;
  for (const g of grupos) {
    for (const parte of chunk(g.cards, CARD_COLS * CARD_ROWS_PER_SHEET)) {
      const f = Math.ceil(parte.length / CARD_COLS);
      if (filas + f > CARD_ROWS_PER_SHEET && actual.length) { hojas.push(actual); actual = []; filas = 0; }
      actual.push({ ...g, cards: parte });
      filas += f;
    }
  }
  if (actual.length) hojas.push(actual);
  return hojas;
}

export const paginarComentarios = (lista) => chunk(lista, COMMENTS_PER_SHEET);
export const paginarSucursales = (lista) => chunk(lista, BRANCHES_PER_SHEET);

// ─── Textos por defecto (editables en el borrador) ───────────────────────────

export const METODOLOGIA_DEFAULT =
  "Encuesta cuantitativa con escala de 1 a 5 por pregunta. El % de satisfacción es la suma de los " +
  "puntos obtenidos entre el máximo posible (respuestas × 5): 5 en todas las respuestas equivale a " +
  "100 % y 1 en todas a 20 %. Semáforo: ≥90 % Excelente, ≥80 % Aceptable, <80 % Crítico. " +
  "Las respuestas son anónimas.";

export function defaultTexts(model, cycleName, branch) {
  const tipos = [model.hasInterno && "Cliente Interno", model.hasExterno && "Cliente Externo"].filter(Boolean);
  const dept = branch ? `${model.department} — ${branch}` : model.department;
  const pct = (v) => (v == null ? "—" : `${Math.round(v)}%`);
  let general;
  if (model.general != null) {
    general = `El Departamento de ${dept} alcanzó un ${pct(model.general)} de satisfacción general, combinando la ` +
      `evaluación de clientes internos (${pct(model.interno.porcentaje)}) y externos (${pct(model.externo.porcentaje)}).`;
  } else if (model.hasInterno || model.hasExterno) {
    const p = model.hasInterno ? model.interno.porcentaje : model.externo.porcentaje;
    general = `El Departamento de ${dept} alcanzó un ${pct(p)} de satisfacción entre el ${tipos[0].toLowerCase()}.`;
  } else {
    general = "Aún no hay respuestas para este departamento en el ciclo seleccionado.";
  }
  return {
    cover_kicker: `Informe de resultados · ${cycleName}`,
    cover_title: dept,
    cover_subtitle: tipos.join(" y ") || "Sin respuestas",
    period: model.periodo ? `Período evaluado: ${model.periodo}` : "",
    footer_line1: "Dirección Administrativa",
    footer_line2: "Mejora Continua & Auditoría",
    methodology: METODOLOGIA_DEFAULT,
    general_text: general,
    ambassador_title: "Servicio WOW — Colaborador destacado",
    action_intro: "Se invita al líder del departamento a elaborar un plan de acción a partir de las oportunidades " +
      "de mejora identificadas, priorizando las de mayor impacto en la experiencia del " +
      (model.hasExterno ? "cliente interno y externo." : "colaborador."),
    closing: "Gracias por su atención.",
    summary_title: `Resultado General\n${dept}`,
    summary_paragraph: `Resultado de las encuestas de satisfacción del ${tipos.join(" y ").toLowerCase() || "cliente"} — ${cycleName}.`,
    summary_slogan: "¡Sigamos elevando el estándar del servicio!",
  };
}

/** Embajador por defecto: el más votado; citas = hasta 2 motivos. */
export function defaultAmbassador(model) {
  const top = model.nominees[0];
  return {
    name: top?.name || "",
    role: "Embajador/a del Servicio WOW",
    quotes: (top?.motivos || []).slice(0, 2),
    photo: null,
  };
}
