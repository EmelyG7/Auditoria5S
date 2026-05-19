import { useMemo } from "react";

const MONTHS = [
  "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
  "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre",
];

const YEARS = Array.from({ length: 7 }, (_, i) => new Date().getFullYear() + 1 - i);

// value: "YYYY-MM-DD" | "" | undefined
// onChange(value): emite "YYYY-MM-DD" (primer día del mes) o undefined al limpiar
export default function MonthYearPicker({ label, value, onChange, className = "" }) {
  const { year, month } = useMemo(() => {
    if (!value) return { year: "", month: "" };
    const [y, m] = value.split("-");
    return { year: y || "", month: m || "" };
  }, [value]);

  const commit = (newYear, newMonth) => {
    if (newYear && newMonth) {
      onChange(`${newYear}-${newMonth.padStart(2, "0")}-01`);
    } else {
      onChange(undefined);
    }
  };

  return (
    <div className={`flex flex-col gap-1 ${className}`}>
      {label && <label className="field-label">{label}</label>}
      <div className="flex gap-1.5">
        <select
          value={month}
          onChange={(e) => commit(year, e.target.value)}
          className="input-glass text-sm py-1.5 px-2 w-auto"
        >
          <option value="">Mes</option>
          {MONTHS.map((m, i) => (
            <option key={i} value={String(i + 1).padStart(2, "0")}>{m}</option>
          ))}
        </select>
        <select
          value={year}
          onChange={(e) => commit(e.target.value, month)}
          className="input-glass text-sm py-1.5 px-2 w-auto"
        >
          <option value="">Año</option>
          {YEARS.map((y) => <option key={y} value={y}>{y}</option>)}
        </select>
      </div>
    </div>
  );
}
