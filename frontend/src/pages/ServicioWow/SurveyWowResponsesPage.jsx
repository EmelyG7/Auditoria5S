/**
 * SurveyWowResponsesPage.jsx — Respuestas importadas del Servicio WOW 2026.
 *
 * Anónimas: el backend no guarda nombre ni correo del respondiente. Los campos
 * identificadores (Cliente, Teléfono... de Almacén externo) llegan enmascarados
 * para usuarios no administradores.
 *
 * Admin: "Importar Excel" sube el export de Forms de un formulario (también
 * disponible por fila en Formularios).
 */

import { useState, useEffect, Fragment } from "react";
import { useQuery } from "@tanstack/react-query";
import { useSearchParams } from "react-router-dom";
import { Loader2, Filter, X, ChevronLeft, ChevronRight, ChevronDown, Award, Upload } from "lucide-react";
import { surveyWowService } from "../../services/surveyWow";
import { useFilters } from "../../hooks/useFilters";
import { useAuth } from "../../store/AuthContext";
import Header from "../../components/Layout/Header";
import GlassCard from "../../components/Layout/GlassCard";
import ResponsesImportModal from "../../components/ServicioWow/ResponsesImportModal";
import {
  SURVEY_TYPE_LABEL, fmtPct, scoreToPct, wowColor, paginator,
} from "../../components/ServicioWow/wowUtils";
import { fmt } from "../../utils/format";

const PAGE_SIZE = 20;

function ResponseDetail({ response }) {
  const { data: form, isLoading } = useQuery({
    queryKey: ["wow-form", response.form_id],
    queryFn:  () => surveyWowService.getForm(response.form_id),
  });
  if (isLoading) {
    return <div className="py-4 flex justify-center"><Loader2 size={18} className="animate-spin text-primary/40" /></div>;
  }
  const qById = Object.fromEntries((form?.questions || []).map((q) => [q.id, q]));

  return (
    <div className="px-4 pb-4 pt-1 space-y-2">
      {response.answers.map((a) => {
        const q = qById[a.question_id];
        return (
          <div key={a.question_id} className="flex gap-3 items-start text-sm">
            <span className="text-xs text-ink/30 w-5 shrink-0 pt-0.5">{a.order}</span>
            <p className="flex-1 text-ink/70 leading-snug">{q?.text || "—"}</p>
            <div className="w-40 shrink-0 text-right">
              {a.value_score != null ? (
                <span className="font-semibold" style={{ color: wowColor(scoreToPct(a.value_score)) }}>{a.value_score} / 5</span>
              ) : (
                <span className="text-ink/60 whitespace-pre-wrap">{a.value_text || "—"}</span>
              )}
            </div>
          </div>
        );
      })}
      {response.nominee_name && (
        <div className="mt-3 bg-secondary/5 border border-secondary/15 rounded-xl px-3 py-2.5 text-sm">
          <p className="flex items-center gap-1.5 font-semibold text-secondary">
            <Award size={14} /> Nominación: {response.nominee_name}
          </p>
          {response.nomination_reason && (
            <p className="text-ink/60 mt-1 leading-snug">{response.nomination_reason}</p>
          )}
        </div>
      )}
    </div>
  );
}

