import { useState, useRef, useCallback, useEffect } from "react";
import {
  Download, ClipboardCheck, Star,
  FileText, Loader2,
} from "lucide-react";
import Header    from "../components/Layout/Header";
import GlassCard from "../components/Layout/GlassCard";
import { auditsService }              from "../services/audits";
import { surveysService }             from "../services/surveys";
import { generateConclusions }        from "../services/reportService";
import ReportPDFContent               from "../components/Reports/ReportPDFContent";

// ─────────────────────────────────────────────────────────────────────────────
// Constantes
// ─────────────────────────────────────────────────────────────────────────────
const CURRENT_YEAR = new Date().getFullYear();
const YEARS        = Array.from({ length: 5 }, (_, i) => CURRENT_YEAR - i);
const QUARTERS     = ["Q1", "Q2", "Q3", "Q4"];

const COLOR_MAP = {
  primary:   "bg-primary",
  secondary: "bg-secondary",
  success:   "bg-success",
};

// ─────────────────────────────────────────────────────────────────────────────
// Componente
// ─────────────────────────────────────────────────────────────────────────────
export default function ReportsPage() {
  // Filtros
  const [year,        setYear]        = useState("");
  const [quarter,     setQuarter]     = useState("");
  const [auditTypeId, setAuditTypeId] = useState("");
  const [auditTypes,  setAuditTypes]  = useState([]);

  // Estados de carga / error por botón
  const [loading,  setLoading]  = useState({});
  const [errors,   setErrors]   = useState({});

  // Estado del PDF
  const [pdfData,       setPdfData]       = useState(null);
  const [generatingPDF, setGeneratingPDF] = useState(false);

  const pdfRef = useRef(null);

  // Cargar tipos de auditoría al montar
  useEffect(() => {
    auditsService.getTypes().then(setAuditTypes).catch(() => {});
  }, []);

  // ── Helpers ──────────────────────────────────────────────────────────────
  const withLoading = useCallback(async (key, fn) => {
    setLoading((l) => ({ ...l, [key]: true }));
    setErrors((e)  => ({ ...e, [key]: null }));
    try {
      await fn();
    } catch (err) {
      const msg = err?.response?.data?.detail ?? "Error al procesar la solicitud.";
      setErrors((e) => ({ ...e, [key]: msg }));
    } finally {
      setLoading((l) => ({ ...l, [key]: false }));
    }
  }, []);

  const auditParams  = useCallback(() => {
    const p = {};
    if (year)        p.year          = year;
    if (quarter)     p.quarter       = quarter;
    if (auditTypeId) p.audit_type_id = auditTypeId;
    return p;
  }, [year, quarter, auditTypeId]);

  const surveyParams = useCallback(() => {
    const p = {};
    if (year)    p.year    = year;
    if (quarter) p.quarter = quarter;
    return p;
  }, [year, quarter]);

  // ── Handlers Excel ───────────────────────────────────────────────────────
  const handleSummary = () =>
    withLoading("summary", () => auditsService.exportSummary(auditParams()));

  const handleDetail  = () =>
    withLoading("detail",  () => auditsService.exportDetail(auditParams()));

  const handleSurveys = () =>
    withLoading("surveys", () => surveysService.exportExcel(surveyParams()));

  // ── Handler PDF ──────────────────────────────────────────────────────────
  const handleGeneratePDF = async () => {
    setGeneratingPDF(true);
    setErrors((e) => ({ ...e, pdf: null }));
    try {
      const [auditKPIs, surveyKPIs] = await Promise.all([
        auditsService.getKPIs(auditParams()),
        surveysService.getKPIs(surveyParams()),
      ]);
      setPdfData({ auditKPIs, surveyKPIs, generatedAt: new Date().toISOString() });
    } catch {
      setErrors((e) => ({ ...e, pdf: "Error al obtener datos. Intente nuevamente." }));
      setGeneratingPDF(false);
    }
  };

  // Cuando pdfData se establece, espera el render y captura
  useEffect(() => {
    if (!pdfData) return;

    const capture = async () => {
      try {
        // Dar tiempo a Recharts para renderizar los SVGs
        await new Promise((r) => setTimeout(r, 1500));

        const { jsPDF }    = await import("jspdf");
        const html2canvas  = (await import("html2canvas")).default;

        const pages = pdfRef.current?.querySelectorAll(".pdf-page");
        if (!pages?.length) throw new Error("No se encontraron páginas.");

        const pdf = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });

        for (let i = 0; i < pages.length; i++) {
          if (i > 0) pdf.addPage();

          const canvas = await html2canvas(pages[i], {
            scale:           2,
            useCORS:         true,
            allowTaint:      true,
            backgroundColor: "#ffffff",
            logging:         false,
          });

          const imgData = canvas.toDataURL("image/jpeg", 0.93);
          const pdfW    = 210;
          const pdfH    = Math.min((canvas.height / canvas.width) * pdfW, 297);
          pdf.addImage(imgData, "JPEG", 0, 0, pdfW, pdfH);
        }

        const filename = `reporte_ejecutivo_${new Date().toISOString().slice(0, 10)}.pdf`;
        pdf.save(filename);
      } catch (err) {
        console.error("PDF error:", err);
        setErrors((e) => ({ ...e, pdf: "Error al generar el PDF. Intente nuevamente." }));
      } finally {
        setPdfData(null);
        setGeneratingPDF(false);
      }
    };

    capture();
  }, [pdfData]);

  // Conclusiones (solo se calculan cuando hay datos de PDF)
  const conclusions = pdfData
    ? generateConclusions(pdfData.auditKPIs, pdfData.surveyKPIs)
    : { conclusions: [], recommendations: [] };

  const hasSurveys  = pdfData?.surveyKPIs?.total_registros > 0;
  const totalPages  = 2 + (hasSurveys ? 1 : 0) + 1; // cover + audits + [surveys] + conclusions

  // ── Configuración de tarjetas Excel ─────────────────────────────────────
  const EXCEL_CARDS = [
    {
      key:     "summary",
      title:   "Resumen de Auditorías",
      desc:    "Listado completo con puntajes por S, semáforo y hoja pivot por sucursal / trimestre.",
      icon:    ClipboardCheck,
      color:   "primary",
      handler: handleSummary,
    },
    {
      key:     "detail",
      title:   "Detalle de Preguntas",
      desc:    "Todas las preguntas respondidas con observaciones, puntos obtenidos/perdidos y criticidad.",
      icon:    ClipboardCheck,
      color:   "secondary",
      handler: handleDetail,
    },
    {
      key:     "surveys",
      title:   "Encuestas de Satisfacción",
      desc:    "Registros de satisfacción interna y externa con las 5 dimensiones por departamento y sede.",
      icon:    Star,
      color:   "success",
      handler: handleSurveys,
    },
  ];

  // ── Render ───────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen relative z-10">
      <Header
        title="Reportes y Exportaciones"
        subtitle="Descarga datos en Excel o genera el reporte ejecutivo en PDF"
      />

      {/* ── Filtros ──────────────────────────────────────────────────────── */}
      <GlassCard className="mb-6">
        <h3 className="text-sm font-semibold text-ink mb-4">Filtros de exportación</h3>
        <div className="flex flex-wrap gap-4 items-end">
          {/* Año */}
          <label className="flex flex-col gap-1">
            <span className="text-xs text-ink/60">Año</span>
            <select
              value={year}
              onChange={(e) => setYear(e.target.value)}
              className="rounded-xl border border-white/30 bg-white/60 backdrop-blur-sm px-3 py-2 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-primary/30"
            >
              <option value="">Todos los años</option>
              {YEARS.map((y) => (
                <option key={y} value={y}>{y}</option>
              ))}
            </select>
          </label>

          {/* Trimestre */}
          <label className="flex flex-col gap-1">
            <span className="text-xs text-ink/60">Trimestre</span>
            <select
              value={quarter}
              onChange={(e) => setQuarter(e.target.value)}
              className="rounded-xl border border-white/30 bg-white/60 backdrop-blur-sm px-3 py-2 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-primary/30"
            >
              <option value="">Todos</option>
              {QUARTERS.map((q) => (
                <option key={q} value={q}>{q}</option>
              ))}
            </select>
          </label>

          {/* Tipo de auditoría (solo afecta exportaciones de auditorías) */}
          {auditTypes.length > 0 && (
            <label className="flex flex-col gap-1">
              <span className="text-xs text-ink/60">Tipo de Auditoría</span>
              <select
                value={auditTypeId}
                onChange={(e) => setAuditTypeId(e.target.value)}
                className="rounded-xl border border-white/30 bg-white/60 backdrop-blur-sm px-3 py-2 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-primary/30"
              >
                <option value="">Todos los tipos</option>
                {auditTypes.map((t) => (
                  <option key={t.id} value={t.id}>{t.name}</option>
                ))}
              </select>
            </label>
          )}
        </div>
      </GlassCard>

      {/* ── Exportaciones Excel ──────────────────────────────────────────── */}
      <p className="text-xs font-semibold text-ink/40 uppercase tracking-widest mb-3">
        Exportaciones Excel
      </p>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-5 mb-6 stagger">
        {EXCEL_CARDS.map((card) => (
          <GlassCard key={card.key}>
            <div className={`w-10 h-10 rounded-2xl ${COLOR_MAP[card.color]} flex items-center justify-center mb-4`}>
              <card.icon size={18} className="text-white" />
            </div>
            <h3 className="text-sm font-semibold text-ink mb-1">{card.title}</h3>
            <p className="text-xs text-ink/50 mb-5 leading-relaxed">{card.desc}</p>

            {errors[card.key] && (
              <p className="text-xs text-rose-500 mb-2 leading-snug">{errors[card.key]}</p>
            )}

            <button
              onClick={card.handler}
              disabled={loading[card.key]}
              className="btn-secondary flex items-center gap-2 text-sm w-full justify-center"
            >
              {loading[card.key]
                ? <Loader2 size={15} className="animate-spin" />
                : <Download size={15} />}
              {loading[card.key] ? "Generando…" : "Descargar Excel"}
            </button>
          </GlassCard>
        ))}
      </div>

      {/* ── Reporte Ejecutivo PDF ────────────────────────────────────────── */}
      <p className="text-xs font-semibold text-ink/40 uppercase tracking-widest mb-3">
        Reporte Ejecutivo
      </p>
      <GlassCard className="mb-6">
        <div className="flex items-start gap-4">
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-primary to-secondary flex items-center justify-center flex-shrink-0">
            <FileText size={20} className="text-white" />
          </div>

          <div className="flex-1 min-w-0">
            <h3 className="text-sm font-semibold text-ink mb-1">Reporte Ejecutivo PDF</h3>
            <p className="text-xs text-ink/50 mb-4 leading-relaxed">
              Genera un documento formal en PDF con portada corporativa, KPIs con semáforo,
              gráficas de auditorías 5S, análisis de satisfacción y conclusiones automáticas
              basadas en los datos del período seleccionado.
            </p>

            <div className="flex flex-wrap gap-2 mb-4">
              {["Portada corporativa", "KPIs con semáforo", "Gráficas por S", "Análisis de satisfacción", "Conclusiones automáticas"].map((tag) => (
                <span key={tag} className="px-2 py-1 text-xs bg-primary/10 text-primary rounded-lg">
                  {tag}
                </span>
              ))}
            </div>

            {errors.pdf && (
              <p className="text-xs text-rose-500 mb-3 leading-snug">{errors.pdf}</p>
            )}

            <button
              onClick={handleGeneratePDF}
              disabled={generatingPDF}
              className="btn-primary flex items-center gap-2 text-sm"
            >
              {generatingPDF
                ? <Loader2 size={16} className="animate-spin" />
                : <FileText size={16} />}
              {generatingPDF ? "Generando reporte…" : "Descargar Reporte PDF"}
            </button>

            {generatingPDF && (
              <p className="text-xs text-ink/40 mt-2">
                Capturando gráficas y compilando el documento, esto puede tomar unos segundos…
              </p>
            )}
          </div>
        </div>
      </GlassCard>

      {/* ── Notas ────────────────────────────────────────────────────────── */}
      <GlassCard>
        <h3 className="text-sm font-semibold text-ink mb-3">📋 Notas sobre exportaciones</h3>
        <ul className="text-xs text-ink/60 space-y-2 leading-relaxed">
          <li>• Los archivos Excel incluyen formato condicional (colores semáforo) y una hoja pivot por sucursal / trimestre.</li>
          <li>• Los filtros de año, trimestre y tipo de auditoría se aplican a todas las exportaciones.</li>
          <li>• El reporte PDF incluye portada, KPIs, gráficas radar y de barras, análisis de satisfacción y conclusiones.</li>
          <li>• Para períodos amplios (todos los años), la generación puede tardar varios segundos.</li>
        </ul>
      </GlassCard>

      {/* ── Contenido PDF (oculto, fuera de pantalla) ───────────────────── */}
      {pdfData && (
        <ReportPDFContent
          ref={pdfRef}
          auditKPIs={pdfData.auditKPIs}
          surveyKPIs={pdfData.surveyKPIs}
          filters={{ year, quarter, auditTypeId }}
          conclusions={conclusions}
          generatedAt={pdfData.generatedAt}
          totalPages={totalPages}
        />
      )}
    </div>
  );
}
