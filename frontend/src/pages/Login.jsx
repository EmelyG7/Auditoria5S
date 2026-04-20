import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../store/AuthContext";
import { Lock, Mail, Eye, EyeOff, Activity, Loader2 } from "lucide-react";

export default function Login() {
  const { login }        = useAuth();
  const navigate         = useNavigate();
  const [email, setEmail]= useState("");
  const [pass,  setPass] = useState("");
  const [show,  setShow] = useState(false);
  const [error, setError]= useState("");
  const [loading, setL]  = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(""); setL(true);
    try {
      await login(email, pass);
      navigate("/dashboard/audits");
    } catch (err) {
      setError(err.response?.data?.detail || "Credenciales incorrectas.");
    } finally {
      setL(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4 relative">
      {/* Orbes decorativos */}
      <div className="absolute top-1/4 -left-24 w-96 h-96 rounded-full bg-primary/10 blur-3xl pointer-events-none" />
      <div className="absolute bottom-1/4 -right-24 w-96 h-96 rounded-full bg-secondary/10 blur-3xl pointer-events-none" />

      <div className="glass rounded-3xl p-8 w-full max-w-sm relative animate-fade-up shadow-glass">
        {/* Logo */}
        <div className="flex flex-col items-center mb-8">
          <div className="w-14 h-14 rounded-2xl bg-primary flex items-center justify-center mb-4 shadow-kpi">
            <Activity size={26} className="text-white" />
          </div>
          <h1 className="text-xl font-semibold text-ink">Mejora Continua</h1>
          <p className="text-ink/50 text-sm mt-1">Auditoría 5S & Satisfacción</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Email */}
          <div>
            <label className="text-xs font-semibold text-ink/60 uppercase tracking-wide mb-1.5 block">Email</label>
            <div className="relative">
              <Mail size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-ink/30" />
              <input
                type="email" required value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="admin@example.com"
                className="input-glass pl-10"
              />
            </div>
          </div>

          {/* Contraseña */}
          <div>
            <label className="text-xs font-semibold text-ink/60 uppercase tracking-wide mb-1.5 block">Contraseña</label>
            <div className="relative">
              <Lock size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-ink/30" />
              <input
                type={show ? "text" : "password"} required value={pass}
                onChange={(e) => setPass(e.target.value)}
                placeholder="••••••••"
                className="input-glass pl-10 pr-10"
              />
              <button type="button" onClick={() => setShow(!show)}
                className="absolute right-3.5 top-1/2 -translate-y-1/2 text-ink/30 hover:text-ink/60">
                {show ? <EyeOff size={15} /> : <Eye size={15} />}
              </button>
            </div>
          </div>

          {error && (
            <div className="bg-danger/10 border border-danger/20 text-danger text-sm rounded-xl px-4 py-2.5">
              {error}
            </div>
          )}

          <button type="submit" disabled={loading} className="btn-primary w-full flex items-center justify-center gap-2 mt-2">
            {loading && <Loader2 size={16} className="animate-spin" />}
            {loading ? "Iniciando sesión..." : "Iniciar sesión"}
          </button>
        </form>

        <p className="text-center text-ink/30 text-xs mt-6">
          Cecomsa · Sistema de Gestión Interna
        </p>
      </div>
    </div>
  );
}