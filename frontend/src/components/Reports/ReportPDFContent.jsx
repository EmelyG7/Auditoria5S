/**
 * ReportPDFContent.jsx
 * Componente oculto (fuera de pantalla) que se renderiza para captura con html2canvas.
 * Cada div.pdf-page corresponde a una página del PDF final.
 * Usa dimensiones explícitas en los gráficos (sin ResponsiveContainer) para
 * garantizar el renderizado correcto cuando el contenedor está off-screen.
 */
import { forwardRef } from "react";
import {
  BarChart, Bar, XAxis, YAxis, Cell, Tooltip, LabelList,
  RadarChart, Radar, PolarGrid, PolarAngleAxis, PolarRadiusAxis,
} from "recharts";

// ─────────────────────────────────────────────────────────────────────────────
// Paleta y constantes de diseño
// ─────────────────────────────────────────────────────────────────────────────
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

const PAGE_W = 794; // A4 a 96 dpi

function color5S(pct) {
  const n = Number(pct);
  if (n >= 80) return C.success;
  if (n >= 60) return C.warning;
  return C.danger;
}

// ─────────────────────────────────────────────────────────────────────────────
// Sub-componentes de diseño del PDF
// ─────────────────────────────────────────────────────────────────────────────

function PageHeader({ date }) {
  return (
    <div style={{
      display: "flex", justifyContent: "space-between", alignItems: "center",
      paddingBottom: 10, marginBottom: 20,
      borderBottom: `2px solid ${C.primary}`,
    }}>
      <span style={{ fontSize: 11, fontWeight: 700, color: C.primary, letterSpacing: 1 }}>
        CECOMSA · REPORTE EJECUTIVO 5S
      </span>
      <span style={{ fontSize: 10, color: C.muted }}>{date}</span>
    </div>
  );
}

function PageFooter({ pageNum, totalPages }) {
  return (
    <div style={{
      position: "absolute", bottom: 20, left: 52, right: 52,
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
      borderLeft: `4px solid ${color}`, paddingLeft: 10,
      marginBottom: 14,
    }}>
      {children}
    </div>
  );
}

function SubTitle({ children, color = C.primary }) {
  return (
    <div style={{ fontSize: 11, fontWeight: 600, color, marginBottom: 8 }}>
      {children}
    </div>
  );
}

function KPIBox({ label, value, color }) {
  return (
    <div style={{
      flex: 1, padding: "10px 14px",
      backgroundColor: C.light,
      borderLeft: `4px solid ${color}`,
      borderRadius: 6,
    }}>
      <div style={{ fontSize: 22, fontWeight: 700, color, lineHeight: 1 }}>{value}</div>
      <div style={{ fontSize: 10, color: C.muted, marginTop: 4 }}>{label}</div>
    </div>
  );
}

function TableHead({ cols, color = C.primary }) {
  return (
    <thead>
      <tr>
        {cols.map((c) => (
          <th key={c} style={{
            padding: "6px 8px", backgroundColor: color,
            color: C.white, fontSize: 10, fontWeight: 600,
            textAlign: "left",
          }}>{c}</th>
        ))}
      </tr>
    </thead>
  );
}

function TableRow({ cells, idx }) {
  return (
    <tr style={{ backgroundColor: idx % 2 === 0 ? C.white : C.light }}>
      {cells.map((cell, i) => (
        <td key={i} style={{ padding: "5px 8px", fontSize: 11 }}>{cell}</td>
      ))}
    </tr>
  );
}

