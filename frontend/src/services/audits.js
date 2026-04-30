/**
 * audits.js — Servicio de auditorías
 *
 * Sin cambios en la firma pública, pero create/update ahora
 * aceptan el campo opcional `event_id` en el payload si el
 * backend lo soporta (para vincular auditoría ↔ evento de calendario).
 *
 * El campo event_id es procesado en el backend para marcar el evento
 * como "Completada" automáticamente.  Si el backend no lo soporta
 * aún, simplemente lo ignora — no rompe nada.
 */

import api from "./api";

function _downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a   = document.createElement("a");
  a.href    = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export const auditsService = {
  // ── Tipos de auditoría ──────────────────────────────────────────────────────
  getTypes: async () => {
    const { data } = await api.get("/audits/types");
    return data;
  },

  // ── KPIs del dashboard ──────────────────────────────────────────────────────
  getKPIs: async (params = {}) => {
    const { data } = await api.get("/audits/kpis", { params });
    return data;
  },

  // ── Listado paginado ────────────────────────────────────────────────────────
  list: async (params = {}) => {
    const { data } = await api.get("/audits/", { params });
    return data;
  },

  // ── Detalle por ID ──────────────────────────────────────────────────────────
  getById: async (id) => {
    const { data } = await api.get(`/audits/${id}`);
    return data;
  },

  /**
   * Crear auditoría.
   *
   * El payload puede incluir el campo opcional `event_id` (number).
   * Si está presente y el backend lo soporta, el evento del calendario
   * se marcará automáticamente como "Completada" en el mismo request.
   *
   * Si prefieres manejarlo en el frontend (como hace SchedulePage),
   * omite `event_id` aquí y llama a scheduleService.complete() después.
   */
  create: async (payload) => {
    const { data } = await api.post("/audits/", payload);
    return data;
  },

  /**
   * Editar auditoría existente.
   * Acepta los mismos campos que `create`, incluido `event_id`.
   */
  update: async (id, payload) => {
    const { data } = await api.put(`/audits/${id}`, payload);
    return data;
  },

  // ── Eliminar ────────────────────────────────────────────────────────────────
  delete: async (id) => {
    await api.delete(`/audits/${id}`);
  },

  // ── Exportar Excel ──────────────────────────────────────────────────────────
  exportSummary: async (params = {}) => {
    const res = await api.get("/audits/export/summary", { params, responseType: "blob" });
    _downloadBlob(res.data, "auditoria_resumen.xlsx");
  },

  exportDetail: async (params = {}) => {
    const res = await api.get("/audits/export/detail", { params, responseType: "blob" });
    _downloadBlob(res.data, "auditoria_detalle.xlsx");
  },

  // ── Importar Excel ──────────────────────────────────────────────────────────
  importExcel: async (file, audit_type_id, overwrite = false) => {
    const form = new FormData();
    form.append("file", file);
    const { data } = await api.post("/audits/import", form, {
      params:  { audit_type_id, overwrite },
      headers: { "Content-Type": "multipart/form-data" },
    });
    return data;
  },

  // ── Análisis inteligente ──────────────────────────────────────────────────

  getAnalysis: async (auditId, historyN = 5) => {
    const { data } = await api.get(`/audits/${auditId}/analysis`, {
      params: { history_n: historyN },
    });
    return data;
  },

  getBranchTrend: async ({ branch, audit_type_id, limit = 10 }) => {
    const { data } = await api.get("/audits/branch-trend", {
      params: { branch, audit_type_id, limit },
    });
    return data;
  },
};