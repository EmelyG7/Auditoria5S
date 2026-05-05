/**
 * ProjectAttachmentsGallery.jsx
 * Galería de todos los adjuntos del proyecto usando un único endpoint.
 */

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Paperclip, Download, Trash, Search, Loader2, FileIcon } from "lucide-react";
import { projectsService } from "../../services/projects";
import GlassCard from "../Layout/GlassCard";

export default function ProjectAttachmentsGallery({ projectId }) {
  const qc = useQueryClient();
  const [searchTerm, setSearchTerm] = useState("");
  const [filterType, setFilterType] = useState("");

  const { data: allAttachments = [], isLoading } = useQuery({
    queryKey: ["project-attachments", projectId],
    queryFn:  () => projectsService.getProjectAttachments(projectId),
    staleTime: 30_000,
  });

  const deleteMut = useMutation({
    mutationFn: ({ taskId, attachmentId }) =>
      projectsService.deleteTaskAttachment(projectId, taskId, attachmentId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["project-attachments", projectId] }),
  });

  const filtered = allAttachments.filter((att) => {
    const matchesSearch =
      att.file_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      att.task_title.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesType = !filterType || att.file_type.includes(filterType);
    return matchesSearch && matchesType;
  });

  const fileTypeGroups = filtered.reduce((groups, att) => {
    const ext = att.file_name.split(".").pop().toLowerCase();
    (groups[ext] = groups[ext] || []).push(att);
    return groups;
  }, {});

  return (
    <GlassCard className="w-full">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-lg font-bold text-ink flex items-center gap-2">
          <Paperclip size={20} /> Archivos del Proyecto
        </h2>
        <span className="text-sm text-ink/50 bg-ink/5 px-3 py-1 rounded-full font-medium">
          {allAttachments.length} archivos
        </span>
      </div>

      {/* Controles */}
      <div className="flex gap-3 mb-6">
        <div className="relative flex-1">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink/35" />
          <input
            type="text"
            placeholder="Buscar archivos o tareas..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="input-glass text-sm pl-9 w-full"
          />
        </div>
        <select
          value={filterType}
          onChange={(e) => setFilterType(e.target.value)}
          className="input-glass text-sm w-32"
        >
          <option value="">Todos</option>
          <option value="image">Imágenes</option>
          <option value="pdf">PDF</option>
          <option value="text">Texto</option>
          <option value="sheet">Hojas</option>
        </select>
      </div>

      {isLoading && (
        <div className="flex items-center justify-center py-12">
          <Loader2 size={24} className="animate-spin text-primary/40" />
        </div>
      )}

      {!isLoading && filtered.length === 0 && (
        <div className="flex flex-col items-center justify-center py-12 text-ink/40">
          <Paperclip size={32} className="mb-2 opacity-50" />
          <p className="text-sm">
            {allAttachments.length === 0 ? "Sin adjuntos en este proyecto" : "Sin resultados"}
          </p>
        </div>
      )}

      {!isLoading && filtered.length > 0 && (
        <div className="space-y-6">
          {Object.entries(fileTypeGroups).map(([ext, items]) => (
            <div key={ext}>
              <h3 className="text-sm font-semibold text-ink/70 mb-3 uppercase tracking-wide">
                {ext}
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                {items.map((att) => (
                  <div
                    key={att.id}
                    className="flex items-start gap-3 p-3 bg-ink/5 rounded-lg hover:bg-ink/10 transition-all border border-ink/10"
                  >
                    <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
                      <FileIcon size={20} className="text-primary" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-ink truncate">{att.file_name}</p>
                      <p className="text-xs text-ink/50 mb-1">
                        {att.task_key} • {(att.file_size / 1024).toFixed(1)} KB
                      </p>
                      <p className="text-xs text-ink/40 truncate" title={att.task_title}>
                        {att.task_title}
                      </p>
                    </div>
                    <div className="flex gap-1 flex-shrink-0">
                      {att.file_url && (
                        <a
                          href={att.file_url}
                          download={att.file_name}
                          target="_blank"
                          rel="noreferrer"
                          className="p-1.5 hover:bg-primary/20 text-primary rounded transition-all"
                        >
                          <Download size={14} />
                        </a>
                      )}
                      <button
                        onClick={() => deleteMut.mutate({ taskId: att.task_id, attachmentId: att.id })}
                        disabled={deleteMut.isPending}
                        className="p-1.5 hover:bg-danger/20 text-danger rounded transition-all"
                      >
                        <Trash size={14} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </GlassCard>
  );
}
