import api from "./api";

export const auditsService = {
  // Tipos
  getTypes: async () => {
    const { data } = await api.get("/audits/types");
    return data;
  },

  // KPIs dashboard
  getKPIs: async (params = {}) => {
    const { data } = await api.get("/audits/kpis", { params });
    return data;
  },

  // Listado paginado
  list: async (params = {}) => {
    const { data } = await api.get("/audits/", { params });
    return data;
  },

  // Detalle
  getById: async (id) => {
    const { data } = await api.get(`/audits/${id}`);
    return data;
  },

  // Crear
  create: async (payload) => {
    const { data } = await api.post("/audits/", payload);
    return data;
  },

  // Editar
  update: async (id, payload) => {
    const { data } = await api.put(`/audits/${id}`, payload);
    return data;
  },

  // Eliminar
  delete: async (id) => {
    await api.delete(`/audits/${id}`);
  },

  // Importar Excel
  importExcel: async (file, audit_type_id, overwrite = false) => {
    const form = new FormData();
    form.append("file", file);
    const { data } = await api.post("/audits/import", form, {
      params: { audit_type_id, overwrite },
      headers: { "Content-Type": "multipart/form-data" },
    });
    return data;
  },
};