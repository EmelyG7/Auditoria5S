/**
 * ProductivityPDFContent.jsx
 * Reporte de horas y productividad por colaborador.
 * Renderizado off-screen para html2canvas → jsPDF.
 *
 * Páginas:
 *  1. Portada (proyecto, período, fecha de generación)
 *  2. Resumen KPIs + gráficas (horas/día y horas/colaborador)
 *  3+. Tabla de registros detallados (25 filas por página)
 */

import { forwardRef } from "react";
import {
  AreaChart, Area, BarChart, Bar,
  XAxis, YAxis, CartesianGrid, Cell, LabelList,
} from "recharts";

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

const PAGE_W     = 794;
const PAD        = 52;
const ROWS_PAGE  = 25;

// ── Componentes compartidos ───────────────────────────────────────────────────
function PageHeader({ dateStr }) {
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
          CECOMSA · REPORTE DE HORAS Y PRODUCTIVIDAD
        </span>
      </div>
      <span style={{ fontSize: 10, color: C.muted }}>{dateStr}</span>
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

function PageWrap({ children, pageNum, totalPages, dateStr }) {
  return (
    <div className="pdf-page" style={{
      width: PAGE_W, minHeight: 1123,
      backgroundColor: C.white,
      padding: `40px ${PAD}px 60px`,
      boxSizing: "border-box", position: "relative",
    }}>
      <PageHeader dateStr={dateStr} />
      {children}
      <PageFooter pageNum={pageNum} totalPages={totalPages} />
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

// ── Página 1: Portada ─────────────────────────────────────────────────────────
function CoverPage({ project, dateFrom, dateTo, dateStr, memberName }) {
  const period = dateFrom && dateTo
    ? `${dateFrom} — ${dateTo}`
    : dateFrom ? `Desde ${dateFrom}` : dateTo ? `Hasta ${dateTo}` : "Todo el período";

  return (
    <div className="pdf-page" style={{
      width: PAGE_W, minHeight: 1123,
      display: "flex", flexDirection: "column",
      background: "linear-gradient(155deg, #0A4F79 0%, #0D6FA3 55%, #0A4F79 100%)",
      color: C.white, padding: "70px 80px", boxSizing: "border-box", position: "relative",
    }}>
      <img src="/logo-cecomsa-blanco.png" alt="Cecomsa"
        style={{ width: 150, objectFit: "contain", marginBottom: 52 }} />

      <div style={{ fontSize: 12, fontWeight: 600, letterSpacing: 3, opacity: 0.65, textTransform: "uppercase", marginBottom: 14 }}>
        Reporte de Productividad
      </div>

      <h1 style={{ fontSize: 32, fontWeight: 800, margin: "0 0 6px", lineHeight: 1.25, maxWidth: 540 }}>
        Horas Dedicadas por Colaborador
      </h1>

      {project?.name && (
        <h2 style={{ fontSize: 17, fontWeight: 400, margin: "0 0 26px", opacity: 0.75 }}>
          {project.name}
          {project.key ? ` · ${project.key}` : ""}
        </h2>
      )}

      <div style={{ display: "flex", width: 140, height: 4, borderRadius: 2, overflow: "hidden", marginBottom: 30 }}>
        {[C.success, C.warning, C.secondary, C.danger].map((c) => (
          <div key={c} style={{ flex: 1, backgroundColor: c }} />
        ))}
      </div>

      <div style={{ marginTop: "auto", display: "flex", flexDirection: "column", gap: 8 }}>
        <div style={{ fontSize: 13, opacity: 0.7 }}>Período: {period}</div>
        {memberName && (
          <div style={{ fontSize: 13, opacity: 0.7 }}>Colaborador: {memberName}</div>
        )}
        <div style={{ fontSize: 11, opacity: 0.45, marginTop: 10 }}>Generado el {dateStr}</div>
      </div>
    </div>
  );
}

// ── Página 2: KPIs + Gráficas ─────────────────────────────────────────────────
function SummaryPage({ project, kpis, dailyData, userHoursData, dateStr, totalPages }) {
  const chartW = Math.floor((PAGE_W - PAD * 2 - 20) / 2);

  return (
    <PageWrap pageNum={2} totalPages={totalPages} dateStr={dateStr}>
      <div style={{
        fontSize: 15, fontWeight: 700, color: C.primary,
        borderLeft: `4px solid ${C.primary}`, paddingLeft: 10, marginBottom: 20,
      }}>
        Resumen de Horas{project?.name ? ` — ${project.name}` : ""}
      </div>

      {/* KPIs */}
      <div style={{ display: "flex", gap: 10, marginBottom: 24 }}>
        <KPIBox label="Horas totales"    value={`${kpis.total.toFixed(1)}h`}    color={C.primary}   />
        <KPIBox label="Días con registro" value={kpis.days}                      color={C.secondary} />
        <KPIBox label="Promedio / día"   value={`${kpis.avgDay.toFixed(1)}h`}   color={C.success}   />
        {kpis.topUser && (
          <KPIBox
            label="Top colaborador"
            value={kpis.topUser[0]}
            sub={`${kpis.topUser[1].toFixed(1)}h`}
            color={C.warning}
          />
        )}
      </div>

      {/* Gráficas lado a lado */}
      <div style={{ display: "flex", gap: 20, marginBottom: 24 }}>
        {/* Área: horas por día */}
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: C.muted, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 10 }}>
            Horas Registradas por Día
          </div>
          {dailyData.length > 0 ? (
            <AreaChart width={chartW} height={195} data={dailyData}
              margin={{ top: 5, right: 10, left: -18, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={C.border} />
              <XAxis dataKey="day" tick={{ fontSize: 9 }} axisLine={false} tickLine={false} />
              <YAxis tickFormatter={(v) => `${v}h`} tick={{ fontSize: 9 }} axisLine={false} tickLine={false} />
              <Area type="monotone" dataKey="horas" name="Horas"
                stroke={C.primary} fill={`${C.primary}20`} strokeWidth={2}
                dot={{ r: 2, fill: C.primary, strokeWidth: 0 }} />
            </AreaChart>
          ) : (
            <div style={{ height: 195, display: "flex", alignItems: "center", justifyContent: "center", color: C.muted, fontSize: 11 }}>
              Sin registros en este período.
            </div>
          )}
        </div>

        {/* Barras: horas por colaborador */}
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: C.muted, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 10 }}>
            Horas por Colaborador
          </div>
          {userHoursData.length > 0 ? (
            <BarChart width={chartW} height={195} data={userHoursData} layout="vertical"
              margin={{ top: 5, right: 45, left: 5, bottom: 0 }}>
              <XAxis type="number" tickFormatter={(v) => `${v}h`}
                tick={{ fontSize: 9 }} axisLine={false} tickLine={false} />
              <YAxis type="category" dataKey="name" width={74}
                tick={{ fontSize: 10 }} axisLine={false} tickLine={false} />
              <Bar dataKey="horas" name="Horas" radius={[0, 4, 4, 0]} maxBarSize={20}
                fill={C.secondary}>
                <LabelList dataKey="horas" position="right"
                  formatter={(v) => `${Number(v).toFixed(1)}h`}
                  style={{ fontSize: 10, fontWeight: 700, fill: C.text }} />
              </Bar>
            </BarChart>
          ) : (
            <div style={{ height: 195, display: "flex", alignItems: "center", justifyContent: "center", color: C.muted, fontSize: 11 }}>
              Sin colaboradores con horas registradas.
            </div>
          )}
        </div>
      </div>

      {/* Tabla resumen por colaborador */}
      {userHoursData.length > 0 && (
        <>
          <div style={{ fontSize: 11, fontWeight: 600, color: C.muted, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 10 }}>
            Resumen por Colaborador
          </div>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11 }}>
            <thead>
              <tr>
                {["Colaborador", "Horas totales", "% del total"].map((h) => (
                  <th key={h} style={{
                    padding: "5px 10px", backgroundColor: C.primary,
                    color: C.white, fontSize: 10, fontWeight: 600, textAlign: "left",
                  }}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {userHoursData.map((u, idx) => (
                <tr key={u.name} style={{ backgroundColor: idx % 2 === 0 ? C.white : C.light }}>
                  <td style={{ padding: "5px 10px", fontWeight: 600 }}>{u.name}</td>
                  <td style={{ padding: "5px 10px", color: C.secondary, fontWeight: 700 }}>
                    {u.horas.toFixed(1)}h
                  </td>
                  <td style={{ padding: "5px 10px", color: C.muted }}>
                    {kpis.total > 0 ? `${((u.horas / kpis.total) * 100).toFixed(1)}%` : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr style={{ borderTop: `2px solid ${C.border}`, backgroundColor: C.light }}>
                <td style={{ padding: "5px 10px", fontWeight: 700 }}>Total</td>
                <td style={{ padding: "5px 10px", fontWeight: 800, color: C.primary }}>{kpis.total.toFixed(1)}h</td>
                <td style={{ padding: "5px 10px", fontWeight: 700 }}>100%</td>
              </tr>
            </tfoot>
          </table>
        </>
      )}
    </PageWrap>
  );
}

// ── Páginas de tabla detallada ────────────────────────────────────────────────
function DetailTablePage({ logs, kpis, pageNum, totalPages, dateStr, isFirst, isLast }) {
  return (
    <PageWrap pageNum={pageNum} totalPages={totalPages} dateStr={dateStr}>
      {isFirst && (
        <div style={{
          fontSize: 15, fontWeight: 700, color: C.primary,
          borderLeft: `4px solid ${C.primary}`, paddingLeft: 10, marginBottom: 16,
        }}>
          Registros Detallados ({totalPages > 3 ? "cont." : `${logs.length === kpis.totalLogs ? kpis.totalLogs : "…"} registros`})
        </div>
      )}

      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11 }}>
        <thead>
          <tr>
            {["Fecha", "Colaborador", "Tarea", "Descripción", "Horas"].map((h, i) => (
              <th key={h} style={{
                padding: "5px 8px", backgroundColor: C.primary,
                color: C.white, fontSize: 10, fontWeight: 600,
                textAlign: i === 4 ? "right" : "left",
              }}>
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {logs.map((l, idx) => (
            <tr key={l.id ?? idx} style={{ backgroundColor: idx % 2 === 0 ? C.white : C.light }}>
              <td style={{ padding: "4px 8px", whiteSpace: "nowrap", color: C.muted }}>{l.date_worked}</td>
              <td style={{ padding: "4px 8px" }}>
                {l.user?.full_name || l.user_name || "—"}
              </td>
              <td style={{ padding: "4px 8px" }}>
                <span style={{ fontFamily: "monospace", fontSize: 9, color: C.muted, marginRight: 4 }}>
                  {l.task_key}
                </span>
                <span style={{ color: C.text }}>
                  {(l.task_title || "").slice(0, 40)}{(l.task_title || "").length > 40 ? "…" : ""}
                </span>
              </td>
              <td style={{ padding: "4px 8px", color: C.muted, maxWidth: 160 }}>
                {(l.description || "").slice(0, 45)}{(l.description || "").length > 45 ? "…" : ""}
              </td>
              <td style={{ padding: "4px 8px", fontWeight: 700, color: C.primary, textAlign: "right", whiteSpace: "nowrap" }}>
                {parseFloat(l.hours).toFixed(1)}h
              </td>
            </tr>
          ))}
        </tbody>
        {isLast && (
          <tfoot>
            <tr style={{ borderTop: `2px solid ${C.border}`, backgroundColor: C.light }}>
              <td colSpan={4} style={{ padding: "5px 8px", fontSize: 11, fontWeight: 700, textAlign: "right", color: C.text }}>
                Total general:
              </td>
              <td style={{ padding: "5px 8px", fontSize: 13, fontWeight: 800, color: C.primary, textAlign: "right" }}>
                {kpis.total.toFixed(1)}h
              </td>
            </tr>
          </tfoot>
        )}
      </table>
    </PageWrap>
  );
}

// ── Componente principal ──────────────────────────────────────────────────────
const ProductivityPDFContent = forwardRef(function ProductivityPDFContent({ data }, ref) {
  if (!data) return null;

  const {
    project, logs, kpis, dailyData, userHoursData,
    dateFrom, dateTo, memberName, generatedAt,
  } = data;

  const dateStr = new Date(generatedAt).toLocaleDateString("es-DO", {
    year: "numeric", month: "long", day: "numeric",
  });

  const tablePages    = Math.ceil((logs.length || 1) / ROWS_PAGE);
  const totalPages    = 2 + tablePages;
  const kpisWithTotal = { ...kpis, totalLogs: logs.length };

  return (
    <div ref={ref} style={{
      position: "absolute", left: -9999, top: 0,
      fontFamily: "'Segoe UI', Arial, sans-serif",
    }}>
      {/* Portada */}
      <CoverPage
        project={project}
        dateFrom={dateFrom}
        dateTo={dateTo}
        dateStr={dateStr}
        memberName={memberName}
      />

      {/* Resumen + gráficas */}
      <SummaryPage
        project={project}
        kpis={kpis}
        dailyData={dailyData}
        userHoursData={userHoursData}
        dateStr={dateStr}
        totalPages={totalPages}
      />

      {/* Páginas de detalle */}
      {Array.from({ length: tablePages }, (_, pi) => {
        const slice = logs.slice(pi * ROWS_PAGE, (pi + 1) * ROWS_PAGE);
        return (
          <DetailTablePage
            key={pi}
            logs={slice}
            kpis={kpisWithTotal}
            pageNum={3 + pi}
            totalPages={totalPages}
            dateStr={dateStr}
            isFirst={pi === 0}
            isLast={pi === tablePages - 1}
          />
        );
      })}
    </div>
  );
});

export default ProductivityPDFContent;
