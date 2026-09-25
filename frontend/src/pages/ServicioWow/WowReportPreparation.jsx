/**
 * WowReportPreparation.jsx — Preparación de los reportes de resultados del
 * Servicio WOW 2026 (mismo flujo que ReportPreparation.jsx del reporte 5S).
 *
 *   1. Elegir ciclo + departamento (+ sucursal opcional) → "Cargar datos".
 *      Los datos salen de los mismos endpoints que el dashboard.
 *   2. Vista previa: respuestas, preguntas, formularios, comentarios, nominados
 *      y cómo quedará el informe (cuántas hojas), con avisos cuando el volumen
 *      de preguntas / sucursales hace que el informe crezca.
 *   3. "Continuar → Generar reporte" navega a /servicio-wow/reportes/editor
 *      pasando los datos vía React Router state.
 */
import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Loader2, AlertCircle, AlertTriangle, ArrowRight, FileText } from "lucide-react";
import Header from "../../components/Layout/Header";
import GlassCard from "../../components/Layout/GlassCard";
import { surveyWowService } from "../../services/surveyWow";
import { wowReportsService } from "../../services/wowReports";
import { buildReportModel, CARD_COLS, CARD_ROWS_PER_SHEET } from "../../components/ServicioWow/wowReportData";
import { buildDetailedSheets } from "../../components/ServicioWow/WowReportDetailed";
import { fmtPct } from "../../components/ServicioWow/wowUtils";

