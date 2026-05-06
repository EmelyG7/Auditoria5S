/**
 * ReportPDFContent.jsx
 * Reporte ejecutivo combinado: Auditorías 5S + Satisfacción.
 * Renderizado off-screen para captura con html2canvas → jsPDF.
 *
 * Páginas (según datos disponibles):
 *  1. Portada corporativa
 *  2. Resumen Ejecutivo combinado — KPIs de auditorías + satisfacción
 *  3. Auditorías 5S — Radar, tabla 5S, tabla por tipo, mejor/peor
 *  4. Sucursales — distribución semáforo, ranking BarChart, tabla completa
 *  5. Satisfacción — KPIs, radar dimensiones, tabla dimensiones, tabla por sede, evolución
 *  6. Análisis Avanzado de Satisfacción — heatmap departamento×dimensión, brecha a meta, delta (si hay datos)
 *  7. Conclusiones y Recomendaciones
 */
import { forwardRef } from "react";
import {
  BarChart, Bar, XAxis, YAxis, Cell, Tooltip, LabelList, Legend,
  RadarChart, Radar, PolarGrid, PolarAngleAxis, PolarRadiusAxis,
  LineChart, Line, CartesianGrid,
} from "recharts";
import { generateConclusions } from "../../services/reportService";

// ── Paleta ────────────────────────────────────────────────────────────────────
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

// ── Dimensiones satisfacción ──────────────────────────────────────────────────
const DIMS = [
  { key: "efficiency",        label: "Eficiencia" },
  { key: "communication",     label: "Comunicación" },
  { key: "technical_quality", label: "Cal. Técnica" },
  { key: "added_value",       label: "Val. Agregado" },
  { key: "global_experience", label: "Exp. Global" },
];

const S_KEYS = ["seiri", "seiton", "seiso", "seiketsu", "shitsuke"];
const S_SHORT = {
  seiri: "Seiri", seiton: "Seiton", seiso: "Seiso",
  seiketsu: "Seiketsu", shitsuke: "Shitsuke",
};
const S_LABEL = {
  seiri:    "Seiri — Clasificar",
  seiton:   "Seiton — Ordenar",
  seiso:    "Seiso — Limpiar",
  seiketsu: "Seiketsu — Estandarizar",
  shitsuke: "Shitsuke — Disciplina",
};

// ── Helpers ───────────────────────────────────────────────────────────────────
const safe  = (v, fb = 0) => (v != null && !isNaN(+v) ? +v : fb);
const toPct = (v) => +(safe(v) * 100).toFixed(1);

function color5S(pct) {
  const n = safe(pct);
  if (n >= 80) return C.success;
  if (n >= 60) return C.warning;
  return C.danger;
}
function label5S(pct) {
  const n = safe(pct);
  if (n >= 80) return "Cumple";
  if (n >= 60) return "Por mejorar";
  return "Crítico";
}

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

