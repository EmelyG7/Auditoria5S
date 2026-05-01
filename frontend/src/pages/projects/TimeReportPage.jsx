/**
 * TimeReportPage.jsx
 * Reporte de horas por colaborador, proyecto y período.
 *
 * Acceso: /projects/time-report
 *
 * Funcionalidades:
 *   - Filtros: proyecto, colaborador, fecha desde/hasta
 *   - Tabla detallada de time logs
 *   - KPIs: horas totales, promedio diario, por proyecto
 *   - Gráfica de horas por día (área)
 *   - Exportar a CSV
 */

import { useState, useMemo }                     from "react";
import { useQuery }                              from "@tanstack/react-query";
import {
  AreaChart, Area, BarChart, Bar, XAxis, YAxis,
  CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from "recharts";
import {
  Clock, Download, Loader2, Filter,
  Calendar, User, Folder, TrendingUp,
} from "lucide-react";
import { projectsService } from "../../services/projects";
import Header              from "../../components/Layout/Header";
import GlassCard           from "../../components/Layout/GlassCard";
import { fmt }             from "../../utils/format";

const COL = { primary: "#0A4F79", secondary: "#B4427F", success: "#98C062", warning: "#EA9947" };

function GTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="glass rounded-xl px-3 py-2 text-xs shadow-xl border border-white/60">
      <p className="font-semibold text-ink mb-1.5">{label}</p>
      {payload.map((p) => (
        <p key={p.dataKey} style={{ color: p.color }} className="flex justify-between gap-4">
          <span>{p.name}</span>
          <span className="font-semibold">{(+p.value).toFixed(1)}h</span>
        </p>
      ))}
    </div>
  );
}

// ── Exportar CSV ─────────────────────────────────────────────────────────────
function exportCSV(logs, filters) {
  const headers = ["Fecha","Colaborador","Email","Proyecto","Tarea","Horas","Descripción"];
  const rows = logs.map((l) => [
    l.date_worked, l.user_name, l.user_email,
    l.project_name, l.task_key, l.hours, l.description || "",
  ]);
  const csv = [headers, ...rows].map((r) => r.map((v) => `"${v}"`).join(",")).join("\n");
  const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
  const url  = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href     = url;
  link.download = `horas_${filters.from || "inicio"}_${filters.to || "hoy"}.csv`;
  link.click();
  URL.revokeObjectURL(url);
}

