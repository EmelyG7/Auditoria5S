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
 * "Regresar" y el modal que aparece al terminar el PDF vuelven a la selección de
 * reportes (WowReportPreparation); si hay cambios sin guardar se pide confirmación.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { FileText, Newspaper, AlertTriangle, ListFilter, CheckCircle2, Loader2 } from "lucide-react";

import ControlBar from "../../components/ReportEditor/ControlBar";
import ReportSidebar from "../../components/ReportEditor/ReportSidebar";
import WowReportDetailed, { buildDetailedSheets } from "../../components/ServicioWow/WowReportDetailed";
import WowReportSummary, { SUMMARY_SHEET_ID } from "../../components/ServicioWow/WowReportSummary";
import { WowReportContext } from "../../components/ServicioWow/WowReportParts";
import WowCommentsPicker from "../../components/ServicioWow/WowCommentsPicker";
import {
  buildReportModel, defaultTexts, METODOLOGIA_ANTERIOR, COMPARATIVO_NOTAS_ANTERIORES, sincronizarTextoGeneral, pctsDesfasados, defaultAmbassador, defaultSelectedComments, selectedCommentsOf, completarCitas,
} from "../../components/ServicioWow/wowReportData";
import { exportSheetsToPDF } from "../../components/ServicioWow/wowReportPdf";
import { WOW_TOKENS as T } from "../../components/ServicioWow/wowReportTokens";
import { wowReportsService } from "../../services/wowReports";
import { generateWowReportTexts } from "../../services/wowReportAI";

const REPORTES_PATH = "/servicio-wow/reportes";

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
    if (!state?.raw) navigate(REPORTES_PATH, { replace: true });
  }, [state, navigate]);

  // Ningún hook después de este return: el editor vive en WowReportEditorView.
  if (!state?.raw) return null;
  return <WowReportEditorView {...state} />;
}