// ── Sub-componentes compartidos ───────────────────────────────────────────────
function PageHeaderAudit({ date }) {
  return (
    <div style={{
      display: "flex", justifyContent: "space-between", alignItems: "center",
      paddingBottom: 10, marginBottom: 18,
      borderBottom: `2px solid ${C.primary}`,
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <img src="/logo-cecomsa-blanco.png" alt="Cecomsa" style={{ height: 22, objectFit: "contain" }} />
        <span style={{ fontSize: 11, fontWeight: 700, color: C.primary, letterSpacing: 1 }}>
          CECOMSA · REPORTE EJECUTIVO INTEGRAL
        </span>
      </div>
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

function SectionTitle({ children, color = C.primary }) {
  return (
    <div style={{
      fontSize: 15, fontWeight: 700, color,
      borderLeft: `4px solid ${color}`, paddingLeft: 10, marginBottom: 14,
    }}>
      {children}
    </div>
  );
}

function SubTitle({ children, color = C.primary }) {
  return (
    <div style={{ fontSize: 11, fontWeight: 600, color, marginBottom: 7 }}>
      {children}
    </div>
  );
}

function KPIBox({ label, value, color, sub }) {
  return (
    <div style={{
      flex: 1, padding: "10px 12px",
      backgroundColor: C.light, borderLeft: `4px solid ${color}`, borderRadius: 6,
    }}>
      <div style={{ fontSize: 20, fontWeight: 700, color, lineHeight: 1 }}>{value}</div>
      {sub && <div style={{ fontSize: 9, color, fontWeight: 600, marginTop: 2 }}>{sub}</div>}
      <div style={{ fontSize: 10, color: C.muted, marginTop: sub ? 2 : 4 }}>{label}</div>
    </div>
  );
}

function THead({ cols, color = C.primary }) {
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
      <PageHeaderAudit date={dateStr} />
      {children}
      <PageFooter pageNum={pageNum} totalPages={tp} />
    </div>
  );
}

// ── PORTADA ───────────────────────────────────────────────────────────────────
function CoverPage({ periodText, dateStr }) {
  return (
    <div className="pdf-page" style={{
      width: PAGE_W, minHeight: 1123,
      display: "flex", flexDirection: "column",
      alignItems: "center", justifyContent: "center", textAlign: "center",
      background: "linear-gradient(155deg, #0A4F79 0%, #0D6FA3 60%, #0A4F79 100%)",
      color: C.white, padding: "60px 80px", boxSizing: "border-box", position: "relative",
    }}>
      <img src="/logo-cecomsa-blanco.png" alt="Cecomsa"
        style={{ width: 160, objectFit: "contain", marginBottom: 36 }} />

      <h1 style={{ fontSize: 32, fontWeight: 800, margin: "0 0 12px", lineHeight: 1.25, maxWidth: 540 }}>
        Reporte Ejecutivo Integral — Auditorías 5S y Satisfacción
      </h1>

      <div style={{ display: "flex", gap: 0, margin: "22px auto", width: 200, height: 4, borderRadius: 2, overflow: "hidden" }}>
        {[C.success, C.warning, C.danger, C.secondary].map((c) => (
          <div key={c} style={{ flex: 1, backgroundColor: c }} />
        ))}
      </div>

      <div style={{ fontSize: 17, opacity: 0.9, marginBottom: 8, fontWeight: 500 }}>{periodText}</div>
      <div style={{ fontSize: 12, opacity: 0.65, marginBottom: 36 }}>{dateStr}</div>

      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", justifyContent: "center", marginBottom: 28 }}>
        {[
          "Resumen Ejecutivo", "Auditorías 5S", "Ranking Sucursales",
          "Satisfacción de Clientes", "Análisis Avanzado", "Conclusiones",
        ].map((tag) => (
          <span key={tag} style={{
            padding: "5px 14px", borderRadius: 20,
            backgroundColor: "rgba(255,255,255,0.15)", fontSize: 11, fontWeight: 500,
          }}>{tag}</span>
        ))}
      </div>

      <div style={{
        padding: "14px 28px", borderRadius: 8,
        backgroundColor: "rgba(255,255,255,0.12)", fontSize: 11, opacity: 0.8,
      }}>
        Sistema de Gestión de Calidad · Metodología 5S
      </div>

      <div style={{
        position: "absolute", bottom: 0, left: 0, right: 0, height: 7,
        background: `linear-gradient(90deg, ${C.success}, ${C.warning}, ${C.danger}, ${C.secondary})`,
      }} />
    </div>
  );
}

// ── PÁGINA 2: RESUMEN EJECUTIVO COMBINADO ────────────────────────────────────
function PageResumenCombinado({ auditKPIs, surveyKPIs, si, se, overall, dateStr, pageNum, tp }) {
  return (
    <PageWrap pageNum={pageNum} tp={tp} dateStr={dateStr}>
      <SectionTitle>1. Resumen Ejecutivo</SectionTitle>

      {/* Auditorías */}
      <div style={{ marginBottom: 18 }}>
        <div style={{
          fontSize: 11, fontWeight: 700, color: C.primary,
          textTransform: "uppercase", letterSpacing: 1, marginBottom: 8,
          display: "flex", alignItems: "center", gap: 8,
        }}>
          <div style={{ width: 12, height: 12, borderRadius: "50%", backgroundColor: C.primary }} />
          Auditorías 5S
        </div>
        <div style={{ display: "flex", gap: 10 }}>
          <KPIBox
            label="Promedio Global"
            value={`${safe(auditKPIs?.promedio_global).toFixed(1)}%`}
            color={color5S(auditKPIs?.promedio_global)}
            sub={auditKPIs?.estado_global}
          />
          <KPIBox
            label="Total Auditorías"
            value={auditKPIs?.total_auditorias ?? 0}
            color={C.primary}
          />
          <KPIBox
            label="Sucursales Cumplen"
            value={`${safe(auditKPIs?.sucursales_cumple_pct).toFixed(1)}%`}
            color={C.success}
            sub="≥ 80%"
          />
          <KPIBox
            label="Sucursales Críticas"
            value={`${safe(auditKPIs?.sucursales_critico_pct).toFixed(1)}%`}
            color={C.danger}
            sub="< 60%"
          />
        </div>
      </div>

      {/* Satisfacción */}
      {surveyKPIs && (
        <div style={{ marginBottom: 20 }}>
          <div style={{
            fontSize: 11, fontWeight: 700, color: C.secondary,
            textTransform: "uppercase", letterSpacing: 1, marginBottom: 8,
            display: "flex", alignItems: "center", gap: 8,
          }}>
            <div style={{ width: 12, height: 12, borderRadius: "50%", backgroundColor: C.secondary }} />
            Satisfacción de Clientes
          </div>
          <div style={{ display: "flex", gap: 10 }}>
            <KPIBox label="Satisfacción Interna"   value={`${si}%`}  color={semPct(si)} sub={semLabel(si)} />
            <KPIBox label="Satisfacción Externa"   value={`${se}%`}  color={semPct(se)} sub={semLabel(se)} />
            <KPIBox label="Índice Global"           value={`${overall}%`} color={semPct(overall)} sub={semLabel(overall)} />
            <KPIBox label="Total Registros"         value={surveyKPIs.total_registros ?? 0} color={C.secondary} />
          </div>
        </div>
      )}

      {/* Comparativa visual */}
      <div style={{ display: "flex", gap: 14 }}>
        {/* Card auditorías */}
        {auditKPIs?.mejor_sucursal && (
          <div style={{ flex: 1 }}>
            <SubTitle>Sucursales destacadas</SubTitle>
            <div style={{
              padding: "10px 14px", borderRadius: 7,
              backgroundColor: `${C.success}12`, borderLeft: `3px solid ${C.success}`,
              marginBottom: 8, fontSize: 11,
            }}>
              <span style={{ fontWeight: 700, color: C.success }}>Mejor: </span>
              {auditKPIs.mejor_sucursal} — {safe(auditKPIs.mejor_sucursal_pct).toFixed(1)}%
            </div>
            <div style={{
              padding: "10px 14px", borderRadius: 7,
              backgroundColor: `${C.danger}12`, borderLeft: `3px solid ${C.danger}`,
              fontSize: 11,
            }}>
              <span style={{ fontWeight: 700, color: C.danger }}>Atención: </span>
              {auditKPIs.peor_sucursal} — {safe(auditKPIs.peor_sucursal_pct).toFixed(1)}%
            </div>
          </div>
        )}

        {/* Card satisfacción */}
        {surveyKPIs && (
          <div style={{ flex: 1 }}>
            <SubTitle color={C.secondary}>Dimensiones de satisfacción</SubTitle>
            <div style={{
              padding: "10px 14px", borderRadius: 7,
              backgroundColor: `${C.success}12`, borderLeft: `3px solid ${C.success}`,
              marginBottom: 8, fontSize: 11,
            }}>
              <span style={{ fontWeight: 700, color: C.success }}>Mejor dimensión: </span>
              {surveyKPIs.mejor_dimension || "—"}
            </div>
            <div style={{
              padding: "10px 14px", borderRadius: 7,
              backgroundColor: `${C.warning}12`, borderLeft: `3px solid ${C.warning}`,
              fontSize: 11,
            }}>
              <span style={{ fontWeight: 700, color: C.warning }}>A mejorar: </span>
              {surveyKPIs.peor_dimension || "—"}
            </div>
          </div>
        )}

        {/* Brecha int-ext */}
        {surveyKPIs && Math.abs(si - se) > 0 && (
          <div style={{ flex: 1 }}>
            <SubTitle color={C.secondary}>Brecha interna − externa</SubTitle>
            <div style={{
              padding: "18px 14px", borderRadius: 7, textAlign: "center",
              backgroundColor: Math.abs(si - se) > 10 ? `${C.warning}15` : `${C.success}15`,
              border: `1px solid ${Math.abs(si - se) > 10 ? C.warning : C.success}30`,
            }}>
              <div style={{
                fontSize: 32, fontWeight: 800,
                color: Math.abs(si - se) > 10 ? C.warning : C.success,
                lineHeight: 1,
              }}>
                {Math.abs(si - se).toFixed(1)} pp
              </div>
              <div style={{ fontSize: 10, color: C.muted, marginTop: 4 }}>
                {si > se ? "Int. > Ext." : "Ext. > Int."}
                {Math.abs(si - se) > 10 ? " — Brecha significativa" : " — Brecha aceptable"}
              </div>
            </div>
          </div>
        )}
      </div>
    </PageWrap>
  );
}

// ── PÁGINA 3: AUDITORÍAS 5S ───────────────────────────────────────────────────
function PageAuditorias({ auditKPIs, radarData, sValues, dateStr, pageNum, tp, sectionNum }) {
  return (
    <PageWrap pageNum={pageNum} tp={tp} dateStr={dateStr}>
      <SectionTitle>{sectionNum}. Auditorías 5S — Análisis de Cumplimiento</SectionTitle>

      {/* Radar + Tabla 5S */}
      <div style={{ display: "flex", gap: 20, marginBottom: 20, alignItems: "flex-start" }}>
        {radarData.length > 0 && (
          <div style={{ flexShrink: 0 }}>
            <SubTitle>Radar de 5S</SubTitle>
            <RadarChart width={HALF_W} height={230} data={radarData}
              margin={{ top: 8, right: 16, bottom: 8, left: 16 }}>
              <PolarGrid stroke={`${C.primary}22`} />
              <PolarAngleAxis dataKey="s" tick={{ fontSize: 10, fill: C.text }} />
              <PolarRadiusAxis domain={[0, 100]} tickCount={5} angle={30}
                tick={{ fontSize: 8, fill: C.muted }} tickFormatter={(v) => `${v}%`} />
              <Radar dataKey="value" stroke={C.primary} fill={C.primary}
                fillOpacity={0.18} strokeWidth={2}
                dot={{ r: 3, fill: C.primary, strokeWidth: 0 }} />
              <Tooltip formatter={(v) => [`${Number(v).toFixed(1)}%`, "Cumplimiento"]}
                contentStyle={{ fontSize: 10 }} />
            </RadarChart>
          </div>
        )}

        <div style={{ flex: 1 }}>
          <SubTitle>Detalle por Dimensión 5S</SubTitle>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <THead cols={["Dimensión", "Puntaje", "Estado"]} />
            <tbody>
              {sValues.map((s, i) => {
                const col = color5S(s.value);
                return (
                  <TRow key={i} idx={i} cells={[
                    <span key="l" style={{ fontWeight: 500 }}>{s.label}</span>,
                    <span key="v" style={{ color: col, fontWeight: 700 }}>{s.value.toFixed(1)}%</span>,
                    <Bdg key="b" label={label5S(s.value)} color={col} />,
                  ]} />
                );
              })}
            </tbody>
          </table>

          {/* Mini barras */}
          <div style={{ marginTop: 12 }}>
            {sValues.map((s) => (
              <div key={s.key} style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 5 }}>
                <span style={{ fontSize: 9, color: C.muted, width: 64, flexShrink: 0 }}>{s.short}</span>
                <div style={{ flex: 1, height: 7, backgroundColor: C.border, borderRadius: 4, overflow: "hidden" }}>
                  <div style={{
                    width: `${Math.min(s.value, 100)}%`, height: "100%",
                    backgroundColor: color5S(s.value), borderRadius: 4,
                  }} />
                </div>
                <span style={{ fontSize: 9, fontWeight: 700, color: color5S(s.value), width: 34, textAlign: "right" }}>
                  {s.value.toFixed(1)}%
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Tabla por tipo */}
      {auditKPIs.por_tipo?.length > 0 && (
        <div style={{ marginBottom: 18 }}>
          <SubTitle>Resumen por Tipo de Auditoría</SubTitle>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <THead cols={["Tipo", "Auditorías", "Promedio", "Seiri", "Seiton", "Seiso", "Seiketsu", "Shitsuke", "Estado"]} />
            <tbody>
              {auditKPIs.por_tipo.map((t, i) => {
                const col = color5S(t.promedio);
                const pS  = t.promedio_por_s || {};
                return (
                  <TRow key={i} idx={i} cells={[
                    <span key="t" style={{ fontWeight: 600 }}>{t.tipo}</span>,
                    t.n_auditorias,
                    <span key="p" style={{ color: col, fontWeight: 700 }}>{safe(t.promedio).toFixed(1)}%</span>,
                    ...S_KEYS.map((k) => {
                      const v = pS[k] != null ? safe(pS[k]) : null;
                      return v != null
                        ? <span key={k} style={{ color: color5S(v), fontWeight: 600, fontSize: 9 }}>{v.toFixed(1)}%</span>
                        : <span key={k} style={{ color: C.muted, fontSize: 9 }}>—</span>;
                    }),
                    <Bdg key="b" label={t.estado || label5S(t.promedio)} color={col} />,
                  ]} />
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Mejor / Peor */}
      {auditKPIs.mejor_sucursal && (
        <div style={{ display: "flex", gap: 12 }}>
          <div style={{
            flex: 1, padding: "10px 14px", borderRadius: 7,
            backgroundColor: `${C.success}12`, borderLeft: `3px solid ${C.success}`, fontSize: 11,
          }}>
            <span style={{ fontWeight: 700, color: C.success }}>Mejor desempeño: </span>
            {auditKPIs.mejor_sucursal} — {safe(auditKPIs.mejor_sucursal_pct).toFixed(1)}%
          </div>
          <div style={{
            flex: 1, padding: "10px 14px", borderRadius: 7,
            backgroundColor: `${C.danger}12`, borderLeft: `3px solid ${C.danger}`, fontSize: 11,
          }}>
            <span style={{ fontWeight: 700, color: C.danger }}>Mayor oportunidad: </span>
            {auditKPIs.peor_sucursal} — {safe(auditKPIs.peor_sucursal_pct).toFixed(1)}%
          </div>
        </div>
      )}
    </PageWrap>
  );
}

// ── PÁGINA 4: SUCURSALES ──────────────────────────────────────────────────────
function PageSucursales({ auditKPIs, barData, dateStr, pageNum, tp, sectionNum }) {
  const barH    = Math.max(160, Math.min(barData.length * 24 + 20, 540));
  const cumple  = barData.filter((d) => safe(d.value) >= 80).length;
  const mejora  = barData.filter((d) => safe(d.value) >= 60 && safe(d.value) < 80).length;
  const critico = barData.filter((d) => safe(d.value) < 60).length;

  return (
    <PageWrap pageNum={pageNum} tp={tp} dateStr={dateStr}>
      <SectionTitle>{sectionNum}. Análisis por Sucursal</SectionTitle>

      {/* Distribución */}
      <div style={{ display: "flex", gap: 12, marginBottom: 18 }}>
        {[
          { n: cumple,  color: C.success, title: "Cumplen (≥80%)"  },
          { n: mejora,  color: C.warning, title: "Por Mejorar (60–79%)" },
          { n: critico, color: C.danger,  title: "Críticas (<60%)" },
        ].map((s, i) => (
          <div key={i} style={{
            flex: 1, padding: "10px 14px", borderRadius: 8,
            backgroundColor: `${s.color}12`, borderLeft: `4px solid ${s.color}`,
            display: "flex", alignItems: "center", gap: 12,
          }}>
            <span style={{ fontSize: 28, fontWeight: 800, color: s.color, lineHeight: 1 }}>{s.n}</span>
            <div>
              <div style={{ fontSize: 10, fontWeight: 700, color: s.color }}>{s.title}</div>
              <div style={{ fontSize: 9, color: C.muted }}>
                {barData.length > 0 ? `${((s.n / barData.length) * 100).toFixed(0)}% del total` : "—"}
              </div>
            </div>
          </div>
        ))}
      </div>

      {barData.length > 0 && (
        <div style={{ display: "flex", gap: 20 }}>
          {/* BarChart */}
          <div style={{ flex: 1 }}>
            <SubTitle>Ranking de Cumplimiento</SubTitle>
            <BarChart width={CHART_W * 0.56} height={barH} data={barData} layout="vertical"
              margin={{ top: 4, right: 55, left: 0, bottom: 4 }}>
              <XAxis type="number" domain={[0, 100]} tick={{ fontSize: 8, fill: C.muted }}
                tickFormatter={(v) => `${v}%`} axisLine={false} tickLine={false} />
              <YAxis type="category" dataKey="name" width={120}
                tick={{ fontSize: 9, fill: C.text }} axisLine={false} tickLine={false} />
              <Tooltip formatter={(v) => [`${Number(v).toFixed(1)}%`, "Cumplimiento"]}
                contentStyle={{ fontSize: 10 }} />
              <Bar dataKey="value" radius={[0, 5, 5, 0]} maxBarSize={18}>
                <LabelList dataKey="value" position="right" style={{ fontSize: 8 }}
                  formatter={(v) => `${Number(v).toFixed(1)}%`} />
                {barData.map((e, i) => (
                  <Cell key={i} fill={color5S(e.value)} fillOpacity={0.85} />
                ))}
              </Bar>
            </BarChart>
          </div>

          {/* Tabla */}
          <div style={{ flex: 1 }}>
            <SubTitle>Tabla de Resultados</SubTitle>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <THead cols={["#", "Sucursal", "Puntaje", "Estado", "vs. Promedio"]} />
              <tbody>
                {barData.map((s, i) => {
                  const col  = color5S(s.value);
                  const diff = safe(s.value) - safe(auditKPIs.promedio_global);
                  return (
                    <TRow key={i} idx={i} cells={[
                      <span key="n" style={{ color: C.muted, fontSize: 9 }}>
                        {String(i + 1).padStart(2, "0")}
                      </span>,
                      <span key="nm" style={{ fontSize: 10 }}>{s.name}</span>,
                      <span key="v" style={{ color: col, fontWeight: 700 }}>
                        {safe(s.value).toFixed(1)}%
                      </span>,
                      <Bdg key="b" label={label5S(s.value)} color={col} />,
                      <span key="d" style={{ color: diff >= 0 ? C.success : C.danger, fontWeight: 600, fontSize: 10 }}>
                        {diff >= 0 ? "+" : ""}{diff.toFixed(1)} pp
                      </span>,
                    ]} />
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </PageWrap>
  );
}

// ── PÁGINA 5: SATISFACCIÓN ────────────────────────────────────────────────────
function PageSatisfaccion({ surveyKPIs, si, se, radarChart, byDept, byPeriod, dateStr, pageNum, tp, sectionNum }) {
  const porSede = (surveyKPIs.por_sede || []).slice(0, 10);
  const barDepts = [...byDept]
    .filter((d) => d.interna != null || d.externa != null)
    .sort((a, b) => ((b.interna || 0) + (b.externa || 0)) - ((a.interna || 0) + (a.externa || 0)))
    .slice(0, 8);
  const lineData = byPeriod.filter((p) => p.interna != null || p.externa != null);

  return (
    <PageWrap pageNum={pageNum} tp={tp} dateStr={dateStr}>
      <SectionTitle color={C.secondary}>{sectionNum}. Satisfacción de Clientes</SectionTitle>

      {/* KPIs satisfacción */}
      <div style={{ display: "flex", gap: 10, marginBottom: 20 }}>
        <KPIBox label="Satisfacción Interna"   value={`${si}%`}  color={semPct(si)}  sub={semLabel(si)} />
        <KPIBox label="Satisfacción Externa"   value={`${se}%`}  color={semPct(se)}  sub={semLabel(se)} />
        <KPIBox label="Mejor Dimensión"         value={surveyKPIs.mejor_dimension || "—"} color={C.success} />
        <KPIBox label="Dimensión a Mejorar"     value={surveyKPIs.peor_dimension  || "—"} color={C.danger}  />
      </div>

      {/* Radar + Tabla dimensiones */}
      <div style={{ display: "flex", gap: 20, marginBottom: 18, alignItems: "flex-start" }}>
        {radarChart.length > 0 && (
          <div style={{ flexShrink: 0 }}>
            <SubTitle color={C.secondary}>5 Dimensiones</SubTitle>
            <RadarChart width={HALF_W} height={210} data={radarChart}
              margin={{ top: 8, right: 16, bottom: 8, left: 16 }}>
              <PolarGrid stroke={`${C.secondary}22`} />
              <PolarAngleAxis dataKey="s" tick={{ fontSize: 10, fill: C.text }} />
              <PolarRadiusAxis domain={[0, 100]} tickCount={5} angle={30}
                tick={{ fontSize: 8, fill: C.muted }} tickFormatter={(v) => `${v}%`} />
              <Radar dataKey="value" stroke={C.secondary} fill={C.secondary}
                fillOpacity={0.18} strokeWidth={2}
                dot={{ r: 3, fill: C.secondary, strokeWidth: 0 }} />
              <Tooltip formatter={(v) => [`${Number(v).toFixed(1)}%`, "Satisfacción"]}
                contentStyle={{ fontSize: 10 }} />
            </RadarChart>
          </div>
        )}

        {surveyKPIs.dimensiones?.length > 0 && (
          <div style={{ flex: 1 }}>
            <SubTitle color={C.secondary}>Detalle por Dimensión</SubTitle>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <THead cols={["Dimensión", "Puntaje", "Registros", "Estado"]} color={C.secondary} />
              <tbody>
                {surveyKPIs.dimensiones.map((d, i) => {
                  const pct = toPct(d.promedio);
                  const col = semPct(pct);
                  return (
                    <TRow key={i} idx={i} cells={[
                      d.nombre,
                      <span key="p" style={{ color: col, fontWeight: 700 }}>{pct.toFixed(1)}%</span>,
                      <span key="n" style={{ color: C.muted }}>{d.n_registros ?? "—"}</span>,
                      <Bdg key="b" label={d.estado || semLabel(pct)} color={col} />,
                    ]} />
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Barras por departamento + Evolución */}
      <div style={{ display: "flex", gap: 20, marginBottom: 18 }}>
        {barDepts.length > 0 && (
          <div style={{ flex: 1 }}>
            <SubTitle color={C.secondary}>Interna vs. Externa por Departamento</SubTitle>
            <BarChart width={HALF_W} height={200} data={barDepts}
              margin={{ top: 4, right: 8, left: -10, bottom: 52 }}>
              <XAxis dataKey="name" tick={{ fontSize: 8, fill: C.muted }}
                angle={-30} textAnchor="end" interval={0} axisLine={false} tickLine={false} />
              <YAxis domain={[0, 100]} tick={{ fontSize: 8, fill: C.muted }}
                tickFormatter={(v) => `${v}%`} axisLine={false} tickLine={false} />
              <Tooltip formatter={(v) => [`${Number(v).toFixed(1)}%`]} contentStyle={{ fontSize: 10 }} />
              <Legend wrapperStyle={{ fontSize: 10, paddingTop: 4 }} />
              <Bar dataKey="interna" name="Interna" fill={C.primary}
                radius={[4, 4, 0, 0]} maxBarSize={14} />
              <Bar dataKey="externa" name="Externa" fill={C.secondary}
                radius={[4, 4, 0, 0]} maxBarSize={14} />
            </BarChart>
          </div>
        )}

        {lineData.length > 1 && (
          <div style={{ flex: 1 }}>
            <SubTitle color={C.secondary}>Evolución Temporal</SubTitle>
            <LineChart width={HALF_W} height={200} data={lineData}
              margin={{ top: 8, right: 20, left: -8, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(30,30,47,0.06)" />
              <XAxis dataKey="period" tick={{ fontSize: 8 }} axisLine={false} tickLine={false} />
              <YAxis domain={[0, 100]} tickFormatter={(v) => `${v}%`}
                tick={{ fontSize: 8 }} axisLine={false} tickLine={false} />
              <Tooltip formatter={(v) => [`${Number(v).toFixed(1)}%`]} contentStyle={{ fontSize: 10 }} />
              <Line type="monotone" dataKey="interna" name="Interna" stroke={C.primary}
                strokeWidth={2} dot={{ r: 3 }} connectNulls />
              <Line type="monotone" dataKey="externa" name="Externa" stroke={C.secondary}
                strokeWidth={2} dot={{ r: 3 }} connectNulls />
              <Legend wrapperStyle={{ fontSize: 10 }} />
            </LineChart>
          </div>
        )}
      </div>

      {/* Tabla por sede */}
      {porSede.length > 0 && (
        <div>
          <SubTitle color={C.secondary}>Satisfacción por Sede</SubTitle>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <THead cols={["Sede", "Interna", "Externa", "Promedio", "Registros", "Estado"]} color={C.secondary} />
            <tbody>
              {porSede.map((s, i) => {
                const siS = toPct(s.sat_interna);
                const seS = toPct(s.sat_externa);
                const avg = +((siS + seS) / 2).toFixed(1);
                const col = semPct(avg);
                return (
                  <TRow key={i} idx={i} cells={[
                    s.site,
                    <span key="si" style={{ color: semPct(siS), fontWeight: 600 }}>{siS}%</span>,
                    <span key="se" style={{ color: semPct(seS), fontWeight: 600 }}>{seS}%</span>,
                    <span key="avg" style={{ color: col, fontWeight: 700 }}>{avg}%</span>,
                    <span key="n" style={{ color: C.muted }}>{s.n_registros ?? "—"}</span>,
                    <Bdg key="b" label={semLabel(avg)} color={col} />,
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

// ── PÁGINA 6: ANÁLISIS AVANZADO SATISFACCIÓN ──────────────────────────────────
function PageSatisfaccionAvanzado({ surveyKPIs, overall, si, se, byDept, radarData, dateStr, pageNum, tp, sectionNum }) {
  const heatDepts = byDept.filter((d) => DIMS.some((dim) => d[dim.key] != null)).slice(0, 12);

  const gapData = radarData
    .map((d) => ({
      s:   d.subject.replace("Calidad Técnica", "Cal. T.").replace("Experiencia Global", "Exp. G.").replace("Valor Agregado", "Val. A."),
      gap: Math.max(0, +(90 - d.value).toFixed(1)),
    }))
    .sort((a, b) => b.gap - a.gap);

  const deltaData = byDept
    .filter((d) => d.interna != null && d.externa != null)
    .map((d) => ({ name: d.name, delta: +(d.interna - d.externa).toFixed(1) }))
    .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta))
    .slice(0, 10);

  const gapH   = Math.max(120, gapData.length * 34 + 20);
  const deltaH = Math.max(120, deltaData.length * 34 + 20);

  return (
    <PageWrap pageNum={pageNum} tp={tp} dateStr={dateStr}>
      <SectionTitle color={C.secondary}>{sectionNum}. Análisis Avanzado — Satisfacción</SectionTitle>

      {/* Índices globales */}
      <div style={{ display: "flex", gap: 12, marginBottom: 20 }}>
        {[
          { label: "ÍNDICE GLOBAL", value: overall, color: semPct(overall) },
          { label: "SAT. INTERNA",  value: si,      color: semPct(si) },
          { label: "SAT. EXTERNA",  value: se,      color: semPct(se) },
          {
            label: "BRECHA INT − EXT",
            value: `${Math.abs(si - se).toFixed(1)} pp`,
            color: Math.abs(si - se) > 10 ? C.warning : C.success,
            sub:   si > se ? "Int. > Ext." : "Ext. > Int.",
          },
        ].map((k, i) => (
          <div key={i} style={{
            flex: 1, textAlign: "center", padding: "14px 10px", borderRadius: 8,
            backgroundColor: `${k.color}12`, borderLeft: `4px solid ${k.color}`,
          }}>
            <div style={{ fontSize: 9, color: C.muted, fontWeight: 700, marginBottom: 4 }}>{k.label}</div>
            <div style={{ fontSize: 28, fontWeight: 800, color: k.color, lineHeight: 1 }}>
              {typeof k.value === "number" ? `${k.value}%` : k.value}
            </div>
            <div style={{ fontSize: 10, color: C.muted, marginTop: 3 }}>
              {k.sub || semLabel(typeof k.value === "number" ? k.value : overall)}
            </div>
          </div>
        ))}
      </div>

      {/* Heatmap departamento × dimensión */}
      {heatDepts.length > 0 && (
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
                  <td style={{ padding: "3px 8px", fontSize: 9, fontWeight: 500 }}>
                    {dept.fullName || dept.name}
                  </td>
                  {DIMS.map((dim) => {
                    const val = dept[dim.key] != null ? +(safe(dept[dim.key]) * 100).toFixed(1) : null;
                    const col = val != null ? semPct(val) : C.muted;
                    return (
                      <td key={dim.key} style={{
                        padding: "3px 5px", textAlign: "center", fontSize: 9, fontWeight: 600,
                        backgroundColor: val != null ? `${col}20` : "transparent", color: col,
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
                        backgroundColor: v != null ? `${col}20` : "transparent", color: col,
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

      {/* Brecha a meta + Delta */}
      <div style={{ display: "flex", gap: 20 }}>
        {gapData.length > 0 && (
          <div style={{ flex: 1 }}>
            <SubTitle color={C.primary}>Brecha a Meta (90%) por Dimensión</SubTitle>
            <BarChart width={HALF_W} height={gapH} data={gapData} layout="vertical"
              margin={{ top: 4, right: 55, left: 8, bottom: 4 }}>
              <XAxis type="number" domain={[0, 30]} tick={{ fontSize: 8, fill: C.muted }}
                tickFormatter={(v) => `${v} pp`} axisLine={false} tickLine={false} />
              <YAxis type="category" dataKey="s" width={90}
                tick={{ fontSize: 9, fill: C.text }} axisLine={false} tickLine={false} />
              <Tooltip formatter={(v) => [`${Number(v).toFixed(1)} pp`, "Brecha"]}
                contentStyle={{ fontSize: 10 }} />
              <Bar dataKey="gap" radius={[0, 4, 4, 0]} maxBarSize={20}>
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
            <SubTitle color={C.primary}>Delta Interna − Externa por Departamento</SubTitle>
            <BarChart width={HALF_W} height={deltaH} data={deltaData} layout="vertical"
              margin={{ top: 4, right: 55, left: 8, bottom: 4 }}>
              <XAxis type="number" tick={{ fontSize: 8, fill: C.muted }}
                tickFormatter={(v) => `${v > 0 ? "+" : ""}${v} pp`} axisLine={false} tickLine={false} />
              <YAxis type="category" dataKey="name" width={90}
                tick={{ fontSize: 9, fill: C.text }} axisLine={false} tickLine={false} />
              <Tooltip
                formatter={(v) => [`${v > 0 ? "+" : ""}${Number(v).toFixed(1)} pp`, "Delta"]}
                contentStyle={{ fontSize: 10 }} />
              <Bar dataKey="delta" radius={[0, 4, 4, 0]} maxBarSize={20}>
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

// ── PÁGINA CONCLUSIONES ───────────────────────────────────────────────────────
function PageConclusions({ conclusions, filters, auditKPIs, surveyKPIs, si, se, dateStr, pageNum, tp, sectionNum }) {
  return (
    <div className="pdf-page" style={{
      width: PAGE_W, minHeight: 1123,
      backgroundColor: C.white,
      padding: `40px ${PAD}px 80px`,
      boxSizing: "border-box", position: "relative",
    }}>
      <PageHeaderAudit date={dateStr} />
      <SectionTitle>{sectionNum}. Conclusiones y Recomendaciones</SectionTitle>

      {/* Contexto */}
      <div style={{
        padding: "12px 16px", borderRadius: 8,
        backgroundColor: `${C.primary}0D`, border: `1px solid ${C.primary}20`,
        marginBottom: 20, fontSize: 11, lineHeight: 1.7,
      }}>
        <strong style={{ color: C.primary }}>Contexto:</strong>{" "}
        <span style={{ color: C.muted }}>
          {filters?.year ? `Año ${filters.year}` : "Todos los años"}
          {filters?.quarter ? ` · Trimestre ${filters.quarter}` : ""}
          {auditKPIs && ` · ${auditKPIs.total_auditorias ?? 0} auditorías — Promedio ${safe(auditKPIs.promedio_global).toFixed(1)}%`}
          {surveyKPIs && ` · Satisfacción interna ${si}% / externa ${se}%`}
        </span>
      </div>

      {conclusions.conclusions.length > 0 && (
        <div style={{ marginBottom: 22 }}>
          <SubTitle>Hallazgos Principales</SubTitle>
          {conclusions.conclusions.map((c, i) => (
            <div key={i} style={{
              display: "flex", gap: 12, marginBottom: 10,
              padding: "10px 14px", borderRadius: 6,
              backgroundColor: "#EFF6FF", borderLeft: `3px solid ${C.primary}`,
              fontSize: 12, lineHeight: 1.55,
            }}>
              <span style={{ color: C.primary, fontWeight: 700, flexShrink: 0, minWidth: 22 }}>
                {String(i + 1).padStart(2, "0")}
              </span>
              <span>{c}</span>
            </div>
          ))}
        </div>
      )}

      {conclusions.recommendations.length > 0 && (
        <div style={{ marginBottom: 24 }}>
          <SubTitle color={C.warning}>Recomendaciones Estratégicas</SubTitle>
          {conclusions.recommendations.map((r, i) => (
            <div key={i} style={{
              display: "flex", gap: 12, marginBottom: 10,
              padding: "10px 14px", borderRadius: 6,
              backgroundColor: "#FFFBEB", borderLeft: `3px solid ${C.warning}`,
              fontSize: 12, lineHeight: 1.55,
            }}>
              <span style={{ color: C.warning, fontWeight: 700, flexShrink: 0 }}>→</span>
              <span>{r}</span>
            </div>
          ))}
        </div>
      )}

      {/* Leyenda semáforos */}
      <div style={{ display: "flex", gap: 20, marginBottom: 20 }}>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 9, color: C.muted, fontWeight: 700, marginBottom: 6, letterSpacing: 1 }}>
            SEMÁFORO AUDITORÍAS 5S
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            {[{ c: C.success, l: "Cumple ≥80%" }, { c: C.warning, l: "Mejora 60-79%" }, { c: C.danger, l: "Crítico <60%" }].map((s, i) => (
              <div key={i} style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 10 }}>
                <div style={{ width: 10, height: 10, borderRadius: "50%", backgroundColor: s.c }} />
                <span style={{ color: C.muted }}>{s.l}</span>
              </div>
            ))}
          </div>
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 9, color: C.muted, fontWeight: 700, marginBottom: 6, letterSpacing: 1 }}>
            SEMÁFORO SATISFACCIÓN
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            {[{ c: C.success, l: "Excelente ≥90%" }, { c: C.warning, l: "Aceptable 80-89%" }, { c: C.danger, l: "Crítico <80%" }].map((s, i) => (
              <div key={i} style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 10 }}>
                <div style={{ width: 10, height: 10, borderRadius: "50%", backgroundColor: s.c }} />
                <span style={{ color: C.muted }}>{s.l}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div style={{
        padding: "14px 18px", borderRadius: 8,
        backgroundColor: C.light, border: `1px solid ${C.border}`,
        fontSize: 10, color: C.muted, textAlign: "center", lineHeight: 1.6,
      }}>
        Este reporte fue generado automáticamente por el Sistema de Gestión de Calidad de Mejora continua & Auditoría.<br />
        Los datos reflejan las auditorías y encuestas registradas en el sistema a la fecha de generación.<br />
        Para consultas o aclaraciones, contacte al equipo de Calidad.
      </div>

      <PageFooter pageNum={pageNum} totalPages={tp} />
    </div>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
// COMPONENTE PRINCIPAL
// ═════════════════════════════════════════════════════════════════════════════
const ReportPDFContent = forwardRef(function ReportPDFContent(
  { auditKPIs, surveyKPIs, filters, generatedAt },
  ref
) {
  const dateStr = new Date(generatedAt).toLocaleDateString("es-DO", {
    day: "2-digit", month: "long", year: "numeric",
  });

  const periodParts = [];
  if (filters?.year)    periodParts.push(`Año ${filters.year}`);
  if (filters?.quarter) periodParts.push(`Trimestre ${filters.quarter}`);
  if (!periodParts.length) periodParts.push("Período general");
  const periodText = periodParts.join(" · ");

  // ── Datos auditorías ─────────────────────────────────────────────────────
  const radarData5S = S_KEYS.map((key) => ({
    s:     S_SHORT[key],
    value: safe(auditKPIs?.promedio_por_s?.[key]),
  }));
  const sValues = S_KEYS.map((key) => ({
    key, label: S_LABEL[key], short: S_SHORT[key],
    value: safe(auditKPIs?.promedio_por_s?.[key]),
  })).sort((a, b) => b.value - a.value);

  const barData = [...(auditKPIs?.por_sucursal || [])]
    .sort((a, b) => safe(b.promedio_pct) - safe(a.promedio_pct))
    .map((s) => ({ name: s.branch, value: s.promedio_pct }));

  // ── Datos satisfacción ───────────────────────────────────────────────────
  const hasSurveys = surveyKPIs && safe(surveyKPIs.total_registros) > 0;
  const si      = hasSurveys ? toPct(surveyKPIs.sat_interna_global) : 0;
  const se      = hasSurveys ? toPct(surveyKPIs.sat_externa_global) : 0;
  const overall = +((si + se) / 2).toFixed(1);

  const radarChart = (surveyKPIs?.dimensiones || []).map((d) => ({
    s: d.nombre
      .replace("Calidad Técnica", "Cal. Técnica")
      .replace("Experiencia Global", "Exp. Global")
      .replace("Valor Agregado", "Val. Agr."),
    value: toPct(d.promedio),
  }));

  const radarDataSurvey = (surveyKPIs?.dimensiones || []).map((d) => ({
    subject: d.nombre,
    value:   toPct(d.promedio),
  }));

  const byDept = (surveyKPIs?.por_departamento || []).map((d) => ({
    name:     d.departamento.length > 20 ? d.departamento.slice(0, 19) + "…" : d.departamento,
    fullName: d.departamento,
    interna:  d.sat_interna  != null ? toPct(d.sat_interna)  : null,
    externa:  d.sat_externa  != null ? toPct(d.sat_externa)  : null,
    n:        d.n_registros,
    efficiency:        d.efficiency,
    communication:     d.communication,
    technical_quality: d.technical_quality,
    added_value:       d.added_value,
    global_experience: d.global_experience,
  }));

  const byPeriod = (surveyKPIs?.por_periodo || []).map((p) => ({
    period:  p.period_name,
    interna: p.sat_interna != null ? toPct(p.sat_interna) : null,
    externa: p.sat_externa != null ? toPct(p.sat_externa) : null,
  }));

  const hasDeptData   = byDept.some((d) => DIMS.some((dim) => d[dim.key] != null));
  const hasSucursales = barData.length > 0;

  // ── Conclusiones ─────────────────────────────────────────────────────────
  const conclusions = generateConclusions(auditKPIs, hasSurveys ? surveyKPIs : null);

  // ── Cálculo de páginas ───────────────────────────────────────────────────
  let pg = 1; // portada
  const pg_resumen     = ++pg;
  const pg_audits      = ++pg;
  const pg_sucursales  = hasSucursales  ? ++pg : null;
  const pg_surveys     = hasSurveys     ? ++pg : null;
  const pg_surveys_adv = (hasSurveys && hasDeptData) ? ++pg : null;
  const pg_conclusions = ++pg;
  const tp             = pg;

  // Sección numeración
  let sec = 1;
  const sec_resumen    = sec++;
  const sec_audits     = sec++;
  const sec_sucursales = hasSucursales  ? sec++ : null;
  const sec_surveys    = hasSurveys     ? sec++ : null;
  const sec_surveys_adv = (hasSurveys && hasDeptData) ? sec++ : null;
  const sec_conclusions = sec;

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

      <PageResumenCombinado
        auditKPIs={auditKPIs} surveyKPIs={hasSurveys ? surveyKPIs : null}
        si={si} se={se} overall={overall}
        dateStr={dateStr} pageNum={pg_resumen} tp={tp}
      />

      {auditKPIs && (
        <PageAuditorias
          auditKPIs={auditKPIs} radarData={radarData5S} sValues={sValues}
          dateStr={dateStr} pageNum={pg_audits} tp={tp}
          sectionNum={sec_audits}
        />
      )}

      {hasSucursales && (
        <PageSucursales
          auditKPIs={auditKPIs} barData={barData}
          dateStr={dateStr} pageNum={pg_sucursales} tp={tp}
          sectionNum={sec_sucursales}
        />
      )}

      {hasSurveys && (
        <PageSatisfaccion
          surveyKPIs={surveyKPIs} si={si} se={se}
          radarChart={radarChart} byDept={byDept} byPeriod={byPeriod}
          dateStr={dateStr} pageNum={pg_surveys} tp={tp}
          sectionNum={sec_surveys}
        />
      )}

      {hasSurveys && hasDeptData && (
        <PageSatisfaccionAvanzado
          surveyKPIs={surveyKPIs} overall={overall} si={si} se={se}
          byDept={byDept} radarData={radarDataSurvey}
          dateStr={dateStr} pageNum={pg_surveys_adv} tp={tp}
          sectionNum={sec_surveys_adv}
        />
      )}

      <PageConclusions
        conclusions={conclusions} filters={filters}
        auditKPIs={auditKPIs} surveyKPIs={hasSurveys ? surveyKPIs : null}
        si={si} se={se}
        dateStr={dateStr} pageNum={pg_conclusions} tp={tp}
        sectionNum={sec_conclusions}
      />
    </div>
  );
});

export default ReportPDFContent;
