/**
 * WowImportModal.jsx — Modal de importación de Excel del Servicio WOW.
 *
 * Genérico: lo usan la importación de respuestas de Forms (por formulario)
 * y la del Excel de Evaluadores. Mismo diseño que Surveys/ImportModal.
 *
 * Props:
 *   title, subtitle      — encabezado
 *   hint                 — texto de ayuda sobre el archivo esperado
 *   onImport(file, forzar) → Promise<resultado>
 *   stats(result)        → [{ label, value, tone }] para los cuadrantes del resumen
 *   onClose, onSuccess
 *
 * Si el backend responde 409 (primera importación con un archivo cuyo nombre
 * no corresponde al formulario), se muestra el aviso y un botón para
 * confirmar y reintentar con forzar = true.
 */

import { useState, useRef } from "react";
import {
  X, FileSpreadsheet, Upload, Loader2, CheckCircle2, AlertCircle, AlertTriangle, Info,
} from "lucide-react";

const TONES = {
  success: { color: "text-success", bg: "bg-success/10 border-success/20" },
  primary: { color: "text-primary", bg: "bg-primary/10 border-primary/20" },
  warning: { color: "text-warning", bg: "bg-warning/10 border-warning/20" },
  danger:  { color: "text-danger",  bg: "bg-danger/10 border-danger/20" },
};

export default function WowImportModal({ title, subtitle, hint, onImport, stats, onClose, onSuccess }) {
  const inputRef = useRef();
  const [file,     setFile]     = useState(null);
  const [loading,  setLoading]  = useState(false);
  const [result,   setResult]   = useState(null);
  const [error,    setError]    = useState("");
  const [conflict, setConflict] = useState("");
  const [dragging, setDragging] = useState(false);

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
    setConflict("");
    setResult(null);
  };

  const submit = async (forzar = false) => {
    if (!file) return;
    setLoading(true);
    setError("");
    try {
      const res = await onImport(file, forzar);
      setResult(res);
      setConflict("");
      onSuccess?.(res);
    } catch (e) {
      const detail = e.response?.data?.detail;
      const msg = typeof detail === "string" ? detail : "Error al importar. Verifica el formato del archivo.";
      if (e.response?.status === 409) setConflict(msg);
      else setError(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: "rgba(10,20,40,0.45)", backdropFilter: "blur(6px)" }}
    >
      <div className="glass rounded-3xl p-6 w-full max-w-md shadow-2xl animate-fade-up max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-5">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-9 h-9 rounded-2xl bg-primary/15 flex items-center justify-center shrink-0">
              <FileSpreadsheet size={16} className="text-primary" />
            </div>
            <div className="min-w-0">
              <h2 className="text-base font-semibold text-ink truncate">{title}</h2>
              {subtitle && <p className="text-xs text-ink/50 truncate">{subtitle}</p>}
            </div>
          </div>
          <button onClick={onClose} className="btn-ghost p-1.5 shrink-0">
            <X size={16} />
          </button>
        </div>

        {!result && (
          <>
            <div
              onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
              onDragLeave={() => setDragging(false)}
              onDrop={(e) => { e.preventDefault(); setDragging(false); pickFile(e.dataTransfer.files[0]); }}
              onClick={() => inputRef.current?.click()}
              className={`border-2 border-dashed rounded-2xl p-7 text-center cursor-pointer
                          transition-all duration-200 mb-4 select-none ${
                dragging
                  ? "border-primary bg-primary/5 scale-[1.01]"
                  : file
                  ? "border-success/50 bg-success/5"
                  : "border-ink/15 hover:border-primary/40 hover:bg-primary/5"
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

            {hint && (
              <div className="flex items-start gap-2 bg-primary/5 border border-primary/15
                              rounded-xl px-3 py-2.5 mb-4 text-xs text-ink/60">
                <Info size={13} className="text-primary/60 mt-0.5 shrink-0" />
                <div>{hint}</div>
              </div>
            )}

            {error && (
              <div className="flex items-start gap-2 bg-danger/10 border border-danger/20
                              text-danger text-xs rounded-xl px-3 py-2.5 mb-4">
                <AlertCircle size={13} className="shrink-0 mt-0.5" />
                <span>{error}</span>
              </div>
            )}

            {conflict && (
              <div className="bg-warning/10 border border-warning/25 rounded-xl px-3 py-2.5 mb-4 text-xs text-ink/70">
                <div className="flex items-start gap-2">
                  <AlertTriangle size={13} className="shrink-0 mt-0.5 text-warning" />
                  <span>{conflict}</span>
                </div>
                <button
                  onClick={() => submit(true)}
                  disabled={loading}
                  className="btn-secondary text-xs mt-2.5 w-full disabled:opacity-50"
                >
                  Sí, es el archivo correcto — importar de todos modos
                </button>
              </div>
            )}

            <div className="flex justify-end gap-3">
              <button onClick={onClose} className="btn-secondary text-sm">Cancelar</button>
              <button
                onClick={() => submit(false)}
                disabled={!file || loading}
                className="btn-primary text-sm flex items-center gap-2 disabled:opacity-50"
              >
                {loading
                  ? <><Loader2 size={14} className="animate-spin" /> Importando…</>
                  : <><Upload size={14} /> Importar</>}
              </button>
            </div>
          </>
        )}

        {result && (
          <div className="space-y-5">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-full bg-success/15 flex items-center justify-center">
                <CheckCircle2 size={16} className="text-success" />
              </div>
              <div>
                <p className="font-semibold text-ink text-sm">Importación completada</p>
                <p className="text-xs text-ink/40">{result.message}</p>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              {stats(result).map(({ label, value, tone = "primary" }) => (
                <div key={label} className={`rounded-xl p-3.5 text-center border ${TONES[tone].bg}`}>
                  <p className={`text-2xl font-bold ${TONES[tone].color}`}>{value ?? 0}</p>
                  <p className="text-xs text-ink/50 mt-0.5 font-medium">{label}</p>
                </div>
              ))}
            </div>

            {result.advertencias?.length > 0 && (
              <div className="bg-warning/10 border border-warning/20 rounded-xl p-3 space-y-1">
                {result.advertencias.map((a, i) => (
                  <p key={i} className="text-xs text-ink/70 leading-snug flex gap-1.5">
                    <AlertTriangle size={12} className="text-warning shrink-0 mt-0.5" /> {a}
                  </p>
                ))}
              </div>
            )}

            {result.errores?.length > 0 && (
              <div>
                <p className="text-xs font-semibold text-danger/80 mb-1.5">
                  Detalle de errores ({result.errores_n}):
                </p>
                <div className="bg-danger/5 border border-danger/15 rounded-xl p-3 max-h-36 overflow-y-auto space-y-1">
                  {result.errores.map((e, i) => (
                    <p key={i} className="text-xs text-danger/70 leading-snug">
                      · Fila {e.fila}: {e.error}
                    </p>
                  ))}
                </div>
              </div>
            )}

            <button onClick={onClose} className="btn-primary w-full text-sm">Cerrar</button>
          </div>
        )}
      </div>
    </div>
  );
}
