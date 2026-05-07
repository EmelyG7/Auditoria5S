import { useState, useRef, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  ClipboardCheck, TrendingUp, Building2, AlertCircle,
  FileText, Loader2,
} from "lucide-react";
import { auditsService } from "../services/audits";
import { useFilters } from "../hooks/useFilters";
import Header from "../components/Layout/Header";
import GlassCard from "../components/Layout/GlassCard";
import KPICard from "../components/Dashboard/KPICard";
import FilterBar from "../components/Common/FilterBar";
import BarChartHorizontal from "../components/Dashboard/BarChartHorizontal";
import RadarChartS from "../components/Dashboard/RadarChartS";
import AuditPDFContent from "../components/Reports/AuditPDFContent";
import { fmt } from "../utils/format";

const S_LABELS = {
  seiri:    "Clasificar",
  seiton:   "Ordenar",
  seiso:    "Limpiar",
  seiketsu: "Estandarizar",
  shitsuke: "Disciplina",
};

// ── Helper para capturar y guardar el PDF ────────────────────────────────────
async function capturePDF(pdfRef, filename) {
  await new Promise((r) => setTimeout(r, 1500));
  const { jsPDF }   = await import("jspdf");
  const html2canvas = (await import("html2canvas")).default;
  const pages = pdfRef.current?.querySelectorAll(".pdf-page");
  if (!pages?.length) throw new Error("No se encontraron páginas.");
  const pdf = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  for (let i = 0; i < pages.length; i++) {
    if (i > 0) pdf.addPage();
    const canvas = await html2canvas(pages[i], {
      scale: 2, useCORS: true, allowTaint: true,
      backgroundColor: "#ffffff", logging: false,
    });
    const imgData = canvas.toDataURL("image/jpeg", 0.93);
    const pdfW = 210;
    const pdfH = Math.min((canvas.height / canvas.width) * pdfW, 297);
    pdf.addImage(imgData, "JPEG", 0, 0, pdfW, pdfH);
  }
  pdf.save(filename);
}

