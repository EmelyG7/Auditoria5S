/**
 * SurveysPage.jsx
 * - Paginación con números de página
 * - Modal de importación con checkbox overwrite + resumen de resultados
 * - Filtros inline (año, trimestre, tipo)
 * - Botón de eliminar con confirmación
 */

import { useState, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Upload, Trash2, Loader2, X, CheckCircle2,
  AlertCircle, FileSpreadsheet, ChevronLeft, ChevronRight, Eye,
} from "lucide-react";
import { surveysService } from "../services/surveys";
import { useFilters } from "../hooks/useFilters";
import { useAuth } from "../store/AuthContext";
import Header from "../components/Layout/Header";
import GlassCard from "../components/Layout/GlassCard";
import ConfirmModal from "../components/Common/ConfirmModal";
import { fmt } from "../utils/format";

const PAGE_SIZE = 20;
const YEARS     = Array.from({ length: 6 }, (_, i) => new Date().getFullYear() - i);
const QTRS      = ["Q1", "Q2", "Q3", "Q4"];

// ─── Helpers ──────────────────────────────────────────────────────────────────
const satColor = (v) => {
  if (v == null) return "text-ink/40";
  const n = +v;
  if (n >= 0.8) return "text-success font-semibold";
  if (n >= 0.6) return "text-warning font-semibold";
  return "text-danger font-semibold";
};

