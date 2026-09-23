/**
 * SurveyWowFormsPage.jsx — Formularios de Microsoft Forms del Servicio WOW 2026.
 *
 * Un formulario por depto (+ sucursal / subproceso). Desde aquí se importa
 * el Excel de respuestas exportado de Forms, uno por formulario. La primera
 * importación crea las preguntas del formulario a partir del Excel.
 */

import { useState, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { Upload, Eye, Loader2, Filter, X, Search, FileText } from "lucide-react";
import { surveyWowService } from "../../services/surveyWow";
import { useFilters } from "../../hooks/useFilters";
import { useAuth } from "../../store/AuthContext";
import Header from "../../components/Layout/Header";
import GlassCard from "../../components/Layout/GlassCard";
import ResponsesImportModal from "../../components/ServicioWow/ResponsesImportModal";
import NomineesUploadModal from "../../components/ServicioWow/NomineesUploadModal";
import { SURVEY_TYPE_LABEL } from "../../components/ServicioWow/wowUtils";
import { fmt } from "../../utils/format";

export default function SurveyWowFormsPage() {
  const { isAdmin } = useAuth();
  const qc          = useQueryClient();
  const navigate    = useNavigate();

  const { filters, activeFilters, setFilter, resetFilters } = useFilters({});
  const [search,     setSearch]     = useState("");
  const [importForm, setImportForm] = useState(null);
  const [showNominees, setShowNominees] = useState(false);

  const { data: departments = [] } = useQuery({
    queryKey: ["wow-departments"],
    queryFn:  surveyWowService.getDepartments,
  });

  const { data: forms = [], isLoading, isFetching, refetch } = useQuery({
    queryKey: ["wow-forms", activeFilters],
    queryFn:  () => surveyWowService.getForms(activeFilters),
    keepPreviousData: true,
  });

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return forms;
    return forms.filter((f) =>
      [f.title, f.department_name, f.branch, f.subprocess, f.list_name]
        .some((v) => v?.toLowerCase().includes(q))
    );
  }, [forms, search]);

  const totalResponses = forms.reduce((acc, f) => acc + f.n_responses, 0);
  const conDatos       = forms.filter((f) => f.n_responses > 0).length;
  const filtersActive  = !!(filters.survey_type || filters.department_id || search);

  const clearAll = () => { resetFilters(); setSearch(""); };
  const internosSinNominados = forms.filter((f) => f.survey_type === "interno" && f.n_nominees == null).length;

  return (
    <div className="min-h-screen relative z-10">
      <Header
        title="Formularios — Servicio WOW 2026"
        subtitle={`${forms.length} formularios · ${conDatos} con respuestas · ${totalResponses} respuestas`}
        onRefresh={refetch}
      />

      {isAdmin && (
        <div className="flex items-center gap-3 mb-6 flex-wrap">
          <button onClick={() => setShowNominees(true)} className="btn-secondary flex items-center gap-2 text-sm">
            <FileText size={15} /> Cargar nominados (.txt)
          </button>
          {internosSinNominados > 0 && (
            <span className="text-xs text-warning">
              {internosSinNominados} formulario(s) interno(s) sin nominados: el sorteo no podrá excluir a su equipo.
            </span>
          )}
        </div>
      )}

      {/* Filtros */}
      <div className="glass rounded-2xl px-4 py-3 flex flex-wrap items-center gap-3 mb-6 animate-fade-in relative z-20">
        <div className="flex items-center gap-2 text-primary/60 shrink-0">
          <Filter size={15} />
          <span className="text-xs font-semibold uppercase tracking-wide">Filtros</span>
        </div>

        <select
          value={filters.survey_type || ""}
          onChange={(e) => setFilter("survey_type", e.target.value)}
          className="input-glass text-sm py-1.5 px-3 w-auto"
        >
          <option value="">Interno y externo</option>
          <option value="interno">Cliente interno</option>
          <option value="externo">Cliente externo</option>
        </select>

        <select
          value={filters.department_id || ""}
          onChange={(e) => setFilter("department_id", e.target.value ? Number(e.target.value) : undefined)}
          className="input-glass text-sm py-1.5 px-3 w-auto"
        >
          <option value="">Todos los departamentos</option>
          {departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
        </select>

        <div className="relative">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink/30" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar formulario o sucursal…"
            className="input-glass text-sm py-1.5 pl-8 pr-3 w-56"
          />
        </div>

        {isFetching && !isLoading && <Loader2 size={14} className="animate-spin text-primary/40" />}

        <button
          onClick={clearAll}
          disabled={!filtersActive}
          className={`btn-ghost flex items-center gap-1.5 text-xs ml-auto text-secondary
                     hover:text-secondary/80 transition-colors
                     ${filtersActive ? "opacity-100" : "opacity-0 pointer-events-none"}`}
        >
          <X size={13} /> Limpiar filtros
        </button>
      </div>

      <GlassCard padding={false} hover={false} className="relative">
        {isLoading ? (
          <div className="flex items-center justify-center h-48">
            <Loader2 size={28} className="animate-spin text-primary/40" />
          </div>
        ) : visible.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-48 gap-2 text-ink/30">
            <p className="text-sm">No hay formularios que coincidan con los filtros.</p>
            {filtersActive && <button onClick={clearAll} className="btn-ghost text-xs">Limpiar filtros</button>}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[760px]">
              <thead>
                <tr className="border-b border-ink/10">
                  {["Tipo", "Departamento", "Sucursal", "Preguntas", "Nominados", "Respuestas", "Última respuesta", ""].map((h) => (
                    <th key={h} className="text-left py-3.5 px-4 text-xs font-semibold text-ink/50 uppercase tracking-wide whitespace-nowrap">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-ink/5">
                {visible.map((f) => (
                  <tr key={f.id} className="hover:bg-primary/[0.03] transition-colors group">
                    <td className="py-3 px-4 whitespace-nowrap">
                      <span className={`text-xs font-semibold px-2 py-0.5 rounded-lg ${
                        f.survey_type === "interno" ? "bg-primary/10 text-primary" : "bg-secondary/10 text-secondary"
                      }`}>
                        {SURVEY_TYPE_LABEL[f.survey_type]}
                      </span>
                    </td>
                    <td className="py-3 px-4 font-medium text-ink whitespace-nowrap" title={f.title}>{f.department_name}</td>
                    <td className="py-3 px-4 text-ink/60 whitespace-nowrap">
                      {[f.subprocess, f.branch].filter(Boolean).join(" · ") || "—"}
                    </td>
                    <td className="py-3 px-4 text-ink/60">
                      {f.n_questions || <span className="text-ink/30" title="Se crean en la primera importación">—</span>}
                    </td>
                    <td className="py-3 px-4 text-ink/60">
                      {f.survey_type !== "interno" ? <span className="text-ink/20">n/a</span>
                        : f.n_nominees == null ? <span className="text-warning" title="Carga los .txt de Forms">sin cargar</span>
                        : f.n_nominees}
                    </td>
                    <td className="py-3 px-4 font-semibold text-ink">{f.n_responses}</td>
                    <td className="py-3 px-4 text-ink/60 whitespace-nowrap">{f.last_response_at ? fmt.date(f.last_response_at) : "—"}</td>
                    <td className="py-3 px-4">
                      <div className="flex items-center gap-1 opacity-60 group-hover:opacity-100 transition-opacity">
                        {f.n_responses > 0 && (
                          <button
                            onClick={() => navigate(`/servicio-wow/respuestas?form_id=${f.id}`)}
                            className="btn-ghost p-1.5" title="Ver respuestas"
                          >
                            <Eye size={15} />
                          </button>
                        )}
                        {isAdmin && (
                          <button
                            onClick={() => setImportForm(f)}
                            className="btn-ghost p-1.5 hover:bg-primary/10" title="Importar Excel de respuestas"
                          >
                            <Upload size={15} />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </GlassCard>

      {showNominees && (
        <NomineesUploadModal
          onClose={() => setShowNominees(false)}
          onSuccess={() => {
            qc.invalidateQueries({ queryKey: ["wow-forms"] });
            qc.invalidateQueries({ queryKey: ["wow-evaluators"] });
          }}
        />
      )}

      {importForm && <ResponsesImportModal form={importForm} onClose={() => setImportForm(null)} />}
    </div>
  );
}