export default function TimeReportPage() {
  // Filtros
  const [projectId,    setProjectId]    = useState("");
  const [userId,       setUserId]       = useState("");
  const [dateFrom,     setDateFrom]     = useState(() => {
    const d = new Date(); d.setDate(1);
    return d.toISOString().split("T")[0];
  });
  const [dateTo,       setDateTo]       = useState(() => new Date().toISOString().split("T")[0]);

  // Cargar proyectos y miembros
  const { data: projectsData } = useQuery({
    queryKey: ["projects", {}],
    queryFn:  () => projectsService.list({ page_size: 50 }),
    staleTime: 60_000,
  });
  const projects = projectsData?.items || [];

  const { data: members = [] } = useQuery({
    queryKey: ["members", projectId],
    queryFn:  () => projectsService.getMembers(projectId),
    enabled:  !!projectId,
    staleTime: 60_000,
  });

  // Cargar tareas del proyecto para obtener time logs
  const { data: tasks = [], isLoading } = useQuery({
    queryKey: ["tasks-timelogs", projectId],
    queryFn:  async () => {
      if (!projectId) return [];
      const taskList = await projectsService.getTasks(projectId);
      // Para cada tarea, cargar sus time logs
      const withLogs = await Promise.allSettled(
        taskList.map(async (t) => {
          const logs = await projectsService.getTimeLogs(projectId, t.id);
          return logs.map((l) => ({
            ...l,
            task_key:     t.task_key,
            task_title:   t.title,
            project_id:   projectId,
            project_name: projects.find((p) => String(p.id) === String(projectId))?.name || "",
          }));
        })
      );
      return withLogs
        .filter((r) => r.status === "fulfilled")
        .flatMap((r) => r.value);
    },
    enabled:  !!projectId,
    staleTime: 30_000,
  });

  // Filtrar logs
  const filteredLogs = useMemo(() => {
    return tasks.filter((l) => {
      if (userId && String(l.user_id) !== String(userId)) return false;
      if (dateFrom && l.date_worked < dateFrom) return false;
      if (dateTo   && l.date_worked > dateTo)   return false;
      return true;
    }).sort((a, b) => b.date_worked.localeCompare(a.date_worked));
  }, [tasks, userId, dateFrom, dateTo]);

  // KPIs calculados
  const kpis = useMemo(() => {
    const total  = filteredLogs.reduce((a, l) => a + parseFloat(l.hours), 0);
    const days   = new Set(filteredLogs.map((l) => l.date_worked)).size;
    const avgDay = days > 0 ? total / days : 0;
    const byUser: Record<string, number> = {};
    filteredLogs.forEach((l) => {
      const name = l.user?.full_name || `Usuario ${l.user_id}`;
      byUser[name] = (byUser[name] || 0) + parseFloat(l.hours);
    });
    const topUser = Object.entries(byUser).sort((a,b)=>b[1]-a[1])[0];
    return { total, avgDay, days, topUser };
  }, [filteredLogs]);

  // Datos para gráfica: horas por día
  const dailyData = useMemo(() => {
    const map: Record<string, number> = {};
    filteredLogs.forEach((l) => {
      map[l.date_worked] = (map[l.date_worked] || 0) + parseFloat(l.hours);
    });
    return Object.entries(map)
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([date, horas]) => ({
        day:   new Date(date).toLocaleDateString("es-DO", { day:"2-digit", month:"short" }),
        horas: +horas.toFixed(1),
      }));
  }, [filteredLogs]);

  // Datos para gráfica: horas por colaborador
  const userHoursData = useMemo(() => {
    const map: Record<string, { name: string; horas: number }> = {};
    filteredLogs.forEach((l) => {
      const uid  = l.user_id;
      const name = l.user?.full_name?.split(" ")[0] || `U${uid}`;
      if (!map[uid]) map[uid] = { name, horas: 0 };
      map[uid].horas += parseFloat(l.hours);
    });
    return Object.values(map)
      .map((d) => ({ ...d, horas: +d.horas.toFixed(1) }))
      .sort((a, b) => b.horas - a.horas)
      .slice(0, 10);
  }, [filteredLogs]);

  return (
    <div className="min-h-screen relative z-10">
      <Header
        title="Reporte de Horas"
        subtitle="Registro de tiempo por colaborador y proyecto"
      />

      {/* ── Filtros ────────────────────────────────────────────────────────── */}
      <GlassCard className="mb-6 !p-4">
        <div className="flex flex-wrap gap-3 items-end">
          <div>
            <label className="field-label">Proyecto *</label>
            <select value={projectId} onChange={(e) => setProjectId(e.target.value)}
              className="input-glass text-sm w-52">
              <option value="">Selecciona un proyecto…</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>{p.name} ({p.key})</option>
              ))}
            </select>
          </div>
          <div>
            <label className="field-label">Colaborador</label>
            <select value={userId} onChange={(e) => setUserId(e.target.value)}
              className="input-glass text-sm w-44" disabled={!projectId}>
              <option value="">Todos</option>
              {members.map((m) => (
                <option key={m.user_id} value={m.user_id}>
                  {m.user?.full_name || `Usuario ${m.user_id}`}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="field-label">Desde</label>
            <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)}
              className="input-glass text-sm w-36" />
          </div>
          <div>
            <label className="field-label">Hasta</label>
            <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)}
              className="input-glass text-sm w-36" />
          </div>
          {filteredLogs.length > 0 && (
            <button
              onClick={() => exportCSV(filteredLogs.map((l) => ({
                date_worked:  l.date_worked,
                user_name:    l.user?.full_name || "",
                user_email:   l.user?.email     || "",
                project_name: l.project_name    || "",
                task_key:     l.task_key        || "",
                hours:        l.hours,
                description:  l.description    || "",
              })), { from: dateFrom, to: dateTo })}
              className="btn-primary flex items-center gap-2 text-sm self-end"
            >
              <Download size={14} /> Exportar CSV
            </button>
          )}
        </div>
      </GlassCard>

      {!projectId ? (
        <div className="flex flex-col items-center justify-center h-48 gap-2 text-ink/30">
          <Folder size={28} className="opacity-40" />
          <p className="text-sm">Selecciona un proyecto para ver el reporte de horas.</p>
        </div>
      ) : isLoading ? (
        <div className="flex items-center justify-center h-48">
          <Loader2 size={28} className="animate-spin text-primary/40" />
        </div>
      ) : (
        <>
          {/* ── KPIs ─────────────────────────────────────────────────────── */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6 stagger">
            {[
              { label: "Total de horas",   value: `${kpis.total.toFixed(1)}h`,   icon: Clock,        color: COL.primary   },
              { label: "Días con registro", value: kpis.days,                     icon: Calendar,     color: COL.secondary },
              { label: "Promedio/día",      value: `${kpis.avgDay.toFixed(1)}h`,  icon: TrendingUp,   color: COL.success   },
              { label: "Top colaborador",   value: kpis.topUser?.[0] || "—",
                sub:                               kpis.topUser ? `${kpis.topUser[1].toFixed(1)}h` : "",
                icon: User, color: COL.warning },
            ].map(({ label, value, sub, icon: Icon, color }) => (
              <GlassCard key={label} className="flex items-start gap-3 animate-fade-up">
                <div className="w-10 h-10 rounded-2xl flex items-center justify-center shrink-0"
                     style={{ background: `${color}20` }}>
                  <Icon size={17} style={{ color }} />
                </div>
                <div>
                  <p className="text-xs font-semibold text-ink/50 uppercase tracking-wide mb-0.5">{label}</p>
                  <p className="text-xl font-bold" style={{ color }}>{value}</p>
                  {sub && <p className="text-xs text-ink/40">{sub}</p>}
                </div>
              </GlassCard>
            ))}
          </div>

          {/* ── Gráficas ──────────────────────────────────────────────────── */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
            {/* Área: horas por día */}
            <GlassCard className="animate-fade-up">
              <h3 className="text-xs font-semibold text-ink/50 uppercase tracking-wide mb-4">
                Horas Registradas por Día
              </h3>
              {dailyData.length === 0 ? (
                <p className="text-sm text-ink/30 text-center py-8">Sin registros en este período.</p>
              ) : (
                <div className="overflow-x-auto">
                  <div style={{ minWidth: Math.max(dailyData.length * 50, 280) }}>
                    <ResponsiveContainer width="100%" height={200}>
                      <AreaChart data={dailyData} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="rgba(30,30,47,0.06)" />
                        <XAxis dataKey="day" tick={{ fontSize: 10 }} axisLine={false} tickLine={false} />
                        <YAxis tickFormatter={(v) => `${v}h`} tick={{ fontSize: 10 }} axisLine={false} tickLine={false} />
                        <Tooltip content={<GTooltip />} />
                        <Area type="monotone" dataKey="horas" name="Horas"
                          stroke={COL.primary} fill={`${COL.primary}20`} strokeWidth={2}
                          dot={{ r: 3, fill: COL.primary, strokeWidth: 0 }} />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              )}
            </GlassCard>

            {/* Barras: horas por colaborador */}
            <GlassCard className="animate-fade-up">
              <h3 className="text-xs font-semibold text-ink/50 uppercase tracking-wide mb-4">
                Horas por Colaborador
              </h3>
              {userHoursData.length === 0 ? (
                <p className="text-sm text-ink/30 text-center py-8">Sin registros.</p>
              ) : (
                <ResponsiveContainer width="100%" height={200}>
                  <BarChart data={userHoursData} layout="vertical"
                    margin={{ top: 4, right: 40, left: 8, bottom: 4 }}>
                    <XAxis type="number" tickFormatter={(v) => `${v}h`}
                      tick={{ fontSize: 10 }} axisLine={false} tickLine={false} />
                    <YAxis type="category" dataKey="name" width={70}
                      tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
                    <Tooltip content={<GTooltip />} />
                    <Bar dataKey="horas" name="Horas" radius={[0,6,6,0]} maxBarSize={22} fill={COL.secondary}>
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              )}
            </GlassCard>
          </div>

          {/* ── Tabla detallada ────────────────────────────────────────────── */}
          <GlassCard padding={false}>
            <div className="flex items-center justify-between px-4 pt-4 pb-3 border-b border-ink/8">
              <h3 className="text-xs font-semibold text-ink/50 uppercase tracking-wide">
                Registros Detallados
              </h3>
              <span className="text-xs text-ink/40">{filteredLogs.length} registros</span>
            </div>

            {filteredLogs.length === 0 ? (
              <div className="flex items-center justify-center h-32 text-sm text-ink/30">
                Sin registros de tiempo para los filtros seleccionados.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm min-w-[620px]">
                  <thead>
                    <tr className="border-b border-ink/8">
                      {["Fecha","Colaborador","Tarea","Horas","Descripción"].map((h) => (
                        <th key={h}
                            className="text-left py-2.5 px-4 text-xs font-semibold text-ink/50 uppercase tracking-wide">
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-ink/5">
                    {filteredLogs.map((l) => (
                      <tr key={l.id} className="hover:bg-primary/[0.025] transition-colors">
                        <td className="py-3 px-4 text-ink/60 whitespace-nowrap">
                          {fmt.date(l.date_worked)}
                        </td>
                        <td className="py-3 px-4">
                          <div className="flex items-center gap-2">
                            <div className="w-6 h-6 rounded-full bg-primary/20 flex items-center
                                            justify-center text-primary font-bold text-[9px] shrink-0">
                              {l.user?.full_name?.charAt(0)}
                            </div>
                            <span className="text-sm text-ink">{l.user?.full_name || "—"}</span>
                          </div>
                        </td>
                        <td className="py-3 px-4">
                          <span className="text-[10px] font-mono text-ink/40 mr-2">{l.task_key}</span>
                          <span className="text-sm text-ink/70 truncate max-w-[160px] inline-block align-middle">
                            {l.task_title}
                          </span>
                        </td>
                        <td className="py-3 px-4 font-semibold text-primary whitespace-nowrap">
                          {parseFloat(l.hours).toFixed(1)}h
                        </td>
                        <td className="py-3 px-4 text-ink/50 text-xs max-w-[200px] truncate">
                          {l.description || <span className="italic text-ink/25">Sin descripción</span>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="border-t border-ink/15 bg-ink/[0.02]">
                      <td colSpan={3} className="py-2.5 px-4 text-xs font-semibold text-ink/50 text-right">
                        Total:
                      </td>
                      <td className="py-2.5 px-4 font-bold text-primary">
                        {kpis.total.toFixed(1)}h
                      </td>
                      <td />
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}
          </GlassCard>
        </>
      )}
    </div>
  );
}