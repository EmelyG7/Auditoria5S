export const fmt = {
  pct: (v, decimals = 1) =>
    v == null ? "—" : `${Number(v).toFixed(decimals)}%`,

  score01: (v, decimals = 1) =>
    v == null ? "—" : `${(Number(v) * 100).toFixed(decimals)}%`,

  date: (d) => {
    if (!d) return "—";
    // Date-only strings (YYYY-MM-DD) must be parsed as local time to avoid UTC-offset shift
    const parsed = typeof d === "string" && /^\d{4}-\d{2}-\d{2}$/.test(d)
      ? new Date(d + "T00:00:00")
      : new Date(d);
    return parsed.toLocaleDateString("es-DO", { day: "2-digit", month: "short", year: "numeric" });
  },

  semaforo: (pct) => {
    const n = Number(pct);
    if (n >= 80) return "Cumple";
    if (n >= 60) return "Por mejorar";
    return "Crítico";
  },

  badgeClass: (estado) => {
    if (estado === "Cumple")       return "badge-cumple";
    if (estado === "Por mejorar")  return "badge-por-mejorar";
    return "badge-critico";
  },

  semaforoColor: (pct) => {
    const n = Number(pct);
    if (n >= 80) return "#98C062";
    if (n >= 60) return "#EA9947";
    return "#DF4585";
  },
};