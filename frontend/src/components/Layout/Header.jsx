import { useState, useRef, useEffect } from "react";
import { Sun, Moon, Droplets, RefreshCw, PanelLeftClose, PanelLeftOpen } from "lucide-react";
import { useAuth } from "../../store/AuthContext";
import { useTheme, PALETTES } from "../../store/ThemeContext";

function getInitials(name) {
  return name?.split(" ").map(w => w[0]).slice(0, 2).join("").toUpperCase() || "U";
}

export default function Header({ title, subtitle, onRefresh }) {
  const { user } = useAuth();
  const { theme, toggleTheme, palette, setPalette, sidebarCollapsed, toggleSidebar } = useTheme();
  const [paletteOpen, setPaletteOpen] = useState(false);
  const paletteRef = useRef(null);

  useEffect(() => {
    const handler = (e) => {
      if (paletteRef.current && !paletteRef.current.contains(e.target)) {
        setPaletteOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  return (
    <header className="header-bar flex items-center gap-3 mb-8 animate-fade-in">

      {/* Sidebar collapse toggle */}
      <button
        onClick={toggleSidebar}
        className="icon-btn-glass flex-shrink-0"
        title={sidebarCollapsed ? "Expandir menú" : "Colapsar menú"}
      >
        {sidebarCollapsed
          ? <PanelLeftOpen size={17} />
          : <PanelLeftClose size={17} />
        }
      </button>

      {/* Page title */}
      <div className="flex-1 min-w-0">
        <h1 className="text-lg font-semibold leading-tight truncate" style={{ color: "var(--text)" }}>
          {title}
        </h1>
        {subtitle && (
          <p className="text-sm mt-0.5 truncate" style={{ color: "var(--text-muted)" }}>
            {subtitle}
          </p>
        )}
      </div>

      {/* Right actions */}
      <div className="flex items-center gap-2 flex-shrink-0">

        {/* Refresh */}
        {onRefresh && (
          <button onClick={onRefresh} className="icon-btn-glass" title="Actualizar">
            <RefreshCw size={16} />
          </button>
        )}

        {/* Palette picker */}
        <div className="relative" ref={paletteRef}>
          <button
            onClick={() => setPaletteOpen(v => !v)}
            className="icon-btn-glass"
            title="Cambiar paleta de color"
          >
            <Droplets size={17} />
          </button>

          {paletteOpen && (
            <div className="palette-dropdown">
              <div className="palette-dropdown-title">Paleta de color</div>
              <div className="palette-grid">
                {PALETTES.map(p => (
                  <button
                    key={p.id}
                    onClick={() => { setPalette(p.id); setPaletteOpen(false); }}
                    className={`swatch-btn${palette === p.id ? " active" : ""}`}
                  >
                    <span
                      className="swatch-chip"
                      style={{ background: p.chip }}
                    />
                    <span className="swatch-name">{p.name}</span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Dark / light toggle */}
        <button
          onClick={toggleTheme}
          className="icon-btn-glass"
          title={theme === "dark" ? "Modo claro" : "Modo oscuro"}
        >
          {theme === "dark" ? <Sun size={17} /> : <Moon size={17} />}
        </button>

        {/* Divider */}
        <div className="w-px h-6 rounded-full mx-1" style={{ background: "var(--border)" }} />

        {/* User card */}
        <div
          className="glass flex items-center gap-2.5 px-3 py-1.5 rounded-2xl"
          style={{ minWidth: 0 }}
        >
          <div
            className="w-7 h-7 rounded-full flex items-center justify-center shrink-0 text-white text-xs font-bold"
            style={{ background: "var(--accent)" }}
          >
            {getInitials(user?.full_name)}
          </div>
          <div className="hidden sm:block min-w-0">
            <p className="text-sm font-semibold leading-tight truncate" style={{ color: "var(--text)" }}>
              {user?.full_name}
            </p>
            <p className="text-xs capitalize leading-tight" style={{ color: "var(--text-muted)" }}>
              {user?.role}
            </p>
          </div>
        </div>
      </div>
    </header>
  );
}
