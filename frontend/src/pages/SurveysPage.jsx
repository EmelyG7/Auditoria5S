import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Upload, Trash2, Loader2 } from "lucide-react";
import { surveysService } from "../services/surveys";
import { useFilters } from "../hooks/useFilters";
import { useAuth } from "../store/AuthContext";
import Header from "../components/Layout/Header";
import GlassCard from "../components/Layout/GlassCard";
import ConfirmModal from "../components/Common/ConfirmModal";
import { fmt } from "../utils/format";

export default function SurveysPage() {
  const { isAdmin }  = useAuth();
  const qc           = useQueryClient();
  const { filters, activeFilters, setFilter, resetFilters } = useFilters({ page: 1, page_size: 20 });
  const [deleteId, setDeleteId] = useState(null);
  const [showImport, setShowImport] = useState(false);
  const [importing, setImporting]   = useState(false);
  const [importResult, setImportResult] = useState(null);

  const { data, isLoading, refetch } = useQuery({
    queryKey: ["surveys", activeFilters],
    queryFn:  () => surveysService.list(activeFilters),
  });

  const deleteMut = useMutation({
    mutationFn: surveysService.delete,
    onSuccess:  () => { qc.invalidateQueries(["surveys"]); setDeleteId(null); },
  });

  const handleImport = async (file) => {
    setImporting(true); setImportResult(null);
    try {
      const res = await surveysService.importExcel(file);
      setImportResult(res);
      qc.invalidateQueries(["surveys"]);
    } catch (e) {
      setImportResult({ error: e.response?.data?.detail || "Error al importar." });
    } finally { setImporting(false); }
  };

  const surveys = data?.items || [];

  return (
    <div className="min-h-screen relative z-10">
      <Header title="Encuestas de Satisfacción" subtitle={`${data?.total || 0} registros`} onRefresh={refetch} />

      <div className="flex gap-3 mb-6 flex-wrap">
        {isAdmin && (
          <button onClick={() => setShowImport(!showImport)} className="btn-secondary flex items-center gap-2 text-sm">
            <Upload size={16} /> Importar Excel
          </button>
        )}
      </div>

      {/* Import inline */}
      {showImport && isAdmin && (
        <GlassCard className="mb-5">
          <h3 className="text-sm font-semibold text-ink mb-3">Importar Satisfaccion_Estructura_Mejorada.xlsx</h3>
          <div className="flex items-center gap-4 flex-wrap">
            <input type="file" accept=".xlsx,.xls"
              onChange={(e) => { if (e.target.files[0]) handleImport(e.target.files[0]); }}
              className="text-sm text-ink/60 file:btn-primary file:mr-3 file:text-xs file:border-0 file:cursor-pointer" />
            {importing && <Loader2 size={18} className="animate-spin text-primary" />}
          </div>
          {importResult && (
            <div className={`mt-3 text-sm rounded-xl px-4 py-2.5 ${importResult.error ? "bg-danger/10 text-danger" : "bg-success/10 text-success"}`}>
              {importResult.error
                ? importResult.error
                : `✅ ${importResult.nuevas} nuevas · ${importResult.actualizadas} actualizadas · ${importResult.omitidas} omitidas`}
            </div>
          )}
        </GlassCard>
      )}

      <GlassCard padding={false}>
        {isLoading ? (
          <div className="flex items-center justify-center h-48"><Loader2 size={28} className="animate-spin text-primary/40" /></div>
        ) : surveys.length === 0 ? (
          <div className="flex items-center justify-center h-48 text-ink/30 text-sm">Sin datos. Importa el Excel de satisfacción.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-ink/10">
                  {["Departamento", "Área", "Sede", "Período", "Sat. Interna", "Sat. Externa", "Estado"].map((h) => (
                    <th key={h} className="text-left py-3 px-4 text-xs font-semibold text-ink/50 uppercase tracking-wide">{h}</th>
                  ))}
                  {isAdmin && <th className="py-3 px-4" />}
                </tr>
              </thead>
              <tbody className="divide-y divide-ink/5">
                {surveys.map((s) => {
                  const si = s.internal_satisfaction;
                  const estado = si >= 0.8 ? "Alto" : si >= 0.6 ? "Medio" : "Bajo";
                  const badgeCls = si >= 0.8 ? "badge-cumple" : si >= 0.6 ? "badge-por-mejorar" : "badge-critico";
                  return (
                    <tr key={s.id} className="hover:bg-primary/3 transition-colors group">
                      <td className="py-3 px-4 font-medium text-ink">{s.department}</td>
                      <td className="py-3 px-4 text-ink/60">{s.area || "—"}</td>
                      <td className="py-3 px-4 text-ink/60">{s.site || "—"}</td>
                      <td className="py-3 px-4 text-ink/60">{s.period_name || s.period}</td>
                      <td className="py-3 px-4 font-semibold text-primary">{fmt.score01(si)}</td>
                      <td className="py-3 px-4 font-semibold text-secondary">{fmt.score01(s.external_satisfaction)}</td>
                      <td className="py-3 px-4"><span className={badgeCls}>{estado}</span></td>
                      {isAdmin && (
                        <td className="py-3 px-4">
                          <button onClick={() => setDeleteId(s.id)}
                            className="btn-ghost p-1.5 text-danger/50 hover:text-danger opacity-0 group-hover:opacity-100 transition-opacity">
                            <Trash2 size={14} />
                          </button>
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </GlassCard>

      <ConfirmModal
        open={!!deleteId}
        title="Eliminar encuesta"
        message="Esta acción no se puede deshacer."
        onConfirm={() => deleteMut.mutate(deleteId)}
        onCancel={() => setDeleteId(null)}
      />
    </div>
  );
}