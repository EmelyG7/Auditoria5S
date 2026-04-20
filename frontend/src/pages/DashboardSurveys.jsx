import { useQuery } from "@tanstack/react-query";
import { Star, ThumbsUp, ThumbsDown, Users } from "lucide-react";
import { surveysService } from "../services/surveys";
import { useFilters } from "../hooks/useFilters";
import Header from "../components/Layout/Header";
import GlassCard from "../components/Layout/GlassCard";
import KPICard from "../components/Dashboard/KPICard";
import FilterBar from "../components/Common/FilterBar";
import RadarChartS from "../components/Dashboard/RadarChartS";
import { fmt } from "../utils/format";
import { BarChart, Bar, XAxis, YAxis, Tooltip, Legend, ResponsiveContainer, Cell } from "recharts";

export default function DashboardSurveys() {
  const { filters, activeFilters, setFilter, resetFilters } = useFilters({});

  const { data: kpis, isLoading, refetch } = useQuery({
    queryKey: ["survey-kpis", activeFilters],
    queryFn:  () => surveysService.getKPIs(activeFilters),
  });

  if (isLoading) return <div className="animate-pulse space-y-4">{[...Array(3)].map((_, i) => <div key={i} className="h-32 bg-ink/10 rounded-3xl" />)}</div>;
  if (!kpis)     return null;

  const radarData = (kpis.dimensiones || []).map((d) => ({
    s:     d.nombre,
    value: d.promedio * 100,
  }));

  const deptData = (kpis.por_departamento || []).slice(0, 12).map((d) => ({
    name:   d.departamento.length > 14 ? d.departamento.slice(0, 12) + "…" : d.departamento,
    interna: d.sat_interna != null ? +(d.sat_interna * 100).toFixed(1) : 0,
    externa: d.sat_externa != null ? +(d.sat_externa * 100).toFixed(1) : 0,
  }));

  return (
    <div className="min-h-screen relative z-10">
      <Header title="Dashboard Satisfacción" subtitle="Indicadores de satisfacción de clientes" onRefresh={refetch} />

      <FilterBar
        filters={filters}
        onFilterChange={setFilter}
        onReset={resetFilters}
        showType={false}
        showBranch={false}
      />

      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6 stagger">
        <KPICard title="Satisfacción Interna" value={fmt.score01(kpis.sat_interna_global)} icon={Users}
          color={kpis.sat_interna_global >= 0.8 ? "success" : kpis.sat_interna_global >= 0.6 ? "warning" : "danger"}
          subtitle="Promedio global" />
        <KPICard title="Satisfacción Externa" value={fmt.score01(kpis.sat_externa_global)} icon={Star}
          color="secondary" subtitle="Clientes externos" />
        <KPICard title="Mejor Dimensión" value={kpis.mejor_dimension || "—"} icon={ThumbsUp} color="success" subtitle="Dimensión más alta" />
        <KPICard title="Dimensión a Mejorar" value={kpis.peor_dimension || "—"} icon={ThumbsDown} color="warning" subtitle="Dimensión más baja" />
      </div>

      {/* Gráficas */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 mb-5">
        <GlassCard>
          <h3 className="text-sm font-semibold text-ink/70 uppercase tracking-wide mb-4">5 Dimensiones</h3>
          <RadarChartS data={radarData} height={260} />
        </GlassCard>

        <GlassCard>
          <h3 className="text-sm font-semibold text-ink/70 uppercase tracking-wide mb-4">Interno vs Externo por Departamento</h3>
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={deptData} margin={{ top: 4, right: 8, left: 0, bottom: 4 }}>
              <XAxis dataKey="name" tick={{ fontSize: 10, fill: "#1E1E2F80" }} axisLine={false} tickLine={false} />
              <YAxis domain={[0, 100]} tick={{ fontSize: 10, fill: "#1E1E2F80" }} tickFormatter={(v) => `${v}%`} axisLine={false} tickLine={false} />
              <Tooltip formatter={(v) => [`${v}%`]} contentStyle={{ borderRadius: 12, border: "1px solid rgba(255,255,255,0.7)", background: "rgba(255,255,255,0.9)", fontSize: 11 }} />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <Bar dataKey="interna" name="Interna" fill="#0A4F79" radius={[4, 4, 0, 0]} maxBarSize={20} />
              <Bar dataKey="externa" name="Externa" fill="#B4427F" radius={[4, 4, 0, 0]} maxBarSize={20} />
            </BarChart>
          </ResponsiveContainer>
        </GlassCard>
      </div>

      {/* Tabla por sede */}
      {kpis.por_sede?.length > 0 && (
        <GlassCard>
          <h3 className="text-sm font-semibold text-ink/70 uppercase tracking-wide mb-4">Por Sede</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-ink/10">
                  {["Sede", "Sat. Interna", "Sat. Externa", "Registros", "Estado"].map((h) => (
                    <th key={h} className="text-left py-2 px-3 text-xs font-semibold text-ink/50 uppercase tracking-wide">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-ink/5">
                {kpis.por_sede.map((s) => (
                  <tr key={s.site} className="hover:bg-primary/3 transition-colors">
                    <td className="py-3 px-3 font-medium text-ink">{s.site}</td>
                    <td className="py-3 px-3 font-semibold text-primary">{fmt.score01(s.sat_interna)}</td>
                    <td className="py-3 px-3 font-semibold text-secondary">{fmt.score01(s.sat_externa)}</td>
                    <td className="py-3 px-3 text-ink/60">{s.n_registros}</td>
                    <td className="py-3 px-3">
                      <span className={s.sat_interna >= 0.8 ? "badge-cumple" : s.sat_interna >= 0.6 ? "badge-por-mejorar" : "badge-critico"}>
                        {s.sat_interna >= 0.8 ? "Alto" : s.sat_interna >= 0.6 ? "Medio" : "Bajo"}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </GlassCard>
      )}
    </div>
  );
}