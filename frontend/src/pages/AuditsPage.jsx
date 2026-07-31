/**
 * AuditsPage.jsx — Listado de auditorías con paginación numérica.
 */

import { useState, useRef, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Plus, Upload, Trash2, Eye, Pencil, BarChart2,
  Loader2, ChevronLeft, ChevronRight, Download, ChevronDown,
  Copy, ClipboardCheck, Filter, X,
} from "lucide-react";
import { useNavigate, useLocation } from "react-router-dom";
import { auditsService } from "../services/audits";
import { useFilters } from "../hooks/useFilters";
import { useAuth } from "../store/AuthContext";
import Header from "../components/Layout/Header";
import GlassCard from "../components/Layout/GlassCard";
import MultiSelect from "../components/Common/MultiSelect";
import ConfirmModal from "../components/Common/ConfirmModal";
import AuditDetail from "../components/Audits/AuditDetail";
import ImportModal from "../components/Audits/ImportModal";
import { fmt } from "../utils/format";

const PAGE_SIZE = 15;

const QUARTERS = ["Q1", "Q2", "Q3", "Q4"];
const MONTHS = [
  "Enero","Febrero","Marzo","Abril","Mayo","Junio",
  "Julio","Agosto","Septiembre","Octubre","Noviembre","Diciembre",
];
const MONTHS_ABBR = ["Ene","Feb","Mar","Abr","May","Jun","Jul","Ago","Sep","Oct","Nov","Dic"];

// Convierte los filtros de selección múltiple (arrays) a CSV para la API.
function toApiParams(filters) {
  const params = { ...filters };
  if (Array.isArray(params.audit_type_id)) params.audit_type_id = params.audit_type_id.join(",");
  if (Array.isArray(params.branch))        params.branch        = params.branch.join(",");
  if (Array.isArray(params.period_year))   params.period_year   = params.period_year.join(",");
  return params;
}

function paginator(current, total) {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
  const delta = 2;
  const range = [];
  for (
    let i = Math.max(2, current - delta);
    i <= Math.min(total - 1, current + delta);
    i++
  ) range.push(i);
  if (current - delta > 2)        range.unshift("...");
  if (current + delta < total - 1) range.push("...");
  return [1, ...range, total];
}

