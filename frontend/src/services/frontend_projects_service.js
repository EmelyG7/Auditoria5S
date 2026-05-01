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
};