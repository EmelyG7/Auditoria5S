import { useQuery } from "@tanstack/react-query";
import { ClipboardCheck, TrendingUp, Building2, AlertCircle } from "lucide-react";
import { auditsService } from "../services/audits";
import { useFilters } from "../hooks/useFilters";
import Header from "../components/Layout/Header";
import GlassCard from "../components/Layout/GlassCard";
import KPICard from "../components/Dashboard/KPICard";
import FilterBar from "../components/Common/FilterBar";
import BarChartHorizontal from "../components/Dashboard/BarChartHorizontal";
import RadarChartS from "../components/Dashboard/RadarChartS";
import LineChartEvolution from "../components/Dashboard/LineChartEvolution";
import { fmt } from "../utils/format";

const S_LABELS = {
  seiri:    "Seiri",
  seiton:   "Seiton",
  seiso:    "Seiso",
  seiketsu: "Seiketsu",
  shitsuke: "Shitsuke",
};

export default function DashboardAudits() {
  const { filters, activeFilters, setFilter, resetFilters } = useFilters({});

  const { data: types = [] } = useQuery({
    queryKey: ["audit-types"],
    queryFn:  auditsService.getTypes,
  });

  const { data: kpis, isLoading, refetch } = useQuery({
    queryKey: ["audit-kpis", activeFilters],
    queryFn:  () => auditsService.getKPIs(activeFilters),
  });

  if (isLoading) return <DashboardSkeleton />;
  if (!kpis)     return null;

  // Datos para radar
  const radarData = Object.entries(S_LABELS).map(([key, label]) => ({
    s:     label,
    value: kpis.promedio_por_s?.[key] ?? 0,
  }));

  // Datos para barras horizontales por sucursal
  const branchData = (kpis.por_sucursal || []).map((s) => ({
    name:   s.branch,
    value:  s.promedio_pct,
    estado: s.estado,
  }));

  // Ramas únicas para el filtro
  const branches = (kpis.por_sucursal || []).map((s) => s.branch);

  return (
    <div className="min-h-screen relative z-10">
      <Header
        title="Dashboard Auditorías 5S"
        subtitle="Resumen ejecutivo de cumplimiento"
        onRefresh={refetch}
      />

      <FilterBar
        filters={filters}
        onFilterChange={setFilter}
        onReset={resetFilters}
        auditTypes={types}
        branches={branches}
      />

      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6 stagger">
        <KPICard
          title="Promedio General"
          value={fmt.pct(kpis.promedio_global)}
          icon={TrendingUp}
          color={kpis.promedio_global >= 80 ? "success" : kpis.promedio_global >= 60 ? "warning" : "danger"}
          subtitle={kpis.estado_global}
        />
        <KPICard
          title="Total Auditorías"
          value={kpis.total_auditorias}
          icon={ClipboardCheck}
          color="primary"
        />
        <KPICard
          title="Sucursales Cumplen"
          value={fmt.pct(kpis.sucursales_cumple_pct)}
          icon={Building2}
          color="success"
          subtitle="≥ 80% de cumplimiento"
        />
        <KPICard
          title="Estado Crítico"
          value={fmt.pct(kpis.sucursales_critico_pct)}
          icon={AlertCircle}
          color="danger"
          subtitle="< 60% de cumplimiento"
        />
      </div>

      {/* Gráficas fila 1 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 mb-5">
        <GlassCard>
          <h3 className="text-sm font-semibold text-ink/70 uppercase tracking-wide mb-4">
            Puntaje por Sucursal
          </h3>
          {branchData.length > 0
            ? <BarChartHorizontal data={branchData} height={Math.max(200, branchData.length * 44)} />
            : <EmptyState />
          }
        </GlassCard>

        <GlassCard>
          <h3 className="text-sm font-semibold text-ink/70 uppercase tracking-wide mb-4">
            Desempeño por cada S
          </h3>
          <RadarChartS data={radarData} height={280} />
        </GlassCard>
      </div>

      {/* Tabla por tipo */}
      {kpis.por_tipo?.length > 0 && (
        <GlassCard className="mb-5">
          <h3 className="text-sm font-semibold text-ink/70 uppercase tracking-wide mb-4">
            Resumen por Tipo de Auditoría
          </h3>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-ink/10">
                  {["Tipo", "Auditorías", "Promedio", "Estado"].map((h) => (
                    <th key={h} className="text-left py-2 px-3 text-xs font-semibold text-ink/50 uppercase tracking-wide">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-ink/5">
                {kpis.por_tipo.map((t) => (
                  <tr key={t.tipo} className="hover:bg-primary/3 transition-colors">
                    <td className="py-3 px-3 font-medium text-ink">{t.tipo}</td>
                    <td className="py-3 px-3 text-ink/70">{t.n_auditorias}</td>
                    <td className="py-3 px-3 font-semibold" style={{ color: fmt.semaforoColor(t.promedio) }}>
                      {fmt.pct(t.promedio)}
                    </td>
                    <td className="py-3 px-3">
                      <span className={fmt.badgeClass(t.estado)}>{t.estado}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </GlassCard>
      )}

      {/* Mejor / Peor sucursal */}
      {kpis.mejor_sucursal && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 stagger">
          <GlassCard className="border-l-4 border-success">
            <p className="text-xs font-semibold text-ink/50 uppercase tracking-wide mb-1">🏆 Mejor Sucursal</p>
            <p className="text-xl font-semibold text-ink">{kpis.mejor_sucursal}</p>
            <p className="text-success text-sm font-semibold mt-0.5">{fmt.pct(kpis.mejor_sucursal_pct)}</p>
          </GlassCard>
          <GlassCard className="border-l-4 border-danger">
            <p className="text-xs font-semibold text-ink/50 uppercase tracking-wide mb-1">⚠️ Mayor Oportunidad</p>
            <p className="text-xl font-semibold text-ink">{kpis.peor_sucursal}</p>
            <p className="text-danger text-sm font-semibold mt-0.5">{fmt.pct(kpis.peor_sucursal_pct)}</p>
          </GlassCard>
        </div>
      )}
    </div>
  );
}

function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center h-40 text-ink/30">
      <ClipboardCheck size={32} className="mb-2" />
      <p className="text-sm">Sin datos para los filtros seleccionados</p>
    </div>
  );
}

function DashboardSkeleton() {
  return (
    <div className="space-y-5 animate-pulse">
      <div className="h-8 bg-ink/10 rounded-xl w-64" />
      <div className="grid grid-cols-4 gap-4">
        {[...Array(4)].map((_, i) => <div key={i} className="h-28 bg-ink/10 rounded-3xl" />)}
      </div>
      <div className="grid grid-cols-2 gap-5">
        <div className="h-72 bg-ink/10 rounded-3xl" />
        <div className="h-72 bg-ink/10 rounded-3xl" />
      </div>
    </div>
  );
}