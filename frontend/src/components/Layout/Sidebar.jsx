import { useState, useEffect, useRef } from "react";
import { NavLink, useNavigate, useLocation } from "react-router-dom";
import {
  LayoutDashboard, ClipboardCheck, BarChart3,
  Calendar, FileSpreadsheet, LogOut, Star,
  ChevronRight, ChevronDown, Users, Sparkles,
  FileText, MessageSquareText, PieChart, UserCheck, Presentation,
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

// Grupos colapsables. Su estado abierto/cerrado se recuerda en localStorage
// (mismo patrón try/catch que theme/palette en ThemeContext).
const NAV_GROUPS = [
  {
    id: "servicio-wow",
    label: "Servicio WOW 2026",
    icon: Sparkles,
    items: [
      { to: "/servicio-wow/formularios", label: "Formularios", icon: FileText },
      { to: "/servicio-wow/respuestas",  label: "Respuestas",  icon: MessageSquareText },
      { to: "/servicio-wow/dashboard",   label: "Dashboard",   icon: PieChart },
      { to: "/servicio-wow/evaluadores", label: "Evaluadores", icon: UserCheck },
      { to: "/servicio-wow/reportes",    label: "Reportes",    icon: Presentation },
    ],
  },
];

const GROUPS_STORAGE_KEY = "nexus-sidebar-groups";

function loadOpenGroups() {
  try {
    return JSON.parse(localStorage.getItem(GROUPS_STORAGE_KEY)) || {};
  } catch {
    return {};
  }
}

function NavItem({ to, label, icon: Icon, collapsed, nested, onClick }) {
  return (
    <NavLink to={to} onClick={onClick}>
      {({ isActive }) => (
        <div
          title={collapsed ? label : undefined}
          className={cn(
            "flex items-center gap-3 py-2.5 rounded-xl transition-all duration-200 cursor-pointer",
            collapsed ? "justify-center px-2" : nested ? "pl-9 pr-3" : "px-3",
            isActive
              ? "bg-white/20 text-white shadow-sm"
              : "text-white/60 hover:bg-white/10 hover:text-white"
          )}
        >
          <Icon size={nested && !collapsed ? 16 : 18} className="shrink-0" />
          {!collapsed && (
            <>
              <span className="text-sm font-medium flex-1">{label}</span>
              {isActive && <ChevronRight size={14} className="opacity-60" />}
            </>
          )}
        </div>
      )}
    </NavLink>
  );
}

function getInitials(name) {
  return name?.split(" ").map(w => w[0]).slice(0, 2).join("").toUpperCase() || "U";
}

export default function Sidebar() {
  const { user, logout } = useAuth();
  const { sidebarCollapsed, mobileSidebarOpen, closeMobileSidebar } = useTheme();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const isAdmin = user?.role === "admin";
  const [openGroups, setOpenGroups] = useState(loadOpenGroups);

  useEffect(() => {
    try { localStorage.setItem(GROUPS_STORAGE_KEY, JSON.stringify(openGroups)); } catch { /* storage bloqueado: solo se pierde la preferencia */ }
  }, [openGroups]);

  // Al navegar hacia una ruta del grupo, abrirlo para que se vea el ítem activo.
  // En el primer render se respeta lo guardado (el encabezado ya queda resaltado).
  // (Se compara con la ruta previa, no con un flag de "primer render": StrictMode monta dos veces.)
  const prevPath = useRef(pathname);
  useEffect(() => {
    if (prevPath.current === pathname) return;
    prevPath.current = pathname;
    const active = NAV_GROUPS.find(g => g.items.some(i => pathname.startsWith(i.to)));
    if (active && !openGroups[active.id]) setOpenGroups(o => ({ ...o, [active.id]: true }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname]);

  const toggleGroup = (id) => setOpenGroups(o => ({ ...o, [id]: !o[id] }));

  const handleLogout = () => { logout(); navigate("/login"); };
  const handleNavClick = () => closeMobileSidebar();

  // En el drawer móvil siempre se ve expandido (ancho completo), sin importar
  // si el usuario dejó el sidebar "colapsado" en su sesión de escritorio.
  const collapsed = sidebarCollapsed && !mobileSidebarOpen;

  return (
    <>
      {/* Backdrop — solo en móvil, cuando el drawer está abierto */}
      {mobileSidebarOpen && (
        <div className="sidebar-backdrop lg:hidden" onClick={closeMobileSidebar} />
      )}

      <aside
        className={cn(
          "fixed left-0 top-0 h-full z-40 flex flex-col sidebar-transition",
          "w-[var(--sidebar-width)]",
          collapsed ? "lg:w-[var(--sidebar-collapsed-width)]" : "lg:w-[var(--sidebar-width)]",
          mobileSidebarOpen ? "translate-x-0" : "-translate-x-full",
          "lg:translate-x-0"
        )}
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
          {NAV.map((item) => (
            <NavItem key={item.to} {...item} collapsed={collapsed} onClick={handleNavClick} />
          ))}

          {NAV_GROUPS.map((group) => {
            const GroupIcon = group.icon;
            const isOpen = !!openGroups[group.id];
            const hasActive = group.items.some(i => pathname.startsWith(i.to));

            // Sidebar colapsado: sin encabezado de texto, solo un separador y los íconos.
            if (collapsed) {
              return (
                <div key={group.id} className="pt-2 space-y-1">
                  <div className="mx-2 border-t border-white/15" title={group.label} />
                  {group.items.map((item) => (
                    <NavItem key={item.to} {...item} collapsed onClick={handleNavClick} />
                  ))}
                </div>
              );
            }

            return (
              <div key={group.id} className="pt-1">
                <button
                  type="button"
                  onClick={() => toggleGroup(group.id)}
                  aria-expanded={isOpen}
                  className={cn(
                    "w-full flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all duration-200",
                    hasActive && !isOpen
                      ? "bg-white/10 text-white"
                      : "text-white/60 hover:bg-white/10 hover:text-white"
                  )}
                >
                  <GroupIcon size={18} className="shrink-0" />
                  <span className="text-sm font-medium flex-1 text-left">{group.label}</span>
                  <ChevronDown
                    size={14}
                    className={cn("opacity-60 transition-transform duration-200", isOpen ? "rotate-0" : "-rotate-90")}
                  />
                </button>
                {isOpen && (
                  <div className="mt-1 space-y-1">
                    {group.items.map((item) => (
                      <NavItem key={item.to} {...item} nested collapsed={false} onClick={handleNavClick} />
                    ))}
                  </div>
                )}
              </div>
            );
          })}

          {isAdmin && (
            <NavItem to="/users" label="Usuarios" icon={Users} collapsed={collapsed} onClick={handleNavClick} />
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
    </>
  );
}
