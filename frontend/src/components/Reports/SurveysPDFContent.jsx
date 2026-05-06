/**
 * SurveysPDFContent.jsx
 * Componente oculto para captura html2canvas → PDF de encuestas de satisfacción.
 *
 * Recibe `views` como array ordenado que determina qué páginas generar:
 *   "general"  → Análisis general (radar, barras, tabla sedes)
 *   "interna"  → Cliente interno (radar, barras h., tabla dimensiones)
 *   "externa"  → Cliente externo (barras h., evolución, tabla comparativa)
 *   "avanzado" → Análisis avanzado (índices globales, heatmap, brecha, delta)
 *
 * Siempre añade portada y página de conclusiones.
 * Usa charts con dimensiones fijas (sin ResponsiveContainer) para compatibilidad con html2canvas.
 */
import { forwardRef } from "react";
import {
  RadarChart, Radar, PolarGrid, PolarAngleAxis, PolarRadiusAxis,
  BarChart, Bar, XAxis, YAxis, Cell, LabelList, Tooltip, Legend,
  LineChart, Line, CartesianGrid,
} from "recharts";
import { generateConclusions } from "../../services/reportService";

// ── Paleta ─────────────────────────────────────────────────────────────────────
const C = {
  primary:   "#0A4F79",
  secondary: "#B4427F",
  success:   "#98C062",
  warning:   "#EA9947",
  danger:    "#DF4585",
  text:      "#1E1E2F",
  muted:     "#6B7280",
  light:     "#F8FAFC",
  border:    "#E2E8F0",
  white:     "#FFFFFF",
};

const PAGE_W  = 794;
const PAD     = 52;
const CHART_W = PAGE_W - PAD * 2;
const HALF_W  = Math.floor((CHART_W - 20) / 2);

// ── Helpers ────────────────────────────────────────────────────────────────────
const safe   = (v, fb = 0) => (v != null && !isNaN(+v) ? +v : fb);
const toPct  = (v) => +(safe(v) * 100).toFixed(1);

function semPct(pct) {
  if (pct >= 90) return C.success;
  if (pct >= 80) return C.warning;
  return C.danger;
}
function semLabel(pct) {
  if (pct >= 90) return "Excelente";
  if (pct >= 80) return "Aceptable";
  return "Crítico";
}

// ── Dimensiones para heatmap ───────────────────────────────────────────────────
const DIMS = [
  { key: "efficiency",        label: "Eficiencia" },
  { key: "communication",     label: "Comunicación" },
  { key: "technical_quality", label: "Cal. Técnica" },
  { key: "added_value",       label: "Val. Agr." },
  { key: "global_experience", label: "Exp. Global" },
];

// ── Sub-componentes de diseño PDF ──────────────────────────────────────────────
function PageHeader({ date }) {
  return (
    <div style={{
      display: "flex", justifyContent: "space-between", alignItems: "center",
      paddingBottom: 10, marginBottom: 18,
      borderBottom: `2px solid ${C.secondary}`,
    }}>
      <span style={{ fontSize: 11, fontWeight: 700, color: C.secondary, letterSpacing: 1 }}>
        CECOMSA · ENCUESTAS DE SATISFACCIÓN
      </span>
      <span style={{ fontSize: 10, color: C.muted }}>{date}</span>
    </div>
  );
}

function PageFooter({ pageNum, totalPages }) {
  return (
    <div style={{
      position: "absolute", bottom: 20, left: PAD, right: PAD,
      display: "flex", justifyContent: "space-between",
      borderTop: `1px solid ${C.border}`, paddingTop: 8,
      fontSize: 10, color: C.muted,
    }}>
      <span>Cecomsa · Sistema de Gestión de Calidad</span>
      <span>Página {pageNum} de {totalPages}</span>
    </div>
  );
}

function SectionTitle({ children, color = C.secondary }) {
  return (
    <div style={{
      fontSize: 15, fontWeight: 700, color,
      borderLeft: `4px solid ${color}`, paddingLeft: 10,
      marginBottom: 14,
    }}>
      {children}
    </div>
  );
}

function SubTitle({ children, color = C.secondary }) {
  return (
    <div style={{ fontSize: 11, fontWeight: 600, color, marginBottom: 7 }}>
      {children}
    </div>
  );
}

function KPIBox({ label, value, color = C.secondary }) {
  return (
    <div style={{
      flex: 1, padding: "10px 12px",
      backgroundColor: C.light,
      borderLeft: `4px solid ${color}`,
      borderRadius: 6,
    }}>
      <div style={{ fontSize: 19, fontWeight: 700, color, lineHeight: 1 }}>{value}</div>
      <div style={{ fontSize: 10, color: C.muted, marginTop: 4 }}>{label}</div>
    </div>
  );
}

