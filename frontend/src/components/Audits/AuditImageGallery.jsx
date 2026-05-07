/**
 * AuditImageGallery.jsx
 * Sección de imágenes dentro del detalle de una auditoría.
 * - Sube hasta 50 imágenes en una sola operación (multipart).
 * - Muestra progreso de carga.
 * - Lightbox nativo al hacer clic en una miniatura.
 * - Elimina imágenes individuales (admin o propietario).
 */

import { useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ExternalLink, ImagePlus, Loader2, Trash2, X, ZoomIn } from "lucide-react";
import { auditsService } from "../../services/audits";
import { useAuth } from "../../store/AuthContext";

const API_BASE = import.meta.env.VITE_API_URL?.replace("/api/v1", "") || "http://localhost:8000";
const MAX_IMAGES = 50;

function imgUrl(att) {
  if (!att.file_url) return null;
  if (att.file_url.startsWith("http")) return att.file_url;
  return `${API_BASE}${att.file_url}`;
}

export default function AuditImageGallery({ auditId }) {
  const { isAdmin, user } = useAuth();
  const qc = useQueryClient();
  const inputRef = useRef(null);

  const [lightbox,  setLightbox]  = useState(null);  // { url, name }
  const [uploadPct, setUploadPct] = useState(null);  // 0-100 | null

  const { data: attachments = [], isLoading } = useQuery({
    queryKey: ["audit-attachments", auditId],
    queryFn:  () => auditsService.getAttachments(auditId),
    enabled:  !!auditId,
  });

  const uploadMut = useMutation({
    mutationFn: (files) =>
      auditsService.uploadAttachments(auditId, files, setUploadPct),
    onSuccess: () => {
      qc.invalidateQueries(["audit-attachments", auditId]);
      setUploadPct(null);
    },
    onError: () => setUploadPct(null),
  });

  const deleteMut = useMutation({
    mutationFn: (attId) => auditsService.deleteAttachment(auditId, attId),
    onSuccess:  () => qc.invalidateQueries(["audit-attachments", auditId]),
  });

  function handleFiles(e) {
    const selected = Array.from(e.target.files || []);
    if (!selected.length) return;
    const remaining = MAX_IMAGES - attachments.length;
    if (selected.length > remaining) {
      alert(`Solo puedes subir ${remaining} imagen${remaining !== 1 ? "es" : ""} más (límite ${MAX_IMAGES}).`);
      return;
    }
    uploadMut.mutate(selected);
    e.target.value = "";
  }

  function canDelete(att) {
    return isAdmin || att.user_id === user?.id;
  }

  const slots = MAX_IMAGES - attachments.length;
  const uploading = uploadMut.isPending;

  return (
    <div className="mt-6">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-xs font-semibold text-ink/50 uppercase tracking-wide">
          Imágenes ({attachments.length}/{MAX_IMAGES})
        </h3>
        {slots > 0 && (
          <>
            <input
              ref={inputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp,image/gif,image/heic"
              multiple
              className="hidden"
              onChange={handleFiles}
            />
            <button
              onClick={() => inputRef.current?.click()}
              disabled={uploading}
              className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-xl
                         bg-primary/10 text-primary font-medium hover:bg-primary/20
                         transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {uploading
                ? <Loader2 size={13} className="animate-spin" />
                : <ImagePlus size={13} />}
              {uploading ? `Subiendo ${uploadPct ?? 0}%…` : "Agregar imágenes"}
            </button>
          </>
        )}
      </div>

      {/* Barra de progreso */}
      {uploading && uploadPct !== null && (
        <div className="mb-3 h-1.5 bg-ink/10 rounded-full overflow-hidden">
          <div
            className="h-full bg-primary rounded-full transition-all duration-300"
            style={{ width: `${uploadPct}%` }}
          />
        </div>
      )}

      {/* Error de upload */}
      {uploadMut.isError && (
        <p className="text-xs text-danger mb-3">
          {uploadMut.error?.response?.data?.detail || "Error al subir las imágenes."}
        </p>
      )}

      {/* Cuadrícula */}
      {isLoading ? (
        <div className="flex items-center gap-2 text-ink/40 text-xs">
          <Loader2 size={13} className="animate-spin" /> Cargando imágenes…
        </div>
      ) : attachments.length === 0 ? (
        <p className="text-xs text-ink/30 italic">Sin imágenes adjuntas.</p>
      ) : (
        <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-2">
          {attachments.map((att) => {
            const url = imgUrl(att);

            /* ── Link externo (SharePoint/OneDrive) ── */
            if (att.is_external) {
              return (
                <div key={att.id} className="relative group aspect-square rounded-xl overflow-hidden bg-primary/5 border border-primary/15 flex flex-col items-center justify-center gap-1 p-2">
                  <ExternalLink size={22} className="text-primary/50" />
                  <p className="text-[9px] text-ink/40 text-center leading-tight line-clamp-2 px-1">
                    {att.file_name}
                  </p>
                  <a
                    href={att.file_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-[9px] text-primary font-semibold hover:underline"
                  >
                    Abrir
                  </a>

                  {canDelete(att) && (
                    <button
                      onClick={() => deleteMut.mutate(att.id)}
                      disabled={deleteMut.isPending}
                      className="absolute top-1 right-1 p-0.5 rounded-md bg-danger/0 text-danger/0
                                 group-hover:bg-danger/10 group-hover:text-danger transition"
                      title="Eliminar referencia"
                    >
                      <Trash2 size={11} />
                    </button>
                  )}
                </div>
              );
            }

            /* ── Archivo local ── */
            return (
              <div key={att.id} className="relative group aspect-square rounded-xl overflow-hidden bg-ink/5">
                {url ? (
                  <img
                    src={url}
                    alt={att.file_name}
                    className="w-full h-full object-cover"
                    loading="lazy"
                  />
                ) : (
                  <div className="flex items-center justify-center h-full text-ink/20 text-xs">
                    Sin URL
                  </div>
                )}

                {/* Overlay en hover */}
                <div className="absolute inset-0 bg-black/0 group-hover:bg-black/40 transition-all
                                flex items-center justify-center gap-2 opacity-0 group-hover:opacity-100">
                  {url && (
                    <button
                      onClick={() => setLightbox({ url, name: att.file_name })}
                      className="p-1.5 rounded-lg bg-white/20 text-white hover:bg-white/40 transition"
                      title="Ver tamaño completo"
                    >
                      <ZoomIn size={14} />
                    </button>
                  )}
                  {canDelete(att) && (
                    <button
                      onClick={() => deleteMut.mutate(att.id)}
                      disabled={deleteMut.isPending}
                      className="p-1.5 rounded-lg bg-danger/70 text-white hover:bg-danger transition"
                      title="Eliminar imagen"
                    >
                      <Trash2 size={14} />
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Lightbox */}
      {lightbox && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center p-4"
          style={{ background: "rgba(10,10,20,0.85)", backdropFilter: "blur(6px)" }}
          onClick={() => setLightbox(null)}
        >
          <button
            className="absolute top-4 right-4 p-2 rounded-full bg-white/10 text-white hover:bg-white/20"
            onClick={() => setLightbox(null)}
          >
            <X size={20} />
          </button>
          <img
            src={lightbox.url}
            alt={lightbox.name}
            className="max-w-full max-h-[90vh] rounded-2xl shadow-2xl object-contain"
            onClick={(e) => e.stopPropagation()}
          />
          <p className="absolute bottom-4 left-0 right-0 text-center text-white/60 text-xs">
            {lightbox.name}
          </p>
        </div>
      )}
    </div>
  );
}
