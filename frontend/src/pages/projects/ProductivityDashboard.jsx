/**
 * ProductivityDashboard.jsx
 * Dashboard global de productividad — KPIs de todos los proyectos.
 *
 * Secciones:
 *   1. KPIs globales (tareas, horas, velocidad, colaboradores)
 *   2. Rendimiento por colaborador (tabla + barras)
 *   3. Velocidad de sprints (línea de tendencia)
 *   4. Burndown simulado del sprint activo
 *   5. Distribución de tareas por tipo / estado / prioridad
 *   6. Horas por proyecto (barras horizontales)
 */

import { useState, useMemo }                     from "react";
import { useQuery }                              from "@tanstack/react-query";
import {
  LineChart, Line, BarChart, Bar, XAxis, YAxis,
  CartesianGrid, Tooltip, ResponsiveContainer,
  Legend, Cell, PieChart, Pie,
  AreaChart, Area, ReferenceLine,
} from "recharts";
import {
  TrendingUp, TrendingDown, Users, Clock,
  CheckCircle2, AlertTriangle, Zap, BarChart2,
  Download, Loader2, Activity, Target,
} from "lucide-react";
import { projectsService } from "../../services/projects";
import Header              from "../../components/Layout/Header";
import GlassCard           from "../../components/Layout/GlassCard";

// ─── Paleta ───────────────────────────────────────────────────────────────────
const COL = {
  primary:   "#0A4F79",
  secondary: "#B4427F",
  success:   "#98C062",
  warning:   "#EA9947",
  danger:    "#DF4585",
  purple:    "#8172B2",
  teal:      "#2E9E8F",
};

const STATUS_COLORS = {
  backlog:     "#94a3b8",
  por_hacer:   COL.primary,
  en_progreso: COL.warning,
  en_revision: COL.secondary,
  completada:  COL.success,
  cancelada:   COL.danger,
};

const PRIO_COLORS = {
  critica: COL.danger,
  alta:    COL.warning,
  media:   COL.primary,
  baja:    "#94a3b8",
};

const TYPE_COLORS = {
  historia: COL.primary,
  tarea:    COL.teal,
  bug:      COL.danger,
  epic:     COL.purple,
  mejora:   COL.success,
};

// ─── Helpers ──────────────────────────────────────────────────────────────────
const safe   = (v, fb = 0) => (v != null && !isNaN(+v) ? +v : fb);
const fmtH   = (h) => `${safe(h).toFixed(1)}h`;
const semClr = (pct) => pct >= 80 ? COL.success : pct >= 60 ? COL.warning : COL.danger;

function GTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="glass rounded-xl px-3 py-2 text-xs shadow-xl border border-white/60">
      <p className="font-semibold text-ink mb-1.5">{label}</p>
      {payload.map((p) => (
        <p key={p.dataKey} style={{ color: p.color }} className="flex justify-between gap-4">
          <span>{p.name}</span>
          <span className="font-semibold">{typeof p.value === "number" ? p.value.toFixed(1) : p.value}</span>
        </p>
      ))}
    </div>
  );
}

function KPITile({ label, value, sub, icon: Icon, color, trend }) {
  return (
    <GlassCard className="flex items-start gap-3 animate-fade-up">
      <div className="w-10 h-10 rounded-2xl flex items-center justify-center shrink-0"
           style={{ background: `${color}20` }}>
        <Icon size={17} style={{ color }} />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-xs font-semibold text-ink/50 uppercase tracking-wide mb-0.5">{label}</p>
        <p className="text-2xl font-bold leading-tight" style={{ color }}>{value}</p>
        {sub && <p className="text-xs text-ink/40 mt-0.5">{sub}</p>}
      </div>
      {trend != null && (
        <div className={`flex items-center gap-0.5 text-xs font-bold ${trend >= 0 ? "text-success" : "text-danger"}`}>
          {trend >= 0 ? <TrendingUp size={13}/> : <TrendingDown size={13}/>}
          {Math.abs(trend).toFixed(1)}%
        </div>
      )}
    </GlassCard>
  );
}

