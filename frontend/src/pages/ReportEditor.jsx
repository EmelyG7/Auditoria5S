/**
 * ReportEditor.jsx — Editor del Reporte de Presentación departamental.
 *
 * Recibe los datos preparados vía React Router state (ver
 * ReportPreparation.jsx → navigate('/reports/presentation/editor', { state })).
 *
 * Tiene dos modos:
 *   - Pantalla: sidebar + barra de control + contenido editable.
 *   - Impresión (@media print, ver <style> embebido más abajo): solo se
 *     ve el documento del reporte, con saltos de página por sección.
 */
import { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import {
  Image as ImageIcon, Target, ClipboardList, Building2,
  FileCheck, BarChart3, ListChecks,
} from "lucide-react";

import { reportsPresentationService } from "../services/reportsPresentation";
import { generateSucursalTexts, generateGlobalConclusion } from "../services/reportPresentationAI";

import ControlBar from "../components/ReportEditor/ControlBar";
import ReportSidebar from "../components/ReportEditor/ReportSidebar";
import CoverSection from "../components/ReportEditor/sections/CoverSection";
import ObjetivosSection from "../components/ReportEditor/sections/ObjetivosSection";
import CriteriosSection from "../components/ReportEditor/sections/CriteriosSection";
import SucursalChecklist from "../components/ReportEditor/sections/SucursalChecklist";
import HallazgosSection from "../components/ReportEditor/sections/HallazgosSection";
import PruebaEjecucion from "../components/ReportEditor/sections/PruebaEjecucion";
import ConclusionDepartamento from "../components/ReportEditor/sections/ConclusionDepartamento";
import ConclusionGeneral from "../components/ReportEditor/sections/ConclusionGeneral";
import PasosASeguir from "../components/ReportEditor/sections/PasosASeguir";

function slugify(s) {
  return (s || "")
    .normalize("NFD").replace(/[̀-ͯ]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .toLowerCase();
}

// Objetivos/Procedimiento por defecto. Almacenes son los textos exactos
// provistos por el negocio; Centro de Servicios y RMA son un punto de
// partida razonable (no se tuvo acceso a los PDF originales de esos dos
// departamentos para replicarlos literalmente) — quedan abiertos a edición.
const DEFAULTS = {
  Almacenes: {
    objetivos: [
      "Velar por la correcta organización de los almacenes.",
      "Garantizar el cumplimiento de los procesos.",
      "Atender y dar seguimiento a las mejoras.",
    ],
    procedimiento: [
      "Los almacenes fueron visitados de manera sorpresiva.",
      "En el caso de las tiendas fue involucrado el gerente de tienda o gerente operativo.",
      "Fueron documentados con imágenes los hallazgos encontrados y se generaron planes de acción.",
      "Fueron revisados los usuarios para garantizar el cumplimiento de los procesos.",
      "Atender y dar seguimiento a las mejoras.",
    ],
  },
  "Centro de Servicios": {
    objetivos: [
      "Velar por la correcta organización del Centro de Servicios.",
      "Garantizar el cumplimiento de los procesos de atención y reparación.",
      "Atender y dar seguimiento a las mejoras identificadas.",
    ],
    procedimiento: [
      "Los centros de servicio fueron visitados de manera sorpresiva.",
      "Fue involucrado el encargado o gerente del centro de servicio.",
      "Fueron documentados con imágenes los hallazgos encontrados y se generaron planes de acción.",
      "Fueron revisados los procesos de recepción y entrega de equipos.",
      "Atender y dar seguimiento a las mejoras.",
    ],
  },
  RMA: {
    objetivos: [
      "Velar por la correcta organización del área de RMA.",
      "Garantizar el cumplimiento de los procesos de devolución.",
      "Atender y dar seguimiento a las mejoras identificadas.",
    ],
    procedimiento: [
      "El área de RMA fue visitada de manera sorpresiva.",
      "Fue involucrado el encargado del área de RMA.",
      "Fueron documentados con imágenes los hallazgos encontrados y se generaron planes de acción.",
      "Fueron revisadas las piezas y su correcta clasificación.",
      "Atender y dar seguimiento a las mejoras.",
    ],
  },
};
DEFAULTS.Mobiliario = DEFAULTS.Almacenes;

const PRINT_STYLE = `
@media print {
  .control-bar, .report-sidebar, .add-item-button { display: none !important; }
  .report-section { page-break-after: always; min-height: 100vh; }
  .report-document { width: 100%; margin: 0; padding: 0; }
  * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
  [contenteditable] { border: none !important; outline: none !important; background: transparent !important; }
}
`;

export default function ReportEditor() {
  const { state } = useLocation();
  const navigate   = useNavigate();

  useEffect(() => {
    if (!state?.reportData) navigate("/reports/presentation", { replace: true });
  }, [state, navigate]);

  // Importante: ningún hook puede ejecutarse después de este return
  // condicional, por eso toda la lógica del editor vive en
  // ReportEditorView, que solo se monta cuando ya hay datos.
  if (!state?.reportData) return null;

  return (
    <ReportEditorView
      reportData={state.reportData}
      auditTypeId={state.auditTypeId}
      selectedImagesBySucursal={state.selectedImagesBySucursal || {}}
      odooDataBySucursal={state.odooDataBySucursal || {}}
    />
  );
}

function ReportEditorView({ reportData, auditTypeId, selectedImagesBySucursal, odooDataBySucursal }) {
  const { department, department_color: deptColor, period_month, period_year, period_label, quarter_label } = reportData;

  const audits = useMemo(
    () => reportData.audits.map((a) => ({ ...a, _slug: slugify(a.sucursal) })),
    [reportData.audits]
  );

  const [heroImage, setHeroImage]   = useState(null);
  const [objetivos, setObjetivos]   = useState(DEFAULTS[department]?.objetivos || []);
  const [procedimiento, setProcedimiento] = useState(DEFAULTS[department]?.procedimiento || []);
  const [sucursalTexts, setSucursalTexts] = useState({});
  const [odooTexts, setOdooTexts]   = useState({});
  const [globalTexts, setGlobalTexts] = useState({ nivel_general: "", fortalezas: "", tendencia: "" });
  const [pasosASeguir, setPasosASeguir] = useState(["", "", ""]);
  const [imagesBySucursal] = useState(selectedImagesBySucursal);

  const [generatingAI, setGeneratingAI] = useState(false);
  const [aiProgress, setAiProgress]     = useState({ current: 0, total: 0 });
  const [savingDraft, setSavingDraft]   = useState(false);
  const [activeSection, setActiveSection] = useState("portada");

  // ── Resumir borrador guardado (textos, objetivos, etc.) ───────────────────
  useEffect(() => {
    let cancelled = false;
    reportsPresentationService
      .getDraft({ audit_type_id: auditTypeId, period_month, period_year })
      .then((draft) => {
        if (cancelled || !draft?.draft_data) return;
        const d = draft.draft_data;
        if (d.ai_texts_by_sucursal)  setSucursalTexts(d.ai_texts_by_sucursal);
        if (d.odoo_data_by_sucursal) setOdooTexts(d.odoo_data_by_sucursal);
        if (d.global_texts)          setGlobalTexts(d.global_texts);
        if (d.pasos_a_seguir?.length) setPasosASeguir(d.pasos_a_seguir);
        if (d.objetivos?.length)     setObjetivos(d.objetivos);
        if (d.procedimiento?.length) setProcedimiento(d.procedimiento);
        if (d.hero_image)            setHeroImage(d.hero_image);
      })
      .catch(() => {});
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Scroll-spy para resaltar la sección activa en el sidebar ─────────────
  const sections = useMemo(() => {
    const list = [
      { id: "portada", label: "Portada", icon: ImageIcon },
      { id: "objetivos", label: "Objetivos", icon: Target },
      { id: "criterios", label: "Criterios de Evaluación", icon: ClipboardList },
      ...audits.map((a) => ({ id: `sucursal-${a._slug}`, label: a.sucursal, icon: Building2 })),
      { id: "conclusion-departamento", label: "Conclusión del Informe", icon: FileCheck },
      { id: "conclusion-general", label: "Conclusión General", icon: BarChart3 },
      { id: "pasos-a-seguir", label: "Pasos a Seguir", icon: ListChecks },
    ];
    return list;
  }, [audits]);

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) setActiveSection(entry.target.id);
        });
      },
      { rootMargin: "-35% 0px -55% 0px", threshold: 0 }
    );
    sections.forEach((s) => {
      const el = document.getElementById(s.id);
      if (el) observer.observe(el);
    });
    return () => observer.disconnect();
  }, [sections]);

  function updateSucursalText(sucursal, field, value) {
    setSucursalTexts((prev) => ({ ...prev, [sucursal]: { ...prev[sucursal], [field]: value } }));
  }

  async function handleGenerateAllAI() {
    setGeneratingAI(true);
    const total = audits.length + 1;
    setAiProgress({ current: 0, total });
    try {
      for (let i = 0; i < audits.length; i++) {
        const audit = audits[i];
        try {
          const result = await generateSucursalTexts(audit, department);
          setSucursalTexts((prev) => ({ ...prev, [audit.sucursal]: result }));
        } catch (e) {
          console.error(`Error generando texto para ${audit.sucursal}:`, e);
        }
        setAiProgress({ current: i + 1, total });
      }

      const avgPct = reportData.summary?.avg_pct ?? 0;
      try {
        const globalResult = await generateGlobalConclusion(audits, department, avgPct);
        setGlobalTexts({
          nivel_general: globalResult.nivel_general || "",
          fortalezas:    globalResult.fortalezas || "",
          tendencia:     globalResult.tendencia || "",
        });
        if (globalResult.pasos_a_seguir?.length) setPasosASeguir(globalResult.pasos_a_seguir);
      } catch (e) {
        console.error("Error generando conclusión global:", e);
      }
      setAiProgress({ current: total, total });
    } finally {
      setGeneratingAI(false);
    }
  }

  async function handleSaveDraft() {
    setSavingDraft(true);
    try {
      await reportsPresentationService.saveDraft({
        audit_type_id: auditTypeId,
        period_month,
        period_year,
        draft_data: {
          selected_images_by_sucursal: imagesBySucursal,
          odoo_data_by_sucursal: odooTexts,
          ai_texts_by_sucursal: sucursalTexts,
          global_texts: globalTexts,
          pasos_a_seguir: pasosASeguir,
          objetivos,
          procedimiento,
          hero_image: heroImage,
        },
      });
    } catch (e) {
      console.error("Error guardando borrador:", e);
    } finally {
      setSavingDraft(false);
    }
  }

  function handleExportPDF() {
    document.title = `Reporte_${department}_${period_label}_${period_year}`;
    window.print();
  }

  function addPaso() {
    setPasosASeguir((prev) => [...prev, ""]);
  }
  function removePaso(i) {
    setPasosASeguir((prev) => prev.filter((_, idx) => idx !== i));
  }
  function updatePaso(i, value) {
    setPasosASeguir((prev) => prev.map((p, idx) => (idx === i ? value : p)));
  }

  let renderedMobiliarioSeparator = false;

  return (
    <div style={{ "--dept-color": deptColor }}>
      <style>{PRINT_STYLE}</style>

      <ControlBar
        department={department}
        deptColor={deptColor}
        periodLabel={`${period_label} ${period_year}`}
        onGenerateAI={handleGenerateAllAI}
        generatingAI={generatingAI}
        aiProgress={aiProgress}
        onSaveDraft={handleSaveDraft}
        savingDraft={savingDraft}
        onExportPDF={handleExportPDF}
      />

      <ReportSidebar
        sections={sections}
        activeSectionId={activeSection}
        deptColor={deptColor}
        onNavigate={setActiveSection}
      />

      <div className="report-document" style={{ marginLeft: 220, paddingTop: 60 }}>
        <CoverSection
          department={department}
          year={period_year}
          monthLabel={period_label}
          deptColor={deptColor}
          heroImage={heroImage}
          onHeroImageChange={setHeroImage}
        />

        <ObjetivosSection
          objetivos={objetivos}
          procedimiento={procedimiento}
          onChangeObjetivo={(i, v) => setObjetivos((prev) => prev.map((o, idx) => (idx === i ? v : o)))}
          onChangeProcedimiento={(i, v) => setProcedimiento((prev) => prev.map((p, idx) => (idx === i ? v : p)))}
          deptColor={deptColor}
        />

        <CriteriosSection
          criteriaTemplate={reportData.criteria_template}
          deptColor={deptColor}
          dateRange={reportData.date_range}
          quarterLabel={quarter_label}
          year={period_year}
        />

        {audits.map((audit) => {
          const showSeparator = audit.is_mobiliario && !renderedMobiliarioSeparator;
          if (showSeparator) renderedMobiliarioSeparator = true;

          return (
            <div key={audit.sucursal + (audit.is_mobiliario ? "-mob" : "")}>
              {showSeparator && (
                <div
                  className="report-section"
                  style={{
                    minHeight: "20vh", display: "flex", alignItems: "center", justifyContent: "center",
                    background: deptColor,
                  }}
                >
                  <span style={{ color: "#fff", fontSize: 32, fontWeight: 800, letterSpacing: 4, textTransform: "uppercase" }}>
                    Mobiliario
                  </span>
                </div>
              )}

              <SucursalChecklist
                audit={audit}
                department={department}
                deptColor={deptColor}
                quarterLabel={quarter_label}
                year={period_year}
              />

              <HallazgosSection
                id={`hallazgos-${audit._slug}`}
                audit={audit}
                deptColor={deptColor}
                criteriaTemplate={reportData.criteria_template}
                texts={sucursalTexts[audit.sucursal]}
                onChangeText={updateSucursalText}
              />

              <PruebaEjecucion
                audit={audit}
                department={department}
                deptColor={deptColor}
                images={imagesBySucursal[audit.sucursal] || []}
                odooCounts={odooDataBySucursal[audit.sucursal]}
                odooText={odooTexts[audit.sucursal]}
                onChangeOdoo={(v) => setOdooTexts((prev) => ({ ...prev, [audit.sucursal]: v }))}
              />

              <HallazgosSection
                id={`conclusion-${audit._slug}`}
                title={`Conclusión del informe — ${audit.sucursal}`}
                audit={audit}
                deptColor={deptColor}
                criteriaTemplate={reportData.criteria_template}
                texts={sucursalTexts[audit.sucursal]}
                onChangeText={updateSucursalText}
              />
            </div>
          );
        })}

        <ConclusionDepartamento
          audits={audits}
          department={department}
          monthLabel={period_label}
          quarterLabel={quarter_label}
          deptColor={deptColor}
          texts={sucursalTexts}
          onChangeCardSummary={(sucursal, v) => updateSucursalText(sucursal, "card_summary", v)}
        />

        <ConclusionGeneral
          audits={audits}
          criteriaTemplate={reportData.criteria_template}
          department={department}
          monthLabel={period_label}
          deptColor={deptColor}
          summary={reportData.summary}
          globalTexts={globalTexts}
          onChangeGlobalText={(field, v) => setGlobalTexts((prev) => ({ ...prev, [field]: v }))}
        />

        <PasosASeguir
          items={pasosASeguir}
          onChangeItem={updatePaso}
          onAddItem={addPaso}
          onRemoveItem={removePaso}
          deptColor={deptColor}
        />
      </div>
    </div>
  );
}
