import { useMemo } from "react";
import { useTheme } from "../store/ThemeContext";

/**
 * Per-palette series + infrastructure colors.
 * c1–c5 are the data-series colors.
 * Semantic colors (success/warning/danger for audit thresholds)
 * are intentionally NOT palette-driven — they remain fixed green/orange/red.
 */
const PALETTE_MAP = {
  corp:     { c1: "#0A4F79", c2: "#1a7fbf", c3: "#5f872f", c4: "#c1781f", c5: "#7C3AED" },
  rosa:     { c1: "#dc0964", c2: "#f0197d", c3: "#16a34a", c4: "#d97706", c5: "#7C3AED" },
  azul:     { c1: "#1e4fc7", c2: "#2f72c8", c3: "#16a34a", c4: "#d97706", c5: "#7C3AED" },
  morada:   { c1: "#900052", c2: "#b0006a", c3: "#16a34a", c4: "#d97706", c5: "#7C3AED" },
  verde:    { c1: "#7cae00", c2: "#9dcf00", c3: "#2f72c8", c4: "#d97706", c5: "#7C3AED" },
  naranja:  { c1: "#fe4e00", c2: "#ff6a20", c3: "#16a34a", c4: "#2f72c8", c5: "#7C3AED" },
  spectrum: { c1: "#7cae00", c2: "#2f72c8", c3: "#d61f86", c4: "#fe4e00", c5: "#900052" },
};

export function useChartColors() {
  const { palette, theme } = useTheme();
  const isDark = theme === "dark";

  return useMemo(() => {
    const p = PALETTE_MAP[palette] || PALETTE_MAP.corp;

    const axis      = isDark ? "rgba(238,241,246,0.45)" : "rgba(30,30,47,0.45)";
    const axisStrong= isDark ? "rgba(238,241,246,0.70)" : "rgba(30,30,47,0.70)";
    const grid      = isDark ? "rgba(255,255,255,0.07)" : `rgba(${hexToRgb(p.c1)},0.07)`;
    const refLine   = isDark ? "rgba(255,255,255,0.18)" : "rgba(30,30,47,0.15)";
    const labelFill = isDark ? "rgba(238,241,246,0.45)" : "rgba(30,30,47,0.45)";
    const cursor    = isDark ? "rgba(255,255,255,0.06)" : `rgba(${hexToRgb(p.c1)},0.06)`;

    const tooltipBg     = isDark ? "rgba(20,14,28,0.94)" : "rgba(255,255,255,0.94)";
    const tooltipBorder = isDark ? "rgba(255,255,255,0.12)" : "rgba(255,255,255,0.72)";
    const tooltipStyle  = {
      borderRadius: 12,
      border: `1px solid ${tooltipBorder}`,
      background: tooltipBg,
      backdropFilter: "blur(14px)",
      fontSize: 12,
      color: isDark ? "#eef1f6" : "#1e1e2f",
    };

    return {
      ...p,
      series:      [p.c1, p.c2, p.c3, p.c4, p.c5],
      isDark,
      axis,
      axisStrong,
      grid,
      refLine,
      labelFill,
      cursor,
      tooltipStyle,
      tooltipBg,
      tooltipBorder,
      // Semantic audit-threshold colors — constant regardless of palette
      sem: {
        success: "#98C062",
        warning: "#EA9947",
        danger:  "#DF4585",
      },
      // Status map for project tasks — c1 drives "in-progress" for current palette
      STATUS: {
        backlog:    "#94a3b8",
        por_hacer:  p.c1,
        en_progreso:p.c4,
        en_revision:p.c2,
        completada: "#98C062",
        cancelada:  "#DF4585",
      },
    };
  }, [palette, isDark]);
}

function hexToRgb(hex) {
  const h = hex.replace("#", "");
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return `${r},${g},${b}`;
}
