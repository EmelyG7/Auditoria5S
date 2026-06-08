import { Filter, X } from "lucide-react";

const QUARTERS = ["Q1", "Q2", "Q3", "Q4"];
const YEARS    = Array.from({ length: 5 }, (_, i) => new Date().getFullYear() - i);
const MONTHS   = [
  "Enero","Febrero","Marzo","Abril","Mayo","Junio",
  "Julio","Agosto","Septiembre","Octubre","Noviembre","Diciembre",
];

// "Activo" cuando un valor es distinto de los vacíos/defaults
function isActive(v) {
  return v !== undefined && v !== null && v !== "" && v !== false;
}

export default function FilterBar({
  filters,
  onFilterChange,
  onReset,
  auditTypes  = [],
  branches    = [],
  showBranch  = true,
  showType    = true,
  showDateRange = false,
  showPeriod  = false,
}) {
  const hasActiveFilter = Object.values(filters).some(isActive);

  return (
    <div className="glass rounded-2xl px-4 py-3 flex flex-wrap items-center gap-3 mb-6 animate-fade-in">
      <div className="flex items-center gap-2 text-primary/60 shrink-0">
        <Filter size={15} />
        <span className="text-xs font-semibold uppercase tracking-wide">Filtros</span>
      </div>

      {/* Año */}
      <select
        value={filters.year || ""}
        onChange={(e) => onFilterChange("year", e.target.value ? Number(e.target.value) : undefined)}
        className="input-glass text-sm py-1.5 px-3 w-auto"
      >
        <option value="">Todos los años</option>
        {YEARS.map((y) => <option key={y} value={y}>{y}</option>)}
      </select>

      {/* Trimestre */}
      <select
        value={filters.quarter || ""}
        onChange={(e) => onFilterChange("quarter", e.target.value || undefined)}
        className="input-glass text-sm py-1.5 px-3 w-auto"
      >
        <option value="">Todos los trimestres</option>
        {QUARTERS.map((q) => <option key={q} value={q}>{q}</option>)}
      </select>

      {/* Tipo de auditoría */}
      {showType && auditTypes.length > 0 && (
        <select
          value={filters.audit_type_id || ""}
          onChange={(e) => onFilterChange("audit_type_id", e.target.value ? Number(e.target.value) : undefined)}
          className="input-glass text-sm py-1.5 px-3 w-auto"
        >
          <option value="">Todos los tipos</option>
          {auditTypes.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
        </select>
      )}

      {/* Sucursal */}
      {showBranch && (
        <select
          value={filters.branch || ""}
          onChange={(e) => onFilterChange("branch", e.target.value || undefined)}
          className="input-glass text-sm py-1.5 px-3 w-auto"
        >
          <option value="">Todas las sucursales</option>
          {branches.map((b) => <option key={b} value={b}>{b}</option>)}
        </select>
      )}

      {/* Rango de fechas — dos inputs nativos lado a lado */}
      {showDateRange && (
        <>
          <div className="flex items-center gap-1.5">
            <label className="text-[10px] font-semibold text-ink/40 uppercase tracking-wide shrink-0">
              Desde
            </label>
            <input
              type="date"
              value={filters.date_from || ""}
              onChange={(e) => onFilterChange("date_from", e.target.value || undefined)}
              className="input-glass text-sm py-1.5 px-3 w-auto"
            />
          </div>
          <div className="flex items-center gap-1.5">
            <label className="text-[10px] font-semibold text-ink/40 uppercase tracking-wide shrink-0">
              Hasta
            </label>
            <input
              type="date"
              value={filters.date_to || ""}
              onChange={(e) => onFilterChange("date_to", e.target.value || undefined)}
              className="input-glass text-sm py-1.5 px-3 w-auto"
            />
          </div>
        </>
      )}

      {/* Período */}
      {showPeriod && (
        <>
          <div className="flex items-center gap-1 text-xs text-ink/40 font-semibold uppercase tracking-wide shrink-0">
            Período:
          </div>
          <select
            value={filters.period_month || ""}
            onChange={(e) => onFilterChange("period_month", e.target.value ? Number(e.target.value) : undefined)}
            className="input-glass text-sm py-1.5 px-3 w-auto"
          >
            <option value="">Todos los meses</option>
            {MONTHS.map((m, i) => <option key={i + 1} value={i + 1}>{m}</option>)}
          </select>
          <select
            value={filters.period_year || ""}
            onChange={(e) => onFilterChange("period_year", e.target.value ? Number(e.target.value) : undefined)}
            className="input-glass text-sm py-1.5 px-3 w-auto"
          >
            <option value="">Todos los años</option>
            {YEARS.map((y) => <option key={y} value={y}>{y}</option>)}
          </select>
        </>
      )}

      {/* Limpiar — siempre en el DOM para evitar layout shifts; invisible cuando no hay filtros */}
      <button
        onClick={onReset}
        disabled={!hasActiveFilter}
        className={`btn-ghost flex items-center gap-1.5 text-xs ml-auto text-secondary
                   hover:text-secondary/80 transition-colors
                   ${hasActiveFilter ? "opacity-100" : "opacity-0 pointer-events-none"}`}
      >
        <X size={13} />
        Limpiar filtros
      </button>
    </div>
  );
}
