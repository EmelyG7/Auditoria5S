import { NavLink, useNavigate } from "react-router-dom";
import {
  LayoutDashboard, ClipboardCheck, BarChart3,
  Calendar, FileSpreadsheet, LogOut, Star, User,
  ChevronRight, Activity,
} from "lucide-react";
import { useAuth } from "../../store/AuthContext";
import { cn } from "../../utils/cn";
import { Users } from "lucide-react";

const NAV = [
  { to: "/dashboard/audits",   label: "Dashboard 5S",       icon: LayoutDashboard },
  { to: "/dashboard/surveys",  label: "Satisfacción",       icon: Star },
  { to: "/audits",             label: "Auditorías",         icon: ClipboardCheck },
  { to: "/surveys",            label: "Encuestas",          icon: BarChart3 },
  { to: "/schedule",           label: "Calendario",         icon: Calendar },
  { to: "/reports",            label: "Reportes",           icon: FileSpreadsheet },
  
];

export default function Sidebar() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const isAdmin = user?.role === "admin";

  const handleLogout = () => { logout(); navigate("/login"); };

  return (
    <aside
      className="fixed left-0 top-0 h-full z-30 flex flex-col"
      style={{ width: "var(--sidebar-width)" }}
    >
      {/* Panel glassmorphism */}
      <div className="glass-dark h-full flex flex-col rounded-r-[28px] overflow-hidden">

        {/* Logo */}
        <div className="px-6 pt-7 pb-6 border-b border-white/10">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-white/20 flex items-center justify-center">
              <Activity size={18} className="text-white" />
            </div>
            <div>
              <p className="text-white font-semibold text-sm leading-tight">Mejora Continua</p>
              <p className="text-white/50 text-xs">Auditoría 5S</p>
            </div>
          </div>
        </div>

        {/* Navegación */}
        <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
          {NAV.map(({ to, label, icon: Icon }) => (
            <NavLink key={to} to={to}>
              {({ isActive }) => (
                <div
                  className={cn(
                    "flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all duration-200 group cursor-pointer",
                    isActive
                      ? "bg-white/20 text-white shadow-sm"
                      : "text-white/60 hover:bg-white/10 hover:text-white"
                  )}
                >
                  <Icon size={18} className="shrink-0" />
                  <span className="text-sm font-medium flex-1">{label}</span>
                  {isActive && <ChevronRight size={14} className="opacity-60" />}
                </div>
              )}
            </NavLink>
          ))}
             {/* Solo para admin: enlace a Usuarios */}
          {isAdmin && (
            <NavLink to="/users">
              {({ isActive }) => (
                <div
                  className={cn(
                    "flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all duration-200 group cursor-pointer",
                    isActive
                      ? "bg-white/20 text-white shadow-sm"
                      : "text-white/60 hover:bg-white/10 hover:text-white"
                  )}
                >
                  <Users size={18} className="shrink-0" />
                  <span className="text-sm font-medium flex-1">Usuarios</span>
                  {isActive && <ChevronRight size={14} className="opacity-60" />}
                </div>
              )}
            </NavLink>
          )}
        </nav>

        {/* Footer usuario */}
        <div className="px-3 pb-5 pt-2 border-t border-white/10">
          <div className="flex items-center gap-3 px-3 py-2.5 rounded-xl mb-1">
            <div className="w-8 h-8 rounded-full bg-white/20 flex items-center justify-center shrink-0">
              <User size={14} className="text-white" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-white text-xs font-medium truncate">{user?.full_name}</p>
              <p className="text-white/40 text-xs capitalize">{user?.role}</p>
            </div>
          </div>
          <button
            onClick={handleLogout}
            className="flex items-center gap-3 px-3 py-2 rounded-xl w-full text-white/50 hover:text-white hover:bg-white/10 transition-all duration-200"
          >
            <LogOut size={16} />
            <span className="text-xs font-medium">Cerrar sesión</span>
          </button>
        </div>
      </div>
    </aside>
  );
}