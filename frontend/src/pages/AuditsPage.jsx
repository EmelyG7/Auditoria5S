/**
 * AuditsPage.jsx — Listado de auditorías con paginación numérica.
 */

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Plus, Upload, Trash2, Eye, Pencil, BarChart2,
  Loader2, ChevronLeft, ChevronRight,
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import { auditsService } from "../services/audits";
import { useFilters } from "../hooks/useFilters";
import { useAuth } from "../store/AuthContext";
import Header from "../components/Layout/Header";
import GlassCard from "../components/Layout/GlassCard";
import FilterBar from "../components/Common/FilterBar";
import ConfirmModal from "../components/Common/ConfirmModal";
import AuditDetail from "../components/Audits/AuditDetail";
import ImportModal from "../components/Audits/ImportModal";
import { fmt } from "../utils/format";

const PAGE_SIZE = 15;

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

  const { filters, activeFilters, setFilter, resetFilters } = useFilters({
    page: 1, page_size: PAGE_SIZE,
  });

  const [selectedId, setSelectedId] = useState(null);
  const [deleteId,   setDeleteId]   = useState(null);
  const [showImport, setShowImport] = useState(false);

  const { data: types = [] } = useQuery({
    queryKey: ["audit-types"],
    queryFn:  auditsService.getTypes,
  });

  const { data, isLoading, isFetching, refetch } = useQuery({
    queryKey: ["audits", activeFilters],
    queryFn:  () => auditsService.list(activeFilters),
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
    filters.status || filters.year || filters.quarter
  );

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
              onClick={() => navigate("/audits/new")}
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
        {isFetching && !isLoading && (
          <Loader2 size={14} className="animate-spin text-primary/40" />
        )}
      </div>

      <FilterBar
        filters={filters}
        onFilterChange={setFilter}
        onReset={resetFilters}
        auditTypes={types}
      />

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
                  {["Fecha","Sucursal","Tipo","Auditor","% General","Estado",""].map((h) => (
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
                          onClick={() => navigate(`/audits/${a.id}`)}
                          className="btn-ghost p-1.5" title="Ver detalle"
                        >
                          <Eye size={15} />
                        </button>
                        <button
                          onClick={() => navigate(`/audits/${a.id}/analysis`)}
                          className="btn-ghost p-1.5 text-secondary/60 hover:text-secondary hover:bg-secondary/10"
                          title="Analizar"
                        >
                          <BarChart2 size={15} />
                        </button>
                        {isAdmin && (
                          <>
                            <button onClick={() => navigate(`/audits/${a.id}/edit`)}
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