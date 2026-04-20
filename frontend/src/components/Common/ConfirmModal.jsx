import { AlertTriangle, X } from "lucide-react";

export default function ConfirmModal({ open, title, message, onConfirm, onCancel, confirmLabel = "Eliminar", danger = true }) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-ink/30 backdrop-blur-sm" onClick={onCancel} />
      <div className="glass rounded-3xl p-6 w-full max-w-sm relative animate-fade-up">
        <button onClick={onCancel} className="absolute top-4 right-4 btn-ghost p-1.5"><X size={16} /></button>
        <div className={`w-12 h-12 rounded-2xl flex items-center justify-center mb-4 ${danger ? "bg-danger/15" : "bg-warning/15"}`}>
          <AlertTriangle size={22} className={danger ? "text-danger" : "text-warning"} />
        </div>
        <h3 className="text-lg font-semibold text-ink mb-1">{title}</h3>
        <p className="text-ink/60 text-sm mb-6">{message}</p>
        <div className="flex gap-3 justify-end">
          <button onClick={onCancel}  className="btn-secondary text-sm">Cancelar</button>
          <button onClick={onConfirm} className={`text-sm ${danger ? "btn-danger" : "btn-primary"}`}>{confirmLabel}</button>
        </div>
      </div>
    </div>
  );
}