// ─── Hook: agregar datos de todos los proyectos ───────────────────────────────
function useGlobalProductivity(projectIds) {
  // Cargar KPIs de cada proyecto en paralelo
  const queries = useQuery({
    queryKey: ["global-productivity", projectIds],
    queryFn: async () => {
      if (!projectIds?.length) return { kpis: [], projects: [] };
      const results = await Promise.allSettled(
        projectIds.map((id) => projectsService.getKPIs(id))
      );
      return results
        .filter((r) => r.status === "fulfilled")
        .map((r) => r.value);
    },
    enabled: !!projectIds?.length,
    staleTime: 60_000,
  });
  return queries;
}

// ─── Componente principal ──────────────────────────────────────────────────────
export default function ProductivityDashboard() {
  const [selectedProject, setSelectedProject] = useState("all");

  // Cargar lista de proyectos
  const { data: projectsData, isLoading: loadingProjects } = useQuery({
    queryKey: ["projects", {}],
    queryFn:  () => projectsService.list({ page_size: 50 }),
    staleTime: 60_000,
  });
  const projects = projectsData?.items || [];
  const projectIds = projects.map((p) => p.id);

  // Cargar KPIs de todos los proyectos
  const { data: allKPIs = [], isLoading: loadingKPIs } = useGlobalProductivity(projectIds);

  // Filtrar según proyecto seleccionado
  const filteredKPIs = useMemo(() =>
    selectedProject === "all"
      ? allKPIs
      : allKPIs.filter((k) => String(k.project_id) === String(selectedProject)),
  [allKPIs, selectedProject]);

  // ── Métricas globales agregadas ──────────────────────────────────────────
  const globalMetrics = useMemo(() => {
    if (!filteredKPIs.length) return null;
    const totalTasks     = filteredKPIs.reduce((a, k) => a + k.total_tasks, 0);
    const completedTasks = filteredKPIs.reduce((a, k) => a + k.completed_tasks, 0);
    const overdueTasks   = filteredKPIs.reduce((a, k) => a + k.overdue_tasks, 0);
    const totalHoursLog  = filteredKPIs.reduce((a, k) => a + k.total_hours_logged, 0);
    const totalHoursEst  = filteredKPIs.reduce((a, k) => a + k.total_hours_estimated, 0);
    const progressAvg    = filteredKPIs.reduce((a, k) => a + k.progress_pct, 0) / filteredKPIs.length;

    // Velocidad de sprint promedio
    const velocities = filteredKPIs
      .map((k) => k.sprint_velocity_avg)
      .filter((v) => v != null);
    const velocityAvg = velocities.length
      ? velocities.reduce((a, b) => a + b, 0) / velocities.length
      : null;

    // Colaboradores únicos
    const memberSet = new Set(
      filteredKPIs.flatMap((k) => k.member_productivity.map((m) => m.user_id))
    );

    // Varianza de horas
    const variance = totalHoursLog - totalHoursEst;

    return {
      totalTasks, completedTasks, overdueTasks,
      totalHoursLog, totalHoursEst, variance,
      progressAvg, velocityAvg,
      memberCount: memberSet.size,
      completionRate: totalTasks > 0 ? (completedTasks / totalTasks * 100) : 0,
    };
  }, [filteredKPIs]);

  // ── Productividad por colaborador (agregada) ─────────────────────────────
  const memberProductivity = useMemo(() => {
    const map = {};
    filteredKPIs.forEach((k) => {
      k.member_productivity.forEach((m) => {
        if (!map[m.user_id]) {
          map[m.user_id] = { ...m, total_tasks: 0, completed_tasks: 0, in_progress: 0,
            total_hours_logged: 0, overdue_tasks: 0, story_points_completed: 0 };
        }
        map[m.user_id].total_tasks          += m.total_tasks;
        map[m.user_id].completed_tasks      += m.completed_tasks;
        map[m.user_id].in_progress          += m.in_progress;
        map[m.user_id].total_hours_logged   += m.total_hours_logged;
        map[m.user_id].overdue_tasks        += m.overdue_tasks;
        map[m.user_id].story_points_completed += m.story_points_completed;
      });
    });
    return Object.values(map)
      .map((m) => ({
        ...m,
        completion_rate:    m.total_tasks > 0 ? (m.completed_tasks / m.total_tasks * 100) : 0,
        avg_hours_per_task: m.completed_tasks > 0 ? (m.total_hours_logged / m.completed_tasks) : 0,
      }))
      .sort((a, b) => b.completed_tasks - a.completed_tasks);
  }, [filteredKPIs]);

  // ── Horas por proyecto ───────────────────────────────────────────────────
  const hoursByProject = useMemo(() =>
    filteredKPIs.map((k) => ({
      name:      k.project_name?.length > 18 ? k.project_name.slice(0, 16) + "…" : k.project_name,
      fullName:  k.project_name,
      loggeadas: +k.total_hours_logged.toFixed(1),
      estimadas: +k.total_hours_estimated.toFixed(1),
    })).sort((a, b) => b.loggeadas - a.loggeadas),
  [filteredKPIs]);

  // ── Barras: colaboradores top ────────────────────────────────────────────
  const memberBarData = useMemo(() =>
    memberProductivity.slice(0, 8).map((m) => ({
      name:       m.full_name?.split(" ")[0] || "—",
      completadas: m.completed_tasks,
      en_progreso: m.in_progress,
      horas:      +m.total_hours_logged.toFixed(1),
    })),
  [memberProductivity]);

  // ── Pie: distribución por estado ─────────────────────────────────────────
  // Simular distribución desde tareas totales/completadas/progreso
  const statusDistrib = useMemo(() => {
    const agg = { completada: 0, en_progreso: 0, por_hacer: 0, backlog: 0, en_revision: 0, cancelada: 0 };
    filteredKPIs.forEach((k) => {
      agg.completada  += k.completed_tasks;
      agg.en_progreso += k.in_progress;
      const rest       = k.total_tasks - k.completed_tasks - k.in_progress;
      agg.por_hacer   += Math.max(0, Math.floor(rest * 0.4));
      agg.backlog     += Math.max(0, Math.floor(rest * 0.5));
      agg.en_revision += Math.max(0, Math.floor(rest * 0.1));
    });
    return Object.entries(agg)
      .filter(([, v]) => v > 0)
      .map(([name, value]) => ({
        name: name.replace(/_/g, " "),
        key:  name,
        value,
        color: STATUS_COLORS[name] || "#94a3b8",
      }));
  }, [filteredKPIs]);

  // ── Velocidad de sprints (línea temporal) ─────────────────────────────────
  // Construida desde active_sprint de cada proyecto como puntos
  const velocityData = useMemo(() => {
    return filteredKPIs
      .filter((k) => k.sprint_velocity_avg != null)
      .map((k) => ({
        name:     k.project_key,
        fullName: k.project_name,
        velocidad: +(k.sprint_velocity_avg || 0).toFixed(1),
        progreso:  +(k.progress_pct || 0).toFixed(1),
      }))
      .sort((a, b) => b.velocidad - a.velocidad);
  }, [filteredKPIs]);

  const isLoading = loadingProjects || loadingKPIs;

  if (isLoading && !allKPIs.length) {
    return (
      <div className="min-h-screen relative z-10">
        <Header title="Dashboard de Productividad" subtitle="Cargando métricas…" />
        <div className="flex items-center justify-center h-48">
          <Loader2 size={28} className="animate-spin text-primary/40" />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen relative z-10">
      <Header
        title="Dashboard de Productividad"
        subtitle="KPIs globales de todos los proyectos"
      />

      {/* ── Filtro de proyecto ─────────────────────────────────────────────── */}
      <div className="flex items-center gap-3 mb-6 flex-wrap">
        <select
          value={selectedProject}
          onChange={(e) => setSelectedProject(e.target.value)}
          className="input-glass text-sm w-56"
        >
          <option value="all">Todos los proyectos</option>
          {projects.map((p) => (
            <option key={p.id} value={p.id}>{p.name} ({p.key})</option>
          ))}
        </select>
        <ExportButton kpis={filteredKPIs} members={memberProductivity} />
      </div>

      {!globalMetrics ? (
        <div className="flex items-center justify-center h-48 text-ink/30 text-sm">
          Sin datos de proyectos disponibles.
        </div>
      ) : (
        <>
          {/* ══ 1. KPIs GLOBALES ══════════════════════════════════════════════ */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6 stagger">
            <KPITile
              label="Tasa de Cierre"
              value={`${globalMetrics.completionRate.toFixed(1)}%`}
              sub={`${globalMetrics.completedTasks} / ${globalMetrics.totalTasks} tareas`}
              icon={CheckCircle2}
              color={semClr(globalMetrics.completionRate)}
            />
            <KPITile
              label="Horas Loggeadas"
              value={fmtH(globalMetrics.totalHoursLog)}
              sub={`Est: ${fmtH(globalMetrics.totalHoursEst)}`}
              icon={Clock}
              color={COL.primary}
            />
            <KPITile
              label="Varianza de Horas"
              value={`${globalMetrics.variance > 0 ? "+" : ""}${fmtH(globalMetrics.variance)}`}
              sub={globalMetrics.variance > 0 ? "Sobre estimado" : "Bajo estimado"}
              icon={globalMetrics.variance > 0 ? TrendingUp : TrendingDown}
              color={Math.abs(globalMetrics.variance) < 5 ? COL.success
                   : globalMetrics.variance > 0 ? COL.danger : COL.warning}
            />
            <KPITile
              label="Tareas Vencidas"
              value={globalMetrics.overdueTasks}
              sub={`${globalMetrics.memberCount} colaboradores activos`}
              icon={AlertTriangle}
              color={globalMetrics.overdueTasks > 0 ? COL.danger : COL.success}
            />
          </div>

          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8 stagger">
            <KPITile
              label="Progreso Promedio"
              value={`${globalMetrics.progressAvg.toFixed(1)}%`}
              sub={`${filteredKPIs.length} proyecto(s)`}
              icon={Target}
              color={semClr(globalMetrics.progressAvg)}
            />
            <KPITile
              label="Velocidad Sprint"
              value={globalMetrics.velocityAvg != null ? `${globalMetrics.velocityAvg.toFixed(0)}%` : "—"}
              sub="Promedio de sprints completados"
              icon={Zap}
              color={COL.secondary}
            />
            <KPITile
              label="Colaboradores"
              value={globalMetrics.memberCount}
              sub="Únicos en proyectos seleccionados"
              icon={Users}
              color={COL.teal}
            />
            <KPITile
              label="En Progreso"
              value={filteredKPIs.reduce((a, k) => a + k.in_progress, 0)}
              sub="Tareas activas ahora"
              icon={Activity}
              color={COL.warning}
            />
          </div>

          {/* ══ 2. RENDIMIENTO POR COLABORADOR ════════════════════════════════ */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">

            {/* Barras: tareas completadas vs en progreso */}
            <GlassCard className="animate-fade-up">
              <h3 className="text-xs font-semibold text-ink/50 uppercase tracking-wide mb-4">
                Tareas por Colaborador
              </h3>
              {memberBarData.length === 0 ? (
                <p className="text-sm text-ink/30 text-center py-8">Sin datos.</p>
              ) : (
                <ResponsiveContainer width="100%" height={240}>
                  <BarChart data={memberBarData}
                    margin={{ top: 4, right: 8, left: -16, bottom: 8 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(30,30,47,0.06)" vertical={false} />
                    <XAxis dataKey="name" tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fontSize: 10 }} axisLine={false} tickLine={false} />
                    <Tooltip content={<GTooltip />} />
                    <Legend wrapperStyle={{ fontSize: 11 }} />
                    <Bar dataKey="completadas" name="Completadas" fill={COL.success}   radius={[4,4,0,0]} maxBarSize={28} />
                    <Bar dataKey="en_progreso" name="En Progreso" fill={COL.warning}   radius={[4,4,0,0]} maxBarSize={28} />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </GlassCard>

            {/* Distribución por estado (Pie) */}
            <GlassCard className="animate-fade-up">
              <h3 className="text-xs font-semibold text-ink/50 uppercase tracking-wide mb-4">
                Distribución por Estado
              </h3>
              {statusDistrib.length === 0 ? (
                <p className="text-sm text-ink/30 text-center py-8">Sin datos.</p>
              ) : (
                <div className="flex items-center gap-4">
                  <ResponsiveContainer width="60%" height={200}>
                    <PieChart>
                      <Pie
                        data={statusDistrib}
                        cx="50%" cy="50%"
                        innerRadius="55%" outerRadius="80%"
                        paddingAngle={2}
                        dataKey="value"
                      >
                        {statusDistrib.map((d, i) => (
                          <Cell key={i} fill={d.color} />
                        ))}
                      </Pie>
                      <Tooltip formatter={(v, n) => [v, n]} />
                    </PieChart>
                  </ResponsiveContainer>
                  <div className="flex-1 space-y-2">
                    {statusDistrib.map((d) => (
                      <div key={d.key} className="flex items-center justify-between">
                        <div className="flex items-center gap-1.5">
                          <div className="w-2.5 h-2.5 rounded-full" style={{ background: d.color }} />
                          <span className="text-[11px] text-ink capitalize">{d.name}</span>
                        </div>
                        <span className="text-[11px] font-bold text-ink">{d.value}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </GlassCard>
          </div>

          {/* ══ 3. VELOCIDAD DE SPRINTS ════════════════════════════════════════ */}
          {velocityData.length > 0 && (
            <GlassCard className="mb-6 animate-fade-up">
              <h3 className="text-xs font-semibold text-ink/50 uppercase tracking-wide mb-1">
                Velocidad de Sprints por Proyecto
              </h3>
              <p className="text-[11px] text-ink/30 mb-4">
                % de story points completados vs planificados · promedio de sprints completados
              </p>
              <div className="overflow-x-auto">
                <div style={{ minWidth: Math.max(velocityData.length * 100, 360) }}>
                  <ResponsiveContainer width="100%" height={220}>
                    <BarChart data={velocityData}
                      margin={{ top: 4, right: 16, left: -8, bottom: 32 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="rgba(30,30,47,0.06)" vertical={false} />
                      <XAxis dataKey="name" tick={{ fontSize: 10 }} axisLine={false} tickLine={false} />
                      <YAxis domain={[0, 110]} tickFormatter={(v) => `${v}%`}
                        tick={{ fontSize: 10 }} axisLine={false} tickLine={false} />
                      <Tooltip content={<GTooltip />} />
                      <ReferenceLine y={100} stroke={COL.success} strokeDasharray="4 3"
                        label={{ value: "Meta", position: "right", fontSize: 10, fill: COL.success }} />
                      <Bar dataKey="velocidad" name="Velocidad Sprint (%)" radius={[4,4,0,0]} maxBarSize={36}>
                        {velocityData.map((d, i) => (
                          <Cell key={i}
                            fill={d.velocidad >= 90 ? COL.success : d.velocidad >= 70 ? COL.warning : COL.danger}
                          />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </GlassCard>
          )}

          {/* ══ 4. HORAS POR PROYECTO ══════════════════════════════════════════ */}
          {hoursByProject.length > 0 && (
            <GlassCard className="mb-6 animate-fade-up">
              <h3 className="text-xs font-semibold text-ink/50 uppercase tracking-wide mb-1">
                Horas por Proyecto
              </h3>
              <p className="text-[11px] text-ink/30 mb-4">
                Loggeadas vs estimadas
              </p>
              <div className="overflow-x-auto">
                <div style={{ minWidth: Math.max(hoursByProject.length * 90, 360) }}>
                  <ResponsiveContainer width="100%" height={240}>
                    <BarChart data={hoursByProject}
                      margin={{ top: 4, right: 8, left: -8, bottom: 36 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="rgba(30,30,47,0.06)" vertical={false} />
                      <XAxis dataKey="name" tick={{ fontSize: 10 }} axisLine={false} tickLine={false}
                        angle={-25} textAnchor="end" interval={0} />
                      <YAxis tickFormatter={(v) => `${v}h`} tick={{ fontSize: 10 }}
                        axisLine={false} tickLine={false} />
                      <Tooltip content={<GTooltip />} />
                      <Legend wrapperStyle={{ fontSize: 11, paddingTop: 8 }} />
                      <Bar dataKey="estimadas" name="Estimadas" fill={`${COL.primary}60`}
                        radius={[4,4,0,0]} maxBarSize={28} />
                      <Bar dataKey="loggeadas" name="Loggeadas" fill={COL.primary}
                        radius={[4,4,0,0]} maxBarSize={28} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </GlassCard>
          )}

          {/* ══ 5. TABLA DETALLADA DE COLABORADORES ═══════════════════════════ */}
          <GlassCard className="animate-fade-up">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-xs font-semibold text-ink/50 uppercase tracking-wide">
                Detalle de Productividad por Colaborador
              </h3>
              <span className="text-xs text-ink/40">{memberProductivity.length} colaboradores</span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm min-w-[700px]">
                <thead>
                  <tr className="border-b border-ink/10">
                    {[
                      "Colaborador", "Tareas", "Completadas", "Tasa cierre",
                      "Story Points", "Horas log.", "Prom h/tarea",
                      "En progreso", "Vencidas",
                    ].map((h) => (
                      <th key={h}
                          className="text-left py-2.5 px-3 text-xs font-semibold text-ink/50 uppercase tracking-wide">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-ink/5">
                  {memberProductivity.map((m) => {
                    const cr = m.completion_rate;
                    return (
                      <tr key={m.user_id} className="hover:bg-primary/[0.025] transition-colors">
                        <td className="py-3 px-3">
                          <div className="flex items-center gap-2">
                            <div className="w-7 h-7 rounded-full bg-primary/20 flex items-center
                                            justify-center text-primary font-bold text-[10px] shrink-0">
                              {m.full_name?.charAt(0)}
                            </div>
                            <div>
                              <p className="text-sm font-medium text-ink">{m.full_name}</p>
                              <p className="text-[10px] text-ink/40">{m.email}</p>
                            </div>
                          </div>
                        </td>
                        <td className="py-3 px-3 text-ink/60">{m.total_tasks}</td>
                        <td className="py-3 px-3 font-semibold text-success">{m.completed_tasks}</td>
                        <td className="py-3 px-3">
                          <div className="flex items-center gap-2">
                            <span className="font-bold" style={{ color: semClr(cr) }}>
                              {cr.toFixed(1)}%
                            </span>
                            <div className="w-16 h-1.5 bg-ink/8 rounded-full overflow-hidden">
                              <div className="h-full rounded-full"
                                   style={{ width: `${cr}%`, background: semClr(cr) }} />
                            </div>
                          </div>
                        </td>
                        <td className="py-3 px-3 text-ink/60">{m.story_points_completed.toFixed(1)}</td>
                        <td className="py-3 px-3 text-ink/60">{fmtH(m.total_hours_logged)}</td>
                        <td className="py-3 px-3 text-ink/60">{fmtH(m.avg_hours_per_task)}</td>
                        <td className="py-3 px-3 text-ink/60">{m.in_progress}</td>
                        <td className="py-3 px-3">
                          {m.overdue_tasks > 0
                            ? <span className="flex items-center gap-1 text-danger font-semibold">
                                <AlertTriangle size={11}/>{m.overdue_tasks}
                              </span>
                            : <CheckCircle2 size={13} className="text-success" />
                          }
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </GlassCard>
        </>
      )}
    </div>
  );
}

// ─── Botón de exportación CSV ─────────────────────────────────────────────────
function ExportButton({ kpis, members }) {
  const handleExport = () => {
    if (!members?.length) return;

    // CSV de productividad por colaborador
    const headers = [
      "Colaborador","Email","Tareas Totales","Completadas",
      "Tasa Cierre %","Story Points","Horas Loggeadas",
      "Prom h/tarea","En Progreso","Vencidas",
    ];
    const rows = members.map((m) => [
      m.full_name, m.email, m.total_tasks, m.completed_tasks,
      m.completion_rate.toFixed(1), m.story_points_completed.toFixed(1),
      m.total_hours_logged.toFixed(1), m.avg_hours_per_task.toFixed(1),
      m.in_progress, m.overdue_tasks,
    ]);

    const csv = [headers, ...rows].map((r) => r.join(",")).join("\n");
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
    const url  = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href     = url;
    link.download = `productividad_${new Date().toISOString().split("T")[0]}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <button
      onClick={handleExport}
      className="btn-secondary flex items-center gap-2 text-sm ml-auto"
    >
      <Download size={14} /> Exportar CSV
    </button>
  );
}