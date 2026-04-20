import { createContext, useContext, useState, useEffect, useCallback } from "react";
import { authService } from "../services/auth";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user,    setUser]    = useState(null);
  const [token,   setToken]   = useState(() => localStorage.getItem("token"));
  const [loading, setLoading] = useState(true);

  // Al montar, verificar si el token guardado sigue válido
  useEffect(() => {
    const init = async () => {
      const savedToken = localStorage.getItem("token");
      if (!savedToken) { setLoading(false); return; }

      try {
        const me = await authService.getMe(savedToken);
        setUser(me);
        setToken(savedToken);
      } catch {
        localStorage.removeItem("token");
        localStorage.removeItem("user");
        setToken(null);
        setUser(null);
      } finally {
        setLoading(false);
      }
    };
    init();
  }, []);

  const login = useCallback(async (email, password) => {
    const data = await authService.login(email, password);
    localStorage.setItem("token", data.access_token);
    localStorage.setItem("user", JSON.stringify({
      id: data.user_id, email: data.email,
      full_name: data.full_name, role: data.role,
    }));
    setToken(data.access_token);
    setUser({ id: data.user_id, email: data.email, full_name: data.full_name, role: data.role });
    return data;
  }, []);

  const logout = useCallback(() => {
    localStorage.removeItem("token");
    localStorage.removeItem("user");
    setToken(null);
    setUser(null);
  }, []);

  return (
    <AuthContext.Provider value={{ user, token, loading, login, logout, isAdmin: user?.role === "admin" }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider");
  return ctx;
};