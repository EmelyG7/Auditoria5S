import api from "./api";

export const surveysService = {
  getKPIs:   async (params = {}) => (await api.get("/surveys/kpis", { params })).data,
  list:      async (params = {}) => (await api.get("/surveys/", { params })).data,
  getById:   async (id)         => (await api.get(`/surveys/${id}`)).data,
  create:    async (payload)    => (await api.post("/surveys/", payload)).data,
  update:    async (id, payload)=> (await api.put(`/surveys/${id}`, payload)).data,
  delete:    async (id)         => { await api.delete(`/surveys/${id}`); },
  importExcel: async (file, overwrite = false) => {
    const form = new FormData();
    form.append("file", file);
    return (await api.post("/surveys/import", form, {
      params: { overwrite },
      headers: { "Content-Type": "multipart/form-data" },
    })).data;
  },
};