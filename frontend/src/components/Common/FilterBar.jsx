import { useRef } from "react";
import { Filter, X } from "lucide-react";

const QUARTERS = ["Q1", "Q2", "Q3", "Q4"];
const YEARS    = Array.from({ length: 5 }, (_, i) => new Date().getFullYear() - i);

export default function FilterBar({ filters, onFilterChange, onReset, auditTypes = [], branches = [], showBranch = true, showType = true }) {
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
      {showBranch && branches.length > 0 && (
        <select
          value={filters.branch || ""}
          onChange={(e) => onFilterChange("branch", e.target.value || undefined)}
          className="input-glass text-sm py-1.5 px-3 w-auto"
        >
          <option value="">Todas las sucursales</option>
          {branches.map((b) => <option key={b} value={b}>{b}</option>)}
        </select>
      )}

      {/* Reset */}
      <button onClick={onReset} className="btn-ghost flex items-center gap-1.5 text-xs ml-auto">
        <X size={13} />
        Limpiar
      </button>
    </div>
  );
}