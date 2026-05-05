/**
 * frontend/src/services/projects.js
 * Servicio completo para el módulo de gestión de proyectos.
 */

import api from "./api";

export const projectsService = {

  // ── Proyectos ──────────────────────────────────────────────────────────────
  list:   async (params = {})       => (await api.get("/projects/", { params })).data,
  getById:async (id)                => (await api.get(`/projects/${id}`)).data,
  create: async (payload)           => (await api.post("/projects/", payload)).data,
  update: async (id, payload)       => (await api.put(`/projects/${id}`, payload)).data,
  delete: async (id)                => { await api.delete(`/projects/${id}`); },
  getKPIs:async (id)                => (await api.get(`/projects/${id}/kpis`)).data,

  // ── Miembros ───────────────────────────────────────────────────────────────
  getMembers:   async (id)          => (await api.get(`/projects/${id}/members`)).data,
  addMember:    async (id, payload) => (await api.post(`/projects/${id}/members`, payload)).data,
  updateMember: async (id, uid, payload) => (await api.put(`/projects/${id}/members/${uid}`, payload)).data,
  removeMember: async (id, uid)     => { await api.delete(`/projects/${id}/members/${uid}`); },

  // ── Sprints ────────────────────────────────────────────────────────────────
  getSprints:     async (id)        => (await api.get(`/projects/${id}/sprints`)).data,
  createSprint:   async (id, p)     => (await api.post(`/projects/${id}/sprints`, p)).data,
  updateSprint:   async (id, sid, p)=> (await api.put(`/projects/${id}/sprints/${sid}`, p)).data,
  startSprint:    async (id, sid)   => (await api.post(`/projects/${id}/sprints/${sid}/start`)).data,
  completeSprint: async (id, sid)   => (await api.post(`/projects/${id}/sprints/${sid}/complete`)).data,
  deleteSprint:   async (id, sid)   => { await api.delete(`/projects/${id}/sprints/${sid}`); },

  // ── Tablero Kanban ─────────────────────────────────────────────────────────
  getBoard:     async (id, sprintId) => (await api.get(`/projects/${id}/board`, { params: sprintId ? { sprint_id: sprintId } : {} })).data,
  addColumn:    async (id, p)        => (await api.post(`/projects/${id}/board/columns`, p)).data,
  updateColumn: async (id, cid, p)   => (await api.put(`/projects/${id}/board/columns/${cid}`, p)).data,
  deleteColumn: async (id, cid)      => { await api.delete(`/projects/${id}/board/columns/${cid}`); },

  // ── Tareas ─────────────────────────────────────────────────────────────────
  getTasks:    async (id, params = {}) => (await api.get(`/projects/${id}/tasks`, { params })).data,
  getTask:     async (id, tid)         => (await api.get(`/projects/${id}/tasks/${tid}`)).data,
  createTask:  async (id, p)           => (await api.post(`/projects/${id}/tasks`, p)).data,
  updateTask:  async (id, tid, p)      => (await api.put(`/projects/${id}/tasks/${tid}`, p)).data,
  moveTask:    async (id, tid, p)      => (await api.post(`/projects/${id}/tasks/${tid}/move`, p)).data,
  deleteTask:  async (id, tid)         => { await api.delete(`/projects/${id}/tasks/${tid}`); },

  // ── Comentarios ────────────────────────────────────────────────────────────
  addComment:  async (id, tid, content) => (await api.post(`/projects/${id}/tasks/${tid}/comments`, { content })).data,

  // ── Time Tracking ──────────────────────────────────────────────────────────
  logTime:     async (id, tid, payload) => (await api.post(`/projects/${id}/tasks/${tid}/time`, payload)).data,
  getTimeLogs: async (id, tid)          => (await api.get(`/projects/${id}/tasks/${tid}/time`)).data,

  // ── Vínculos con auditorías ────────────────────────────────────────────────
  getAuditLinks:  async (id)          => (await api.get(`/projects/${id}/audit-links`)).data,
  addAuditLink:   async (id, payload) => (await api.post(`/projects/${id}/audit-links`, payload)).data,
  removeAuditLink:async (id, lid)     => { await api.delete(`/projects/${id}/audit-links/${lid}`); },

  // ── Adjuntos de tareas ─────────────────────────────────────────────────
  getProjectAttachments: async (projectId) => (await api.get(`/projects/${projectId}/attachments`)).data,

  uploadTaskAttachment: async (projectId, taskId, file) => {
    const formData = new FormData();
    formData.append("file", file);
    return (await api.post(`/projects/${projectId}/tasks/${taskId}/attachments`, formData, {
      headers: { "Content-Type": "multipart/form-data" }
    })).data;
  },
  getTaskAttachments: async (projectId, taskId) => (await api.get(`/projects/${projectId}/tasks/${taskId}/attachments`)).data,
  deleteTaskAttachment: async (projectId, taskId, attachmentId) => { await api.delete(`/projects/${projectId}/tasks/${taskId}/attachments/${attachmentId}`); },

  // ── Actividad de tareas ────────────────────────────────────────────────
  getTaskActivity: async (projectId, taskId) => (await api.get(`/projects/${projectId}/tasks/${taskId}/activity`)).data,

  // ── Relaciones de tareas ───────────────────────────────────────────────
  getTaskRelations: async (projectId, taskId) => (await api.get(`/projects/${projectId}/tasks/${taskId}/relations`)).data,
  addTaskRelation: async (projectId, taskId, payload) => (await api.post(`/projects/${projectId}/tasks/${taskId}/relations`, payload)).data,
  deleteTaskRelation: async (projectId, taskId, relationId) => { await api.delete(`/projects/${projectId}/tasks/${taskId}/relations/${relationId}`); },

  // ── Campos personalizados ──────────────────────────────────────────────
  getCustomFields: async (projectId) => (await api.get(`/projects/${projectId}/custom-fields`)).data,
  createCustomField: async (projectId, payload) => (await api.post(`/projects/${projectId}/custom-fields`, payload)).data,
  updateCustomField: async (projectId, fieldId, payload) => (await api.put(`/projects/${projectId}/custom-fields/${fieldId}`, payload)).data,
  deleteCustomField: async (projectId, fieldId) => { await api.delete(`/projects/${projectId}/custom-fields/${fieldId}`); },

  // ── Valores de campos personalizados ────────────────────────────────────
  getTaskCustomValues: async (projectId, taskId) => (await api.get(`/projects/${projectId}/tasks/${taskId}/custom-values`)).data,
  setTaskCustomValue: async (projectId, taskId, payload) => (await api.post(`/projects/${projectId}/tasks/${taskId}/custom-values`, payload)).data,
};