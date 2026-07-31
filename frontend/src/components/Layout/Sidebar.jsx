import { NavLink, useNavigate } from "react-router-dom";
import {
  LayoutDashboard, ClipboardCheck, BarChart3,
  Calendar, FileSpreadsheet, LogOut, Star,
  ChevronRight, Users,
} from "lucide-react";
import { useAuth } from "../../store/AuthContext";
import { useTheme } from "../../store/ThemeContext";
import { cn } from "../../utils/cn";

const NAV = [
  { to: "/dashboard/audits",        label: "Dashboard 5S",  icon: LayoutDashboard },
  { to: "/dashboard/surveys",       label: "Satisfacción",  icon: Star },
  { to: "/audits",                  label: "Auditorías",    icon: ClipboardCheck },
  { to: "/surveys",                 label: "Encuestas",     icon: BarChart3 },
  { to: "/schedule",                label: "Calendario",    icon: Calendar },
  { to: "/reports",                 label: "Reportes",      icon: FileSpreadsheet },
];

function getInitials(name) {
  return name?.split(" ").map(w => w[0]).slice(0, 2).join("").toUpperCase() || "U";
}

export default function Sidebar() {
  const { user, logout } = useAuth();
  const { sidebarCollapsed } = useTheme();
  const navigate = useNavigate();
  const isAdmin = user?.role === "admin";

  const handleLogout = () => { logout(); navigate("/login"); };

  const collapsed = sidebarCollapsed;

  return (
    <aside
      className="fixed left-0 top-0 h-full z-30 flex flex-col sidebar-transition"
      style={{ width: collapsed ? "var(--sidebar-collapsed-width)" : "var(--sidebar-width)" }}
    >
      <div className="glass-dark h-full flex flex-col rounded-r-[28px] overflow-hidden">

        {/* Logo */}
        <div
          className={cn(
            "pt-7 pb-6 border-b border-white/10 cursor-pointer hover:bg-white/5 transition-colors",
            collapsed ? "px-3" : "px-5"
          )}
          onClick={() => navigate("/home")}
        >
          <div className={cn("flex items-center gap-3", collapsed && "justify-center")}>
            <img
              src="/logo-cecomsa-blanco-nube.png"
              alt="Cecomsa"
              className="h-9 w-auto object-contain shrink-0"
            />
            {!collapsed && (
              <div>
                <p className="text-white font-semibold text-sm leading-tight">Mejora Continua</p>
                <p className="text-white/50 text-xs">Auditoría 5S</p>
              </div>
            )}
          </div>
        </div>

        {/* Navigation */}
        <nav className={cn("flex-1 py-4 space-y-1 overflow-y-auto", collapsed ? "px-2" : "px-3")}>
          {NAV.map(({ to, label, icon: Icon }) => (
            <NavLink key={to} to={to}>
              {({ isActive }) => (
                <div
                  title={collapsed ? label : undefined}
                  className={cn(
                    "flex items-center gap-3 py-2.5 rounded-xl transition-all duration-200 cursor-pointer",
                    collapsed ? "justify-center px-2" : "px-3",
                    isActive
                      ? "bg-white/20 text-white shadow-sm"
                      : "text-white/60 hover:bg-white/10 hover:text-white"
                  )}
                >
                  <Icon size={18} className="shrink-0" />
                  {!collapsed && (
                    <>
                      <span className="text-sm font-medium flex-1">{label}</span>
                      {isActive && <ChevronRight size={14} className="opacity-60" />}
                    </>
                  )}
                </div>
              )}
            </NavLink>
          ))}

          {isAdmin && (
            <NavLink to="/users">
              {({ isActive }) => (
                <div
                  title={collapsed ? "Usuarios" : undefined}
                  className={cn(
                    "flex items-center gap-3 py-2.5 rounded-xl transition-all duration-200 cursor-pointer",
                    collapsed ? "justify-center px-2" : "px-3",
                    isActive
                      ? "bg-white/20 text-white shadow-sm"
                      : "text-white/60 hover:bg-white/10 hover:text-white"
                  )}
                >
                  <Users size={18} className="shrink-0" />
                  {!collapsed && (
                    <>
                      <span className="text-sm font-medium flex-1">Usuarios</span>
                      {isActive && <ChevronRight size={14} className="opacity-60" />}
                    </>
                  )}
                </div>
              )}
            </NavLink>
          )}
        </nav>

        {/* Footer */}
        <div className={cn("pb-5 pt-2 border-t border-white/10", collapsed ? "px-2" : "px-3")}>
          {collapsed ? (
            <div className="flex justify-center py-2 mb-1">
              <div
                title={user?.full_name}
                className="w-8 h-8 rounded-full bg-white/20 flex items-center justify-center text-white text-xs font-semibold shrink-0"
              >
                {getInitials(user?.full_name)}
              </div>
            </div>
          ) : (
            <div className="flex items-center gap-3 px-3 py-2.5 rounded-xl mb-1">
              <div className="w-8 h-8 rounded-full bg-white/20 flex items-center justify-center shrink-0 text-white text-xs font-semibold">
                {getInitials(user?.full_name)}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-white text-xs font-medium truncate">{user?.full_name}</p>
                <p className="text-white/40 text-xs capitalize">{user?.role}</p>
              </div>
            </div>
          )}

          <button
            onClick={handleLogout}
            title={collapsed ? "Cerrar sesión" : undefined}
            className={cn(
              "flex items-center gap-3 py-2 rounded-xl w-full text-white/50 hover:text-white hover:bg-white/10 transition-all duration-200",
              collapsed ? "justify-center px-2" : "px-3"
            )}
          >
            <LogOut size={16} />
            {!collapsed && <span className="text-xs font-medium">Cerrar sesión</span>}
          </button>
        </div>
      </div>
    </aside>
  );
}
