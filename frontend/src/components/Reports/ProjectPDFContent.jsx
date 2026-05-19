/**
 * ProjectPDFContent.jsx
 * Reporte ejecutivo de proyecto — renderizado off-screen para html2canvas → jsPDF.
 *
 * Páginas:
 *  1. Portada (nombre, clave, descripción, estado, fechas)
 *  2. Resumen ejecutivo (progreso, tareas, horas, sprint activo)
 *  3. Productividad por miembro (tabla detallada)
 */

import { forwardRef } from "react";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Cell, LabelList,
  RadialBarChart, RadialBar,
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
  purple:    "#8172B2",
};

const PAGE_W = 794;
const PAD    = 52;

const STATUS_LABELS = {
  activo:      "Activo",
  pausado:     "Pausado",
  completado:  "Completado",
  archivado:   "Archivado",
};

const STATUS_COLORS = {
  activo:     C.success,
  pausado:    C.warning,
  completado: C.primary,
  archivado:  C.muted,
};

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
          CECOMSA · REPORTE DE PROYECTO
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

function SectionTitle({ children, color = C.primary }) {
  return (
    <div style={{
      fontSize: 15, fontWeight: 700, color,
      borderLeft: `4px solid ${color}`, paddingLeft: 10, marginBottom: 16,
    }}>
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

function Badge({ label, color }) {
  return (
    <span style={{
      backgroundColor: `${color}22`, color,
      padding: "3px 10px", borderRadius: 20, fontSize: 11, fontWeight: 700,
      border: `1px solid ${color}44`,
    }}>
      {label}
    </span>
  );
}

function semColor(pct) {
  if (pct >= 80) return C.success;
  if (pct >= 60) return C.warning;
  return C.danger;
}

function fmtDate(d) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("es-DO", { day: "2-digit", month: "short", year: "numeric" });
}

// ── Página 1: Portada ─────────────────────────────────────────────────────────
function CoverPage({ project, kpis, dateStr }) {
  const statusColor = STATUS_COLORS[project.status] || C.muted;
  const statusLabel = STATUS_LABELS[project.status]  || project.status;

  return (
    <div className="pdf-page" style={{
      width: PAGE_W, minHeight: 1123,
      display: "flex", flexDirection: "column",
      background: `linear-gradient(155deg, #0A4F79 0%, #0D6FA3 55%, #0A4F79 100%)`,
      color: C.white, padding: "70px 80px", boxSizing: "border-box", position: "relative",
    }}>
      {/* Logo */}
      <img src="/logo-cecomsa-blanco.png" alt="Cecomsa"
        style={{ width: 150, objectFit: "contain", marginBottom: 52 }} />

      {/* Etiqueta tipo de reporte */}
      <div style={{
        fontSize: 12, fontWeight: 600, letterSpacing: 3, opacity: 0.65,
        textTransform: "uppercase", marginBottom: 14,
      }}>
        Reporte de Proyecto
      </div>

      {/* Nombre del proyecto */}
      <h1 style={{ fontSize: 34, fontWeight: 800, margin: "0 0 6px", lineHeight: 1.2, maxWidth: 560 }}>
        {project.name}
      </h1>

      {/* Clave del proyecto */}
      <div style={{
        fontSize: 15, opacity: 0.65, fontFamily: "monospace", fontWeight: 600, marginBottom: 26,
      }}>
        {project.key}
      </div>

      {/* Barra de colores */}
      <div style={{ display: "flex", width: 140, height: 4, borderRadius: 2, overflow: "hidden", marginBottom: 30 }}>
        {[C.success, C.warning, C.secondary, C.danger].map((c) => (
          <div key={c} style={{ flex: 1, backgroundColor: c }} />
        ))}
      </div>

      {/* Descripción */}
      {project.description && (
        <p style={{ fontSize: 14, opacity: 0.75, maxWidth: 500, lineHeight: 1.6, marginBottom: 32 }}>
          {project.description}
        </p>
      )}

      {/* Metadatos */}
      <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: "auto" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{
            backgroundColor: `${statusColor}33`, border: `1px solid ${statusColor}66`,
            borderRadius: 16, padding: "4px 14px", fontSize: 12, fontWeight: 700, color: statusColor,
          }}>
            {statusLabel}
          </div>
        </div>

        <div style={{ display: "flex", gap: 32, marginTop: 6 }}>
          {[
            { label: "Inicio",     value: fmtDate(project.start_date) },
            { label: "Cierre",     value: fmtDate(project.end_date)   },
            { label: "Progreso",   value: `${kpis.progress_pct.toFixed(1)}%` },
            { label: "Miembros",   value: kpis.member_count           },
          ].map(({ label, value }) => (
            <div key={label}>
              <div style={{ fontSize: 10, opacity: 0.55, marginBottom: 2 }}>{label}</div>
              <div style={{ fontSize: 15, fontWeight: 700 }}>{value}</div>
            </div>
          ))}
        </div>

        <div style={{ fontSize: 11, opacity: 0.45, marginTop: 12 }}>
          Generado el {dateStr}
        </div>
      </div>
    </div>
  );
}

