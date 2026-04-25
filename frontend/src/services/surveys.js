import api from "./api";

function _downloadBlob(blob, filename) {
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement("a");
  a.href     = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export const surveysService = {
  getKPIs:   async (params = {}) => (await api.get("/surveys/kpis", { params })).data,
  list:      async (params = {}) => (await api.get("/surveys/", { params })).data,
  getById:   async (id)         => (await api.get(`/surveys/${id}`)).data,
  create:    async (payload)    => (await api.post("/surveys/", payload)).data,
  update:    async (id, payload)=> (await api.put(`/surveys/${id}`, payload)).data,
  delete:    async (id)         => { await api.delete(`/surveys/${id}`); },

  exportExcel: async (params = {}) => {
    const res = await api.get("/surveys/export", { params, responseType: "blob" });
    _downloadBlob(res.data, "satisfaccion.xlsx");
  },

  importExcel: async (file, overwrite = false) => {
    const form = new FormData();
    form.append("file", file);
    return (await api.post("/surveys/import", form, {
      params: { overwrite },
      headers: { "Content-Type": "multipart/form-data" },
    })).data;
  },
};