/**
 * NomineesUploadModal.jsx — Carga de nominados desde los .txt de Microsoft Forms.
 *
 * Se suben varios .txt a la vez (carpeta "Formularios Cliente Interno"); cada uno
 * se asocia al formulario interno cuyo título coincide con el nombre del archivo.
 * El sorteo de evaluadores excluye a los nominados (conflicto de interés).
 */

import { useState, useRef } from "react";
import { X, FileText, Upload, Loader2, CheckCircle2, AlertCircle, AlertTriangle } from "lucide-react";
import { surveyWowService } from "../../services/surveyWow";

export default function NomineesUploadModal({ onClose, onSuccess }) {
  const inputRef = useRef();
  const [files,   setFiles]   = useState([]);
  const [loading, setLoading] = useState(false);
  const [result,  setResult]  = useState(null);
  const [error,   setError]   = useState("");

  const pick = (list) => {
    const txt = Array.from(list || []).filter((f) => f.name.toLowerCase().endsWith(".txt"));
    if (!txt.length) { setError("Selecciona uno o más archivos .txt."); return; }
    setFiles(txt); setError(""); setResult(null);
  };

  const submit = async () => {
    setLoading(true); setError("");
    try {
      const r = await surveyWowService.uploadNominees(files);
      setResult(r);
      onSuccess?.(r);
    } catch (e) {
      const d = e.response?.data?.detail;
      setError(typeof d === "string" ? d : "No se pudieron cargar los nominados.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
         style={{ background: "rgba(10,20,40,0.45)", backdropFilter: "blur(6px)" }}>
      <div className="glass rounded-3xl p-6 w-full max-w-md shadow-2xl animate-fade-up max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-5">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-2xl bg-primary/15 flex items-center justify-center">
              <FileText size={16} className="text-primary" />
            </div>
            <div>
              <h2 className="text-base font-semibold text-ink">Cargar nominados</h2>
              <p className="text-xs text-ink/50">.txt de Formularios Cliente Interno</p>
            </div>
          </div>
          <button onClick={onClose} className="btn-ghost p-1.5"><X size={16} /></button>
        </div>

        {!result ? (
          <>
            <div
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => { e.preventDefault(); pick(e.dataTransfer.files); }}
              onClick={() => inputRef.current?.click()}
              className={`border-2 border-dashed rounded-2xl p-7 text-center cursor-pointer transition-all mb-4 select-none ${
                files.length ? "border-success/50 bg-success/5" : "border-ink/15 hover:border-primary/40 hover:bg-primary/5"
              }`}
            >
              <input ref={inputRef} type="file" accept=".txt" multiple className="hidden" onChange={(e) => pick(e.target.files)} />
              {files.length ? (
                <>
                  <CheckCircle2 size={28} className="mx-auto mb-2 text-success" />
                  <p className="text-sm font-medium text-ink">{files.length} archivo(s) .txt</p>
                  <p className="text-xs text-ink/40 mt-0.5">haz clic para cambiar</p>
                </>
              ) : (
                <div className="text-ink/40">
                  <Upload size={28} className="mx-auto mb-2 opacity-50" />
                  <p className="text-sm font-medium">Arrastra los .txt aquí</p>
                  <p className="text-xs mt-1 opacity-60">o haz clic para seleccionar varios</p>
                </div>
              )}
            </div>
            <p className="text-xs text-ink/50 mb-4 leading-relaxed">
              Cada archivo se asocia al formulario con el mismo nombre. Si vuelves a subir un .txt,
              sus nominados reemplazan a los anteriores.
            </p>
            {error && (
              <div className="flex items-start gap-2 bg-danger/10 border border-danger/20 text-danger text-xs rounded-xl px-3 py-2.5 mb-4">
                <AlertCircle size={13} className="shrink-0 mt-0.5" /> <span>{error}</span>
              </div>
            )}
            <div className="flex justify-end gap-3">
              <button onClick={onClose} className="btn-secondary text-sm">Cancelar</button>
              <button onClick={submit} disabled={!files.length || loading} className="btn-primary text-sm flex items-center gap-2 disabled:opacity-50">
                {loading ? <><Loader2 size={14} className="animate-spin" /> Cargando…</> : <><Upload size={14} /> Cargar</>}
              </button>
            </div>
          </>
        ) : (
          <div className="space-y-4">
            <div className="flex items-center gap-2.5">
              <CheckCircle2 size={18} className="text-success" />
              <p className="font-semibold text-ink text-sm">{result.message}</p>
            </div>
            {result.sin_formulario.length > 0 && (
              <div className="bg-warning/10 border border-warning/20 rounded-xl p-3">
                <p className="text-xs font-semibold text-ink/70 mb-1 flex items-center gap-1.5">
                  <AlertTriangle size={12} className="text-warning" /> Sin formulario con ese nombre ({result.sin_formulario.length})
                </p>
                {result.sin_formulario.map((n) => <p key={n} className="text-xs text-ink/60 truncate">· {n}</p>)}
              </div>
            )}
            {result.sin_nominados.length > 0 && (
              <div className="bg-warning/10 border border-warning/20 rounded-xl p-3">
                <p className="text-xs font-semibold text-ink/70 mb-1">No se encontró la pregunta de nominación en:</p>
                {result.sin_nominados.map((n) => <p key={n} className="text-xs text-ink/60 truncate">· {n}</p>)}
              </div>
            )}
            <button onClick={onClose} className="btn-primary w-full text-sm">Cerrar</button>
          </div>
        )}
      </div>
    </div>
  );
}