// ── Página 2: Resumen ejecutivo ───────────────────────────────────────────────
function SummaryPage({ project, kpis, dateStr, totalPages }) {
  // Datos para el gráfico de distribución de tareas
  const taskDist = [
    { name: "Completadas", value: kpis.completed_tasks,                                       color: C.success   },
    { name: "En progreso", value: kpis.in_progress,                                           color: C.warning   },
    { name: "Pendientes",  value: kpis.open_tasks - kpis.in_progress - kpis.overdue_tasks,    color: C.primary   },
    { name: "Vencidas",    value: kpis.overdue_tasks,                                         color: C.danger    },
  ].filter((d) => d.value > 0);

  // Datos para el gráfico de horas
  const hoursData = [
    { name: "Estimadas", horas: kpis.total_hours_estimated, color: C.muted    },
    { name: "Registradas", horas: kpis.total_hours_logged,  color: C.secondary },
  ];

  const variance     = kpis.hours_variance;
  const varianceColor = variance > 0 ? C.danger : C.success;
  const varianceLabel = variance > 0
    ? `+${variance.toFixed(1)}h sobre lo estimado`
    : `${Math.abs(variance).toFixed(1)}h bajo lo estimado`;

  return (
    <PageWrap pageNum={2} totalPages={totalPages} dateStr={dateStr}>
      <SectionTitle>Resumen Ejecutivo — {project.name}</SectionTitle>

      {/* Barra de progreso */}
      <div style={{ marginBottom: 20 }}>
        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 5 }}>
          <span style={{ fontSize: 11, fontWeight: 600, color: C.text }}>Avance del proyecto</span>
          <span style={{ fontSize: 13, fontWeight: 800, color: semColor(kpis.progress_pct) }}>
            {kpis.progress_pct.toFixed(1)}%
          </span>
        </div>
        <div style={{ height: 12, backgroundColor: C.border, borderRadius: 6, overflow: "hidden" }}>
          <div style={{
            width: `${kpis.progress_pct}%`, height: "100%",
            backgroundColor: semColor(kpis.progress_pct), borderRadius: 6,
            transition: "width 0s",
          }} />
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", marginTop: 4 }}>
          <span style={{ fontSize: 10, color: C.muted }}>{kpis.completed_tasks} tareas completadas</span>
          {kpis.days_remaining != null && (
            <span style={{ fontSize: 10, color: kpis.days_remaining < 0 ? C.danger : C.muted }}>
              {kpis.days_remaining < 0
                ? `${Math.abs(kpis.days_remaining)} días de retraso`
                : `${kpis.days_remaining} días restantes`}
            </span>
          )}
        </div>
      </div>

      {/* KPIs en fila */}
      <div style={{ display: "flex", gap: 10, marginBottom: 20 }}>
        <KPIBox label="Total de tareas"  value={kpis.total_tasks}                               color={C.primary}   />
        <KPIBox label="Completadas"      value={kpis.completed_tasks}                           color={C.success}   />
        <KPIBox label="En progreso"      value={kpis.in_progress}                               color={C.warning}   />
        <KPIBox label="Vencidas"         value={kpis.overdue_tasks}                             color={C.danger}    />
      </div>

      {/* Horas */}
      <div style={{ display: "flex", gap: 10, marginBottom: 22 }}>
        <KPIBox label="Horas registradas"  value={`${kpis.total_hours_logged.toFixed(1)}h`}    color={C.secondary} />
        <KPIBox label="Horas estimadas"    value={`${kpis.total_hours_estimated.toFixed(1)}h`} color={C.muted}     />
        <KPIBox label="Varianza"           value={`${variance > 0 ? "+" : ""}${variance.toFixed(1)}h`}
                                           sub={varianceLabel}                                  color={varianceColor} />
        {kpis.sprint_velocity_avg != null && (
          <KPIBox label="Velocidad media" value={`${kpis.sprint_velocity_avg.toFixed(0)}%`}   color={C.purple}    />
        )}
      </div>

      {/* Gráficos lado a lado */}
      <div style={{ display: "flex", gap: 20, marginBottom: 22 }}>
        {/* Distribución de tareas */}
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: C.muted, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 10 }}>
            Distribución de Tareas
          </div>
          {taskDist.length > 0 ? (
            <BarChart width={320} height={160} data={taskDist}
              margin={{ top: 4, right: 32, left: -20, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={C.border} />
              <XAxis dataKey="name" tick={{ fontSize: 10 }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 9 }} axisLine={false} tickLine={false} />
              <Bar dataKey="value" maxBarSize={32} radius={[4, 4, 0, 0]}>
                {taskDist.map((d, i) => (
                  <Cell key={i} fill={d.color} />
                ))}
                <LabelList dataKey="value" position="top" style={{ fontSize: 10, fontWeight: 700 }} />
              </Bar>
            </BarChart>
          ) : (
            <div style={{ height: 160, display: "flex", alignItems: "center", justifyContent: "center", color: C.muted, fontSize: 11 }}>
              Sin tareas
            </div>
          )}
        </div>

        {/* Horas estimadas vs registradas */}
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: C.muted, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 10 }}>
            Horas: Estimadas vs Registradas
          </div>
          <BarChart width={320} height={160} data={hoursData}
            margin={{ top: 4, right: 32, left: -20, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke={C.border} />
            <XAxis dataKey="name" tick={{ fontSize: 10 }} axisLine={false} tickLine={false} />
            <YAxis tickFormatter={(v) => `${v}h`} tick={{ fontSize: 9 }} axisLine={false} tickLine={false} />
            <Bar dataKey="horas" maxBarSize={40} radius={[4, 4, 0, 0]}>
              {hoursData.map((d, i) => (
                <Cell key={i} fill={d.color} />
              ))}
              <LabelList dataKey="horas" position="top"
                formatter={(v) => `${Number(v).toFixed(1)}h`}
                style={{ fontSize: 10, fontWeight: 700 }} />
            </Bar>
          </BarChart>
        </div>
      </div>

      {/* Sprint activo */}
      {kpis.active_sprint && (
        <div style={{
          backgroundColor: C.light, border: `1px solid ${C.border}`, borderRadius: 8,
          padding: "12px 16px",
        }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: C.success, marginBottom: 10 }}>
            Sprint Activo — {kpis.active_sprint.sprint_name}
          </div>
          <div style={{ display: "flex", gap: 16 }}>
            {[
              { label: "Velocidad",       value: kpis.active_sprint.velocity != null ? `${kpis.active_sprint.velocity.toFixed(0)}%` : "—" },
              { label: "Tareas",          value: `${kpis.active_sprint.completed_tasks} / ${kpis.active_sprint.total_tasks}` },
              { label: "Completadas",     value: `${kpis.active_sprint.completion_rate.toFixed(1)}%` },
              { label: "Horas loggeadas", value: `${kpis.active_sprint.total_hours_logged.toFixed(1)}h` },
              { label: "Días restantes",  value: kpis.active_sprint.days_remaining != null ? kpis.active_sprint.days_remaining : "—" },
            ].map(({ label, value }) => (
              <div key={label} style={{
                flex: 1, padding: "8px 10px", backgroundColor: C.white,
                borderRadius: 6, textAlign: "center", border: `1px solid ${C.border}`,
              }}>
                <div style={{ fontSize: 14, fontWeight: 700, color: C.text }}>{value}</div>
                <div style={{ fontSize: 9, color: C.muted, marginTop: 2 }}>{label}</div>
              </div>
            ))}
          </div>
        </div>
      )}
    </PageWrap>
  );
}