function WowReportEditorView({ raw, cycle, department, branch, savedDraft }) {
  const navigate = useNavigate();
  const model = useMemo(() => buildReportModel(raw, department.name, cycle.year), [raw, department.name, cycle.year]);

  const [variant, setVariant] = useState("detallado");
  const [draft, setDraft] = useState(() => {
    const base = {
      texts: defaultTexts(model, cycle.name, branch),
      action_items: ["", "", ""],
      ambassador: defaultAmbassador(model),
      summary_photos: [null, null],
      selected_comments: defaultSelectedComments(model),
    };
    // El borrador es único por (ciclo, departamento): si se guardó con otra sucursal no se mezcla
    const d = savedDraft?.draft_data;
    if (!d || (d.branch || null) !== (branch || null)) return base;
    // Borradores anteriores: `hidden_comments` → `selected_comments`; embajador con menos de 4 citas → se completa
    const rest = { ...d };
    delete rest.hidden_comments;
    return {
      ...base, ...rest,
      texts: {
        ...base.texts, ...d.texts,
        // Metodología sin editar del cálculo anterior (por puntos) → texto del cálculo actual
        ...(d.texts?.methodology === METODOLOGIA_ANTERIOR ? { methodology: base.texts.methodology } : {}),
        ...(COMPARATIVO_NOTAS_ANTERIORES.includes(d.texts?.comparativo_nota) ? { comparativo_nota: base.texts.comparativo_nota } : {}),
        // Texto automático con % viejos → mismo texto con los % actuales de las donas
        general_text: sincronizarTextoGeneral(d.texts?.general_text, base.texts.general_text),
      },
      ambassador: completarCitas({ ...base.ambassador, ...d.ambassador }, model),
      selected_comments: selectedCommentsOf(model, d),
    };
  });
  const otroBorrador = savedDraft?.draft_data && (savedDraft.draft_data.branch || null) !== (branch || null);
  const update = (patch) => setDraft((d) => ({ ...d, ...patch }));
  // Cambios sin guardar: el borrador difiere del último guardado (o del estado con que se abrió)
  const draftJson = useMemo(() => JSON.stringify(draft), [draft]);
  const [savedJson, setSavedJson] = useState(draftJson);
  const dirty = draftJson !== savedJson;
  // null | { kind: "exported", file } | { kind: "leave" }
  const [modal, setModal] = useState(null);

  const [exporting, setExporting]       = useState(false);
  const [savingDraft, setSavingDraft]   = useState(false);
  const [generatingAI, setGeneratingAI] = useState(false);
  const [notice, setNotice]             = useState(() => {
    if (otroBorrador) {
      return `El borrador guardado es de ${savedDraft.draft_data.branch || "todo el departamento"}; este reporte empieza desde cero y al guardar lo reemplaza.`;
    }
    const viejos = pctsDesfasados(draft.texts.general_text, model);
    return viejos.length
      ? `El texto de "Resultado general" menciona ${viejos.map((v) => `${v}%`).join(", ")}, que no coincide con los resultados actuales. Revísalo o vuelve a generarlo con IA.`
      : "";
  });
  const [pickingComments, setPickingComments] = useState(false);
  const docRef = useRef(null);
  const totalComments = model.allComments.interno.length + model.allComments.externo.length;

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

  /** Devuelve true si se guardó. */
  async function handleSaveDraft() {
    setSavingDraft(true);
    try {
      await wowReportsService.saveDraft({
        cycle_id: cycle.id, department_id: department.id, draft_data: { ...draft, branch: branch || null },
      });
      setSavedJson(draftJson);
      setNotice("Borrador guardado.");
      return true;
    } catch (e) {
      setNotice(e.response?.data?.detail || "No se pudo guardar el borrador.");
      return false;
    } finally {
      setSavingDraft(false);
    }
  }

  const irAReportes = () => navigate(REPORTES_PATH);
  // Regresar: con cambios sin guardar se pregunta antes de salir
  const handleBack = () => (dirty ? setModal({ kind: "leave" }) : irAReportes());

  async function handleSaveAndLeave() {
    if (await handleSaveDraft()) irAReportes();
    else setModal(null);   // el error queda en el aviso de la barra
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
      setModal({ kind: "exported", file: `${nombre}.pdf` });
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
        onBack={handleBack}
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
          {variant === "detallado" && totalComments > 0 && (
            <button
              onClick={() => setPickingComments(true)}
              style={{
                display: "flex", alignItems: "center", gap: 6, padding: "7px 14px", borderRadius: 10,
                border: `1px solid ${T.line}`, background: "#fff", color: T.navy,
                fontSize: 12, fontWeight: 600, cursor: "pointer",
              }}
            >
              <ListFilter size={14} /> Comentarios ({draft.selected_comments.length}/{totalComments})
            </button>
          )}
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
              ? <WowReportDetailed model={model} draft={draft} sheets={sheets} onChange={update} onPickComments={() => setPickingComments(true)} />
              : <WowReportSummary model={model} draft={draft} onChange={update} />}
          </div>
        </WowReportContext.Provider>
      </div>

      {pickingComments && (
        <WowCommentsPicker
          model={model} selected={draft.selected_comments}
          onChange={(selected_comments) => update({ selected_comments })}
          onClose={() => setPickingComments(false)}
        />
      )}

      {modal?.kind === "exported" && (
        <EditorModal
          icon={<CheckCircle2 size={36} color={T.green} />}
          title="Reporte generado"
          onClose={() => setModal(null)}
          actions={[
            { label: "Quedarme aquí", onClick: () => setModal(null) },
            { label: "Volver a reportes", primary: true, onClick: () => (dirty ? setModal({ kind: "leave" }) : irAReportes()) },
          ]}
        >
          El PDF <strong>{modal.file}</strong> se descargó correctamente. ¿Deseas quedarte editando este reporte o volver a
          la página de selección de reportes?
        </EditorModal>
      )}

      {modal?.kind === "leave" && (
        <EditorModal
          icon={<AlertTriangle size={36} color={T.orange} />}
          title="Tienes cambios sin guardar"
          onClose={() => setModal(null)}
          actions={[
            { label: "Cancelar", onClick: () => setModal(null) },
            { label: "Salir sin guardar", onClick: irAReportes },
            { label: savingDraft ? "Guardando…" : "Guardar y salir", primary: true, disabled: savingDraft, onClick: handleSaveAndLeave },
          ]}
        >
          Si vuelves a la selección de reportes sin guardar el borrador, perderás los cambios hechos en este reporte.
        </EditorModal>
      )}
    </div>
  );
}

function EditorModal({ icon, title, children, actions, onClose }) {
  useEffect(() => {
    const onKey = (e) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed", inset: 0, zIndex: 100, display: "flex", alignItems: "center", justifyContent: "center",
        padding: 16, background: "rgba(28,43,54,.45)", fontFamily: T.font,
      }}
    >
      <div
        role="dialog" aria-modal="true" aria-labelledby="wow-editor-modal-title"
        onClick={(e) => e.stopPropagation()}
        style={{
          width: "100%", maxWidth: 440, padding: "28px 28px 22px", borderRadius: 16, background: "#fff",
          boxShadow: "0 20px 50px rgba(10,79,121,.25)", textAlign: "center",
        }}
      >
        <div style={{ display: "flex", justifyContent: "center", marginBottom: 12 }}>{icon}</div>
        <h2 id="wow-editor-modal-title" style={{ margin: 0, fontSize: 18, fontWeight: 700, color: T.navy }}>{title}</h2>
        <p style={{ margin: "10px 0 22px", fontSize: 14, lineHeight: 1.5, color: T.ink, wordBreak: "break-word" }}>{children}</p>
        <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "center", gap: 10 }}>
          {actions.map((a) => (
            <button
              key={a.label}
              onClick={a.onClick}
              disabled={a.disabled}
              style={{
                display: "flex", alignItems: "center", gap: 6, padding: "9px 16px", borderRadius: 10,
                border: a.primary ? "none" : `1px solid ${T.line}`,
                background: a.primary ? T.navy : "#fff", color: a.primary ? "#fff" : T.ink,
                fontSize: 13, fontWeight: 600, cursor: a.disabled ? "default" : "pointer", opacity: a.disabled ? 0.7 : 1,
              }}
            >
              {a.disabled && <Loader2 size={14} className="animate-spin" />}
              {a.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
