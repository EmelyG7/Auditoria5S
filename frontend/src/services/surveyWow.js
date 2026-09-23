/**
 * surveyWow.js — Servicio del módulo Servicio WOW 2026 (encuestas).
 * Backend: backend/app/api/survey_wow.py (prefix /servicio-wow).
 */

import api from "./api";

export const surveyWowService = {
  getCycles:      async ()             => (await api.get("/servicio-wow/cycles")).data,
  getDepartments: async ()             => (await api.get("/servicio-wow/departments")).data,
  getCriteria:    async ()             => (await api.get("/servicio-wow/criteria")).data,
  getForms:       async (params = {}) => (await api.get("/servicio-wow/forms", { params })).data,
  getForm:        async (id)          => (await api.get(`/servicio-wow/forms/${id}`)).data,
  getResponses:   async (params = {}) => (await api.get("/servicio-wow/responses", { params })).data,
  getDashboardInterno: async (params = {}) => (await api.get("/servicio-wow/dashboard/interno", { params })).data,
  getDashboardExterno: async (params = {}) => (await api.get("/servicio-wow/dashboard/externo", { params })).data,
  getNominations: async (params = {}) => (await api.get("/servicio-wow/nominations", { params })).data,

  /** Sube varios .txt de Forms (Cliente Interno) para cargar los nominados de cada formulario. */
  uploadNominees: async (files) => {
    const form = new FormData();
    files.forEach((f) => form.append("files", f));
    return (await api.post("/servicio-wow/forms/nominees", form, {
      headers: { "Content-Type": "multipart/form-data" },
    })).data;
  },

  /**
   * Importa el Excel exportado de Microsoft Forms para un formulario.
   * Si es la primera importación y el nombre del archivo no corresponde al
   * formulario, el backend responde 409: reintentar con forzar = true.
   */
  importResponses: async (formId, file, forzar = false) => {
    const form = new FormData();
    form.append("file", file);
    return (await api.post(`/servicio-wow/forms/${formId}/import`, form, {
      params:  { forzar },
      headers: { "Content-Type": "multipart/form-data" },
    })).data;
  },
};