// ── Página 3: Productividad por miembro ───────────────────────────────────────
function MemberProductivityPage({ kpis, dateStr, totalPages }) {
  const members = kpis.member_productivity || [];

  // Gráfico: horas por colaborador
  const hoursChartData = members
    .filter((m) => m.total_hours_logged > 0)
    .map((m) => ({
      name:  m.full_name.split(" ")[0],
      horas: m.total_hours_logged,
      color: semColor(m.completion_rate),
    }))
    .sort((a, b) => b.horas - a.horas)
    .slice(0, 8);

  return (
    <PageWrap pageNum={3} totalPages={totalPages} dateStr={dateStr}>
      <SectionTitle>Productividad por Colaborador</SectionTitle>

      {/* Gráfico de horas */}
      {hoursChartData.length > 0 && (
        <div style={{ marginBottom: 20 }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: C.muted, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 10 }}>
            Horas Registradas por Colaborador
          </div>
          <BarChart width={PAGE_W - PAD * 2} height={140} data={hoursChartData} layout="vertical"
            margin={{ top: 0, right: 60, left: 20, bottom: 0 }}>
            <XAxis type="number" tickFormatter={(v) => `${v}h`}
              tick={{ fontSize: 9 }} axisLine={false} tickLine={false} />
            <YAxis type="category" dataKey="name" width={80}
              tick={{ fontSize: 10 }} axisLine={false} tickLine={false} />
            <Bar dataKey="horas" maxBarSize={18} radius={[0, 4, 4, 0]}>
              {hoursChartData.map((d, i) => (
                <Cell key={i} fill={d.color} />
              ))}
              <LabelList dataKey="horas" position="right"
                formatter={(v) => `${Number(v).toFixed(1)}h`}
                style={{ fontSize: 10, fontWeight: 700 }} />
            </Bar>
          </BarChart>
        </div>
      )}

      {/* Tabla de productividad */}
      {members.length > 0 ? (
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11 }}>
          <thead>
            <tr>
              {["Colaborador", "Tareas", "Completadas", "Tasa cierre", "Horas", "H/Tarea", "Story Pts", "Vencidas"].map((h) => (
                <th key={h} style={{
                  padding: "6px 8px", backgroundColor: C.primary,
                  color: C.white, fontSize: 10, fontWeight: 600, textAlign: "left",
                }}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {members.map((m, idx) => {
              const rate = m.completion_rate;
              const rColor = semColor(rate);
              return (
                <tr key={m.user_id} style={{ backgroundColor: idx % 2 === 0 ? C.white : C.light }}>
                  <td style={{ padding: "6px 8px" }}>
                    <div style={{ fontWeight: 600, color: C.text }}>{m.full_name}</div>
                    <div style={{ fontSize: 9, color: C.muted }}>{m.email}</div>
                  </td>
                  <td style={{ padding: "6px 8px", textAlign: "center" }}>{m.total_tasks}</td>
                  <td style={{ padding: "6px 8px", textAlign: "center", color: C.success, fontWeight: 700 }}>
                    {m.completed_tasks}
                  </td>
                  <td style={{ padding: "6px 8px", textAlign: "center" }}>
                    <span style={{
                      backgroundColor: `${rColor}22`, color: rColor,
                      padding: "2px 8px", borderRadius: 10, fontSize: 10, fontWeight: 700,
                    }}>
                      {rate.toFixed(1)}%
                    </span>
                  </td>
                  <td style={{ padding: "6px 8px", textAlign: "center", color: C.secondary, fontWeight: 700 }}>
                    {m.total_hours_logged.toFixed(1)}h
                  </td>
                  <td style={{ padding: "6px 8px", textAlign: "center", color: C.muted }}>
                    {m.avg_hours_per_task.toFixed(1)}h
                  </td>
                  <td style={{ padding: "6px 8px", textAlign: "center", color: C.muted }}>
                    {m.story_points_completed.toFixed(1)}
                  </td>
                  <td style={{ padding: "6px 8px", textAlign: "center" }}>
                    {m.overdue_tasks > 0
                      ? <span style={{ color: C.danger, fontWeight: 700 }}>{m.overdue_tasks}</span>
                      : <span style={{ color: C.success }}>—</span>
                    }
                  </td>
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr style={{ borderTop: `2px solid ${C.border}`, backgroundColor: C.light }}>
              <td style={{ padding: "6px 8px", fontWeight: 700, color: C.text }}>Total</td>
              <td style={{ padding: "6px 8px", textAlign: "center", fontWeight: 700 }}>{kpis.total_tasks}</td>
              <td style={{ padding: "6px 8px", textAlign: "center", fontWeight: 700, color: C.success }}>{kpis.completed_tasks}</td>
              <td style={{ padding: "6px 8px", textAlign: "center", fontWeight: 700, color: semColor(kpis.progress_pct) }}>
                {kpis.progress_pct.toFixed(1)}%
              </td>
              <td style={{ padding: "6px 8px", textAlign: "center", fontWeight: 700, color: C.secondary }}>
                {kpis.total_hours_logged.toFixed(1)}h
              </td>
              <td colSpan={3} />
            </tr>
          </tfoot>
        </table>
      ) : (
        <div style={{ padding: "24px 0", textAlign: "center", color: C.muted, fontSize: 13 }}>
          Sin colaboradores registrados en este proyecto.
        </div>
      )}
    </PageWrap>
  );
}

// ── Componente principal ──────────────────────────────────────────────────────
const ProjectPDFContent = forwardRef(function ProjectPDFContent({ data }, ref) {
  if (!data) return null;

  const { project, kpis, generatedAt } = data;
  const dateStr = new Date(generatedAt).toLocaleDateString("es-DO", {
    year: "numeric", month: "long", day: "numeric",
  });
  const totalPages = 3;

  return (
    <div ref={ref} style={{
      position: "absolute", left: -9999, top: 0,
      fontFamily: "'Segoe UI', Arial, sans-serif",
    }}>
      <CoverPage   project={project} kpis={kpis} dateStr={dateStr} />
      <SummaryPage project={project} kpis={kpis} dateStr={dateStr} totalPages={totalPages} />
      <MemberProductivityPage kpis={kpis} dateStr={dateStr} totalPages={totalPages} />
    </div>
  );
});

export default ProjectPDFContent;
