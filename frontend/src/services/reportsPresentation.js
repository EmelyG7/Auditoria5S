/**
 * reportsPresentation.js — Servicio del generador de "Reportes de
 * Presentación" departamentales.
 */

import api from "./api";

export const reportsPresentationService = {
  // ── Datos completos para armar el reporte ────────────────────────────────
  getData: async ({ audit_type_id, period_month, period_year }) => {
    const { data } = await api.get("/reports/presentation/data", {
      params: { audit_type_id, period_month, period_year },
    });
    return data;
  },

  // ── Borrador (resumir edición) ───────────────────────────────────────────
  saveDraft: async ({ audit_type_id, period_month, period_year, draft_data }) => {
    const { data } = await api.post("/reports/presentation/draft", {
      audit_type_id,
      period_month,
      period_year,
      draft_data,
    });
    return data;
  },

  getDraft: async ({ audit_type_id, period_month, period_year }) => {
    const { data } = await api.get("/reports/presentation/draft", {
      params: { audit_type_id, period_month, period_year },
    });
    return data; // null si no hay borrador guardado
  },
};
