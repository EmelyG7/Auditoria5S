import { createContext, useContext, useState, useEffect } from "react";

export const PALETTES = [
  { id: "corp",     name: "Corporativa", chip: "#0A4F79" },
  { id: "rosa",     name: "Rosa",        chip: "#dc0964" },
  { id: "azul",     name: "Azul",        chip: "#1e4fc7" },
  { id: "morada",   name: "Morada",      chip: "#900052" },
  { id: "verde",    name: "Verde",       chip: "#7cae00" },
  { id: "naranja",  name: "Naranja",     chip: "#fe4e00" },
  { id: "spectrum", name: "Espectro",    chip: "linear-gradient(135deg,#7cae00,#1e4fc7 38%,#900052 66%,#fe4e00)" },
  { id: "negro",    name: "Negro",       chip: "#18181b" },
];

const ThemeContext = createContext(null);

export function ThemeProvider({ children }) {
  const [theme, setTheme] = useState(() => {
    try { return localStorage.getItem("nexus-theme") || "light"; } catch { return "light"; }
  });
  const [palette, setPaletteState] = useState(() => {
    try { return localStorage.getItem("nexus-palette-v2") || "corp"; } catch { return "corp"; }
  });
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
    try { localStorage.setItem("nexus-theme", theme); } catch {}
  }, [theme]);

  useEffect(() => {
    document.documentElement.setAttribute("data-palette", palette);
    try { localStorage.setItem("nexus-palette-v2", palette); } catch {}
  }, [palette]);

  const toggleTheme = () => setTheme(t => t === "dark" ? "light" : "dark");

  const setPalette = (id) => {
    if (PALETTES.some(p => p.id === id)) setPaletteState(id);
  };

  const toggleSidebar = () => setSidebarCollapsed(c => !c);
  const toggleMobileSidebar = () => setMobileSidebarOpen(v => !v);
  const closeMobileSidebar = () => setMobileSidebarOpen(false);

  return (
    <ThemeContext.Provider value={{
      theme, toggleTheme, palette, setPalette,
      sidebarCollapsed, toggleSidebar,
      mobileSidebarOpen, toggleMobileSidebar, closeMobileSidebar,
    }}>
      {children}
    </ThemeContext.Provider>
  );
}

export const useTheme = () => useContext(ThemeContext);