function Badge({ label, color }) {
  return (
    <span style={{
      backgroundColor: `${color}22`, color,
      padding: "2px 7px", borderRadius: 4, fontSize: 10, fontWeight: 600,
    }}>
      {label}
    </span>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Componente principal (forwardRef para que ReportsPage lo capture con useRef)
// ─────────────────────────────────────────────────────────────────────────────
const ReportPDFContent = forwardRef(function ReportPDFContent(
  { auditKPIs, surveyKPIs, filters, conclusions, generatedAt, totalPages },
  ref
) {
  const hasSurveys = surveyKPIs && surveyKPIs.total_registros > 0;
  const tp = totalPages;

  const dateStr = new Date(generatedAt).toLocaleDateString("es-DO", {
    day: "2-digit", month: "long", year: "numeric",
  });

  const periodParts = [];
  if (filters?.year)    periodParts.push(`Año ${filters.year}`);
  if (filters?.quarter) periodParts.push(`Trimestre ${filters.quarter}`);
  if (!periodParts.length) periodParts.push("Período general");
  const periodText = periodParts.join(" · ");

  // ── Datos para gráficas ──────────────────────────────────────────────────
  const barDataAudit = (auditKPIs?.por_sucursal || [])
    .slice(0, 10)
    .map((s) => ({ name: s.branch, value: s.promedio_pct }));

  const radarDataAudit = auditKPIs?.promedio_por_s
    ? [
        { s: "Seiri",    value: auditKPIs.promedio_por_s.seiri    ?? 0 },
        { s: "Seiton",   value: auditKPIs.promedio_por_s.seiton   ?? 0 },
        { s: "Seiso",    value: auditKPIs.promedio_por_s.seiso    ?? 0 },
        { s: "Seiketsu", value: auditKPIs.promedio_por_s.seiketsu ?? 0 },
        { s: "Shitsuke", value: auditKPIs.promedio_por_s.shitsuke ?? 0 },
      ]
    : [];

  const radarDataSurvey = (surveyKPIs?.dimensiones || []).map((d) => ({
    s: d.nombre
      .replace("Calidad Técnica", "Cal. Técnica")
      .replace("Experiencia Global", "Exp. Global"),
    value: d.promedio * 100,
  }));

  const barH = Math.max(120, Math.min(barDataAudit.length * 34 + 20, 340));
  const chartW = PAGE_W - 104; // page width minus padding

  return (
    <div
      ref={ref}
      style={{
        position: "absolute",
        left: -9999,
        top: 0,
        width: PAGE_W,
        fontFamily: '"Segoe UI", system-ui, -apple-system, sans-serif',
        color: C.text,
      }}
    >
      {/* ════════════════════════════════════════════════════════════════
          PÁGINA 1 — PORTADA
      ════════════════════════════════════════════════════════════════ */}
      <div
        className="pdf-page"
        style={{
          width: PAGE_W,
          minHeight: 1123,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          textAlign: "center",
          background: "linear-gradient(155deg, #0A4F79 0%, #0D6FA3 60%, #0A4F79 100%)",
          color: C.white,
          padding: "60px 80px",
          boxSizing: "border-box",
          position: "relative",
        }}
      >
        {/* Círculo logo */}
        <div style={{
          width: 88, height: 88, borderRadius: "50%",
          backgroundColor: "rgba(255,255,255,0.15)",
          display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: 30, fontWeight: 800, marginBottom: 36, letterSpacing: 1,
        }}>
          CE
        </div>

        <div style={{ fontSize: 12, letterSpacing: 4, opacity: 0.75, marginBottom: 6 }}>
          CECOMSA
        </div>

        <h1 style={{
          fontSize: 34, fontWeight: 800, margin: "0 0 12px",
          lineHeight: 1.25, maxWidth: 520,
        }}>
          Reporte Ejecutivo de Auditorías 5S y Satisfacción
        </h1>

        {/* Línea decorativa */}
        <div style={{ display: "flex", gap: 0, margin: "22px auto", width: 200, height: 4, borderRadius: 2, overflow: "hidden" }}>
          {[C.success, C.warning, C.danger, C.secondary].map((c) => (
            <div key={c} style={{ flex: 1, backgroundColor: c }} />
          ))}
        </div>

        <div style={{ fontSize: 17, opacity: 0.9, marginBottom: 8, fontWeight: 500 }}>
          {periodText}
        </div>
        <div style={{ fontSize: 12, opacity: 0.65, marginBottom: 40 }}>
          Generado el {dateStr}
        </div>

        <div style={{
          padding: "14px 28px", borderRadius: 8,
          backgroundColor: "rgba(255,255,255,0.12)",
          fontSize: 11, opacity: 0.8,
        }}>
          Sistema de Gestión de Calidad · Auditorías 5S
        </div>

        {/* Barra inferior multicolor */}
        <div style={{
          position: "absolute", bottom: 0, left: 0, right: 0, height: 7,
          background: `linear-gradient(90deg, ${C.success}, ${C.warning}, ${C.danger}, ${C.secondary})`,
        }} />
      </div>

      {/* ════════════════════════════════════════════════════════════════
          PÁGINA 2 — AUDITORÍAS 5S
      ════════════════════════════════════════════════════════════════ */}
      <div
        className="pdf-page"
        style={{
          width: PAGE_W, minHeight: 1123,
          backgroundColor: C.white,
          padding: "40px 52px 60px",
          boxSizing: "border-box",
          position: "relative",
        }}
      >
        <PageHeader date={dateStr} />
        <SectionTitle>1. Resumen General de Auditorías 5S</SectionTitle>

        {/* KPIs */}
        <div style={{ display: "flex", gap: 10, marginBottom: 22 }}>
          <KPIBox
            label="Promedio Global"
            value={`${Number(auditKPIs?.promedio_global ?? 0).toFixed(1)}%`}
            color={color5S(auditKPIs?.promedio_global ?? 0)}
          />
          <KPIBox
            label="Total Auditorías"
            value={auditKPIs?.total_auditorias ?? 0}
            color={C.primary}
          />
          <KPIBox
            label="Sucursales Cumplen (≥80%)"
            value={`${Number(auditKPIs?.sucursales_cumple_pct ?? 0).toFixed(1)}%`}
            color={C.success}
          />
          <KPIBox
            label="Sucursales Críticas (<60%)"
            value={`${Number(auditKPIs?.sucursales_critico_pct ?? 0).toFixed(1)}%`}
            color={C.danger}
          />
        </div>

        {/* Gráfica de barras por sucursal */}
        {barDataAudit.length > 0 && (
          <div style={{ marginBottom: 22 }}>
            <SubTitle>Puntaje por Sucursal (Top {barDataAudit.length})</SubTitle>
            <BarChart
              width={chartW}
              height={barH}
              data={barDataAudit}
              layout="vertical"
              margin={{ top: 4, right: 55, left: 0, bottom: 4 }}
            >
              <XAxis
                type="number" domain={[0, 100]}
                tick={{ fontSize: 10, fill: C.muted }}
                tickFormatter={(v) => `${v}%`}
                axisLine={false} tickLine={false}
              />
              <YAxis
                type="category" dataKey="name" width={130}
                tick={{ fontSize: 10, fill: C.text }}
                axisLine={false} tickLine={false}
              />
              <Tooltip
                formatter={(v) => [`${Number(v).toFixed(1)}%`, "Cumplimiento"]}
                contentStyle={{ fontSize: 11, borderRadius: 8 }}
              />
              <Bar dataKey="value" radius={[0, 6, 6, 0]} maxBarSize={24}>
                <LabelList dataKey="value" position="right" style={{ fontSize: 10 }} formatter={(v) => `${Number(v).toFixed(1)}%`} />
                {barDataAudit.map((e, i) => (
                  <Cell key={i} fill={color5S(e.value)} fillOpacity={0.85} />
                ))}
              </Bar>
            </BarChart>
          </div>
        )}

        {/* Radar + tabla por tipo */}
        <div style={{ display: "flex", gap: 20, alignItems: "flex-start" }}>
          {radarDataAudit.length > 0 && (
            <div style={{ flex: 1 }}>
              <SubTitle>Desempeño por Dimensión 5S</SubTitle>
              <RadarChart
                width={330} height={220}
                data={radarDataAudit}
                margin={{ top: 8, right: 16, bottom: 8, left: 16 }}
              >
                <PolarGrid stroke={`${C.primary}22`} />
                <PolarAngleAxis dataKey="s" tick={{ fontSize: 10, fill: C.text }} />
                <PolarRadiusAxis
                  domain={[0, 100]} tickCount={5}
                  tick={{ fontSize: 9, fill: C.muted }}
                  tickFormatter={(v) => `${v}%`}
                  angle={30}
                />
                <Radar
                  name="5S" dataKey="value"
                  stroke={C.primary} fill={C.primary} fillOpacity={0.18}
                  strokeWidth={2}
                  dot={{ r: 3, fill: C.primary, strokeWidth: 0 }}
                />
                <Tooltip formatter={(v) => [`${Number(v).toFixed(1)}%`, "Cumplimiento"]} contentStyle={{ fontSize: 11 }} />
              </RadarChart>
            </div>
          )}

          {/* Tabla por tipo */}
          {auditKPIs?.por_tipo?.length > 0 && (
            <div style={{ flex: 1 }}>
              <SubTitle>Resumen por Tipo de Auditoría</SubTitle>
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <TableHead cols={["Tipo", "Auditorías", "Promedio", "Estado"]} />
                <tbody>
                  {auditKPIs.por_tipo.map((t, i) => (
                    <TableRow
                      key={i} idx={i}
                      cells={[
                        t.tipo,
                        t.n_auditorias,
                        <span key="p" style={{ color: color5S(t.promedio), fontWeight: 600 }}>
                          {Number(t.promedio).toFixed(1)}%
                        </span>,
                        <Badge key="b" label={t.estado} color={color5S(t.promedio)} />,
                      ]}
                    />
                  ))}
                </tbody>
              </table>

              {/* Mejor / Peor */}
              {auditKPIs.mejor_sucursal && (
                <div style={{ marginTop: 16 }}>
                  <div style={{
                    padding: "8px 12px", borderRadius: 6,
                    backgroundColor: `${C.success}15`,
                    borderLeft: `3px solid ${C.success}`,
                    fontSize: 11, marginBottom: 8,
                  }}>
                    <strong>Mejor:</strong> {auditKPIs.mejor_sucursal} —{" "}
                    {Number(auditKPIs.mejor_sucursal_pct).toFixed(1)}%
                  </div>
                  <div style={{
                    padding: "8px 12px", borderRadius: 6,
                    backgroundColor: `${C.danger}15`,
                    borderLeft: `3px solid ${C.danger}`,
                    fontSize: 11,
                  }}>
                    <strong>Atención:</strong> {auditKPIs.peor_sucursal} —{" "}
                    {Number(auditKPIs.peor_sucursal_pct).toFixed(1)}%
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        <PageFooter pageNum={2} totalPages={tp} />
      </div>

      {/* ════════════════════════════════════════════════════════════════
          PÁGINA 3 — SATISFACCIÓN (condicional)
      ════════════════════════════════════════════════════════════════ */}
      {hasSurveys && (
        <div
          className="pdf-page"
          style={{
            width: PAGE_W, minHeight: 1123,
            backgroundColor: C.white,
            padding: "40px 52px 60px",
            boxSizing: "border-box",
            position: "relative",
          }}
        >
          <PageHeader date={dateStr} />
          <SectionTitle color={C.secondary}>2. Análisis de Satisfacción</SectionTitle>

          {/* KPIs satisfacción */}
          <div style={{ display: "flex", gap: 10, marginBottom: 22 }}>
            <KPIBox
              label="Satisfacción Interna Global"
              value={`${(Number(surveyKPIs.sat_interna_global) * 100).toFixed(1)}%`}
              color={Number(surveyKPIs.sat_interna_global) >= 0.8 ? C.success : C.danger}
            />
            <KPIBox
              label="Satisfacción Externa Global"
              value={`${(Number(surveyKPIs.sat_externa_global) * 100).toFixed(1)}%`}
              color={Number(surveyKPIs.sat_externa_global) >= 0.8 ? C.success : C.danger}
            />
            <KPIBox
              label="Mejor Dimensión"
              value={surveyKPIs.mejor_dimension || "—"}
              color={C.success}
            />
            <KPIBox
              label="Dimensión a Mejorar"
              value={surveyKPIs.peor_dimension || "—"}
              color={C.danger}
            />
          </div>

          {/* Radar satisfacción + tabla sedes */}
          <div style={{ display: "flex", gap: 20, alignItems: "flex-start", marginBottom: 22 }}>
            {radarDataSurvey.length > 0 && (
              <div style={{ flex: 1 }}>
                <SubTitle color={C.secondary}>Radar de Dimensiones</SubTitle>
                <RadarChart
                  width={330} height={230}
                  data={radarDataSurvey}
                  margin={{ top: 8, right: 16, bottom: 8, left: 16 }}
                >
                  <PolarGrid stroke={`${C.secondary}22`} />
                  <PolarAngleAxis dataKey="s" tick={{ fontSize: 10, fill: C.text }} />
                  <PolarRadiusAxis
                    domain={[0, 100]} tickCount={5}
                    tick={{ fontSize: 9, fill: C.muted }}
                    tickFormatter={(v) => `${v}%`}
                    angle={30}
                  />
                  <Radar
                    name="Satisfacción" dataKey="value"
                    stroke={C.secondary} fill={C.secondary} fillOpacity={0.18}
                    strokeWidth={2}
                    dot={{ r: 3, fill: C.secondary, strokeWidth: 0 }}
                  />
                  <Tooltip formatter={(v) => [`${Number(v).toFixed(1)}%`, "Satisfacción"]} contentStyle={{ fontSize: 11 }} />
                </RadarChart>
              </div>
            )}

            {/* Tabla por sede */}
            {surveyKPIs.por_sede?.length > 0 && (
              <div style={{ flex: 1 }}>
                <SubTitle color={C.secondary}>Satisfacción por Sede</SubTitle>
                <table style={{ width: "100%", borderCollapse: "collapse" }}>
                  <TableHead cols={["Sede", "Interna", "Externa", "Estado"]} color={C.secondary} />
                  <tbody>
                    {surveyKPIs.por_sede.slice(0, 12).map((s, i) => {
                      const avg = ((Number(s.sat_interna) + Number(s.sat_externa)) / 2) * 100;
                      const estado = avg >= 90 ? "Excelente" : avg >= 80 ? "Aceptable" : "Crítico";
                      const col = avg >= 90 ? C.success : avg >= 80 ? C.warning : C.danger;
                      return (
                        <TableRow
                          key={i} idx={i}
                          cells={[
                            s.site,
                            `${(Number(s.sat_interna) * 100).toFixed(1)}%`,
                            `${(Number(s.sat_externa) * 100).toFixed(1)}%`,
                            <Badge key="b" label={estado} color={col} />,
                          ]}
                        />
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Tabla dimensiones */}
          {surveyKPIs.dimensiones?.length > 0 && (
            <div>
              <SubTitle color={C.secondary}>Detalle por Dimensión</SubTitle>
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <TableHead cols={["Dimensión", "Promedio", "Estado"]} color={C.secondary} />
                <tbody>
                  {surveyKPIs.dimensiones.map((d, i) => {
                    const pct = Number(d.promedio) * 100;
                    const col = pct >= 90 ? C.success : pct >= 80 ? C.warning : C.danger;
                    return (
                      <TableRow
                        key={i} idx={i}
                        cells={[
                          d.nombre,
                          <span key="p" style={{ color: col, fontWeight: 600 }}>{pct.toFixed(1)}%</span>,
                          <Badge key="b" label={d.estado} color={col} />,
                        ]}
                      />
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          <PageFooter pageNum={3} totalPages={tp} />
        </div>
      )}

      {/* ════════════════════════════════════════════════════════════════
          ÚLTIMA PÁGINA — CONCLUSIONES Y RECOMENDACIONES
      ════════════════════════════════════════════════════════════════ */}
      <div
        className="pdf-page"
        style={{
          width: PAGE_W, minHeight: 1123,
          backgroundColor: C.white,
          padding: "40px 52px 80px",
          boxSizing: "border-box",
          position: "relative",
        }}
      >
        <PageHeader date={dateStr} />
        <SectionTitle>{hasSurveys ? "3" : "2"}. Conclusiones y Recomendaciones</SectionTitle>

        {conclusions.conclusions.length > 0 && (
          <div style={{ marginBottom: 26 }}>
            <SubTitle>Hallazgos Principales</SubTitle>
            {conclusions.conclusions.map((c, i) => (
              <div
                key={i}
                style={{
                  display: "flex", gap: 12, marginBottom: 10,
                  padding: "10px 14px", borderRadius: 6,
                  backgroundColor: "#EFF6FF",
                  borderLeft: `3px solid ${C.primary}`,
                  fontSize: 12, lineHeight: 1.55,
                }}
              >
                <span style={{ color: C.primary, fontWeight: 700, flexShrink: 0, minWidth: 22 }}>
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
              <div
                key={i}
                style={{
                  display: "flex", gap: 12, marginBottom: 10,
                  padding: "10px 14px", borderRadius: 6,
                  backgroundColor: "#FFFBEB",
                  borderLeft: `3px solid ${C.warning}`,
                  fontSize: 12, lineHeight: 1.55,
                }}
              >
                <span style={{ color: C.warning, fontWeight: 700, flexShrink: 0 }}>→</span>
                <span>{r}</span>
              </div>
            ))}
          </div>
        )}

        {/* Nota de cierre */}
        <div style={{
          padding: "14px 18px", borderRadius: 8,
          backgroundColor: C.light, border: `1px solid ${C.border}`,
          fontSize: 10, color: C.muted, textAlign: "center", lineHeight: 1.6,
        }}>
          Este reporte fue generado automáticamente por el Sistema de Gestión de Calidad de Cecomsa.<br />
          Los datos reflejan las auditorías y encuestas registradas en el sistema a la fecha de generación.
        </div>

        <PageFooter pageNum={hasSurveys ? 4 : 3} totalPages={tp} />
      </div>
    </div>
  );
});

export default ReportPDFContent;
