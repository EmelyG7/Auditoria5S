/**
 * SatisfactionHeatmap.jsx
 *
 * Heatmap de dimensiones × departamento.
 * Cada celda muestra el promedio de una dimensión para un departamento,
 * coloreada según el semáforo de satisfacción (90/80).
 *
 * Props:
 *   data  — array de {
 *     departamento, sat_interna, sat_externa,
 *     efficiency, communication, technical_quality, added_value, global_experience
 *   }  (valores 0-1)
 *   showSat — bool: incluir columnas Sat.Interna y Sat.Externa (default true)
 */

import { useMemo } from "react";

const SAT_EXC = 90;
const SAT_ACC = 80;

const DIMS = [
  { key: "efficiency",        label: "Eficiencia"    },
  { key: "communication",     label: "Comunicación"  },
  { key: "technical_quality", label: "Cal. Técnica"  },
  { key: "added_value",       label: "Val. Agr."     },
  { key: "global_experience", label: "Exp. Global"   },
];

const SAT_COLS = [
  { key: "sat_interna", label: "Sat. Interna" },
  { key: "sat_externa", label: "Sat. Externa" },
];

// Colores de celda (bg, text) según nivel
function cellStyle(v) {
  if (v == null) return { bg: "rgba(30,30,47,0.04)", text: "rgba(30,30,47,0.25)", weight: 400 };
  const p = +v * 100;
  if (p >= SAT_EXC) return { bg: "rgba(152,192,98,0.20)",  text: "#3a6e10", weight: 500 };
  if (p >= SAT_ACC) return { bg: "rgba(234,153,71,0.18)",  text: "#7a4d08", weight: 500 };
  return               { bg: "rgba(223,69,133,0.16)",  text: "#8a1040", weight: 500 };
}

function semLabel(v) {
  if (v == null) return "—";
  const p = +v * 100;
  if (p >= SAT_EXC) return "Exc.";
  if (p >= SAT_ACC) return "Acept.";
  return "Crít.";
}

function fmtPct(v) {
  return v != null ? `${(+v * 100).toFixed(1)}%` : "—";
}

// Mini badge de estado
function StateBadge({ v }) {
  const { text } = cellStyle(v);
  return (
    <span
      className="ml-1 text-[9px] font-semibold px-1 py-0.5 rounded"
      style={{ background: `${text}15`, color: text }}
    >
      {semLabel(v)}
    </span>
  );
}