function THead({ cols, color = C.secondary }) {
  return (
    <thead>
      <tr>
        {cols.map((c, i) => (
          <th key={i} style={{
            padding: "5px 8px", backgroundColor: color,
            color: C.white, fontSize: 10, fontWeight: 600, textAlign: "left",
          }}>{c}</th>
        ))}
      </tr>
    </thead>
  );
}

function TRow({ cells, idx }) {
  return (
    <tr style={{ backgroundColor: idx % 2 === 0 ? C.white : C.light }}>
      {cells.map((cell, i) => (
        <td key={i} style={{ padding: "4px 8px", fontSize: 11 }}>{cell}</td>
      ))}
    </tr>
  );
}

function Bdg({ label, color }) {
  return (
    <span style={{
      backgroundColor: `${color}22`, color,
      padding: "2px 7px", borderRadius: 4, fontSize: 10, fontWeight: 600,
    }}>
      {label}
    </span>
  );
}

function PageWrap({ children, pageNum, tp, dateStr }) {
  return (
    <div className="pdf-page" style={{
      width: PAGE_W, minHeight: 1123,
      backgroundColor: C.white,
      padding: `40px ${PAD}px 60px`,
      boxSizing: "border-box", position: "relative",
    }}>
      <PageHeader date={dateStr} />
      {children}
      <PageFooter pageNum={pageNum} totalPages={tp} />
    </div>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
// PÁGINA GENERAL
// ═════════════════════════════════════════════════════════════════════════════
function PageGeneral({ kpis, si, se, radarChart, barDepts, dateStr, pageNum, tp, sectionNum }) {
  const porSede = (kpis.por_sede || []).slice(0, 8);

  return (
    <PageWrap pageNum={pageNum} tp={tp} dateStr={dateStr}>
      <SectionTitle>{sectionNum}. Análisis General de Satisfacción</SectionTitle>

      {/* KPIs */}
      <div style={{ display: "flex", gap: 10, marginBottom: 20 }}>
        <KPIBox label="Satisfacción Interna" value={`${si}%`} color={semPct(si)} />
        <KPIBox label="Satisfacción Externa" value={`${se}%`} color={semPct(se)} />
        <KPIBox label="Mejor Dimensión"      value={kpis.mejor_dimension || "—"} color={C.success} />
        <KPIBox label="Dimensión a Mejorar"  value={kpis.peor_dimension  || "—"} color={C.danger}  />
      </div>

      {/* Radar + Barras comparativas */}
      <div style={{ display: "flex", gap: 20, marginBottom: 20, alignItems: "flex-start" }}>
        {radarChart.length > 0 && (
          <div>
            <SubTitle>5 Dimensiones</SubTitle>
            <RadarChart width={HALF_W} height={220} data={radarChart}
              margin={{ top: 8, right: 16, bottom: 8, left: 16 }}>
              <PolarGrid stroke={`${C.secondary}22`} />
              <PolarAngleAxis dataKey="s" tick={{ fontSize: 10, fill: C.text }} />
              <PolarRadiusAxis domain={[0, 100]} tickCount={5} angle={30}
                tick={{ fontSize: 8, fill: C.muted }} tickFormatter={(v) => `${v}%`} />
              <Radar dataKey="value" stroke={C.secondary} fill={C.secondary}
                fillOpacity={0.18} strokeWidth={2} dot={{ r: 3, fill: C.secondary, strokeWidth: 0 }} />
              <Tooltip formatter={(v) => [`${Number(v).toFixed(1)}%`, "Satisfacción"]} contentStyle={{ fontSize: 10 }} />
            </RadarChart>
          </div>
        )}

        {barDepts.length > 0 && (
          <div style={{ flex: 1 }}>
            <SubTitle>Interna vs Externa por Departamento</SubTitle>
            <BarChart width={HALF_W} height={220} data={barDepts}
              margin={{ top: 4, right: 8, left: -10, bottom: 52 }}>
              <XAxis dataKey="name" tick={{ fontSize: 8, fill: C.muted }}
                angle={-30} textAnchor="end" interval={0} axisLine={false} tickLine={false} />
              <YAxis domain={[0, 100]} tick={{ fontSize: 8, fill: C.muted }}
                tickFormatter={(v) => `${v}%`} axisLine={false} tickLine={false} />
              <Tooltip formatter={(v) => [`${Number(v).toFixed(1)}%`]} contentStyle={{ fontSize: 10 }} />
              <Legend wrapperStyle={{ fontSize: 10, paddingTop: 4 }} />
              <Bar dataKey="interna" name="Interna" fill={C.primary} radius={[4,4,0,0]} maxBarSize={16} />
              <Bar dataKey="externa" name="Externa" fill={C.secondary} radius={[4,4,0,0]} maxBarSize={16} />
            </BarChart>
          </div>
        )}
      </div>

      {/* Tabla por sede */}
      {porSede.length > 0 && (
        <div>
          <SubTitle>Resumen por Sede</SubTitle>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <THead cols={["Sede", "Sat. Interna", "Sat. Externa", "Registros", "Estado"]} />
            <tbody>
              {porSede.map((s, i) => {
                const siS = toPct(s.sat_interna);
                const seS = toPct(s.sat_externa);
                const avg = (siS + seS) / 2;
                return (
                  <TRow key={i} idx={i} cells={[
                    s.site,
                    <span key="si" style={{ color: semPct(siS), fontWeight: 600 }}>{siS}%</span>,
                    <span key="se" style={{ color: semPct(seS), fontWeight: 600 }}>{seS}%</span>,
                    s.n_registros,
                    <Bdg key="b" label={semLabel(avg)} color={semPct(avg)} />,
                  ]} />
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </PageWrap>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
// PÁGINA INTERNA
// ═════════════════════════════════════════════════════════════════════════════
function PageInterna({ kpis, si, radarChart, radarData, hBarInt, lineData, dateStr, pageNum, tp, sectionNum }) {
  const hBarH = Math.max(160, hBarInt.length * 32 + 20);
  const mejorDept = hBarInt[0];
  const peorDept  = hBarInt[hBarInt.length - 1];

  return (
    <PageWrap pageNum={pageNum} tp={tp} dateStr={dateStr}>
      <SectionTitle color={C.primary}>{sectionNum}. Satisfacción del Cliente Interno</SectionTitle>

      <div style={{ display: "flex", gap: 10, marginBottom: 20 }}>
        <KPIBox label="Satisfacción Interna"  value={`${si}%`}                      color={semPct(si)} />
        <KPIBox label="Total Registros"        value={kpis.total_registros ?? "—"}    color={C.primary}  />
        <KPIBox label="Mejor Departamento"     value={mejorDept?.fullName || "—"}    color={C.success}  />
        <KPIBox label="Departamento a Reforzar" value={peorDept?.fullName  || "—"}    color={C.warning}  />
      </div>

      <div style={{ display: "flex", gap: 20, marginBottom: 20, alignItems: "flex-start" }}>
        {radarChart.length > 0 && (
          <div>
            <SubTitle color={C.primary}>5 Dimensiones</SubTitle>
            <RadarChart width={HALF_W} height={200} data={radarChart}
              margin={{ top: 8, right: 16, bottom: 8, left: 16 }}>
              <PolarGrid stroke={`${C.primary}22`} />
              <PolarAngleAxis dataKey="s" tick={{ fontSize: 10, fill: C.text }} />
              <PolarRadiusAxis domain={[0, 100]} tickCount={5} angle={30}
                tick={{ fontSize: 8, fill: C.muted }} tickFormatter={(v) => `${v}%`} />
              <Radar dataKey="value" stroke={C.primary} fill={C.primary}
                fillOpacity={0.18} strokeWidth={2} dot={{ r: 3, fill: C.primary, strokeWidth: 0 }} />
              <Tooltip formatter={(v) => [`${Number(v).toFixed(1)}%`]} contentStyle={{ fontSize: 10 }} />
            </RadarChart>
          </div>
        )}

        {hBarInt.length > 0 && (
          <div style={{ flex: 1 }}>
            <SubTitle color={C.primary}>Por Departamento</SubTitle>
            <BarChart width={HALF_W} height={hBarH} data={hBarInt} layout="vertical"
              margin={{ top: 4, right: 48, left: 8, bottom: 4 }}>
              <XAxis type="number" domain={[0, 100]} tick={{ fontSize: 8, fill: C.muted }}
                tickFormatter={(v) => `${v}%`} axisLine={false} tickLine={false} />
              <YAxis type="category" dataKey="name" width={90}
                tick={{ fontSize: 9, fill: C.text }} axisLine={false} tickLine={false} />
              <Tooltip formatter={(v) => [`${Number(v).toFixed(1)}%`, "Interna"]} contentStyle={{ fontSize: 10 }} />
              <Bar dataKey="interna" radius={[0,4,4,0]} maxBarSize={20}>
                <LabelList dataKey="interna" position="right" style={{ fontSize: 9 }}
                  formatter={(v) => `${v}%`} />
                {hBarInt.map((d, i) => <Cell key={i} fill={semPct(d.interna)} />)}
              </Bar>
            </BarChart>
          </div>
        )}
      </div>

      {/* Tabla dimensiones */}
      {radarData.length > 0 && (
        <div>
          <SubTitle color={C.primary}>Detalle por Dimensión</SubTitle>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <THead cols={["Dimensión", "Puntaje", "Estado", "Interpretación"]} color={C.primary} />
            <tbody>
              {radarData.map((d, i) => {
                const col = semPct(d.value);
                return (
                  <TRow key={i} idx={i} cells={[
                    d.subject,
                    <span key="v" style={{ color: col, fontWeight: 600 }}>{d.value}%</span>,
                    <Bdg key="b" label={semLabel(d.value)} color={col} />,
                    <span key="t" style={{ color: C.muted, fontSize: 10 }}>
                      {d.value >= 90 ? "Cumple adecuadamente." : d.value >= 80 ? "Nivel aceptable, monitorear." : "Requiere acciones prioritarias."}
                    </span>,
                  ]} />
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </PageWrap>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
// PÁGINA EXTERNA
// ═════════════════════════════════════════════════════════════════════════════
function PageExterna({ kpis, se, hBarExt, lineData, dateStr, pageNum, tp, sectionNum }) {
  const hBarH  = Math.max(160, hBarExt.length * 32 + 20);
  const lineH  = Math.max(160, hBarH);
  const mejorDept = hBarExt[0];
  const peorDept  = hBarExt[hBarExt.length - 1];

  return (
    <PageWrap pageNum={pageNum} tp={tp} dateStr={dateStr}>
      <SectionTitle>{sectionNum}. Satisfacción del Cliente Externo</SectionTitle>

      <div style={{ display: "flex", gap: 10, marginBottom: 20 }}>
        <KPIBox label="Satisfacción Externa"  value={`${se}%`}                     color={semPct(se)} />
        <KPIBox label="Total Registros"        value={kpis.total_registros ?? "—"}   color={C.secondary} />
        <KPIBox label="Mejor Departamento"     value={mejorDept?.fullName || "—"}   color={C.success}   />
        <KPIBox label="Departamento a Reforzar" value={peorDept?.fullName  || "—"}   color={C.warning}   />
      </div>

      <div style={{ display: "flex", gap: 20, marginBottom: 20, alignItems: "flex-start" }}>
        {hBarExt.length > 0 && (
          <div>
            <SubTitle>Por Departamento</SubTitle>
            <BarChart width={HALF_W} height={hBarH} data={hBarExt} layout="vertical"
              margin={{ top: 4, right: 48, left: 8, bottom: 4 }}>
              <XAxis type="number" domain={[0, 100]} tick={{ fontSize: 8, fill: C.muted }}
                tickFormatter={(v) => `${v}%`} axisLine={false} tickLine={false} />
              <YAxis type="category" dataKey="name" width={90}
                tick={{ fontSize: 9, fill: C.text }} axisLine={false} tickLine={false} />
              <Tooltip formatter={(v) => [`${Number(v).toFixed(1)}%`, "Externa"]} contentStyle={{ fontSize: 10 }} />
              <Bar dataKey="externa" radius={[0,4,4,0]} maxBarSize={20}>
                <LabelList dataKey="externa" position="right" style={{ fontSize: 9 }}
                  formatter={(v) => `${v}%`} />
                {hBarExt.map((d, i) => <Cell key={i} fill={semPct(d.externa)} />)}
              </Bar>
            </BarChart>
          </div>
        )}

        {lineData.length > 1 && (
          <div style={{ flex: 1 }}>
            <SubTitle>Evolución Temporal</SubTitle>
            <LineChart width={HALF_W} height={lineH} data={lineData}
              margin={{ top: 8, right: 20, left: -8, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(30,30,47,0.06)" />
              <XAxis dataKey="period" tick={{ fontSize: 8 }} axisLine={false} tickLine={false} />
              <YAxis domain={[0, 100]} tickFormatter={(v) => `${v}%`} tick={{ fontSize: 8 }} axisLine={false} tickLine={false} />
              <Tooltip formatter={(v) => [`${Number(v).toFixed(1)}%`]} contentStyle={{ fontSize: 10 }} />
              <Line type="monotone" dataKey="externa" name="Externa" stroke={C.secondary}
                strokeWidth={2} dot={{ r: 3, fill: C.secondary, strokeWidth: 0 }} connectNulls />
            </LineChart>
          </div>
        )}
      </div>

      {/* Tabla comparativa */}
      {hBarExt.length > 0 && (
        <div>
          <SubTitle>Comparativa por Departamento</SubTitle>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <THead cols={["Departamento", "Sat. Externa", "Registros", "Estado", "Interpretación"]} />
            <tbody>
              {hBarExt.slice(0, 10).map((d, i) => {
                const col = semPct(d.externa);
                return (
                  <TRow key={i} idx={i} cells={[
                    d.fullName,
                    <span key="v" style={{ color: col, fontWeight: 600 }}>{d.externa}%</span>,
                    d.n,
                    <Bdg key="b" label={semLabel(d.externa)} color={col} />,
                    <span key="t" style={{ color: C.muted, fontSize: 10 }}>
                      {d.externa >= 90 ? "Desempeño satisfactorio." : d.externa >= 80 ? "Aceptable, con oportunidades." : "Requiere acciones prioritarias."}
                    </span>,
                  ]} />
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </PageWrap>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
// PÁGINA AVANZADO
// ═════════════════════════════════════════════════════════════════════════════
function PageAvanzado({ kpis, overall, si, se, gapData, deltaData, byDept, dateStr, pageNum, tp, sectionNum }) {
  const hasHeatmap = byDept.some((d) => d.efficiency != null);
  const heatDepts  = byDept.slice(0, 10);
  const gapH   = Math.max(120, gapData.length * 36 + 20);
  const deltaH = Math.max(120, deltaData.length * 36 + 20);

  return (
    <PageWrap pageNum={pageNum} tp={tp} dateStr={dateStr}>
      <SectionTitle color={C.primary}>{sectionNum}. Análisis Avanzado</SectionTitle>

      {/* Índices globales */}
      <div style={{ display: "flex", gap: 12, marginBottom: 22 }}>
        {[
          { label: "ÍNDICE GLOBAL", value: overall, color: semPct(overall) },
          { label: "SAT. INTERNA",  value: si,      color: semPct(si) },
          { label: "SAT. EXTERNA",  value: se,      color: semPct(se) },
          {
            label: "BRECHA INT−EXT",
            value: `${Math.abs(si - se).toFixed(1)} pp`,
            color: Math.abs(si - se) > 10 ? C.warning : C.success,
            sub: si > se ? "Int. > Ext." : "Ext. > Int.",
          },
        ].map((k, i) => (
          <div key={i} style={{
            flex: 1, textAlign: "center", padding: "14px 10px", borderRadius: 8,
            backgroundColor: `${k.color}12`, borderLeft: `4px solid ${k.color}`,
          }}>
            <div style={{ fontSize: 9, color: C.muted, fontWeight: 700, marginBottom: 4 }}>{k.label}</div>
            <div style={{ fontSize: 30, fontWeight: 800, color: k.color, lineHeight: 1 }}>
              {typeof k.value === "number" ? `${k.value}%` : k.value}
            </div>
            <div style={{ fontSize: 10, color: C.muted, marginTop: 3 }}>
              {k.sub || semLabel(typeof k.value === "number" ? k.value : overall)}
            </div>
          </div>
        ))}
      </div>

      {/* Heatmap */}
      {hasHeatmap && heatDepts.length > 0 && (
        <div style={{ marginBottom: 20 }}>
          <SubTitle color={C.primary}>Heatmap — Dimensión × Departamento</SubTitle>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr>
                <th style={{ padding: "4px 8px", backgroundColor: C.primary, color: C.white, fontSize: 9, fontWeight: 600, textAlign: "left" }}>
                  Departamento
                </th>
                {DIMS.map((d) => (
                  <th key={d.key} style={{ padding: "4px 5px", backgroundColor: C.primary, color: C.white, fontSize: 9, fontWeight: 600, textAlign: "center" }}>
                    {d.label}
                  </th>
                ))}
                <th style={{ padding: "4px 5px", backgroundColor: C.secondary, color: C.white, fontSize: 9, fontWeight: 600, textAlign: "center" }}>Int.</th>
                <th style={{ padding: "4px 5px", backgroundColor: C.secondary, color: C.white, fontSize: 9, fontWeight: 600, textAlign: "center" }}>Ext.</th>
              </tr>
            </thead>
            <tbody>
              {heatDepts.map((dept, i) => (
                <tr key={i} style={{ backgroundColor: i % 2 === 0 ? C.white : C.light }}>
                  <td style={{ padding: "3px 8px", fontSize: 9, fontWeight: 500 }}>{dept.fullName || dept.name}</td>
                  {DIMS.map((dim) => {
                    const val = dept[dim.key] != null ? +(safe(dept[dim.key]) * 100).toFixed(1) : null;
                    const col = val != null ? semPct(val) : C.muted;
                    return (
                      <td key={dim.key} style={{
                        padding: "3px 5px", textAlign: "center", fontSize: 9, fontWeight: 600,
                        backgroundColor: val != null ? `${col}20` : "transparent",
                        color: col,
                      }}>
                        {val != null ? `${val}%` : "—"}
                      </td>
                    );
                  })}
                  {[dept.interna, dept.externa].map((v, j) => {
                    const col = v != null ? semPct(v) : C.muted;
                    return (
                      <td key={j} style={{
                        padding: "3px 5px", textAlign: "center", fontSize: 9, fontWeight: 600,
                        backgroundColor: v != null ? `${col}20` : "transparent",
                        color: col,
                      }}>
                        {v != null ? `${v}%` : "—"}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Brecha a meta + Delta int-ext */}
      <div style={{ display: "flex", gap: 20 }}>
        {gapData.length > 0 && (
          <div style={{ flex: 1 }}>
            <SubTitle color={C.primary}>Brecha a Meta (90%)</SubTitle>
            <BarChart width={HALF_W} height={gapH} data={gapData} layout="vertical"
              margin={{ top: 4, right: 55, left: 8, bottom: 4 }}>
              <XAxis type="number" domain={[0, 30]} tick={{ fontSize: 8, fill: C.muted }}
                tickFormatter={(v) => `${v} pp`} axisLine={false} tickLine={false} />
              <YAxis type="category" dataKey="s" width={100}
                tick={{ fontSize: 9, fill: C.text }} axisLine={false} tickLine={false} />
              <Tooltip formatter={(v) => [`${Number(v).toFixed(1)} pp`, "Brecha"]} contentStyle={{ fontSize: 10 }} />
              <Bar dataKey="gap" radius={[0,4,4,0]} maxBarSize={20}>
                <LabelList dataKey="gap" position="right" style={{ fontSize: 9 }}
                  formatter={(v) => `${Number(v).toFixed(1)} pp`} />
                {gapData.map((d, i) => (
                  <Cell key={i} fill={d.gap <= 0 ? C.success : d.gap <= 10 ? C.warning : C.danger} />
                ))}
              </Bar>
            </BarChart>
          </div>
        )}

        {deltaData.length > 0 && (
          <div style={{ flex: 1 }}>
            <SubTitle color={C.primary}>Delta Interna − Externa</SubTitle>
            <BarChart width={HALF_W} height={deltaH} data={deltaData} layout="vertical"
              margin={{ top: 4, right: 55, left: 8, bottom: 4 }}>
              <XAxis type="number" tick={{ fontSize: 8, fill: C.muted }}
                tickFormatter={(v) => `${v > 0 ? "+" : ""}${v} pp`} axisLine={false} tickLine={false} />
              <YAxis type="category" dataKey="name" width={90}
                tick={{ fontSize: 9, fill: C.text }} axisLine={false} tickLine={false} />
              <Tooltip formatter={(v) => [`${v > 0 ? "+" : ""}${Number(v).toFixed(1)} pp`, "Delta"]} contentStyle={{ fontSize: 10 }} />
              <Bar dataKey="delta" radius={[0,4,4,0]} maxBarSize={20}>
                <LabelList dataKey="delta" position="right" style={{ fontSize: 9 }}
                  formatter={(v) => `${v > 0 ? "+" : ""}${Number(v).toFixed(1)}`} />
                {deltaData.map((d, i) => (
                  <Cell key={i} fill={d.delta > 0 ? C.primary : C.secondary} fillOpacity={0.85} />
                ))}
              </Bar>
            </BarChart>
          </div>
        )}
      </div>
    </PageWrap>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
// PÁGINA CONCLUSIONES
// ═════════════════════════════════════════════════════════════════════════════
function PageConclusions({ conclusions, dateStr, pageNum, tp, sectionNum }) {
  return (
    <div className="pdf-page" style={{
      width: PAGE_W, minHeight: 1123,
      backgroundColor: C.white,
      padding: `40px ${PAD}px 80px`,
      boxSizing: "border-box", position: "relative",
    }}>
      <PageHeader date={dateStr} />
      <SectionTitle>{sectionNum}. Conclusiones y Recomendaciones</SectionTitle>

      {conclusions.conclusions.length > 0 && (
        <div style={{ marginBottom: 24 }}>
          <SubTitle>Hallazgos Principales</SubTitle>
          {conclusions.conclusions.map((c, i) => (
            <div key={i} style={{
              display: "flex", gap: 12, marginBottom: 10,
              padding: "10px 14px", borderRadius: 6,
              backgroundColor: "#FDF4F9",
              borderLeft: `3px solid ${C.secondary}`,
              fontSize: 12, lineHeight: 1.55,
            }}>
              <span style={{ color: C.secondary, fontWeight: 700, flexShrink: 0, minWidth: 22 }}>
                {String(i + 1).padStart(2, "0")}
              </span>
              <span>{c}</span>
            </div>
          ))}
        </div>
      )}

      {conclusions.recommendations.length > 0 && (
        <div style={{ marginBottom: 30 }}>
          <SubTitle color={C.warning}>Recomendaciones</SubTitle>
          {conclusions.recommendations.map((r, i) => (
            <div key={i} style={{
              display: "flex", gap: 12, marginBottom: 10,
              padding: "10px 14px", borderRadius: 6,
              backgroundColor: "#FFFBEB",
              borderLeft: `3px solid ${C.warning}`,
              fontSize: 12, lineHeight: 1.55,
            }}>
              <span style={{ color: C.warning, fontWeight: 700, flexShrink: 0 }}>→</span>
              <span>{r}</span>
            </div>
          ))}
        </div>
      )}

      <div style={{
        padding: "14px 18px", borderRadius: 8,
        backgroundColor: C.light, border: `1px solid ${C.border}`,
        fontSize: 10, color: C.muted, textAlign: "center", lineHeight: 1.6,
      }}>
        Este reporte fue generado automáticamente por el Sistema de Gestión de Calidad de Mejora continua & Auditoría .<br />
        Los datos reflejan las encuestas de satisfacción registradas en el sistema a la fecha de generación.
      </div>

      <PageFooter pageNum={pageNum} totalPages={tp} />
    </div>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
// PORTADA
// ═════════════════════════════════════════════════════════════════════════════
function CoverPage({ periodText, dateStr }) {
  return (
    <div className="pdf-page" style={{
      width: PAGE_W, minHeight: 1123,
      display: "flex", flexDirection: "column",
      alignItems: "center", justifyContent: "center", textAlign: "center",
      background: `linear-gradient(155deg, ${C.secondary} 0%, #c45a9a 60%, ${C.secondary} 100%)`,
      color: C.white,
      padding: "60px 80px", boxSizing: "border-box", position: "relative",
    }}>
      <img src="/logo-cecomsa-blanco.png" alt="Cecomsa"
        style={{ width: 160, objectFit: "contain", marginBottom: 36 }} />
      <h1 style={{ fontSize: 32, fontWeight: 800, margin: "0 0 12px", lineHeight: 1.25, maxWidth: 520 }}>
        Reporte de Satisfacción de Clientes
      </h1>
      <div style={{ display: "flex", gap: 0, margin: "22px auto", width: 200, height: 4, borderRadius: 2, overflow: "hidden" }}>
        {[C.primary, C.success, C.warning, C.danger].map((c) => (
          <div key={c} style={{ flex: 1, backgroundColor: c }} />
        ))}
      </div>
      <div style={{ fontSize: 17, opacity: 0.9, marginBottom: 8, fontWeight: 500 }}>{periodText}</div>
      <div style={{ fontSize: 12, opacity: 0.65, marginBottom: 40 }}>{dateStr}</div>
      <div style={{
        padding: "14px 28px", borderRadius: 8,
        backgroundColor: "rgba(255,255,255,0.12)", fontSize: 11, opacity: 0.8,
      }}>
        Sistema de Gestión de Calidad · Encuestas de Satisfacción
      </div>
      <div style={{
        position: "absolute", bottom: 0, left: 0, right: 0, height: 7,
        background: `linear-gradient(90deg, ${C.primary}, ${C.success}, ${C.warning}, ${C.danger})`,
      }} />
    </div>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
// COMPONENTE PRINCIPAL
// ═════════════════════════════════════════════════════════════════════════════
const SurveysPDFContent = forwardRef(function SurveysPDFContent(
  { kpis, radarData = [], byDept = [], byPeriod = [], filters, generatedAt, views = ["general"] },
  ref
) {
  if (!kpis) return null;

  const dateStr = new Date(generatedAt).toLocaleDateString("es-DO", {
    day: "2-digit", month: "long", year: "numeric",
  });
  const periodParts = [];
  if (filters?.year)    periodParts.push(`Año ${filters.year}`);
  if (filters?.quarter) periodParts.push(`Trimestre ${filters.quarter}`);
  if (filters?.site)    periodParts.push(`Sede: ${filters.site}`);
  if (!periodParts.length) periodParts.push("Período general");
  const periodText = periodParts.join(" · ");

  // Totales de páginas: portada + vistas + conclusiones
  const tp = 1 + views.length + 1;

  const conclusions = generateConclusions(null, kpis);

  // Métricas globales
  const si      = toPct(kpis.sat_interna_global);
  const se      = toPct(kpis.sat_externa_global);
  const overall = +((si + se) / 2).toFixed(1);

  // Radar (s = label corto, value = 0-100)
  const radarChart = radarData.map((d) => ({
    s: d.subject
      .replace("Calidad Técnica", "Cal. Técnica")
      .replace("Experiencia Global", "Exp. Global")
      .replace("Valor Agregado", "Val. Agr."),
    value: d.value,
  }));

  // Barras comparativas (interna vs externa)
  const barDepts = byDept
    .filter((d) => d.interna != null || d.externa != null)
    .sort((a, b) => ((b.interna || 0) + (b.externa || 0)) - ((a.interna || 0) + (a.externa || 0)))
    .slice(0, 10);

  // Horizontal bars interna / externa
  const hBarInt = [...byDept]
    .filter((d) => d.interna != null)
    .sort((a, b) => b.interna - a.interna)
    .slice(0, 10);

  const hBarExt = [...byDept]
    .filter((d) => d.externa != null)
    .sort((a, b) => b.externa - a.externa)
    .slice(0, 10);

  // Evolución temporal (valores ya en 0-100)
  const lineData = byPeriod.filter((p) => p.interna != null || p.externa != null);

  // Gap a meta 90%
  const gapData = radarData
    .map((d) => ({
      s:   d.subject.replace("Calidad Técnica", "Cal. T.").replace("Experiencia Global", "Exp. G.").replace("Valor Agregado", "Val. A."),
      gap: Math.max(0, +(90 - d.value).toFixed(1)),
    }))
    .sort((a, b) => b.gap - a.gap);

  // Delta interna − externa por dept
  const deltaData = byDept
    .filter((d) => d.interna != null && d.externa != null)
    .map((d) => ({ name: d.name, fullName: d.fullName, delta: +(d.interna - d.externa).toFixed(1) }))
    .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta))
    .slice(0, 10);

  // Helper: número de página y sección para cada vista
  const pageOf    = (viewId) => 1 + views.indexOf(viewId) + 1;
  const sectionOf = (viewId) => views.indexOf(viewId) + 1;

  return (
    <div
      ref={ref}
      style={{
        position: "absolute", left: -9999, top: 0,
        width: PAGE_W,
        fontFamily: '"Segoe UI", system-ui, -apple-system, sans-serif',
        color: C.text,
      }}
    >
      <CoverPage periodText={periodText} dateStr={dateStr} />

      {views.includes("general") && (
        <PageGeneral
          kpis={kpis} si={si} se={se} radarChart={radarChart} barDepts={barDepts}
          dateStr={dateStr} pageNum={pageOf("general")} tp={tp} sectionNum={sectionOf("general")}
        />
      )}

      {views.includes("interna") && (
        <PageInterna
          kpis={kpis} si={si} radarChart={radarChart} radarData={radarData}
          hBarInt={hBarInt} lineData={lineData.filter((p) => p.interna != null)}
          dateStr={dateStr} pageNum={pageOf("interna")} tp={tp} sectionNum={sectionOf("interna")}
        />
      )}

      {views.includes("externa") && (
        <PageExterna
          kpis={kpis} se={se} hBarExt={hBarExt}
          lineData={lineData.filter((p) => p.externa != null)}
          dateStr={dateStr} pageNum={pageOf("externa")} tp={tp} sectionNum={sectionOf("externa")}
        />
      )}

      {views.includes("avanzado") && (
        <PageAvanzado
          kpis={kpis} overall={overall} si={si} se={se}
          gapData={gapData} deltaData={deltaData} byDept={byDept}
          dateStr={dateStr} pageNum={pageOf("avanzado")} tp={tp} sectionNum={sectionOf("avanzado")}
        />
      )}

      <PageConclusions
        conclusions={conclusions} dateStr={dateStr}
        pageNum={tp} tp={tp} sectionNum={views.length + 1}
      />
    </div>
  );
});

export default SurveysPDFContent;
