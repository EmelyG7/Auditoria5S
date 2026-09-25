/**
 * wowReports.js — Reportes de resultados del Servicio WOW 2026 (informe
 * detallado y resumen ejecutivo).
 *
 * No hay endpoint de "datos del reporte": `loadWowReportData` pide lo mismo que
 * el dashboard (/dashboard/interno, /dashboard/externo, /nominations) más las
 * respuestas anónimas (/responses, para los comentarios abiertos) y el detalle
 * del formulario interno (texto de cada pregunta), todo filtrado por
 * ciclo + departamento (+ sucursal). Los % vienen tal cual del backend.
 *
 * Borrador: backend/app/api/reports_wow.py (prefix /reports).
 */

import api from "./api";
import { surveyWowService } from "./surveyWow";

async function allResponses(params) {
  const items = [];
  for (let page = 1; ; page++) {
    const data = await surveyWowService.getResponses({ ...params, page, page_size: 100 });
    items.push(...data.items);
    if (!data.has_next) return items;
  }
}

export const wowReportsService = {
  getDraft: async ({ cycle_id, department_id }) =>
    (await api.get("/reports/servicio-wow/draft", { params: { cycle_id, department_id } })).data, // null si no hay

  saveDraft: async ({ cycle_id, department_id, draft_data }) =>
    (await api.post("/reports/servicio-wow/draft", { cycle_id, department_id, draft_data })).data,

  /** Datos crudos del reporte, desde los endpoints del dashboard. `branch` es opcional. */
  loadData: async ({ cycle_id, department_id, branch }) => {
    const filtros = { cycle_id, department_id, ...(branch ? { branch } : {}) };
    const [interno, externo, nominaciones, responses, formsInternos] = await Promise.all([
      surveyWowService.getDashboardInterno(filtros),
      surveyWowService.getDashboardExterno(filtros),
      surveyWowService.getNominations(filtros),
      allResponses(filtros),
      surveyWowService.getForms({ ...filtros, survey_type: "interno" }),
    ]);
    // Texto de cada pregunta interna (una por criterio). Las preguntas internas son
    // las mismas en todas las sucursales del departamento: basta el primer formulario con preguntas.
    const conPreguntas = formsInternos.find((f) => f.n_questions > 0);
    const formInterno = conPreguntas ? await surveyWowService.getForm(conPreguntas.id) : null;
    return { filtros, interno, externo, nominaciones, responses, formInterno };
  },
};
