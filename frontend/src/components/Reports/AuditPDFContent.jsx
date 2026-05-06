/**
 * AuditPDFContent.jsx
 * PDF detallado exclusivo para auditorías 5S.
 *
 * Páginas:
 *  1. Portada corporativa
 *  2. Resumen Ejecutivo  — 4 KPIs, Radar 5S, Tabla 5S con mini-barras, Mejor/Peor sucursal
 *  3. Análisis por Sucursal — distribución semáforo, BarChart ranking, tabla completa
 *  4. Análisis por Tipo de Área — tabla resumen + radars individuales (condicional)
 *  5. Conclusiones y Recomendaciones
 */
import { forwardRef } from "react";
import {
  BarChart, Bar, XAxis, YAxis, Cell, Tooltip, LabelList,
  RadarChart, Radar, PolarGrid, PolarAngleAxis, PolarRadiusAxis,
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

// ── Constantes 5S ─────────────────────────────────────────────────────────────
const S_KEYS = ["seiri", "seiton", "seiso", "seiketsu", "shitsuke"];
const S_LABEL = {
  seiri:    "Seiri — Clasificar",
  seiton:   "Seiton — Ordenar",
  seiso:    "Seiso — Limpiar",
  seiketsu: "Seiketsu — Estandarizar",
  shitsuke: "Shitsuke — Disciplina",
};
const S_SHORT = {
  seiri: "Seiri", seiton: "Seiton", seiso: "Seiso",
  seiketsu: "Seiketsu", shitsuke: "Shitsuke",
};

// ── Helpers ───────────────────────────────────────────────────────────────────
const safe  = (v, fb = 0) => (v != null && !isNaN(+v) ? +v : fb);
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
function obs5S(pct) {
  const n = safe(pct);
  if (n >= 80) return "Nivel óptimo, mantener prácticas.";
  if (n >= 60) return "Nivel aceptable, reforzar consistencia.";
  return "Requiere plan de acción inmediato.";
}

// ── Sub-componentes ───────────────────────────────────────────────────────────
function PageHeader({ date }) {
  return (
    <div style={{
      display: "flex", justifyContent: "space-between", alignItems: "center",
      paddingBottom: 10, marginBottom: 18,
      borderBottom: `2px solid ${C.primary}`,
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <img src="/logo-cecomsa-blanco.png" alt="Cecomsa"
          style={{ height: 22, objectFit: "contain" }} />
        <span style={{ fontSize: 11, fontWeight: 700, color: C.primary, letterSpacing: 1 }}>
          AUDITORÍAS 5S · REPORTE DETALLADO
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
      flex: 1, padding: "10px 14px",
      backgroundColor: C.light, borderLeft: `4px solid ${color}`, borderRadius: 6,
    }}>
      <div style={{ fontSize: 22, fontWeight: 700, color, lineHeight: 1 }}>{value}</div>
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
      <PageHeader date={dateStr} />
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

      <h1 style={{ fontSize: 34, fontWeight: 800, margin: "0 0 12px", lineHeight: 1.25, maxWidth: 520 }}>
        Reporte Detallado de Auditorías 5S
      </h1>

      <div style={{ display: "flex", gap: 0, margin: "22px auto", width: 200, height: 4, borderRadius: 2, overflow: "hidden" }}>
        {[C.success, C.warning, C.danger, C.secondary].map((c) => (
          <div key={c} style={{ flex: 1, backgroundColor: c }} />
        ))}
      </div>

      <div style={{ fontSize: 17, opacity: 0.9, marginBottom: 8, fontWeight: 500 }}>{periodText}</div>
      <div style={{ fontSize: 12, opacity: 0.65, marginBottom: 36 }}>{dateStr}</div>

      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", justifyContent: "center", marginBottom: 28 }}>
        {["Resumen Ejecutivo", "Análisis 5S", "Ranking de Sucursales", "Análisis por Tipo", "Conclusiones"].map((tag) => (
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

// ── PÁGINA 2: RESUMEN EJECUTIVO ───────────────────────────────────────────────
function PageResumen({ kpis, radarData, dateStr, pageNum, tp }) {
  const sValues = S_KEYS.map((key) => ({
    key, label: S_LABEL[key], short: S_SHORT[key],
    value: safe(kpis.promedio_por_s?.[key]),
  }));
  const sortedS = [...sValues].sort((a, b) => b.value - a.value);

  return (
    <PageWrap pageNum={pageNum} tp={tp} dateStr={dateStr}>
      <SectionTitle>1. Resumen Ejecutivo</SectionTitle>

      {/* 4 KPIs */}
      <div style={{ display: "flex", gap: 10, marginBottom: 22 }}>
        <KPIBox
          label="Promedio Global de Cumplimiento"
          value={`${safe(kpis.promedio_global).toFixed(1)}%`}
          color={color5S(kpis.promedio_global)}
          sub={kpis.estado_global}
        />
        <KPIBox
          label="Total de Auditorías Realizadas"
          value={kpis.total_auditorias ?? 0}
          color={C.primary}
        />
        <KPIBox
          label="Sucursales con Cumplimiento ≥80%"
          value={`${safe(kpis.sucursales_cumple_pct).toFixed(1)}%`}
          color={C.success}
        />
        <KPIBox
          label="Sucursales en Estado Crítico (<60%)"
          value={`${safe(kpis.sucursales_critico_pct).toFixed(1)}%`}
          color={C.danger}
        />
      </div>

      {/* Radar + Tabla 5S */}
      <div style={{ display: "flex", gap: 20, marginBottom: 22, alignItems: "flex-start" }}>
        {radarData.length > 0 && (
          <div style={{ flexShrink: 0 }}>
            <SubTitle>Desempeño Global por cada S</SubTitle>
            <RadarChart width={HALF_W} height={240} data={radarData}
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
            <THead cols={["Dimensión", "Puntaje", "Estado", "Observación"]} />
            <tbody>
              {sortedS.map((s, i) => {
                const col = color5S(s.value);
                return (
                  <TRow key={i} idx={i} cells={[
                    <span key="l" style={{ fontWeight: 500 }}>{s.label}</span>,
                    <span key="v" style={{ color: col, fontWeight: 700 }}>{s.value.toFixed(1)}%</span>,
                    <Bdg key="b" label={label5S(s.value)} color={col} />,
                    <span key="o" style={{ color: C.muted, fontSize: 10 }}>{obs5S(s.value)}</span>,
                  ]} />
                );
              })}
            </tbody>
          </table>

          {/* Mini barras por S */}
          <div style={{ marginTop: 14 }}>
            {sValues.map((s) => (
              <div key={s.key} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                <span style={{ fontSize: 9, color: C.muted, width: 68, flexShrink: 0 }}>{s.short}</span>
                <div style={{ flex: 1, height: 8, backgroundColor: C.border, borderRadius: 4, overflow: "hidden" }}>
                  <div style={{
                    width: `${Math.min(s.value, 100)}%`, height: "100%",
                    backgroundColor: color5S(s.value), borderRadius: 4,
                  }} />
                </div>
                <span style={{ fontSize: 9, fontWeight: 700, color: color5S(s.value), width: 36, textAlign: "right" }}>
                  {s.value.toFixed(1)}%
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Mejor / Peor sucursal */}
      {kpis.mejor_sucursal && (
        <div style={{ display: "flex", gap: 14 }}>
          <div style={{
            flex: 1, padding: "14px 18px", borderRadius: 8,
            backgroundColor: `${C.success}12`, borderLeft: `4px solid ${C.success}`,
          }}>
            <div style={{ fontSize: 9, color: C.muted, fontWeight: 700, letterSpacing: 1, marginBottom: 4 }}>
              MEJOR DESEMPEÑO
            </div>
            <div style={{ fontSize: 16, fontWeight: 700, color: C.text }}>{kpis.mejor_sucursal}</div>
            <div style={{ fontSize: 26, fontWeight: 800, color: C.success, lineHeight: 1.2 }}>
              {safe(kpis.mejor_sucursal_pct).toFixed(1)}%
            </div>
            <div style={{ fontSize: 10, color: C.muted, marginTop: 2 }}>
              Sucursal con mayor cumplimiento 5S en el período
            </div>
          </div>
          <div style={{
            flex: 1, padding: "14px 18px", borderRadius: 8,
            backgroundColor: `${C.danger}12`, borderLeft: `4px solid ${C.danger}`,
          }}>
            <div style={{ fontSize: 9, color: C.muted, fontWeight: 700, letterSpacing: 1, marginBottom: 4 }}>
              MAYOR OPORTUNIDAD DE MEJORA
            </div>
            <div style={{ fontSize: 16, fontWeight: 700, color: C.text }}>{kpis.peor_sucursal}</div>
            <div style={{ fontSize: 26, fontWeight: 800, color: C.danger, lineHeight: 1.2 }}>
              {safe(kpis.peor_sucursal_pct).toFixed(1)}%
            </div>
            <div style={{ fontSize: 10, color: C.muted, marginTop: 2 }}>
              Sucursal que requiere atención y recursos prioritarios
            </div>
          </div>
        </div>
      )}
    </PageWrap>
  );
}

// ── PÁGINA 3: ANÁLISIS POR SUCURSAL ──────────────────────────────────────────
function PageSucursales({ kpis, barData, dateStr, pageNum, tp }) {
  const barH    = Math.max(160, Math.min(barData.length * 26 + 20, 520));
  const cumple  = barData.filter((d) => safe(d.value) >= 80).length;
  const mejora  = barData.filter((d) => safe(d.value) >= 60 && safe(d.value) < 80).length;
  const critico = barData.filter((d) => safe(d.value) < 60).length;

  return (
    <PageWrap pageNum={pageNum} tp={tp} dateStr={dateStr}>
      <SectionTitle>2. Análisis por Sucursal</SectionTitle>

      {/* Distribución semáforo */}
      <div style={{ display: "flex", gap: 12, marginBottom: 18 }}>
        {[
          { n: cumple,  color: C.success, title: "Cumplen",    sub: "≥ 80% de cumplimiento" },
          { n: mejora,  color: C.warning, title: "Por Mejorar", sub: "60 – 79% de cumplimiento" },
          { n: critico, color: C.danger,  title: "Críticas",    sub: "< 60% de cumplimiento" },
        ].map((s, i) => (
          <div key={i} style={{
            flex: 1, padding: "10px 16px", borderRadius: 8,
            backgroundColor: `${s.color}12`, borderLeft: `4px solid ${s.color}`,
            display: "flex", alignItems: "center", gap: 14,
          }}>
            <span style={{ fontSize: 30, fontWeight: 800, color: s.color, lineHeight: 1 }}>{s.n}</span>
            <div>
              <div style={{ fontSize: 11, fontWeight: 700, color: s.color }}>{s.title}</div>
              <div style={{ fontSize: 9, color: C.muted }}>{s.sub}</div>
              <div style={{ fontSize: 9, color: C.muted }}>
                {barData.length > 0 ? `${((s.n / barData.length) * 100).toFixed(0)}% del total` : "—"}
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* BarChart ranking */}
      {barData.length > 0 && (
        <div style={{ marginBottom: 20 }}>
          <SubTitle>Ranking de Cumplimiento por Sucursal</SubTitle>
          <BarChart width={CHART_W} height={barH} data={barData} layout="vertical"
            margin={{ top: 4, right: 60, left: 0, bottom: 4 }}>
            <XAxis type="number" domain={[0, 100]} tick={{ fontSize: 9, fill: C.muted }}
              tickFormatter={(v) => `${v}%`} axisLine={false} tickLine={false} />
            <YAxis type="category" dataKey="name" width={130}
              tick={{ fontSize: 9, fill: C.text }} axisLine={false} tickLine={false} />
            <Tooltip formatter={(v) => [`${Number(v).toFixed(1)}%`, "Cumplimiento"]}
              contentStyle={{ fontSize: 10 }} />
            <Bar dataKey="value" radius={[0, 5, 5, 0]} maxBarSize={20}>
              <LabelList dataKey="value" position="right" style={{ fontSize: 9 }}
                formatter={(v) => `${Number(v).toFixed(1)}%`} />
              {barData.map((e, i) => (
                <Cell key={i} fill={color5S(e.value)} fillOpacity={0.85} />
              ))}
            </Bar>
          </BarChart>
        </div>
      )}

      {/* Tabla completa */}
      {barData.length > 0 && (
        <div>
          <SubTitle>Tabla Completa — Todas las Sucursales</SubTitle>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <THead cols={["#", "Sucursal", "Cumplimiento", "Estado", "Diferencia al promedio"]} />
            <tbody>
              {barData.map((s, i) => {
                const col  = color5S(s.value);
                const diff = safe(s.value) - safe(kpis.promedio_global);
                return (
                  <TRow key={i} idx={i} cells={[
                    <span key="n" style={{ color: C.muted, fontSize: 9 }}>
                      {String(i + 1).padStart(2, "0")}
                    </span>,
                    <span key="nm" style={{ fontWeight: 500 }}>{s.name}</span>,
                    <span key="v" style={{ color: col, fontWeight: 700 }}>
                      {safe(s.value).toFixed(1)}%
                    </span>,
                    <Bdg key="b" label={label5S(s.value)} color={col} />,
                    <span key="d" style={{
                      color: diff >= 0 ? C.success : C.danger, fontWeight: 600, fontSize: 10,
                    }}>
                      {diff >= 0 ? "+" : ""}{diff.toFixed(1)} pp
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

// ── PÁGINA 4: ANÁLISIS POR TIPO DE ÁREA ──────────────────────────────────────
function PageTipos({ kpis, tiposConS, dateStr, pageNum, tp }) {
  const cols = tiposConS.length >= 3 ? 3 : tiposConS.length === 2 ? 2 : 1;
  const radarW = cols === 3 ? 196 : cols === 2 ? HALF_W - 10 : CHART_W / 2;

  return (
    <PageWrap pageNum={pageNum} tp={tp} dateStr={dateStr}>
      <SectionTitle>3. Análisis por Tipo de Área</SectionTitle>

      {/* Tabla resumen */}
      {kpis.por_tipo?.length > 0 && (
        <div style={{ marginBottom: 22 }}>
          <SubTitle>Resumen por Tipo de Auditoría</SubTitle>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <THead cols={["Tipo de Área", "Auditorías", "Promedio", "Seiri", "Seiton", "Seiso", "Seiketsu", "Shitsuke", "Estado"]} />
            <tbody>
              {kpis.por_tipo.map((t, i) => {
                const col = color5S(t.promedio);
                const pS  = t.promedio_por_s || {};
                return (
                  <TRow key={i} idx={i} cells={[
                    <span key="tipo" style={{ fontWeight: 600 }}>{t.tipo}</span>,
                    <span key="n">{t.n_auditorias}</span>,
                    <span key="p" style={{ color: col, fontWeight: 700 }}>{safe(t.promedio).toFixed(1)}%</span>,
                    ...S_KEYS.map((k) => {
                      const v = pS[k] != null ? safe(pS[k]) : null;
                      return v != null
                        ? <span key={k} style={{ color: color5S(v), fontWeight: 600, fontSize: 10 }}>{v.toFixed(1)}%</span>
                        : <span key={k} style={{ color: C.muted }}>—</span>;
                    }),
                    <Bdg key="b" label={t.estado || label5S(t.promedio)} color={col} />,
                  ]} />
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Radars por tipo */}
      {tiposConS.length > 0 && (
        <div>
          <SubTitle>Perfil 5S por Tipo de Área</SubTitle>
          <div style={{
            display: "grid",
            gridTemplateColumns: `repeat(${cols}, 1fr)`,
            gap: 14,
          }}>
            {tiposConS.map((tipo, ti) => {
              const radarTipo = S_KEYS.map((key) => ({
                s:     S_SHORT[key],
                value: safe(tipo.promedio_por_s?.[key]),
              }));
              const col = color5S(tipo.promedio);

              return (
                <div key={ti} style={{
                  borderRadius: 8, border: `1px solid ${col}30`,
                  backgroundColor: `${col}08`, padding: 12,
                }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 6 }}>
                    <div>
                      <div style={{ fontSize: 11, fontWeight: 700, color: C.text }}>{tipo.tipo}</div>
                      <div style={{ fontSize: 9, color: C.muted }}>
                        {tipo.n_auditorias} auditoría{tipo.n_auditorias !== 1 ? "s" : ""}
                      </div>
                    </div>
                    <div style={{ textAlign: "right" }}>
                      <div style={{ fontSize: 20, fontWeight: 800, color: col, lineHeight: 1 }}>
                        {safe(tipo.promedio).toFixed(1)}%
                      </div>
                      <Bdg label={tipo.estado || label5S(tipo.promedio)} color={col} />
                    </div>
                  </div>

                  <RadarChart width={radarW} height={170} data={radarTipo}
                    margin={{ top: 4, right: 12, bottom: 4, left: 12 }}>
                    <PolarGrid stroke={`${col}30`} />
                    <PolarAngleAxis dataKey="s" tick={{ fontSize: 8, fill: C.text }} />
                    <PolarRadiusAxis domain={[0, 100]} tickCount={4} angle={30}
                      tick={{ fontSize: 7, fill: C.muted }} tickFormatter={(v) => `${v}%`} />
                    <Radar dataKey="value" stroke={col} fill={col}
                      fillOpacity={0.2} strokeWidth={2}
                      dot={{ r: 2.5, fill: col, strokeWidth: 0 }} />
                    <Tooltip formatter={(v) => [`${Number(v).toFixed(1)}%`]} contentStyle={{ fontSize: 9 }} />
                  </RadarChart>

                  {/* Mini barras */}
                  <div style={{ marginTop: 6 }}>
                    {radarTipo.map((d) => (
                      <div key={d.s} style={{ display: "flex", alignItems: "center", gap: 5, marginBottom: 4 }}>
                        <span style={{ fontSize: 8, color: C.muted, width: 54, flexShrink: 0 }}>{d.s}</span>
                        <div style={{ flex: 1, height: 5, backgroundColor: C.border, borderRadius: 3, overflow: "hidden" }}>
                          <div style={{
                            width: `${Math.min(d.value, 100)}%`, height: "100%",
                            backgroundColor: color5S(d.value), borderRadius: 3,
                          }} />
                        </div>
                        <span style={{ fontSize: 8, fontWeight: 700, color: color5S(d.value), width: 30, textAlign: "right" }}>
                          {d.value.toFixed(1)}%
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </PageWrap>
  );
}

// ── PÁGINA CONCLUSIONES ───────────────────────────────────────────────────────
function PageConclusions({ conclusions, filters, kpis, dateStr, pageNum, tp, sectionNum }) {
  return (
    <div className="pdf-page" style={{
      width: PAGE_W, minHeight: 1123,
      backgroundColor: C.white,
      padding: `40px ${PAD}px 80px`,
      boxSizing: "border-box", position: "relative",
    }}>
      <PageHeader date={dateStr} />
      <SectionTitle>{sectionNum}. Conclusiones y Recomendaciones</SectionTitle>

      {/* Contexto */}
      <div style={{
        padding: "12px 16px", borderRadius: 8,
        backgroundColor: `${C.primary}0D`, border: `1px solid ${C.primary}20`,
        marginBottom: 20, fontSize: 11, lineHeight: 1.6,
      }}>
        <strong style={{ color: C.primary }}>Contexto del análisis:</strong>{" "}
        <span style={{ color: C.muted }}>
          {filters?.year ? `Año ${filters.year}` : "Todos los años"}
          {filters?.quarter ? ` · Trimestre ${filters.quarter}` : ""}
          {" · "}{kpis.total_auditorias ?? 0} auditoría{(kpis.total_auditorias ?? 0) !== 1 ? "s" : ""} analizadas
          {" · "}Promedio global: {safe(kpis.promedio_global).toFixed(1)}%
          {" · "}Estado: {kpis.estado_global ?? label5S(kpis.promedio_global)}
        </span>
      </div>

      {conclusions.conclusions.length > 0 && (
        <div style={{ marginBottom: 24 }}>
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

      {/* Leyenda semáforo */}
      <div style={{ display: "flex", gap: 12, marginBottom: 20 }}>
        {[
          { color: C.success, title: "Cumple",      range: "≥ 80%" },
          { color: C.warning, title: "Por Mejorar", range: "60 – 79%" },
          { color: C.danger,  title: "Crítico",     range: "< 60%" },
        ].map((s, i) => (
          <div key={i} style={{
            flex: 1, padding: "8px 12px", borderRadius: 6,
            backgroundColor: `${s.color}15`, borderLeft: `3px solid ${s.color}`,
            display: "flex", alignItems: "center", gap: 8,
          }}>
            <div style={{ width: 10, height: 10, borderRadius: "50%", backgroundColor: s.color, flexShrink: 0 }} />
            <div>
              <div style={{ fontSize: 10, fontWeight: 700, color: s.color }}>{s.title}</div>
              <div style={{ fontSize: 9, color: C.muted }}>{s.range}</div>
            </div>
          </div>
        ))}
      </div>

      <div style={{
        padding: "14px 18px", borderRadius: 8,
        backgroundColor: C.light, border: `1px solid ${C.border}`,
        fontSize: 10, color: C.muted, textAlign: "center", lineHeight: 1.6,
      }}>
        Este reporte fue generado automáticamente por el Sistema de Gestión de Calidad de Mejora continua & Auditoría.<br />
        Los datos reflejan las auditorías 5S registradas en el sistema a la fecha de generación.<br />
        Para consultas adicionales o aclaraciones, contacte al equipo de Calidad.
      </div>

      <PageFooter pageNum={pageNum} totalPages={tp} />
    </div>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
// COMPONENTE PRINCIPAL
// ═════════════════════════════════════════════════════════════════════════════
const AuditPDFContent = forwardRef(function AuditPDFContent(
  { auditKPIs, filters, generatedAt },
  ref
) {
  if (!auditKPIs) return null;

  const dateStr = new Date(generatedAt).toLocaleDateString("es-DO", {
    day: "2-digit", month: "long", year: "numeric",
  });

  const periodParts = [];
  if (filters?.year)          periodParts.push(`Año ${filters.year}`);
  if (filters?.quarter)       periodParts.push(`Trimestre ${filters.quarter}`);
  if (filters?.audit_type_id) periodParts.push("Tipo filtrado");
  if (!periodParts.length)    periodParts.push("Período general");
  const periodText = periodParts.join(" · ");

  const conclusions = generateConclusions(auditKPIs, null);

  // Radar global
  const radarData = S_KEYS.map((key) => ({
    s:     S_SHORT[key],
    value: safe(auditKPIs.promedio_por_s?.[key]),
  }));

  // Barras por sucursal — ordenadas de mayor a menor
  const barData = [...(auditKPIs.por_sucursal || [])]
    .sort((a, b) => safe(b.promedio_pct) - safe(a.promedio_pct))
    .map((s) => ({ name: s.branch, value: s.promedio_pct }));

  // Tipos con desglose por S
  const tiposConS = (auditKPIs.por_tipo || []).filter((t) => t.promedio_por_s);
  const hasTipos  = (auditKPIs.por_tipo || []).length > 0;

  // Total páginas: portada + resumen + sucursales + [tipos] + conclusiones
  const tp = 3 + (hasTipos ? 1 : 0) + 1;
  let pg   = 1;

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

      <PageResumen
        kpis={auditKPIs} radarData={radarData}
        dateStr={dateStr} pageNum={++pg} tp={tp}
      />

      <PageSucursales
        kpis={auditKPIs} barData={barData}
        dateStr={dateStr} pageNum={++pg} tp={tp}
      />

      {hasTipos && (
        <PageTipos
          kpis={auditKPIs} tiposConS={tiposConS}
          dateStr={dateStr} pageNum={++pg} tp={tp}
        />
      )}

      <PageConclusions
        conclusions={conclusions} filters={filters} kpis={auditKPIs}
        dateStr={dateStr} pageNum={++pg} tp={tp}
        sectionNum={hasTipos ? 4 : 3}
      />
    </div>
  );
});

export default AuditPDFContent;
