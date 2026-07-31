import { useState, useRef, useEffect } from "react";
import { ChevronDown, Check } from "lucide-react";

/**
 * MultiSelect — dropdown de selección múltiple con "Seleccionar todo" / "Limpiar".
 *
 * options: [{ value, label }]
 * selected: array de values actualmente seleccionados (vacío = "todos", sin filtrar)
 * onChange: (nuevoArray) => void
 */
export default function MultiSelect({ options, selected = [], onChange, allLabel = "Todos" }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const toggle = (value) => {
    onChange(
      selected.includes(value)
        ? selected.filter((v) => v !== value)
        : [...selected, value]
    );
  };

  const selectAll = () => onChange(options.map((o) => o.value));
  const clear     = () => onChange([]);

  const buttonLabel =
    selected.length === 0
      ? allLabel
      : selected.length === 1
      ? options.find((o) => String(o.value) === String(selected[0]))?.label ?? allLabel
      : `${selected.length} seleccionados`;

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="input-glass text-sm py-1.5 px-3 w-auto flex items-center gap-2 whitespace-nowrap"
      >
        {buttonLabel}
        <ChevronDown size={13} className={`transition-transform duration-150 ${open ? "rotate-180" : ""}`} />
      </button>

      {open && (
        <div className="absolute left-0 top-full mt-1 bg-surface border border-ink/10 rounded-xl shadow-lg py-1.5 z-30 min-w-[220px] max-h-72 overflow-y-auto">
          <div className="flex items-center justify-between px-3 py-1.5 border-b border-ink/10 mb-1">
            <button
              type="button"
              onClick={selectAll}
              className="text-xs font-semibold text-primary hover:text-primary/70"
            >
              Seleccionar todo
            </button>
            <button
              type="button"
              onClick={clear}
              className="text-xs font-semibold text-secondary hover:text-secondary/70"
            >
              Limpiar
            </button>
          </div>

          {options.length === 0 && (
            <p className="px-3 py-2 text-xs text-ink/40">Sin opciones</p>
          )}

          {options.map((o) => {
            const checked = selected.includes(o.value);
            return (
              <label
                key={o.value}
                className="flex items-center gap-2 px-3 py-1.5 text-sm text-ink hover:bg-ink/5 cursor-pointer"
              >
                <span
                  className={`w-4 h-4 rounded flex items-center justify-center border shrink-0 ${
                    checked ? "bg-primary border-primary" : "border-ink/20"
                  }`}
                >
                  {checked && <Check size={11} className="text-white" />}
                </span>
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={() => toggle(o.value)}
                  className="sr-only"
                />
                <span className="truncate">{o.label}</span>
              </label>
            );
          })}
        </div>
      )}
    </div>
  );
}