export default function SatisfactionHeatmap({ data = [], showSat = true }) {
  const rows = useMemo(() =>
    data.map((d) => ({
      dept:    d.departamento || d.name || "—",
      dims:    DIMS.map(({ key }) => d[key] ?? null),
      interna: d.sat_interna ?? null,
      externa: d.sat_externa ?? null,
    })),
  [data]);

  const columns = useMemo(() => {
    const base = DIMS.map((d) => d.label);
    return showSat ? [...base, "Sat. Interna", "Sat. Externa"] : base;
  }, [showSat]);

  // Promedios por columna (fila de totales)
  const colAvgs = useMemo(() => {
    return DIMS.map(({ key }) => {
      const vals = data.map((d) => d[key]).filter((v) => v != null).map(Number);
      return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null;
    }).concat(
      showSat
        ? [
            (() => { const v = data.map((d) => d.sat_interna).filter((v) => v != null).map(Number); return v.length ? v.reduce((a,b)=>a+b,0)/v.length : null; })(),
            (() => { const v = data.map((d) => d.sat_externa).filter((v) => v != null).map(Number); return v.length ? v.reduce((a,b)=>a+b,0)/v.length : null; })(),
          ]
        : []
    );
  }, [data, showSat]);

  if (!rows.length) {
    return (
      <div className="flex items-center justify-center h-32 text-sm text-ink/30">
        Sin datos para el heatmap.
      </div>
    );
  }

  return (
    <div>
      <div className="overflow-x-auto">
        <table className="w-full text-xs" style={{ minWidth: columns.length * 100 + 130 }}>
          <thead>
            <tr>
              <th
                className="text-left py-2 px-3 text-ink/50 font-semibold uppercase tracking-wide sticky left-0"
                style={{ background: "transparent", minWidth: 120 }}
              >
                Departamento
              </th>
              {columns.map((c) => (
                <th
                  key={c}
                  className="py-2 px-2 text-center text-ink/50 font-semibold uppercase tracking-wide"
                  style={{ minWidth: 88 }}
                >
                  {c}
                </th>
              ))}
            </tr>
          </thead>

          <tbody className="divide-y divide-ink/5">
            {rows.map((row) => {
              const allVals = [
                ...row.dims,
                ...(showSat ? [row.interna, row.externa] : []),
              ];
              return (
                <tr key={row.dept} className="hover:bg-primary/[0.02] transition-colors">
                  {/* Nombre */}
                  <td
                    className="py-2.5 px-3 font-medium text-ink sticky left-0"
                    style={{ background: "transparent" }}
                  >
                    {row.dept}
                  </td>

                  {/* Celdas de dimensiones */}
                  {row.dims.map((v, i) => {
                    const { bg, text, weight } = cellStyle(v);
                    return (
                      <td key={i} className="py-1.5 px-1.5 text-center">
                        <div
                          className="rounded-lg py-1.5 px-2 text-center leading-tight"
                          style={{ background: bg }}
                        >
                          <span style={{ color: text, fontWeight: weight }}>
                            {fmtPct(v)}
                          </span>
                        </div>
                      </td>
                    );
                  })}

                  {/* Sat. Interna */}
                  {showSat && (
                    <>
                      <td className="py-1.5 px-1.5 text-center">
                        {(() => {
                          const { bg, text, weight } = cellStyle(row.interna);
                          return (
                            <div className="rounded-lg py-1.5 px-2" style={{ background: bg }}>
                              <span style={{ color: text, fontWeight: weight }}>{fmtPct(row.interna)}</span>
                            </div>
                          );
                        })()}
                      </td>
                      <td className="py-1.5 px-1.5 text-center">
                        {(() => {
                          const { bg, text, weight } = cellStyle(row.externa);
                          return (
                            <div className="rounded-lg py-1.5 px-2" style={{ background: bg }}>
                              <span style={{ color: text, fontWeight: weight }}>{fmtPct(row.externa)}</span>
                            </div>
                          );
                        })()}
                      </td>
                    </>
                  )}
                </tr>
              );
            })}
          </tbody>

          {/* Fila de promedios */}
          <tfoot>
            <tr className="border-t border-ink/20">
              <td className="py-2 px-3 font-semibold text-ink/70 text-xs uppercase tracking-wide sticky left-0"
                  style={{ background: "transparent" }}>
                Promedio
              </td>
              {colAvgs.map((v, i) => {
                const { bg, text, weight } = cellStyle(v);
                return (
                  <td key={i} className="py-1.5 px-1.5 text-center">
                    <div className="rounded-lg py-1.5 px-2" style={{ background: bg }}>
                      <span style={{ color: text, fontWeight: 600 }}>{fmtPct(v)}</span>
                    </div>
                  </td>
                );
              })}
            </tr>
          </tfoot>
        </table>
      </div>

      {/* Leyenda */}
      <div className="flex items-center gap-4 mt-3 flex-wrap">
        {[
          ["≥90% Excelente",  "rgba(152,192,98,0.20)",  "#3a6e10"],
          ["80-89% Aceptable", "rgba(234,153,71,0.18)", "#7a4d08"],
          ["<80% Crítico",    "rgba(223,69,133,0.16)",  "#8a1040"],
        ].map(([lbl, bg, c]) => (
          <div key={lbl} className="flex items-center gap-1.5">
            <div
              className="w-6 h-3 rounded"
              style={{ background: bg, border: `1px solid ${c}30` }}
            />
            <span className="text-[10px] text-ink/50">{lbl}</span>
          </div>
        ))}
      </div>
    </div>
  );
}