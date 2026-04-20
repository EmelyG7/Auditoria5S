import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus, Upload, Trash2, Eye, Loader2 } from "lucide-react";
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
import { useNavigate } from "react-router-dom";

export default function AuditsPage() {
  const { isAdmin } = useAuth();
  const qc = useQueryClient();
  const { filters, activeFilters, setFilter, resetFilters } = useFilters({ page: 1, page_size: 15 });

  const [selectedId,  setSelectedId]  = useState(null);
  const [deleteId,    setDeleteId]    = useState(null);
  const [showImport,  setShowImport]  = useState(false);

  const { data: types = [] } = useQuery({ queryKey: ["audit-types"], queryFn: auditsService.getTypes });

  const { data, isLoading, refetch } = useQuery({
    queryKey: ["audits", activeFilters],
    queryFn:  () => auditsService.list(activeFilters),
  });

  const deleteMut = useMutation({
    mutationFn: auditsService.delete,
    onSuccess:  () => { qc.invalidateQueries(["audits"]); setDeleteId(null); },
  });

  const audits = data?.items || [];
  const total  = data?.total || 0;

  const navigate = useNavigate();

  return (
    <div className="min-h-screen relative z-10">
      <Header title="Auditorías 5S" subtitle={`${total} registros`} onRefresh={refetch} />

      {/* Acciones */}
      <div className="flex items-center gap-3 mb-6 flex-wrap">
        {isAdmin && (
          <>
            <button onClick={() => navigate("/audits/new")} className="btn-primary flex items-center gap-2 text-sm">
              <Plus size={16} /> Nueva Auditoría
            </button>
            <button onClick={() => setShowImport(true)} className="btn-secondary flex items-center gap-2 text-sm">
              <Upload size={16} /> Importar Excel
            </button>
          </>
        )}
      </div>

      <FilterBar
        filters={filters}
        onFilterChange={setFilter}
        onReset={resetFilters}
        auditTypes={types}
      />

      <GlassCard padding={false}>
        {isLoading ? (
          <div className="flex items-center justify-center h-48">
            <Loader2 size={28} className="animate-spin text-primary/40" />
          </div>
        ) : audits.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-48 text-ink/30">
            <p className="text-sm">No hay auditorías que coincidan con los filtros.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-ink/10">
                  {["Fecha", "Sucursal", "Tipo", "Auditor", "% General", "Estado", "Acciones"].map((h) => (
                    <th key={h} className="text-left py-3.5 px-4 text-xs font-semibold text-ink/50 uppercase tracking-wide">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-ink/5">
                {audits.map((a) => (
                  <tr key={a.id} className="hover:bg-primary/3 transition-colors group">
                    <td className="py-3 px-4 text-ink/70">{fmt.date(a.audit_date)}</td>
                    <td className="py-3 px-4 font-medium text-ink">{a.branch}</td>
                    <td className="py-3 px-4 text-ink/60">{a.audit_type_name}</td>
                    <td className="py-3 px-4 text-ink/60">{a.auditor_name || "—"}</td>
                    <td className="py-3 px-4 font-semibold" style={{ color: fmt.semaforoColor(a.percentage) }}>
                      {fmt.pct(a.percentage)}
                    </td>
                    <td className="py-3 px-4">
                      <span className={fmt.badgeClass(a.status)}>{a.status}</span>
                    </td>
                    <td className="py-3 px-4">
                      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button onClick={() => setSelectedId(a.id)} className="btn-ghost p-1.5" title="Ver detalle">
                          <Eye size={15} />
                        </button>
                        {isAdmin && (
                          <button onClick={() => setDeleteId(a.id)} className="btn-ghost p-1.5 text-danger/60 hover:text-danger hover:bg-danger/10" title="Eliminar">
                            <Trash2 size={15} />
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

        {/* Paginación */}
        {data?.total_pages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-ink/10">
            <p className="text-xs text-ink/50">
              Página {data.page} de {data.total_pages} · {total} registros
            </p>
            <div className="flex gap-2">
              <button
                disabled={!data.has_prev}
                onClick={() => setFilter("page", (filters.page || 1) - 1)}
                className="btn-ghost text-xs disabled:opacity-30 disabled:cursor-not-allowed"
              >← Anterior</button>
              <button
                disabled={!data.has_next}
                onClick={() => setFilter("page", (filters.page || 1) + 1)}
                className="btn-ghost text-xs disabled:opacity-30 disabled:cursor-not-allowed"
              >Siguiente →</button>
            </div>
          </div>
        )}
      </GlassCard>

      {/* Detalle modal */}
      {selectedId && (
        <AuditDetail auditId={selectedId} onClose={() => setSelectedId(null)} />
      )}

      {/* Confirm delete */}
      <ConfirmModal
        open={!!deleteId}
        title="Eliminar auditoría"
        message="Esta acción no se puede deshacer. Se eliminarán todos los detalles de preguntas asociados."
        onConfirm={() => deleteMut.mutate(deleteId)}
        onCancel={() => setDeleteId(null)}
        confirmLabel={deleteMut.isPending ? "Eliminando..." : "Eliminar"}
      />

      {/* Import modal */}
      {showImport && (
        <ImportModal
          types={types}
          onClose={() => setShowImport(false)}
          onSuccess={() => { qc.invalidateQueries(["audits"]); setShowImport(false); }}
        />
      )}
    </div>
  );
}