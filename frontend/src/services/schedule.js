import api from "./api";

export const scheduleService = {

  getCalendar: async (month) => {
    const { data } = await api.get("/schedule/calendar", { params: { month } });
    return data;
  },

  getUpcoming: async (days = 7) => {
    const { data } = await api.get("/schedule/upcoming", { params: { days } });
    return data;
  },

  create: async (payload) => {
    const { data } = await api.post("/schedule/", payload);
    return data;
  },

  update: async (id, payload) => {
    const { data } = await api.put(`/schedule/${id}`, payload);
    return data;
  },

  complete: async (id, extraData = {}) => {
    const { data } = await api.patch(`/schedule/${id}/complete`, extraData);
    return data;
  },

  cancel: async (id) => {
    const { data } = await api.patch(`/schedule/${id}/cancel`);
    return data;
  },

  reactivate: async (id) => {
    const { data } = await api.patch(`/schedule/${id}/reactivate`);
    return data;
  },

  delete: async (id) => {
    await api.delete(`/schedule/${id}`);
  },

  sendReminders: async ({ daysAhead = [1, 3, 7], appUrl = "" } = {}) => {
    const { data } = await api.post("/schedule/send-reminders", null, {
      params: {
        days_ahead: daysAhead,
        app_url:    appUrl,
      },
    });
    return data;
  },
};
