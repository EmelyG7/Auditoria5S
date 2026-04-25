import { useQuery } from "@tanstack/react-query";
import { X, Loader2 } from "lucide-react";
import { auditsService } from "../../services/audits";
import { fmt } from "../../utils/format";
import RadarChartS from "../Dashboard/RadarChartS";

// Mapeo de claves del backend a etiquetas cortas para el radar
const S_KEYS = ["seiri", "seiton", "seiso", "seiketsu", "shitsuke"];
const S_LABELS = ["Seiri", "Seiton", "Seiso", "Seiketsu", "Shitsuke"];

export default function AuditDetail({ auditId, onClose }) {
  const { data: audit, isLoading } = useQuery({
    queryKey: ["audit", auditId],
    queryFn: () => auditsService.getById(auditId),
  });

  // Datos para el radar
  const radarData = audit?.puntajes_por_s
    ? S_KEYS.map((key, i) => ({
        s: S_LABELS[i],
        value: audit.puntajes_por_s[key] ?? 0,
      }))
    : [];

  return (
    // Overlay completo (fondo oscuro + centrado del modal)
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: "rgba(30, 30, 47, 0.5)", backdropFilter: "blur(4px)" }}
      onClick={onClose}
    >
      {/* Modal (evita que el click en el contenido cierre) */}
      <div
        className="glass rounded-3xl w-full max-w-3xl max-h-[90vh] overflow-y-auto shadow-2xl animate-fade-up"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="sticky top-0 glass border-b border-white/40 px-6 py-4 flex items-start justify-between rounded-t-3xl z-10">
          {isLoading ? (
            <div className="h-6 bg-ink/10 rounded-lg w-48 animate-pulse" />
          ) : (
            <div>
              <h2 className="text-lg font-semibold text-ink">{audit?.branch}</h2>
              <p className="text-ink/50 text-sm">
                {fmt.date(audit?.audit_date)} · {audit?.audit_type_name}
                {audit?.auditor_name && ` · ${audit.auditor_name}`}
              </p>
            </div>
          )}
          <button
            onClick={onClose}
            className="btn-ghost p-1.5 ml-4 shrink-0"
            aria-label="Cerrar"
          >
            <X size={18} />
          </button>
        </div>

        {/* Contenido */}
        <div className="p-6">
          {isLoading ? (
            <div className="flex items-center justify-center h-48">
              <Loader2 size={28} className="animate-spin text-primary/40" />
            </div>
          ) : audit ? (
            <>
              {/* Puntaje general */}
              <div
                className="flex items-center gap-4 mb-6 p-4 rounded-2xl"
                style={{ background: `${fmt.semaforoColor(audit.percentage)}18` }}
              >
                <div
                  className="text-4xl font-bold"
                  style={{ color: fmt.semaforoColor(audit.percentage) }}
                >
                  {fmt.pct(audit.percentage)}
                </div>
                <div>
                  <span className={fmt.badgeClass(audit.status)}>
                    {audit.status}
                  </span>
                  <p className="text-ink/50 text-xs mt-1">
                    {audit.total_score} / {audit.max_score} pts
                  </p>
                </div>
              </div>

              {/* Radar (corregido) */}
              <RadarChartS data={radarData} height={240} />

              {/* Preguntas críticas */}
              {audit.preguntas_criticas?.length > 0 && (
                <div className="mt-6">
                  <h3 className="text-xs font-semibold text-ink/50 uppercase tracking-wide mb-3">
                    ⚠️ Preguntas Críticas ({audit.preguntas_criticas_n})
                  </h3>
                  <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
                    {audit.preguntas_criticas.slice(0, 8).map((q) => (
                      <div
                        key={q.id}
                        className="flex items-start gap-3 bg-danger/5 border border-danger/15 rounded-xl px-4 py-2.5"
                      >
                        <span className="text-danger text-xs font-semibold shrink-0 mt-0.5">
                          {q.s_name?.split(" ")[0]}
                        </span>
                        <div className="flex-1 min-w-0">
                          <p className="text-ink text-xs leading-snug">
                            {q.question_text}
                          </p>
                          <p className="text-ink/50 text-xs mt-0.5">
                            Respuesta: {q.response_percent}% · Puntos perdidos:{" "}
                            {q.points_lost}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          ) : null}
        </div>
      </div>
    </div>
  );
}