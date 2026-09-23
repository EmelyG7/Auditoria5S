/**
 * evaluators.js — Programación y asignación de evaluadores (Servicio WOW 2026).
 * Backend: backend/app/api/evaluators.py (prefix /servicio-wow/evaluadores).
 */

import api from "./api";

export const evaluatorsService = {
  getSchedule:            async (params = {}) => (await api.get("/servicio-wow/evaluadores/schedule", { params })).data,
  updateScheduleEntry:    async (id, payload) => (await api.put(`/servicio-wow/evaluadores/schedule/${id}`, payload)).data,
  getAssignments:         async (params = {}) => (await api.get("/servicio-wow/evaluadores/assignments", { params })).data,
  getParticipationMatrix: async (params = {}) => (await api.get("/servicio-wow/evaluadores/participation-matrix", { params })).data,
  getSampleSummary:       async (params = {}) => (await api.get("/servicio-wow/evaluadores/sample-summary", { params })).data,
  getSamplingConfig:      async (params = {}) => (await api.get("/servicio-wow/evaluadores/sampling-config", { params })).data,
  updateSamplingConfig:   async (payload)     => (await api.put("/servicio-wow/evaluadores/sampling-config", payload)).data,
  searchEmployees:        async (search)      => (await api.get("/servicio-wow/evaluadores/employees", { params: { search } })).data,

  // ── Ampliar una lista / seguimiento de respuestas ───────────────────────────
  getCandidatos:          async (entryId, params) => (await api.get(`/servicio-wow/evaluadores/schedule/${entryId}/candidatos`, { params })).data,
  addAssignments:         async (entryId, employee_ids) => (await api.post(`/servicio-wow/evaluadores/schedule/${entryId}/assignments`, { employee_ids })).data,
  setAssignmentStatus:    async (id, status)  => (await api.patch(`/servicio-wow/evaluadores/assignments/${id}`, { status })).data,
  deleteAssignment:       async (id)          => (await api.delete(`/servicio-wow/evaluadores/assignments/${id}`)).data,

  // ── Sorteo (Fase 2) ─────────────────────────────────────────────────────────
  getSorteoEvaluaciones:  async ()            => (await api.get("/servicio-wow/evaluadores/sorteo/evaluaciones")).data,
  sorteoPreview:          async (claves)      => (await api.post("/servicio-wow/evaluadores/sorteo/preview", { claves })).data,
  sorteoApply:            async (claves, token) => (await api.post("/servicio-wow/evaluadores/sorteo/apply", { claves, token })).data,

  importRoster: async (file) => {
    const form = new FormData();
    form.append("file", file);
    return (await api.post("/servicio-wow/evaluadores/roster/import", form, {
      headers: { "Content-Type": "multipart/form-data" },
    })).data;
  },

  importExcel: async (file) => {
    const form = new FormData();
    form.append("file", file);
    return (await api.post("/servicio-wow/evaluadores/import", form, {
      headers: { "Content-Type": "multipart/form-data" },
    })).data;
  },
};
