/**
 * ImportModal.jsx (Surveys)
 * Modal de importación de encuestas con:
 *   - Drag & drop
 *   - Checkbox overwrite
 *   - Resumen: nuevas / actualizadas / omitidas / errores
 */

import { useState, useRef } from "react";
import {
  X, FileSpreadsheet, Upload, Loader2,
  CheckCircle2, AlertCircle, Info,
} from "lucide-react";
import { surveysService } from "../../services/surveys";
import SurveyImportModal from "../components/Surveys/ImportModal";

// Columnas mínimas esperadas en el Excel
const COLUMNAS_REQUERIDAS = [
  "department", "site", "period",
  "internal_satisfaction", "external_satisfaction",
];

export default function SurveyImportModal({ onClose, onSuccess }) {
  const inputRef               = useRef();
  const [file,      setFile]   = useState(null);
  const [overwrite, setOver]   = useState(false);
  const [loading,   setLoad]   = useState(false);
  const [result,    setResult] = useState(null);
  const [error,     setError]  = useState("");
  const [dragging,  setDrag]   = useState(false);

  // ── Validación básica del archivo ──────────────────────────────────────────
  const pickFile = (f) => {
    if (!f) return;
    if (!f.name.match(/\.(xlsx|xls)$/i)) {
      setError("Solo se aceptan archivos .xlsx o .xls");
      return;
    }
    if (f.size > 10 * 1024 * 1024) {
      setError("El archivo no puede superar 10 MB.");
      return;
    }
    setFile(f);
    setError("");
    setResult(null);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setDrag(false);
    pickFile(e.dataTransfer.files[0]);
  };

  // ── Submit ─────────────────────────────────────────────────────────────────
  const handleSubmit = async () => {
    if (!file) return;
    setLoad(true);
    setError("");
    try {
      const res = await surveysService.importExcel(file, overwrite);
      setResult(res);
      onSuccess?.();
    } catch (e) {
      const detail = e.response?.data?.detail;
      setError(
        typeof detail === "string"
          ? detail
          : "Error al importar. Verifica el formato del archivo."
      );
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
        {/* ── Header ────────────────────────────────────────────────────────── */}
        <div className="flex items-center justify-between mb-5">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-2xl bg-secondary/15 flex items-center justify-center">
              <FileSpreadsheet size={16} className="text-secondary" />
            </div>
            <div>
              <h2 className="text-base font-semibold text-ink">Importar Encuestas</h2>
              <p className="text-xs text-ink/50">Satisfaccion_Estructura_Mejorada.xlsx</p>
            </div>
          </div>
          <button onClick={onClose} className="btn-ghost p-1.5">
            <X size={16} />
          </button>
        </div>

        {/* ── Fase: selección de archivo ────────────────────────────────────── */}
        {!result && (
          <>
            {/* Drop zone */}
            <div
              onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
              onDragLeave={() => setDrag(false)}
              onDrop={handleDrop}
              onClick={() => inputRef.current?.click()}
              className={`border-2 border-dashed rounded-2xl p-7 text-center cursor-pointer
                          transition-all duration-200 mb-4 select-none ${
                dragging
                  ? "border-secondary bg-secondary/8 scale-[1.01]"
                  : file
                  ? "border-success/50 bg-success/5"
                  : "border-ink/15 hover:border-secondary/40 hover:bg-secondary/4"
              }`}
            >
              <input
                ref={inputRef}
                type="file"
                accept=".xlsx,.xls"
                className="hidden"
                onChange={(e) => pickFile(e.target.files[0])}
              />

              {file ? (
                <div>
                  <CheckCircle2 size={28} className="mx-auto mb-2 text-success" />
                  <p className="text-sm font-medium text-ink truncate px-4">{file.name}</p>
                  <p className="text-xs text-ink/40 mt-0.5">
                    {(file.size / 1024).toFixed(0)} KB · haz clic para cambiar
                  </p>
                </div>
              ) : (
                <div className="text-ink/40">
                  <Upload size={28} className="mx-auto mb-2 opacity-50" />
                  <p className="text-sm font-medium">Arrastra el archivo aquí</p>
                  <p className="text-xs mt-1 opacity-60">o haz clic para seleccionar · .xlsx / .xls</p>
                </div>
              )}
            </div>

            {/* Columnas esperadas */}
            <div className="flex items-start gap-2 bg-primary/6 border border-primary/15
                            rounded-xl px-3 py-2.5 mb-4 text-xs text-ink/60">
              <Info size={13} className="text-primary/60 mt-0.5 shrink-0" />
              <div>
                <p className="font-semibold text-ink/70 mb-0.5">Columnas mínimas requeridas:</p>
                <p className="font-mono text-[10px] leading-relaxed">
                  {COLUMNAS_REQUERIDAS.join(" · ")}
                </p>
              </div>
            </div>

            {/* Checkbox overwrite */}
            <label className="flex items-start gap-2.5 cursor-pointer mb-5 px-1 select-none">
              <input
                type="checkbox"
                checked={overwrite}
                onChange={(e) => setOver(e.target.checked)}
                className="w-4 h-4 mt-0.5 accent-secondary rounded shrink-0"
              />
              <div>
                <p className="text-sm text-ink/80 font-medium">Actualizar registros duplicados</p>
                <p className="text-xs text-ink/40 mt-0.5 leading-snug">
                  Si está marcado, los registros con la misma combinación
                  <em> departamento + sede + período</em> serán actualizados.
                  Si no, se omiten.
                </p>
              </div>
            </label>

            {/* Error */}
            {error && (
              <div className="flex items-start gap-2 bg-danger/10 border border-danger/20
                              text-danger text-xs rounded-xl px-3 py-2.5 mb-4">
                <AlertCircle size={13} className="shrink-0 mt-0.5" />
                <span>{error}</span>
              </div>
            )}

            {/* Acciones */}
            <div className="flex justify-end gap-3">
              <button onClick={onClose} className="btn-secondary text-sm">
                Cancelar
              </button>
              <button
                onClick={handleSubmit}
                disabled={!file || loading}
                className="btn-primary text-sm flex items-center gap-2 disabled:opacity-50"
                style={{ background: !file || loading ? undefined : "#B4427F" }}
              >
                {loading
                  ? <><Loader2 size={14} className="animate-spin" /> Importando…</>
                  : <><Upload size={14} /> Importar</>
                }
              </button>
            </div>
          </>
        )}

        {/* ── Fase: resultado ───────────────────────────────────────────────── */}
        {result && (
          <div className="space-y-5">
            {/* Título de éxito */}
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-full bg-success/15 flex items-center justify-center">
                <CheckCircle2 size={16} className="text-success" />
              </div>
              <div>
                <p className="font-semibold text-ink text-sm">Importación completada</p>
                <p className="text-xs text-ink/40">
                  {(result.nuevas || 0) + (result.actualizadas || 0)} registros procesados en total
                </p>
              </div>
            </div>

            {/* Cuadrantes de resumen */}
            <div className="grid grid-cols-2 gap-3">
              {[
                { label: "Nuevas",        value: result.nuevas,       color: "text-success", bg: "bg-success/10 border-success/20"  },
                { label: "Actualizadas",  value: result.actualizadas, color: "text-primary", bg: "bg-primary/10 border-primary/20"  },
                { label: "Omitidas",      value: result.omitidas,     color: "text-warning", bg: "bg-warning/10 border-warning/20"  },
                { label: "Errores",       value: result.errores_n,    color: "text-danger",  bg: "bg-danger/10  border-danger/20"   },
              ].map(({ label, value, color, bg }) => (
                <div key={label} className={`rounded-xl p-3.5 text-center border ${bg}`}>
                  <p className={`text-2xl font-bold ${color}`}>{value ?? 0}</p>
                  <p className="text-xs text-ink/50 mt-0.5 font-medium">{label}</p>
                </div>
              ))}
            </div>

            {/* Lista de errores (si los hay) */}
            {result.errores?.length > 0 && (
              <div>
                <p className="text-xs font-semibold text-danger/80 mb-1.5">
                  Detalle de errores ({result.errores.length}):
                </p>
                <div className="bg-danger/6 border border-danger/15 rounded-xl p-3
                                max-h-36 overflow-y-auto space-y-1">
                  {result.errores.map((e, i) => (
                    <p key={i} className="text-xs text-danger/70 leading-snug">
                      · {e}
                    </p>
                  ))}
                </div>
              </div>
            )}

            {/* Mensaje de overwrite */}
            {result.omitidas > 0 && !overwrite && (
              <div className="flex items-start gap-2 bg-warning/8 border border-warning/20
                              rounded-xl px-3 py-2.5 text-xs text-warning/80">
                <Info size={13} className="shrink-0 mt-0.5" />
                <span>
                  {result.omitidas} registro(s) ya existían y fueron omitidos.
                  Activa "Actualizar registros duplicados" para sobreescribirlos.
                </span>
              </div>
            )}

            {/* Botón cerrar */}
            <button onClick={onClose} className="btn-primary w-full text-sm">
              Cerrar
            </button>
          </div>
        )}
      </div>
    </div>
  );
}