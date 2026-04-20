import api from "./api";

export const scheduleService = {
  getCalendar: async (month, params = {}) =>
    (await api.get("/schedule/calendar", { params: { month, ...params } })).data,
  list:        async (params = {}) => (await api.get("/schedule/", { params })).data,
  getById:     async (id)          => (await api.get(`/schedule/${id}`)).data,
  create:      async (payload)     => (await api.post("/schedule/", payload)).data,
  update:      async (id, payload) => (await api.put(`/schedule/${id}`, payload)).data,
  delete:      async (id)          => { await api.delete(`/schedule/${id}`); },
  complete:    async (id, payload) => (await api.patch(`/schedule/${id}/complete`, payload)).data,
  cancel:      async (id, reason)  => (await api.patch(`/schedule/${id}/cancel`, null, { params: { cancellation_reason: reason } })).data,
};