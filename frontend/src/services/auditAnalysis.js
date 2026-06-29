/**
 * auditAnalysis.js — Servicio de análisis comparativo, plan de acción
 * y generación de texto con IA para una auditoría.
 *
 * getAuditAnalysis() reutiliza el mismo endpoint que auditsService.getAnalysis()
 * (GET /audits/{id}/analysis): la respuesta ahora incluye además los campos
 * `current`, `previous`, `delta` y `action_plans` usados por estos paneles.
 */

import api from "./api";

export const auditAnalysisService = {
  getAuditAnalysis: async (auditId) => {
    const { data } = await api.get(`/audits/${auditId}/analysis`);
    return data;
  },

  // ── Plan de acción ──────────────────────────────────────────────────────
  getActionPlans: async (auditId) => {
    const { data } = await api.get(`/audits/${auditId}/action-plans`);
    return data;
  },

  createActionPlan: async (auditId, payload) => {
    const { data } = await api.post(`/audits/${auditId}/action-plans`, payload);
    return data;
  },

  updateActionPlan: async (auditId, planId, payload) => {
    const { data } = await api.put(`/audits/${auditId}/action-plans/${planId}`, payload);
    return data;
  },

  deleteActionPlan: async (auditId, planId) => {
    await api.delete(`/audits/${auditId}/action-plans/${planId}`);
  },

  // ── Generación de texto con IA (proxy seguro hacia Claude) ──────────────
  generateAI: async (auditId, prompt, maxTokens = 1000) => {
    const { data } = await api.post(`/audits/${auditId}/ai-generate`, {
      prompt,
      max_tokens: maxTokens,
    });
    return data.text;
  },
};