export default function SurveyWowResponsesPage() {
  const { isAdmin } = useAuth();
  const [showImport, setShowImport] = useState(false);
  const [searchParams] = useSearchParams();
  const initialFormId  = searchParams.get("form_id");
  const DEFAULTS       = { page: 1, page_size: PAGE_SIZE };

  const { filters, activeFilters, setFilter, resetFilters } = useFilters(
    initialFormId ? { ...DEFAULTS, form_id: Number(initialFormId) } : DEFAULTS, DEFAULTS,
  );
  const [expanded, setExpanded] = useState(null);

  // Cambiar cualquier filtro vuelve a la página 1
  const setFilterAndReset = (k, v) => { setFilter(k, v); setFilter("page", 1); };

  const { data: departments = [] } = useQuery({
    queryKey: ["wow-departments"],
    queryFn:  surveyWowService.getDepartments,
  });
  const { data: forms = [] } = useQuery({
    queryKey: ["wow-forms", {}],
    queryFn:  () => surveyWowService.getForms(),
  });
  const formsWithData = forms.filter((f) => f.n_responses > 0 || f.id === filters.form_id);

  const { data, isLoading, isFetching, refetch } = useQuery({
    queryKey: ["wow-responses", activeFilters],
    queryFn:  () => surveyWowService.getResponses(activeFilters),
    keepPreviousData: true,
  });

  useEffect(() => { setExpanded(null); }, [activeFilters.page, activeFilters.form_id]);

  const items       = data?.items || [];
  const total       = data?.total || 0;
  const totalPages  = data?.total_pages || 1;
  const currentPage = data?.page || filters.page || 1;
  const goPage      = (p) => setFilter("page", p);

  const filtersActive = !!(filters.form_id || filters.department_id || filters.survey_type);

  return (
    <div className="min-h-screen relative z-10">
      <Header
        title="Respuestas — Servicio WOW 2026"
        subtitle={total ? `${total} respuestas anónimas` : "Sin respuestas"}
        onRefresh={refetch}
      />

      <div className="glass rounded-2xl px-4 py-3 flex flex-wrap items-center gap-3 mb-6 animate-fade-in relative z-20">
        <div className="flex items-center gap-2 text-primary/60 shrink-0">
          <Filter size={15} />
          <span className="text-xs font-semibold uppercase tracking-wide">Filtros</span>
        </div>

        <select
          value={filters.survey_type || ""}
          onChange={(e) => setFilterAndReset("survey_type", e.target.value)}
          className="input-glass text-sm py-1.5 px-3 w-auto"
        >
          <option value="">Interno y externo</option>
          <option value="interno">Cliente interno</option>
          <option value="externo">Cliente externo</option>
        </select>

        <select
          value={filters.department_id || ""}
          onChange={(e) => setFilterAndReset("department_id", e.target.value ? Number(e.target.value) : undefined)}
          className="input-glass text-sm py-1.5 px-3 w-auto"
        >
          <option value="">Todos los departamentos</option>
          {departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
        </select>

        <select
          value={filters.form_id || ""}
          onChange={(e) => setFilterAndReset("form_id", e.target.value ? Number(e.target.value) : undefined)}
          className="input-glass text-sm py-1.5 px-3 w-auto max-w-[320px]"
        >
          <option value="">Todos los formularios con respuestas</option>
          {formsWithData.map((f) => (
            <option key={f.id} value={f.id}>
              {SURVEY_TYPE_LABEL[f.survey_type]} · {f.title.split("—").pop().trim()}
            </option>
          ))}
        </select>

        {isFetching && !isLoading && <Loader2 size={14} className="animate-spin text-primary/40" />}

        <button
          onClick={resetFilters}
          disabled={!filtersActive}
          className={`btn-ghost flex items-center gap-1.5 text-xs ml-auto text-secondary
                     hover:text-secondary/80 transition-colors
                     ${filtersActive ? "opacity-100" : "opacity-0 pointer-events-none"}`}
        >
          <X size={13} /> Limpiar filtros
        </button>

        {isAdmin && (
          <button onClick={() => setShowImport(true)} className="btn-primary flex items-center gap-2 text-sm">
            <Upload size={15} /> Importar Excel
          </button>
        )}
      </div>

      <GlassCard padding={false} hover={false} className="relative">
        {isLoading ? (
          <div className="flex items-center justify-center h-48">
            <Loader2 size={28} className="animate-spin text-primary/40" />
          </div>
        ) : items.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-48 gap-2 text-ink/30">
            <p className="text-sm">No hay respuestas importadas{filtersActive ? " para estos filtros" : ""}.</p>
            <p className="text-xs">{isAdmin ? "Usa “Importar Excel” (arriba) o el botón de cada formulario en Formularios." : "Las importa un administrador."}</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[760px]">
              <thead>
                <tr className="border-b border-ink/10">
                  {["", "ID", "Fecha", "Tipo", "Departamento", "Sucursal", "Resultado", "Nominado"].map((h, i) => (
                    <th key={i} className="text-left py-3.5 px-4 text-xs font-semibold text-ink/50 uppercase tracking-wide whitespace-nowrap">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-ink/5">
                {items.map((r) => {
                  const open = expanded === r.id;
                  return (
                    <Fragment key={r.id}>
                      <tr
                        onClick={() => setExpanded(open ? null : r.id)}
                        className="hover:bg-primary/[0.03] transition-colors cursor-pointer"
                      >
                        <td className="py-3 pl-4 pr-0 w-6">
                          <ChevronDown size={14} className={`text-ink/40 transition-transform ${open ? "" : "-rotate-90"}`} />
                        </td>
                        <td className="py-3 px-4 text-ink/40 font-mono text-xs">#{r.external_response_id}</td>
                        <td className="py-3 px-4 text-ink/70 whitespace-nowrap">{fmt.date(r.completed_at)}</td>
                        <td className="py-3 px-4 text-ink/60">{SURVEY_TYPE_LABEL[r.survey_type]}</td>
                        <td className="py-3 px-4 font-medium text-ink whitespace-nowrap">{r.department_name}</td>
                        <td className="py-3 px-4 text-ink/60 whitespace-nowrap">{r.branch || "—"}</td>
                        <td className="py-3 px-4 font-semibold whitespace-nowrap" style={{ color: wowColor(r.porcentaje) }}>
                          {fmtPct(r.porcentaje)}
                        </td>
                        <td className="py-3 px-4 text-ink/60 whitespace-nowrap">{r.nominee_name || "—"}</td>
                      </tr>
                      {open && (
                        <tr className="bg-primary/[0.02]">
                          <td colSpan={8}><ResponseDetail response={r} /></td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {totalPages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-ink/10 flex-wrap gap-3">
            <p className="text-xs text-ink/50">
              {(currentPage - 1) * PAGE_SIZE + 1}–{Math.min(currentPage * PAGE_SIZE, total)} de {total} respuestas
            </p>
            <div className="flex items-center gap-1">
              <button disabled={!data?.has_prev} onClick={() => goPage(currentPage - 1)}
                className="w-8 h-8 flex items-center justify-center rounded-lg glass text-ink/60 hover:text-ink disabled:opacity-30 disabled:cursor-not-allowed">
                <ChevronLeft size={14} />
              </button>
              {paginator(currentPage, totalPages).map((p, i) =>
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
              <button disabled={!data?.has_next} onClick={() => goPage(currentPage + 1)}
                className="w-8 h-8 flex items-center justify-center rounded-lg glass text-ink/60 hover:text-ink disabled:opacity-30 disabled:cursor-not-allowed">
                <ChevronRight size={14} />
              </button>
            </div>
          </div>
        )}
      </GlassCard>

      {showImport && (
        <ResponsesImportModal forms={forms} initialFormId={filters.form_id} onClose={() => setShowImport(false)} />
      )}
    </div>
  );
}
