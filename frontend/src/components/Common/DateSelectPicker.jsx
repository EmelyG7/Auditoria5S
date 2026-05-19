import { useState, useEffect, useMemo } from "react";

const YEARS = Array.from({ length: 8 }, (_, i) => new Date().getFullYear() + 1 - i);

const MONTHS = [
  { v: "01", l: "Enero" },   { v: "02", l: "Febrero" },
  { v: "03", l: "Marzo" },   { v: "04", l: "Abril" },
  { v: "05", l: "Mayo" },    { v: "06", l: "Junio" },
  { v: "07", l: "Julio" },   { v: "08", l: "Agosto" },
  { v: "09", l: "Sep." },    { v: "10", l: "Oct." },
  { v: "11", l: "Nov." },    { v: "12", l: "Dic." },
];

function daysInMonth(y, m) {
  if (!y || !m) return 31;
  return new Date(parseInt(y), parseInt(m), 0).getDate();
}

function splitDate(value) {
  if (!value) return ["", "", ""];
  const parts = value.split("-");
  return [parts[0] || "", parts[1] || "", parts[2] || ""];
}

// value:    "YYYY-MM-DD" | "" | undefined
// onChange: (v: string | undefined) => void
export default function DateSelectPicker({ label, value, onChange, className = "" }) {
  const [y, m, d] = useMemo(() => splitDate(value), []);

  const [year,  setYear]  = useState(y);
  const [month, setMonth] = useState(m);
  const [day,   setDay]   = useState(d);

  // Sincroniza cuando el padre limpia el filtro
  useEffect(() => {
    const [ny, nm, nd] = splitDate(value);
    setYear(ny); setMonth(nm); setDay(nd);
  }, [value]);

  const maxDay = daysInMonth(year, month);

  const emit = (ny, nm, nd) => {
    if (ny && nm && nd) {
      const max      = daysInMonth(ny, nm);
      const safeDay  = String(Math.min(parseInt(nd), max)).padStart(2, "0");
      if (safeDay !== nd) setDay(safeDay);
      onChange(`${ny}-${nm}-${safeDay}`);
    } else {
      onChange(undefined);
    }
  };

  const onYear  = (e) => { setYear(e.target.value);  emit(e.target.value, month, day); };
  const onMonth = (e) => { setMonth(e.target.value); emit(year, e.target.value, day); };
  const onDay   = (e) => { setDay(e.target.value);   emit(year, month, e.target.value); };

  const cls = "input-glass text-sm py-1.5 px-2 w-auto";

  return (
    <div className={`flex flex-col gap-1 ${className}`}>
      {label && <span className="field-label">{label}</span>}
      <div className="flex gap-1">
        <select value={day} onChange={onDay} className={cls}>
          <option value="">Día</option>
          {Array.from({ length: maxDay }, (_, i) => {
            const val = String(i + 1).padStart(2, "0");
            return <option key={val} value={val}>{i + 1}</option>;
          })}
        </select>

        <select value={month} onChange={onMonth} className={cls}>
          <option value="">Mes</option>
          {MONTHS.map(({ v, l }) => <option key={v} value={v}>{l}</option>)}
        </select>

        <select value={year} onChange={onYear} className={cls}>
          <option value="">Año</option>
          {YEARS.map((yr) => <option key={yr} value={String(yr)}>{yr}</option>)}
        </select>
      </div>
    </div>
  );
}
