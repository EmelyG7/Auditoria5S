/**
 * WowReportEditor.jsx — Editor de los reportes de resultados del Servicio WOW 2026.
 *
 * Mismo patrón que el reporte de presentación 5S (ReportPreparation → ReportEditor):
 * ruta full-bleed fuera de AppLayout, datos preparados vía React Router state
 * (ver WowReportPreparation.jsx), ControlBar + ReportSidebar del editor 5S,
 * borrador JSON en el backend (WowReportDraft) y textos con IA vía el proxy.
 *
 * Dos variantes del mismo modelo y del mismo SatisfactionDonut:
 *   - Informe detallado (WowReportDetailed) — varias hojas
 *   - Resumen ejecutivo (WowReportSummary) — una página vertical
 * "Exportar PDF" exporta la variante visible (jspdf + html2canvas, una hoja = una página).
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { FileText, Newspaper, AlertTriangle } from "lucide-react";

import ControlBar from "../../components/ReportEditor/ControlBar";
import ReportSidebar from "../../components/ReportEditor/ReportSidebar";
import WowReportDetailed, { buildDetailedSheets } from "../../components/ServicioWow/WowReportDetailed";
import WowReportSummary, { SUMMARY_SHEET_ID } from "../../components/ServicioWow/WowReportSummary";
import { WowReportContext } from "../../components/ServicioWow/WowReportParts";
import { buildReportModel, defaultTexts, defaultAmbassador } from "../../components/ServicioWow/wowReportData";
import { exportSheetsToPDF } from "../../components/ServicioWow/wowReportPdf";
import { WOW_TOKENS as T } from "../../components/ServicioWow/wowReportTokens";
import { wowReportsService } from "../../services/wowReports";
import { generateWowReportTexts } from "../../services/wowReportAI";

const VARIANTS = [
  { id: "detallado", label: "Informe detallado", icon: FileText },
  { id: "resumen",   label: "Resumen ejecutivo", icon: Newspaper },
];

const EDITOR_STYLE = `
.wow-editable { border-radius: 4px; transition: box-shadow .15s; }
.wow-editable:hover { box-shadow: 0 0 0 1px rgba(10,79,121,.28); }
.wow-editable:focus { box-shadow: 0 0 0 2px rgba(10,79,121,.45); }
.wow-editable:empty::before { content: attr(data-placeholder); color: #9AA8B2; }
`;

function slug(s) {
  return String(s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-zA-Z0-9]+/g, "_").replace(/^_|_$/g, "");
}

export default function WowReportEditor() {
  const { state } = useLocation();
  const navigate = useNavigate();

  useEffect(() => {
    if (!state?.raw) navigate("/servicio-wow/reportes", { replace: true });
  }, [state, navigate]);

  // Ningún hook después de este return: el editor vive en WowReportEditorView.
  if (!state?.raw) return null;
  return <WowReportEditorView {...state} />;
}

function WowReportEditorView({ raw, cycle, department, branch, savedDraft }) {
  const model = useMemo(() => buildReportModel(raw, department.name), [raw, department.name]);

  const [variant, setVariant] = useState("detallado");
  const [draft, setDraft] = useState(() => {
    const base = {
      texts: defaultTexts(model, cycle.name, branch),
      action_items: ["", "", ""],
      ambassador: defaultAmbassador(model),
      summary_photos: [null, null],
      hidden_comments: [],
    };
    // El borrador es único por (ciclo, departamento): si se guardó con otra sucursal no se mezcla
    const d = savedDraft?.draft_data;
    if (!d || (d.branch || null) !== (branch || null)) return base;
    return {
      ...base, ...d,
      texts: { ...base.texts, ...d.texts },
      ambassador: { ...base.ambassador, ...d.ambassador },
    };
  });
  const otroBorrador = savedDraft?.draft_data && (savedDraft.draft_data.branch || null) !== (branch || null);
  const update = (patch) => setDraft((d) => ({ ...d, ...patch }));

  const [exporting, setExporting]       = useState(false);
  const [savingDraft, setSavingDraft]   = useState(false);
  const [generatingAI, setGeneratingAI] = useState(false);
  const [notice, setNotice]             = useState(otroBorrador
    ? `El borrador guardado es de ${savedDraft.draft_data.branch || "todo el departamento"}; este reporte empieza desde cero y al guardar lo reemplaza.`
    : "");
  const docRef = useRef(null);

  const sheets = useMemo(() => buildDetailedSheets(model, draft), [model, draft]);
  const sections = useMemo(() => (
    variant === "detallado"
      ? sheets.filter((s) => s.nav).map((s) => ({ id: s.id, ...s.nav }))
      : [{ id: SUMMARY_SHEET_ID, label: "Resumen ejecutivo", icon: Newspaper }]
  ), [variant, sheets]);
  const [activeSection, setActiveSection] = useState(sections[0]?.id);

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => entries.forEach((e) => e.isIntersecting && setActiveSection(e.target.id)),
      { rootMargin: "-35% 0px -55% 0px", threshold: 0 },
    );
    sections.forEach((s) => {
      const el = document.getElementById(s.id);
      if (el) observer.observe(el);
    });
    return () => observer.disconnect();
  }, [sections]);

  async function handleSaveDraft() {
    setSavingDraft(true);
    try {
      await wowReportsService.saveDraft({
        cycle_id: cycle.id, department_id: department.id, draft_data: { ...draft, branch: branch || null },
      });
      setNotice("Borrador guardado.");
    } catch (e) {
      setNotice(e.response?.data?.detail || "No se pudo guardar el borrador.");
    } finally {
      setSavingDraft(false);
    }
  }

  async function handleGenerateAI() {
    setGeneratingAI(true);
    try {
      const r = await generateWowReportTexts(model, { cycleName: cycle.name, branch });
      setDraft((d) => ({
        ...d,
        texts: {
          ...d.texts,
          general_text:      r.general_text      || d.texts.general_text,
          summary_paragraph: r.summary_paragraph || d.texts.summary_paragraph,
        },
        action_items: r.action_items?.length ? r.action_items : d.action_items,
      }));
    } catch (e) {
      setNotice(e.response?.data?.detail || "No se pudieron generar los textos con IA.");
    } finally {
      setGeneratingAI(false);
    }
  }

  async function handleExportPDF() {
    setExporting(true);
    // Dos frames: que React quite los controles de edición antes de capturar
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    try {
      const nombre = [variant === "detallado" ? "Informe" : "Resumen", "WOW", department.name, branch, cycle.year]
        .filter(Boolean).map(slug).join("_");
      await exportSheetsToPDF(docRef.current, `${nombre}.pdf`);
    } catch (e) {
      console.error("Error exportando PDF:", e);
      setNotice("No se pudo exportar el PDF.");
    } finally {
      setExporting(false);
    }
  }

  const periodLabel = [cycle.name, branch].filter(Boolean).join(" · ");

  return (
    <div style={{ minHeight: "100vh", background: T.surfaceAlt }}>
      <style>{EDITOR_STYLE}</style>

      <ControlBar
        department={department.name}
        deptColor={T.navy}
        periodLabel={periodLabel}
        onGenerateAI={handleGenerateAI}
        generatingAI={generatingAI}
        aiProgress={{ current: 0, total: 0 }}
        onSaveDraft={handleSaveDraft}
        savingDraft={savingDraft}
        onExportPDF={handleExportPDF}
      />

      <ReportSidebar sections={sections} activeSectionId={activeSection} deptColor={T.navy} onNavigate={setActiveSection} />

      <div style={{ marginLeft: 220, paddingTop: 60 }}>
        <div
          style={{
            position: "sticky", top: 60, zIndex: 30, display: "flex", alignItems: "center", gap: 8,
            padding: "12px 24px", background: "rgba(244,246,248,.92)", backdropFilter: "blur(6px)",
            borderBottom: `1px solid ${T.line}`, fontFamily: T.font,
          }}
        >
          {VARIANTS.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              onClick={() => { setVariant(id); window.scrollTo({ top: 0 }); }}
              style={{
                display: "flex", alignItems: "center", gap: 6, padding: "7px 14px", borderRadius: 10,
                border: `1px solid ${variant === id ? T.navy : T.line}`,
                background: variant === id ? T.navy : "#fff", color: variant === id ? "#fff" : T.ink,
                fontSize: 12, fontWeight: 600, cursor: "pointer",
              }}
            >
              <Icon size={14} /> {label}
            </button>
          ))}
          {notice && (
            <span style={{ marginLeft: 12, fontSize: 12, color: T.slate, display: "flex", alignItems: "center", gap: 6 }}>
              {otroBorrador && notice.startsWith("El borrador") && <AlertTriangle size={13} color={T.orange} />}
              {notice}
              <button onClick={() => setNotice("")} style={{ border: "none", background: "transparent", color: T.slate, cursor: "pointer" }}>×</button>
            </span>
          )}
          <span style={{ marginLeft: "auto", fontSize: 11, color: T.slate }}>
            Haz clic en cualquier texto para editarlo · los % vienen del dashboard
          </span>
        </div>

        <WowReportContext.Provider value={{ editable: !exporting }}>
          <div ref={docRef} style={{ padding: "40px 24px 80px" }}>
            {variant === "detallado"
              ? <WowReportDetailed model={model} draft={draft} sheets={sheets} onChange={update} />
              : <WowReportSummary model={model} draft={draft} onChange={update} />}
          </div>
        </WowReportContext.Provider>
      </div>
    </div>
  );
}