export default function AuditsPage() {
  const { isAdmin } = useAuth();
  const qc          = useQueryClient();
  const navigate    = useNavigate();
  const location    = useLocation();

  const restoredFilters = location.state?.restoredFilters;
  const DEFAULT_FILTERS = { page: 1, page_size: PAGE_SIZE };

  const { filters, activeFilters, setFilter, resetFilters } = useFilters(
    restoredFilters || DEFAULT_FILTERS, DEFAULT_FILTERS
  );

  const [selectedId,     setSelectedId]     = useState(null);
  const [deleteId,       setDeleteId]       = useState(null);
  const [showImport,     setShowImport]     = useState(false);
  const [showExportMenu, setShowExportMenu] = useState(false);
  const [exportingExcel, setExportingExcel] = useState(false);
  const [copiedBulk,     setCopiedBulk]     = useState(false);
  const exportMenuRef = useRef(null);

  useEffect(() => {
    if (!showExportMenu) return;
    const handler = (e) => {
      if (exportMenuRef.current && !exportMenuRef.current.contains(e.target)) {
        setShowExportMenu(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [showExportMenu]);

  const handleExportExcel = async (type) => {
    setExportingExcel(true);
    setShowExportMenu(false);
    try {
      if (type === "summary") {
        await auditsService.exportSummary(toApiParams(activeFilters));
      } else {
        await auditsService.exportDetail(toApiParams(activeFilters));
      }
    } catch (err) {
      console.error("Error al exportar Excel:", err);
    } finally {
      setExportingExcel(false);
    }
  };

  // Navega conservando los filtros/página actuales para que "regresar" restaure esta vista.
  const goToAudit = (path) => {
    navigate(path, { state: { from: "/audits", restoredFilters: filters } });
  };

  const { data: types = [] } = useQuery({
    queryKey: ["audit-types"],
    queryFn:  auditsService.getTypes,
  });

  // Sucursales contextuales: solo las que realmente tienen auditorías del tipo seleccionado.
  const { data: branches = [] } = useQuery({
    queryKey: ["audit-branches", filters.audit_type_id],
    queryFn:  () => auditsService.getBranches(filters.audit_type_id),
  });

  // Si cambia el tipo seleccionado y una sucursal filtrada ya no aplica, se limpia sola.
  useEffect(() => {
    if (!filters.branch) return;
    const valid = filters.branch.filter((b) => branches.includes(b));
    if (valid.length !== filters.branch.length) {
      setFilter("branch", valid.length ? valid : undefined);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [branches]);

  const { data: periodYearsData = [] } = useQuery({
    queryKey: ["audit-period-years"],
    queryFn:  auditsService.getPeriodYears,
  });

  const currentYear = new Date().getFullYear();
  const minYear = Math.max(2026, periodYearsData.length ? Math.min(...periodYearsData) : 2026);
  const maxYear = Math.max(currentYear, periodYearsData.length ? Math.max(...periodYearsData) : currentYear);
  const yearOptions = Array.from({ length: maxYear - minYear + 1 }, (_, i) => {
    const y = minYear + i;
    return { value: y, label: String(y) };
  });

  const { data, isLoading, isFetching, refetch } = useQuery({
    queryKey: ["audits", activeFilters],
    queryFn:  () => auditsService.list(toApiParams(activeFilters)),
    keepPreviousData: true,
  });

  const deleteMut = useMutation({
    mutationFn: auditsService.delete,
    onSuccess:  () => {
      qc.invalidateQueries(["audits"]);
      qc.invalidateQueries(["audit-kpis"]);
      setDeleteId(null);
    },
  });

  const audits      = data?.items       || [];
  const total       = data?.total       || 0;
  const totalPages  = data?.total_pages || 1;
  const currentPage = data?.page        || (filters.page ?? 1);
  const hasNext     = data?.has_next    ?? false;
  const hasPrev     = data?.has_prev    ?? false;

  const goPage      = (p) => setFilter("page", p);
  const pageNumbers = paginator(currentPage, totalPages);

  const filtersActive = !!(
    filters.audit_type_id || filters.branch ||
    filters.status || filters.quarter ||
    filters.period_month || filters.period_year
  );

  function buildBulkPrompt() {
    const MESES = MONTHS;
    const S_LABEL = { seiri: "Seiri", seiton: "Seiton", seiso: "Seiso", seiketsu: "Seiketsu", shitsuke: "Shitsuke" };

    // ── Contexto del filtro ──────────────────────────────────────────────────
    const ctx = [];
    if (filters.audit_type_id?.length) {
      const names = filters.audit_type_id
        .map((id) => types.find((x) => String(x.id) === String(id))?.name)
        .filter(Boolean);
      if (names.length) ctx.push(`Tipo: ${names.join(", ")}`);
    }
    if (filters.period_month && filters.period_year?.length) {
      const q = Math.ceil(Number(filters.period_month) / 3);
      ctx.push(`Período: ${MESES[filters.period_month - 1]} ${filters.period_year.join(", ")} (Q${q})`);
    } else if (filters.period_year?.length) {
      ctx.push(`Año: ${filters.period_year.join(", ")}`);
    }
    if (filters.branch?.length) ctx.push(`Sucursal: ${filters.branch.join(", ")}`);
    if (filters.status)         ctx.push(`Estado: ${filters.status}`);

    // ── Lista de auditorías ──────────────────────────────────────────────────
    const auditLines = audits
      .map((a, i) =>
        `${i + 1}. ${a.branch} | ${fmt.date(a.audit_date)} | Auditor: ${a.auditor_name || "—"} | ${a.percentage?.toFixed(1) ?? "—"}% | ${a.status || "—"}`
      )
      .join("\n");

    // ── Detalle por S cuando está disponible en la respuesta ─────────────────
    const withS = audits.filter((a) => a.puntajes_por_s);
    const sDetail = withS.length > 0
      ? withS
          .map((a) => {
            const p = a.puntajes_por_s;
            const parts = ["seiri","seiton","seiso","seiketsu","shitsuke"]
              .filter((k) => p[k] != null)
              .map((k) => `${S_LABEL[k]}: ${Number(p[k]).toFixed(1)}%`);
            return `${a.branch} — ${parts.join(" | ")}`;
          })
          .join("\n")
      : null;

    // ── Plantilla de sucursales para el JSON ─────────────────────────────────
    const sucursalesTemplate = audits
      .map((a) => {
        const pct = a.percentage ?? 0;
        const labelHint = pct === 100
          ? '"Cumplimiento total"'
          : `"Área de oportunidad: [S con menor puntaje]"`;
        return `    "${a.branch}": {\n      "hallazgos": "...",\n      "conclusiones_generales": "...",\n      "card_summary": "...",\n      "cumplimiento_label": ${labelHint}\n    }`;
      })
      .join(",\n");

    return `Eres un analista de auditorías 5S para Cecomsa. Genera el contenido narrativo para un informe de presentación tipo Cecomsa con datos reales que te paso abajo.

CONTEXTO DEL FILTRO:
${ctx.length > 0 ? ctx.join("\n") : "Sin filtros (vista general)"}

AUDITORÍAS (${audits.length} registros${total > audits.length ? ` de ${total} en total — solo se incluye la página actual` : ""}):
${auditLines}
${sDetail
  ? `\nDETALLE POR S (sucursales con cumplimiento < 100%):\n${sDetail}`
  : "\n[Nota: solo se dispone del % total por sucursal. Genera hallazgos y conclusiones basándote en el puntaje general. Para mencionar una S específica como área de oportunidad, abre la auditoría individualmente y copia su detalle por S aquí.]"}

INSTRUCCIONES:
Genera el contenido en el siguiente formato JSON exacto, sin texto adicional antes o después, sin marcadores de código:

{
  "sucursales": {
${sucursalesTemplate}
  },
  "conclusion_general": {
    "nivel_general": "1-2 oraciones describiendo el desempeño del grupo en este período.",
    "fortalezas": "1-2 oraciones mencionando las sucursales o S más fuertes.",
    "tendencia": "1-2 oraciones sobre patrones observados."
  },
  "pasos_a_seguir": [
    "Acción concreta 1, operativa y con responsable implícito.",
    "Acción concreta 2.",
    "Acción concreta 3 (solo si aplica)."
  ]
}

Descripción de cada campo:
- hallazgos: 2-3 oraciones describiendo lo encontrado.
- conclusiones_generales: 4-5 oraciones evaluando la madurez 5S, mencionando fortalezas y, si aplica, áreas de oportunidad.
- card_summary: 3-4 oraciones para tarjeta resumen en la sección de conclusión del departamento.
- cumplimiento_label: "Cumplimiento total" si es 100%, o "Área de oportunidad: [Nombre de la S]" si hay alguna por debajo.

TONO Y ESTILO — usa exactamente este registro, basado en informes reales de Cecomsa:
- "Este almacén demuestra un alto nivel de madurez en la implementación de las 5S."
- "La clasificación, el orden, la limpieza, la estandarización y la disciplina están completamente consolidados."
- "El personal refleja una cultura genuina de organización técnica."
- "Área de oportunidad: Seiso (Limpiar) – puntual."
- "No se identificaron hallazgos."
- "Se requiere un plan estructurado con fecha compromiso para cerrar estos hallazgos antes de la próxima auditoría." (solo si hay áreas débiles)

REGLAS:
- Si el cumplimiento es 100%, los hallazgos deben ser positivos, sin inventar problemas.
- Si el cumplimiento está entre 90-99%, mencionar la(s) S específica(s) con menor puntaje como área de oportunidad puntual, sin exagerar.
- Si el cumplimiento es menor a 90%, ser más directo sobre la necesidad de acción correctiva.
- No uses bullets dentro de los campos de texto, solo prosa continua.
- No inventes observaciones de campo que no te haya dado — solo usa los porcentajes y el contexto general.`;
  }

  async function handleBulkCopy() {
    await navigator.clipboard.writeText(buildBulkPrompt());
    setCopiedBulk(true);
    setTimeout(() => setCopiedBulk(false), 2500);
  }

  return (
    <div className="min-h-screen relative z-10">
      <Header
        title="Auditorías 5S"
        subtitle={total ? `${total} registros` : "Sin registros"}
        onRefresh={refetch}
      />

      {/* Acciones */}
      <div className="flex items-center gap-3 mb-6 flex-wrap">
        {isAdmin && (
          <>
            <button
              onClick={() => goToAudit("/audits/new")}
              className="btn-primary flex items-center gap-2 text-sm"
            >
              <Plus size={16} /> Nueva Auditoría
            </button>
            <button
              onClick={() => setShowImport(true)}
              className="btn-secondary flex items-center gap-2 text-sm"
            >
              <Upload size={16} /> Importar Excel
            </button>
          </>
        )}

        {/* Exportar Excel dropdown */}
        <div className="relative" ref={exportMenuRef}>
          <button
            onClick={() => setShowExportMenu((v) => !v)}
            disabled={exportingExcel}
            className="btn-secondary flex items-center gap-2 text-sm"
          >
            {exportingExcel
              ? <Loader2 size={15} className="animate-spin" />
              : <Download size={15} />}
            {exportingExcel ? "Exportando…" : "Exportar Excel"}
            <ChevronDown size={13} className={`transition-transform duration-150 ${showExportMenu ? "rotate-180" : ""}`} />
          </button>
          {showExportMenu && (
            <div className="absolute left-0 top-full mt-1 bg-surface border border-ink/10 rounded-xl shadow-lg py-1 z-20 min-w-[180px]">
              <button
                onClick={() => handleExportExcel("summary")}
                className="w-full text-left px-4 py-2.5 text-sm hover:bg-ink/5 text-ink transition-colors"
              >
                Resumen general
              </button>
              <button
                onClick={() => handleExportExcel("detail")}
                className="w-full text-left px-4 py-2.5 text-sm hover:bg-ink/5 text-ink transition-colors"
              >
                Detalle de preguntas
              </button>
            </div>
          )}
        </div>

        {/* Copiar para Claude.ai */}
        {audits.length > 0 && (
          <button
            onClick={handleBulkCopy}
            className="btn-secondary flex items-center gap-2 text-sm"
            title={`Genera un prompt con las ${audits.length} auditorías visibles para analizar en claude.ai`}
          >
            {copiedBulk ? <ClipboardCheck size={15} /> : <Copy size={15} />}
            {copiedBulk
              ? "¡Copiado!"
              : `Copiar para Claude.ai${audits.length < total ? ` (${audits.length})` : ""}`}
          </button>
        )}

        {isFetching && !isLoading && (
          <Loader2 size={14} className="animate-spin text-primary/40" />
        )}
      </div>

      <div className="glass rounded-2xl px-4 py-3 flex flex-wrap items-center gap-3 mb-6 animate-fade-in relative z-20">
        <div className="flex items-center gap-2 text-primary/60 shrink-0">
          <Filter size={15} />
          <span className="text-xs font-semibold uppercase tracking-wide">Filtros</span>
        </div>

        <MultiSelect
          allLabel="Todos los tipos"
          options={types.map((t) => ({ value: t.id, label: t.name }))}
          selected={filters.audit_type_id || []}
          onChange={(arr) => setFilter("audit_type_id", arr.length ? arr : undefined)}
        />

        <MultiSelect
          allLabel="Todas las sucursales"
          options={branches.map((b) => ({ value: b, label: b }))}
          selected={filters.branch || []}
          onChange={(arr) => setFilter("branch", arr.length ? arr : undefined)}
        />

        {/* Trimestre */}
        <select
          value={filters.quarter || ""}
          onChange={(e) => setFilter("quarter", e.target.value || undefined)}
          className="input-glass text-sm py-1.5 px-3 w-auto"
        >
          <option value="">Todos los trimestres</option>
          {QUARTERS.map((q) => <option key={q} value={q}>{q}</option>)}
        </select>

        {/* Período: mes + año (el año evaluado, no la fecha de realización) */}
        <div className="flex items-center gap-1 text-xs text-ink/40 font-semibold uppercase tracking-wide shrink-0">
          Período:
        </div>
        <select
          value={filters.period_month || ""}
          onChange={(e) => setFilter("period_month", e.target.value ? Number(e.target.value) : undefined)}
          className="input-glass text-sm py-1.5 px-3 w-auto"
        >
          <option value="">Todos los meses</option>
          {MONTHS.map((m, i) => <option key={i + 1} value={i + 1}>{m}</option>)}
        </select>

        <MultiSelect
          allLabel="Todos los años"
          options={yearOptions}
          selected={filters.period_year || []}
          onChange={(arr) => setFilter("period_year", arr.length ? arr : undefined)}
        />

        <button
          onClick={resetFilters}
          disabled={!filtersActive}
          className={`btn-ghost flex items-center gap-1.5 text-xs ml-auto text-secondary
                     hover:text-secondary/80 transition-colors
                     ${filtersActive ? "opacity-100" : "opacity-0 pointer-events-none"}`}
        >
          <X size={13} />
          Limpiar filtros
        </button>
      </div>

      <GlassCard padding={false} className="relative">
        {isLoading ? (
          <div className="flex items-center justify-center h-48">
            <Loader2 size={28} className="animate-spin text-primary/40" />
          </div>
        ) : audits.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-48 gap-2 text-ink/30">
            <p className="text-sm">No hay auditorías que coincidan con los filtros.</p>
            {filtersActive && (
              <button onClick={resetFilters} className="btn-ghost text-xs">
                Limpiar filtros
              </button>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[700px]">
              <thead>
                <tr className="border-b border-ink/10">
                  {["Fecha","Período","Sucursal","Tipo","Auditor","% General","Estado",""].map((h) => (
                    <th key={h} className="text-left py-3.5 px-4 text-xs font-semibold
                                           text-ink/50 uppercase tracking-wide whitespace-nowrap">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-ink/5">
                {audits.map((a) => (
                  <tr key={a.id} className="hover:bg-primary/[0.03] transition-colors group">
                    <td className="py-3 px-4 text-ink/70 whitespace-nowrap">{fmt.date(a.audit_date)}</td>
                    <td className="py-3 px-4 text-ink/60 whitespace-nowrap">
                      {a.period_month ? `${MONTHS_ABBR[a.period_month - 1]} ${a.period_year ?? ""}` : (a.period_year ?? "—")}
                    </td>
                    <td className="py-3 px-4 font-medium text-ink">{a.branch}</td>
                    <td className="py-3 px-4 text-ink/60 whitespace-nowrap">{a.audit_type_name}</td>
                    <td className="py-3 px-4 text-ink/60">{a.auditor_name || "—"}</td>
                    <td className="py-3 px-4 font-semibold whitespace-nowrap"
                        style={{ color: fmt.semaforoColor(a.percentage) }}>
                      {fmt.pct(a.percentage)}
                    </td>
                    <td className="py-3 px-4 whitespace-nowrap">
                      <span className={fmt.badgeClass(a.status)}>{a.status}</span>
                    </td>
                    <td className="py-3 px-4">
                      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button
                          onClick={() => goToAudit(`/audits/${a.id}`)}
                          className="btn-ghost p-1.5" title="Ver detalle"
                        >
                          <Eye size={15} />
                        </button>
                        <button
                          onClick={() => goToAudit(`/audits/${a.id}/analysis`)}
                          className="btn-ghost p-1.5 text-secondary/60 hover:text-secondary hover:bg-secondary/10"
                          title="Analizar"
                        >
                          <BarChart2 size={15} />
                        </button>
                        {isAdmin && (
                          <>
                            <button onClick={() => goToAudit(`/audits/${a.id}/edit`)}
                              className="btn-ghost p-1.5 hover:bg-primary/10" title="Editar">
                              <Pencil size={15} />
                            </button>
                            <button onClick={() => setDeleteId(a.id)}
                              className="btn-ghost p-1.5 text-danger/60 hover:text-danger hover:bg-danger/10" title="Eliminar">
                              <Trash2 size={15} />
                            </button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Paginación */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-ink/10 flex-wrap gap-3">
            <p className="text-xs text-ink/50">
              {(currentPage - 1) * PAGE_SIZE + 1}–{Math.min(currentPage * PAGE_SIZE, total)} de {total} registros
            </p>
            <div className="flex items-center gap-1">
              <button disabled={!hasPrev} onClick={() => goPage(currentPage - 1)}
                className="w-8 h-8 flex items-center justify-center rounded-lg glass
                           text-ink/60 hover:text-ink disabled:opacity-30 disabled:cursor-not-allowed">
                <ChevronLeft size={14} />
              </button>
              {pageNumbers.map((p, i) =>
                p === "..." ? (
                  <span key={`e${i}`} className="w-8 text-center text-xs text-ink/30">…</span>
                ) : (
                  <button key={p} onClick={() => goPage(p)}
                    className={`w-8 h-8 rounded-lg text-xs font-medium transition-all ${
                      p === currentPage ? "bg-primary text-white shadow-sm" : "glass text-ink/60 hover:text-ink"
                    }`}>
                    {p}
                  </button>
                )
              )}
              <button disabled={!hasNext} onClick={() => goPage(currentPage + 1)}
                className="w-8 h-8 flex items-center justify-center rounded-lg glass
                           text-ink/60 hover:text-ink disabled:opacity-30 disabled:cursor-not-allowed">
                <ChevronRight size={14} />
              </button>
            </div>
          </div>
        )}
      </GlassCard>

      {selectedId && <AuditDetail auditId={selectedId} onClose={() => setSelectedId(null)} />}

      <ConfirmModal
        open={!!deleteId}
        title="Eliminar auditoría"
        message="Esta acción no se puede deshacer. Se eliminarán todos los detalles de preguntas asociados."
        onConfirm={() => deleteMut.mutate(deleteId)}
        onCancel={() => setDeleteId(null)}
        confirmLabel={deleteMut.isPending ? "Eliminando..." : "Eliminar"}
      />

      {showImport && (
        <ImportModal
          types={types}
          onClose={() => setShowImport(false)}
          onSuccess={() => {
            qc.invalidateQueries(["audits"]);
            qc.invalidateQueries(["audit-kpis"]);
            setShowImport(false);
          }}
        />
      )}
    </div>
  );
}