export default function WowReportPreparation() {
  const navigate = useNavigate();
  const [cycleId, setCycleId]           = useState("");
  const [departmentId, setDepartmentId] = useState("");
  const [branch, setBranch]             = useState("");
  const [loaded, setLoaded]             = useState(null);   // { raw, savedDraft, cycle, department, branch }
  const [loading, setLoading]           = useState(false);
  const [error, setError]               = useState(null);

  const { data: cycles = [] } = useQuery({ queryKey: ["wow-cycles"], queryFn: surveyWowService.getCycles });
  const { data: departments = [] } = useQuery({ queryKey: ["wow-departments"], queryFn: surveyWowService.getDepartments });
  const cid = cycleId || (cycles.find((c) => c.is_active) || cycles[0])?.id || "";

  const { data: forms = [] } = useQuery({
    queryKey: ["wow-forms", cid, departmentId],
    queryFn:  () => surveyWowService.getForms({ cycle_id: cid, department_id: departmentId }),
    enabled:  !!cid && !!departmentId,
  });
  const branches = useMemo(() => [...new Set(forms.map((f) => f.branch).filter(Boolean))].sort(), [forms]);

  async function handleLoad() {
    if (!cid || !departmentId) return;
    setLoading(true);
    setError(null);
    try {
      const params = { cycle_id: Number(cid), department_id: Number(departmentId), branch: branch || undefined };
      const [raw, savedDraft] = await Promise.all([wowReportsService.loadData(params), wowReportsService.getDraft(params)]);
      setLoaded({
        raw, savedDraft, branch: branch || null,
        cycle: cycles.find((c) => c.id === Number(cid)),
        department: departments.find((d) => d.id === Number(departmentId)),
      });
    } catch (e) {
      setError(e.response?.data?.detail || "No se pudieron cargar los datos.");
      setLoaded(null);
    } finally {
      setLoading(false);
    }
  }

  const model = useMemo(() => (loaded ? buildReportModel(loaded.raw, loaded.department.name) : null), [loaded]);
  const sheets = useMemo(() => (model ? buildDetailedSheets(model, { hidden_comments: [] }) : []), [model]);
  const avisos = useMemo(() => (model ? layoutWarnings(model, sheets, !!loaded?.branch) : []), [model, sheets, loaded]);
  const sinDatos = model && !model.hasInterno && !model.hasExterno;

  return (
    <div className="min-h-screen relative z-10">
      <Header title="Reportes — Servicio WOW 2026" subtitle="Informe detallado y resumen ejecutivo por departamento y ciclo" />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 mb-5">
        <GlassCard>
          <h3 className="text-sm font-semibold text-ink/70 uppercase tracking-wide mb-4">Configuración</h3>

          <label className="field-label">Ciclo</label>
          <select value={cid} onChange={(e) => { setCycleId(e.target.value); setLoaded(null); }} className="input-glass text-sm mb-4">
            {cycles.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>

          <label className="field-label">Departamento</label>
          <select
            value={departmentId}
            onChange={(e) => { setDepartmentId(e.target.value); setBranch(""); setLoaded(null); }}
            className="input-glass text-sm mb-4"
          >
            <option value="">Selecciona un departamento…</option>
            {departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
          </select>

          {branches.length > 0 && (
            <>
              <label className="field-label">Sucursal</label>
              <select value={branch} onChange={(e) => { setBranch(e.target.value); setLoaded(null); }} className="input-glass text-sm mb-4">
                <option value="">Todas las sucursales</option>
                {branches.map((b) => <option key={b} value={b}>{b}</option>)}
              </select>
            </>
          )}

          <button
            onClick={handleLoad}
            disabled={!cid || !departmentId || loading}
            className="btn-primary text-sm flex items-center gap-2 disabled:opacity-50"
          >
            {loading && <Loader2 size={15} className="animate-spin" />}
            Cargar datos
          </button>
          {error && (
            <p className="text-xs text-danger mt-3 flex items-center gap-1.5"><AlertCircle size={13} /> {error}</p>
          )}
        </GlassCard>

        <GlassCard>
          <h3 className="text-sm font-semibold text-ink/70 uppercase tracking-wide mb-4">Vista previa</h3>
          {!model ? (
            <p className="text-xs text-ink/40 italic">Carga datos para ver qué incluirá el reporte.</p>
          ) : (
            <div className="space-y-2 text-sm">
              <Row k="Departamento" v={[loaded.department.name, loaded.branch].filter(Boolean).join(" — ")} />
              <Row k="Cliente interno" v={model.hasInterno ? `${fmtPct(model.interno.porcentaje)} · ${model.interno.n} respuestas · ${model.totals.preguntasInterno} preguntas` : "Sin respuestas"} />
              <Row k="Cliente externo" v={model.hasExterno ? `${fmtPct(model.externo.porcentaje)} · ${model.externo.n} respuestas · ${model.externo.groups.length} formulario(s)` : "Sin respuestas"} />
              {model.general != null && <Row k="General" v={`${fmtPct(model.general)} (promedio interno / externo)`} />}
              <Row k="Comentarios abiertos" v={model.comments.interno.length + model.comments.externo.length} />
              <Row k="Embajador (más votado)" v={model.nominees[0] ? `${model.nominees[0].name} · ${model.nominees[0].votos} voto(s)` : "Sin nominaciones"} />
              <Row k="Período" v={model.periodo || "—"} />
              <Row k="Informe detallado" v={`${sheets.length} hojas`} />
              {loaded.savedDraft && (
                <p className="text-xs text-primary flex items-center gap-1.5 pt-1">
                  <FileText size={13} /> Hay un borrador guardado
                  {(loaded.savedDraft.draft_data?.branch || null) !== loaded.branch
                    ? ` para ${loaded.savedDraft.draft_data?.branch || "todo el departamento"} (no se usará con esta selección)`
                    : " — se retomará en el editor"}.
                </p>
              )}
            </div>
          )}
        </GlassCard>
      </div>

      {avisos.length > 0 && (
        <GlassCard className="mb-5">
          <h3 className="text-sm font-semibold text-ink/70 uppercase tracking-wide mb-3">Avisos de diseño</h3>
          <ul className="space-y-1.5">
            {avisos.map((a) => (
              <li key={a} className="text-xs text-ink/70 flex items-start gap-1.5">
                <AlertTriangle size={13} className="text-warning shrink-0 mt-0.5" /> {a}
              </li>
            ))}
          </ul>
        </GlassCard>
      )}

      {model && (
        <div className="flex justify-end">
          <button
            onClick={() => navigate("/servicio-wow/reportes/editor", { state: loaded })}
            disabled={sinDatos}
            title={sinDatos ? "No hay respuestas para este departamento" : undefined}
            className="btn-primary flex items-center gap-2 text-sm disabled:opacity-50"
          >
            Continuar → Generar reporte <ArrowRight size={15} />
          </button>
        </div>
      )}
    </div>
  );
}

function Row({ k, v }) {
  return <p><span className="text-ink/40">{k}:</span> <strong>{v}</strong></p>;
}

/** Avisos cuando el volumen de datos cambia el layout respecto a los mockups. */
function layoutWarnings(model, sheets, filtrado) {
  const out = [];
  const porHoja = CARD_COLS * CARD_ROWS_PER_SHEET;
  const hojasPreg = sheets.filter((s) => s.kind === "questions").length;
  if (model.externo.groups.length > 2 && !filtrado) {
    out.push(`${model.externo.groups.length} formularios de cliente externo: sus preguntas se agrupan por formulario ` +
      `(${hojasPreg} hoja(s) de preguntas en total). Filtra por sucursal para un informe más corto.`);
  } else if (hojasPreg > 2) {
    out.push(`Más de ${porHoja} preguntas: los resultados por pregunta ocupan ${hojasPreg} hojas (máx. ${porHoja} tarjetas por hoja).`);
  }
  if (model.sucursales.length > 1) {
    out.push(`${model.sucursales.length} formularios / sucursales: se agrega la hoja "Resultados por sucursal" ` +
      "(no está en el mockup; el resultado general sigue siendo el del departamento).");
  }
  const nCom = model.comments.interno.length + model.comments.externo.length;
  if (nCom > 16) out.push(`${nCom} comentarios abiertos: la tabla cualitativa ocupa varias hojas. Puedes quitar comentarios desde el editor.`);
  if (model.hasInterno && !model.nominees.length) out.push("Sin nominaciones cargadas: el colaborador destacado se completa a mano.");
  if (!model.hasInterno && !model.hasExterno) out.push("No hay respuestas importadas para esta selección.");
  return out;
}