export default function DashboardAudits() {
  const { filters, activeFilters, setFilter, resetFilters } = useFilters({});

  // PDF state
  const [pdfData,       setPdfData]       = useState(null);
  const [generatingPDF, setGeneratingPDF] = useState(false);
  const pdfRef = useRef(null);

  const { data: types = [] } = useQuery({
    queryKey: ["audit-types"],
    queryFn:  auditsService.getTypes,
  });

  const { data: kpis, isLoading, refetch } = useQuery({
    queryKey: ["audit-kpis", activeFilters],
    queryFn:  () => auditsService.getKPIs(activeFilters),
  });

  // PDF capture effect
  useEffect(() => {
    if (!pdfData) return;
    const capture = async () => {
      try {
        const filename = `dashboard_auditorias_${new Date().toISOString().slice(0, 10)}.pdf`;
        await capturePDF(pdfRef, filename);
      } catch (err) {
        console.error("PDF error:", err);
      } finally {
        setPdfData(null);
        setGeneratingPDF(false);
      }
    };
    capture();
  }, [pdfData]);

  const handleGeneratePDF = () => {
    if (!kpis || generatingPDF) return;
    setGeneratingPDF(true);
    setPdfData({ auditKPIs: kpis, surveyKPIs: null, generatedAt: new Date().toISOString() });
  };

  if (isLoading) return <DashboardSkeleton />;
  if (!kpis)     return null;

  // Datos para radar global
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

  // Tipos con desglose por S (para análisis por área)
  const tiposConS = (kpis.por_tipo || []).filter((t) => t.promedio_por_s);

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

      {/* Botón PDF */}
      <div className="flex justify-end mb-5">
        <button
          onClick={handleGeneratePDF}
          disabled={generatingPDF || !kpis}
          className="btn-secondary flex items-center gap-2 text-sm"
        >
          {generatingPDF
            ? <Loader2 size={15} className="animate-spin" />
            : <FileText size={15} />}
          {generatingPDF ? "Generando PDF…" : "Descargar PDF"}
        </button>
      </div>

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

      {/* ── Análisis General por Tipo de Área ─────────────────────────────── */}
      {tiposConS.length > 0 && (
        <GlassCard className="mb-5">
          <h3 className="text-sm font-semibold text-ink/70 uppercase tracking-wide mb-1">
            Análisis General por Tipo de Área
          </h3>
          <p className="text-xs text-ink/40 mb-5">
            Desglose de las 5S por cada tipo de área auditada, aplicado a los filtros seleccionados.
          </p>

          <div className={`grid gap-5 ${tiposConS.length === 1 ? "grid-cols-1" : tiposConS.length === 2 ? "grid-cols-1 md:grid-cols-2" : "grid-cols-1 md:grid-cols-3"}`}>
            {tiposConS.map((tipo) => {
              const color = tipo.promedio >= 80
                ? "success"
                : tipo.promedio >= 60 ? "warning" : "danger";
              const colorHex = tipo.promedio >= 80
                ? "#98C062"
                : tipo.promedio >= 60 ? "#EA9947" : "#DF4585";

              const radarTipo = Object.entries(S_LABELS).map(([key, label]) => ({
                s:     label,
                value: tipo.promedio_por_s?.[key] ?? 0,
              }));

              return (
                <div
                  key={tipo.tipo}
                  className="rounded-2xl border p-4"
                  style={{
                    borderColor: `${colorHex}30`,
                    background:  `${colorHex}06`,
                  }}
                >
                  {/* Header del tipo */}
                  <div className="flex items-center justify-between mb-3">
                    <div>
                      <p className="text-sm font-semibold text-ink">{tipo.tipo}</p>
                      <p className="text-xs text-ink/40">{tipo.n_auditorias} auditoría{tipo.n_auditorias !== 1 ? "s" : ""}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-2xl font-bold" style={{ color: colorHex }}>
                        {fmt.pct(tipo.promedio)}
                      </p>
                      <span className={`text-xs px-2 py-0.5 rounded-full border font-semibold ${fmt.badgeClass(tipo.estado)}`}>
                        {tipo.estado}
                      </span>
                    </div>
                  </div>

                  {/* Radar por S */}
                  <RadarChartS data={radarTipo} height={200} />

                  {/* Tabla mini de valores por S */}
                  <div className="mt-3 space-y-1.5">
                    {radarTipo.map((d) => (
                      <div key={d.s} className="flex items-center gap-2">
                        <span className="text-xs text-ink/60 w-20 shrink-0">{d.s}</span>
                        <div className="flex-1 h-1.5 bg-ink/8 rounded-full overflow-hidden">
                          <div
                            className="h-full rounded-full transition-all duration-700"
                            style={{
                              width: `${Math.min(d.value, 100)}%`,
                              background: d.value >= 80 ? "#98C062" : d.value >= 60 ? "#EA9947" : "#DF4585",
                            }}
                          />
                        </div>
                        <span
                          className="text-xs font-semibold w-12 text-right"
                          style={{ color: d.value >= 80 ? "#98C062" : d.value >= 60 ? "#EA9947" : "#DF4585" }}
                        >
                          {fmt.pct(d.value)}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Leyenda semáforo */}
          <div className="flex items-center gap-4 mt-4 flex-wrap">
            {[["≥80% Cumple", "#98C062"], ["60-79% Por mejorar", "#EA9947"], ["<60% Crítico", "#DF4585"]]
              .map(([lbl, c]) => (
                <div key={lbl} className="flex items-center gap-1.5">
                  <div className="w-2.5 h-2.5 rounded-full" style={{ background: c }} />
                  <span className="text-[10px] text-ink/50">{lbl}</span>
                </div>
              ))}
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

      {/* PDF oculto para captura */}
      {pdfData && (
        <AuditPDFContent
          ref={pdfRef}
          auditKPIs={pdfData.auditKPIs}
          filters={activeFilters}
          generatedAt={pdfData.generatedAt}
        />
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