// ─── Modal de importación ─────────────────────────────────────────────────────
function ImportModal({ onClose, onSuccess }) {
  const inputRef               = useRef();
  const [file,      setFile]   = useState(null);
  const [overwrite, setOver]   = useState(false);
  const [loading,   setLoad]   = useState(false);
  const [result,    setResult] = useState(null);   // éxito
  const [error,     setError]  = useState("");
  const [dragging,  setDrag]   = useState(false);

  const pickFile = (f) => {
    if (!f) return;
    if (!f.name.match(/\.(xlsx|xls)$/i)) {
      setError("Solo se aceptan archivos .xlsx o .xls");
      return;
    }
    setFile(f);
    setError("");
    setResult(null);
  };

  const submit = async () => {
    if (!file) return;
    setLoad(true);
    setError("");
    try {
      const res = await surveysService.importExcel(file, overwrite);
      setResult(res);
      onSuccess?.();
    } catch (e) {
      setError(e.response?.data?.detail || "Error al importar el archivo.");
    } finally {
      setLoad(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: "rgba(10,20,40,0.45)", backdropFilter: "blur(6px)" }}
    >
      <div className="glass rounded-3xl p-6 w-full max-w-md shadow-2xl animate-fade-up">
        {/* Header */}
        <div className="flex items-center justify-between mb-5">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-2xl bg-primary/15 flex items-center justify-center">
              <FileSpreadsheet size={16} className="text-primary" />
            </div>
            <div>
              <h2 className="text-base font-semibold text-ink">Importar Encuestas</h2>
              <p className="text-xs text-ink/50">Formato: Satisfaccion_Estructura_Mejorada.xlsx</p>
            </div>
          </div>
          <button onClick={onClose} className="btn-ghost p-1.5"><X size={16} /></button>
        </div>

        {/* ─ Fase de selección ─ */}
        {!result && (
          <>
            {/* Drop zone */}
            <div
              onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
              onDragLeave={() => setDrag(false)}
              onDrop={(e) => { e.preventDefault(); setDrag(false); pickFile(e.dataTransfer.files[0]); }}
              onClick={() => inputRef.current?.click()}
              className={`border-2 border-dashed rounded-2xl p-6 text-center cursor-pointer
                          transition-all duration-200 mb-4 ${
                dragging
                  ? "border-primary bg-primary/8"
                  : "border-ink/15 hover:border-primary/40 hover:bg-primary/4"
              }`}
            >
              <input
                ref={inputRef} type="file" accept=".xlsx,.xls"
                className="hidden"
                onChange={(e) => pickFile(e.target.files[0])}
              />
              {file ? (
                <div className="flex items-center justify-center gap-2 text-primary">
                  <FileSpreadsheet size={18} />
                  <span className="text-sm font-medium truncate max-w-xs">{file.name}</span>
                </div>
              ) : (
                <div className="text-ink/40">
                  <FileSpreadsheet size={28} className="mx-auto mb-2 opacity-40" />
                  <p className="text-sm">Arrastra o haz clic para seleccionar</p>
                  <p className="text-xs mt-1 opacity-60">.xlsx / .xls</p>
                </div>
              )}
            </div>

            {/* Opción overwrite */}
            <label className="flex items-center gap-2.5 cursor-pointer mb-4 px-1 select-none">
              <input
                type="checkbox" checked={overwrite}
                onChange={(e) => setOver(e.target.checked)}
                className="w-4 h-4 accent-primary rounded"
              />
              <span className="text-sm text-ink/70">
                Actualizar registros duplicados
              </span>
            </label>

            {/* Error */}
            {error && (
              <div className="flex items-center gap-2 bg-danger/10 border border-danger/20
                              text-danger text-xs rounded-xl px-3 py-2 mb-4">
                <AlertCircle size={13} /> {error}
              </div>
            )}

            <div className="flex justify-end gap-3">
              <button onClick={onClose} className="btn-secondary text-sm">Cancelar</button>
              <button
                onClick={submit}
                disabled={!file || loading}
                className="btn-primary text-sm flex items-center gap-2 disabled:opacity-50"
              >
                {loading
                  ? <><Loader2 size={14} className="animate-spin" /> Importando...</>
                  : "Importar"}
              </button>
            </div>
          </>
        )}

        {/* ─ Fase de resultado ─ */}
        {result && (
          <div className="space-y-4">
            <div className="flex items-center gap-2 text-success">
              <CheckCircle2 size={18} />
              <span className="font-medium text-sm">Importación completada</span>
            </div>

            {/* Cuadrantes de resumen */}
            <div className="grid grid-cols-2 gap-3">
              {[
                ["Nuevas",       result.nuevas,       "text-success"],
                ["Actualizadas", result.actualizadas, "text-primary"],
                ["Omitidas",     result.omitidas,     "text-warning"],
                ["Errores",      result.errores_n,    "text-danger"],
              ].map(([label, val, cls]) => (
                <div key={label} className="glass rounded-xl p-3 text-center">
                  <p className={`text-2xl font-bold ${cls}`}>{val ?? 0}</p>
                  <p className="text-xs text-ink/50 mt-0.5">{label}</p>
                </div>
              ))}
            </div>

            {/* Detalle de errores */}
            {result.errores?.length > 0 && (
              <div className="bg-danger/8 border border-danger/15 rounded-xl p-3
                              max-h-32 overflow-y-auto space-y-1">
                {result.errores.map((e, i) => (
                  <p key={i} className="text-xs text-danger/80">{e}</p>
                ))}
              </div>
            )}

            <button onClick={onClose} className="btn-primary w-full text-sm">
              Cerrar
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Página principal ─────────────────────────────────────────────────────────
export default function SurveysPage() {
  const { isAdmin } = useAuth();
  const qc          = useQueryClient();

  const { filters, activeFilters, setFilter, resetFilters } = useFilters({
    page:      1,
    page_size: PAGE_SIZE,
  });

  const [deleteId,   setDeleteId]   = useState(null);
  const [showImport, setShowImport] = useState(false);
  const [detailRow,  setDetailRow]  = useState(null);

  // ── Query ──────────────────────────────────────────────────────────────────
  const { data, isLoading, isFetching, refetch } = useQuery({
    queryKey: ["surveys", activeFilters],
    queryFn:  () => surveysService.list(activeFilters),
    keepPreviousData: true,
  });

  const deleteMut = useMutation({
    mutationFn: surveysService.delete,
    onSuccess:  () => {
      qc.invalidateQueries(["surveys"]);
      qc.invalidateQueries(["survey-kpis"]);
      setDeleteId(null);
    },
  });

  const surveys     = data?.items       || [];
  const total       = data?.total       || 0;
  const totalPages  = data?.total_pages || 1;
  const currentPage = data?.page        || (filters.page ?? 1);
  const hasNext     = data?.has_next    ?? false;
  const hasPrev     = data?.has_prev    ?? false;

  // Paginador con elipsis
  const pageNumbers = (() => {
    if (totalPages <= 7) return Array.from({ length: totalPages }, (_, i) => i + 1);
    const delta = 2;
    const range = [];
    for (
      let i = Math.max(2, currentPage - delta);
      i <= Math.min(totalPages - 1, currentPage + delta);
      i++
    ) range.push(i);
    if (currentPage - delta > 2)              range.unshift("...");
    if (currentPage + delta < totalPages - 1) range.push("...");
    return [1, ...range, totalPages];
  })();

  const goPage = (p) => setFilter("page", p);

  const filtersActive = !!(
    filters.year || filters.quarter || filters.type || filters.search
  );

  return (
    <div className="min-h-screen relative z-10">
      <Header
        title="Encuestas de Satisfacción"
        subtitle={total ? `${total} registros` : "Sin registros"}
        onRefresh={refetch}
      />

      {/* ── Acciones ──────────────────────────────────────────────────────── */}
      <div className="flex items-center gap-3 mb-5 flex-wrap">
        {isAdmin && (
          <button
            onClick={() => setShowImport(true)}
            className="btn-primary flex items-center gap-2 text-sm"
          >
            <Upload size={16} /> Importar Excel
          </button>
        )}
        {isFetching && !isLoading && (
          <Loader2 size={14} className="animate-spin text-primary/40" />
        )}
      </div>

      {/* ── Filtros inline ────────────────────────────────────────────────── */}
      <GlassCard className="mb-5 !p-4">
        <div className="flex flex-wrap gap-3 items-end">
          {/* Año */}
          <div>
            <label className="field-label">Año</label>
            <select
              value={filters.year || ""}
              onChange={(e) => {
                setFilter("year", e.target.value || undefined);
                setFilter("page", 1);
              }}
              className="input-glass text-sm w-28"
            >
              <option value="">Todos</option>
              {YEARS.map((y) => <option key={y} value={y}>{y}</option>)}
            </select>
          </div>

          {/* Trimestre */}
          <div>
            <label className="field-label">Trimestre</label>
            <select
              value={filters.quarter || ""}
              onChange={(e) => {
                setFilter("quarter", e.target.value || undefined);
                setFilter("page", 1);
              }}
              className="input-glass text-sm w-28"
            >
              <option value="">Todos</option>
              {QTRS.map((q) => <option key={q} value={q}>{q}</option>)}
            </select>
          </div>

          {/* Tipo */}
          <div>
            <label className="field-label">Tipo</label>
            <select
              value={filters.type || ""}
              onChange={(e) => {
                setFilter("type", e.target.value || undefined);
                setFilter("page", 1);
              }}
              className="input-glass text-sm w-40"
            >
              <option value="">Todos</option>
              <option value="Cliente interno">Cliente interno</option>
              <option value="Cliente externo">Cliente externo</option>
            </select>
          </div>

          {/* Búsqueda libre */}
          <div>
            <label className="field-label">Buscar</label>
            <input
              type="text"
              placeholder="Departamento, sede…"
              value={filters.search || ""}
              onChange={(e) => {
                setFilter("search", e.target.value || undefined);
                setFilter("page", 1);
              }}
              className="input-glass text-sm w-44"
            />
          </div>

          {filtersActive && (
            <button
              onClick={() => { resetFilters(); }}
              className="btn-ghost text-xs self-end mb-0.5"
            >
              Limpiar
            </button>
          )}
        </div>
      </GlassCard>

      {/* ── Tabla ─────────────────────────────────────────────────────────── */}
      <GlassCard padding={false} className="relative">
        {isLoading ? (
          <div className="flex items-center justify-center h-48">
            <Loader2 size={28} className="animate-spin text-primary/40" />
          </div>
        ) : surveys.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-48 gap-2 text-ink/30">
            <p className="text-sm">
              {filtersActive
                ? "No hay encuestas que coincidan con los filtros."
                : "Sin datos. Importa el Excel de satisfacción."}
            </p>
            {filtersActive && (
              <button onClick={resetFilters} className="btn-ghost text-xs">
                Limpiar filtros
              </button>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[780px]">
              <thead>
                <tr className="border-b border-ink/10">
                  {[
                    "Departamento", "Área", "Sede",
                    "Período", "Tipo",
                    "Sat. Interna", "Sat. Externa", "Estado", "",
                  ].map((h) => (
                    <th
                      key={h}
                      className="text-left py-3.5 px-4 text-xs font-semibold
                                 text-ink/50 uppercase tracking-wide whitespace-nowrap"
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-ink/5">
                {surveys.map((s) => {
                  const si     = s.internal_satisfaction;
                  const estado = si >= 0.8 ? "Alto" : si >= 0.6 ? "Medio" : "Bajo";
                  const badge  = si >= 0.8
                    ? "badge-cumple" : si >= 0.6
                    ? "badge-por-mejorar" : "badge-critico";

                  return (
                    <tr
                      key={s.id}
                      className="hover:bg-primary/[0.03] transition-colors group cursor-pointer"
                      onClick={() => setDetailRow(s)}
                    >
                      <td className="py-3 px-4 font-medium text-ink">{s.department || "—"}</td>
                      <td className="py-3 px-4 text-ink/60">{s.area || "—"}</td>
                      <td className="py-3 px-4 text-ink/60">{s.site || "—"}</td>
                      <td className="py-3 px-4 text-ink/60 whitespace-nowrap">
                        {s.period_name || s.period || "—"}
                        {s.year ? ` ${s.year}` : ""}
                      </td>
                      <td className="py-3 px-4">
                        <span className={`text-xs px-2 py-0.5 rounded-full border ${
                          s.survey_type === "Cliente interno"
                            ? "bg-primary/10 text-primary border-primary/20"
                            : "bg-secondary/10 text-secondary border-secondary/20"
                        }`}>
                          {s.survey_type || "—"}
                        </span>
                      </td>
                      <td className={`py-3 px-4 whitespace-nowrap ${satColor(si)}`}>
                        {fmt.score01(si)}
                      </td>
                      <td className={`py-3 px-4 whitespace-nowrap ${satColor(s.external_satisfaction)}`}>
                        {fmt.score01(s.external_satisfaction)}
                      </td>
                      <td className="py-3 px-4">
                        <span className={badge}>{estado}</span>
                      </td>
                      <td
                        className="py-3 px-4"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                          <button
                            onClick={() => setDetailRow(s)}
                            className="btn-ghost p-1.5"
                            title="Ver detalle"
                          >
                            <Eye size={14} />
                          </button>
                          {isAdmin && (
                            <button
                              onClick={() => setDeleteId(s.id)}
                              className="btn-ghost p-1.5 text-danger/50 hover:text-danger hover:bg-danger/10"
                              title="Eliminar"
                            >
                              <Trash2 size={14} />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* ── Paginación ─────────────────────────────────────────────────── */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between px-4 py-3
                          border-t border-ink/10 flex-wrap gap-3">
            <p className="text-xs text-ink/50">
              Mostrando{" "}
              {(currentPage - 1) * PAGE_SIZE + 1}–
              {Math.min(currentPage * PAGE_SIZE, total)}{" "}
              de {total} registros
            </p>

            <div className="flex items-center gap-1">
              <button
                disabled={!hasPrev}
                onClick={() => goPage(currentPage - 1)}
                className="w-8 h-8 flex items-center justify-center rounded-lg glass
                           text-ink/60 hover:text-ink disabled:opacity-30 disabled:cursor-not-allowed"
              >
                <ChevronLeft size={14} />
              </button>

              {pageNumbers.map((p, i) =>
                p === "..." ? (
                  <span key={`e${i}`} className="w-8 text-center text-xs text-ink/30">…</span>
                ) : (
                  <button
                    key={p}
                    onClick={() => goPage(p)}
                    className={`w-8 h-8 rounded-lg text-xs font-medium transition-all ${
                      p === currentPage
                        ? "bg-primary text-white shadow-sm"
                        : "glass text-ink/60 hover:text-ink"
                    }`}
                  >
                    {p}
                  </button>
                )
              )}

              <button
                disabled={!hasNext}
                onClick={() => goPage(currentPage + 1)}
                className="w-8 h-8 flex items-center justify-center rounded-lg glass
                           text-ink/60 hover:text-ink disabled:opacity-30 disabled:cursor-not-allowed"
              >
                <ChevronRight size={14} />
              </button>
            </div>
          </div>
        )}
      </GlassCard>

      {/* ── Modal de detalle ──────────────────────────────────────────────── */}
      {detailRow && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: "rgba(10,20,40,0.45)", backdropFilter: "blur(6px)" }}
          onClick={() => setDetailRow(null)}
        >
          <div
            className="glass rounded-3xl p-6 w-full max-w-md shadow-2xl animate-fade-up"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-5">
              <h2 className="font-semibold text-ink">Encuesta #{detailRow.id}</h2>
              <button onClick={() => setDetailRow(null)} className="btn-ghost p-1.5">
                <X size={16} />
              </button>
            </div>
            <div className="grid grid-cols-2 gap-x-6 gap-y-3">
              {[
                ["Departamento",  detailRow.department],
                ["Área",          detailRow.area],
                ["Sede",          detailRow.site],
                ["Tipo",          detailRow.type],
                ["Período",       detailRow.period_name || detailRow.period],
                ["Año",           detailRow.year],
                ["Sat. Interna",  fmt.score01(detailRow.internal_satisfaction)],
                ["Sat. Externa",  fmt.score01(detailRow.external_satisfaction)],
                ["Eficiencia",    fmt.score01(detailRow.efficiency)],
                ["Comunicación",  fmt.score01(detailRow.communication)],
                ["Cal. Técnica",  fmt.score01(detailRow.technical_quality)],
                ["Valor Agregado",fmt.score01(detailRow.added_value)],
                ["Exp. Global",   fmt.score01(detailRow.global_experience)],
              ].map(([k, v]) => (
                <div key={k}>
                  <p className="text-xs text-ink/40 uppercase tracking-wide">{k}</p>
                  <p className="text-sm font-medium text-ink">{v || "—"}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ── Confirm eliminar ──────────────────────────────────────────────── */}
      <ConfirmModal
        open={!!deleteId}
        title="Eliminar encuesta"
        message="Esta acción no se puede deshacer."
        onConfirm={() => deleteMut.mutate(deleteId)}
        onCancel={() => setDeleteId(null)}
        confirmLabel={deleteMut.isPending ? "Eliminando..." : "Eliminar"}
      />

      {/* ── Modal de importación ──────────────────────────────────────────── */}
      {showImport && (
        <ImportModal
          onClose={() => setShowImport(false)}
          onSuccess={() => {
            qc.invalidateQueries(["surveys"]);
            qc.invalidateQueries(["survey-kpis"]);
          }}
        />
      )}
    </div>
  );
}