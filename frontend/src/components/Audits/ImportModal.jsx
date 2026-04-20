import { useState, useRef } from "react";
import { X, Upload, FileSpreadsheet, Loader2, CheckCircle, AlertCircle } from "lucide-react";
import { auditsService } from "../../services/audits";

export default function ImportModal({ types, onClose, onSuccess }) {
  const [file,       setFile]      = useState(null);
  const [typeId,     setTypeId]    = useState(types[0]?.id || "");
  const [overwrite,  setOverwrite] = useState(false);
  const [loading,    setLoading]   = useState(false);
  const [result,     setResult]    = useState(null);
  const [error,      setError]     = useState("");
  const inputRef = useRef();

  const handleDrop = (e) => {
    e.preventDefault();
    const f = e.dataTransfer.files[0];
    if (f?.name.match(/\.xlsx?$/i)) setFile(f);
  };

  const handleImport = async () => {
    if (!file || !typeId) return;
    setLoading(true); setError(""); setResult(null);
    try {
      const res = await auditsService.importExcel(file, Number(typeId), overwrite);
      setResult(res);
      if (res.nuevas > 0 || res.actualizadas > 0) {
        setTimeout(onSuccess, 1500);
      }
    } catch (e) {
      setError(e.response?.data?.detail || "Error al importar el archivo.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-ink/30 backdrop-blur-sm" onClick={onClose} />
      <div className="glass rounded-3xl p-6 w-full max-w-md relative animate-fade-up shadow-glass-hover">
        <button onClick={onClose} className="absolute top-4 right-4 btn-ghost p-1.5"><X size={16} /></button>
        <h2 className="text-lg font-semibold text-ink mb-1">Importar desde Excel</h2>
        <p className="text-ink/50 text-sm mb-5">Sube el checklist original para importar auditorías masivamente.</p>

        {/* Tipo */}
        <div className="mb-4">
          <label className="text-xs font-semibold text-ink/60 uppercase tracking-wide mb-1.5 block">Tipo de Auditoría</label>
          <select value={typeId} onChange={(e) => setTypeId(e.target.value)} className="input-glass text-sm">
            {types.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
        </div>

        {/* Drop zone */}
        <div
          onDrop={handleDrop}
          onDragOver={(e) => e.preventDefault()}
          onClick={() => inputRef.current?.click()}
          className={`border-2 border-dashed rounded-2xl p-8 text-center cursor-pointer transition-all duration-200 mb-4 ${
            file ? "border-success/40 bg-success/5" : "border-primary/20 hover:border-primary/40 hover:bg-primary/3"
          }`}
        >
          <input ref={inputRef} type="file" accept=".xlsx,.xls" className="hidden"
            onChange={(e) => setFile(e.target.files[0])} />
          {file ? (
            <>
              <FileSpreadsheet size={32} className="text-success mx-auto mb-2" />
              <p className="text-sm font-medium text-ink">{file.name}</p>
              <p className="text-xs text-ink/50">{(file.size / 1024).toFixed(1)} KB</p>
            </>
          ) : (
            <>
              <Upload size={28} className="text-primary/30 mx-auto mb-2" />
              <p className="text-sm text-ink/50">Arrastra el archivo aquí o haz clic</p>
              <p className="text-xs text-ink/30 mt-1">.xlsx · .xls</p>
            </>
          )}
        </div>

        {/* Overwrite */}
        <label className="flex items-center gap-2.5 mb-5 cursor-pointer">
          <input type="checkbox" checked={overwrite} onChange={(e) => setOverwrite(e.target.checked)}
            className="w-4 h-4 rounded accent-primary" />
          <span className="text-sm text-ink/70">Actualizar registros duplicados</span>
        </label>

        {/* Resultado */}
        {result && (
          <div className={`rounded-xl px-4 py-3 mb-4 text-sm ${result.errores_n === 0 ? "bg-success/10 border border-success/20 text-success" : "bg-warning/10 border border-warning/20 text-warning"}`}>
            <div className="flex items-center gap-2 font-semibold mb-1">
              <CheckCircle size={15} />
              {result.nuevas} nuevas · {result.actualizadas} actualizadas · {result.omitidas} omitidas
            </div>
            {result.errores_n > 0 && <p className="text-xs opacity-80">{result.errores_n} errores</p>}
          </div>
        )}

        {error && (
          <div className="bg-danger/10 border border-danger/20 text-danger text-sm rounded-xl px-4 py-3 mb-4 flex items-center gap-2">
            <AlertCircle size={15} />{error}
          </div>
        )}

        <div className="flex gap-3 justify-end">
          <button onClick={onClose} className="btn-secondary text-sm">Cancelar</button>
          <button onClick={handleImport} disabled={!file || !typeId || loading} className="btn-primary flex items-center gap-2 text-sm disabled:opacity-50">
            {loading ? <Loader2 size={15} className="animate-spin" /> : <Upload size={15} />}
            {loading ? "Importando..." : "Importar"}
          </button>
        </div>
      </div>
    </div>
  );
}