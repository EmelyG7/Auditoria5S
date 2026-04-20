import api from "./api";

export const authService = {
  login: async (email, password) => {
    const { data } = await api.post("/auth/login", { email, password });
    return data;
  },
  getMe: async (token) => {
    const { data } = await api.get("/auth/me", {
      headers: { Authorization: `Bearer ${token}` },
    });
    return data;
  },
  register: async (userData) => {
    const { data } = await api.post("/auth/register", userData);
    return data;
  },
  listUsers: async () => {
    const { data } = await api.get("/auth/users");
    return data;
  },
  changePassword: async (current_password, new_password) => {
    const { data } = await api.post("/auth/me/change-password", { current_password, new_password });
    return data;
  },
};