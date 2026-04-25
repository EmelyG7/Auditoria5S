/**
 * AuditDetailPage.jsx — Página de detalle de una auditoría.
 * Se accede desde /audits/:id (ruta protegida).
 * Muestra toda la información de la auditoría, incluyendo gráfico radar y preguntas críticas.
 */

import { useParams, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, Loader2 } from "lucide-react";
import { auditsService } from "../services/audits";
import Header from "../components/Layout/Header";
import GlassCard from "../components/Layout/GlassCard";
import RadarChartS from "../components/Dashboard/RadarChartS";
import { fmt } from "../utils/format";

// Mapeo de claves del backend a etiquetas cortas para el radar
const S_KEYS = ["seiri", "seiton", "seiso", "seiketsu", "shitsuke"];
const S_LABELS = ["Seiri", "Seiton", "Seiso", "Seiketsu", "Shitsuke"];

export default function AuditDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();

  const { data: audit, isLoading, error } = useQuery({
    queryKey: ["audit", id],
    queryFn: () => auditsService.getById(id),
    enabled: !!id,
  });

  // Datos para el radar
  const radarData = audit?.puntajes_por_s
    ? S_KEYS.map((key, i) => ({
        s: S_LABELS[i],
        value: audit.puntajes_por_s[key] ?? 0,
      }))
    : [];

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 size={32} className="animate-spin text-primary/40" />
      </div>
    );
  }

  if (error || !audit) {
    return (
      <div className="text-center py-12">
        <p className="text-danger">No se pudo cargar la auditoría.</p>
        <button onClick={() => navigate("/audits")} className="btn-secondary mt-4">
          Volver al listado
        </button>
      </div>
    );
  }

  return (
    <div className="min-h-screen relative z-10">
      <Header
        title={`Detalle de Auditoría #${audit.id}`}
        subtitle={`${audit.branch} · ${fmt.date(audit.audit_date)}`}
      />

      {/* Botón de regreso */}
      <div className="mb-4">
        <button
          onClick={() => navigate("/audits")}
          className="btn-ghost flex items-center gap-2 text-sm"
        >
          <ArrowLeft size={16} />
          Volver al listado
        </button>
      </div>

      {/* Contenido principal */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* Columna izquierda: Datos generales y radar */}
        <div className="space-y-5">
          <GlassCard>
            <h3 className="text-sm font-semibold text-ink/70 uppercase tracking-wide mb-4">
              Información General
            </h3>
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <p className="text-xs text-ink/40">Tipo</p>
                <p className="font-medium">{audit.audit_type_name || "—"}</p>
              </div>
              <div>
                <p className="text-xs text-ink/40">Sucursal</p>
                <p className="font-medium">{audit.branch}</p>
              </div>
              <div>
                <p className="text-xs text-ink/40">Fecha</p>
                <p className="font-medium">{fmt.date(audit.audit_date)}</p>
              </div>
              <div>
                <p className="text-xs text-ink/40">Auditor</p>
                <p className="font-medium">{audit.auditor_name || "—"}</p>
              </div>
              {audit.start_time && (
                <div>
                  <p className="text-xs text-ink/40">Hora inicio</p>
                  <p className="font-medium">{audit.start_time}</p>
                </div>
              )}
              {audit.end_time && (
                <div>
                  <p className="text-xs text-ink/40">Hora fin</p>
                  <p className="font-medium">{audit.end_time}</p>
                </div>
              )}
            </div>
            {audit.general_observations && (
              <div className="mt-4 pt-3 border-t border-ink/10">
                <p className="text-xs text-ink/40 mb-1">Observaciones generales</p>
                <p className="text-sm text-ink/70 whitespace-pre-wrap">
                  {audit.general_observations}
                </p>
              </div>
            )}
          </GlassCard>

          <GlassCard>
            <h3 className="text-sm font-semibold text-ink/70 uppercase tracking-wide mb-4">
              Puntaje General
            </h3>
            <div className="flex items-center gap-4 p-4 rounded-2xl bg-ink/5">
              <div
                className="text-4xl font-bold"
                style={{ color: fmt.semaforoColor(audit.percentage) }}
              >
                {fmt.pct(audit.percentage)}
              </div>
              <div>
                <span className={fmt.badgeClass(audit.status)}>{audit.status}</span>
                <p className="text-ink/50 text-xs mt-1">
                  {audit.total_score} / {audit.max_score} pts
                </p>
              </div>
            </div>
          </GlassCard>
        </div>

        {/* Columna derecha: Radar 5S */}
        <GlassCard>
          <h3 className="text-sm font-semibold text-ink/70 uppercase tracking-wide mb-4">
            Desempeño por cada S
          </h3>
          <RadarChartS data={radarData} height={280} />
        </GlassCard>
      </div>

      {/* Preguntas críticas (a pantalla completa) */}
      {audit.preguntas_criticas?.length > 0 && (
        <div className="mt-5">
          <GlassCard>
            <h3 className="text-sm font-semibold text-ink/70 uppercase tracking-wide mb-4">
              Preguntas Críticas ({audit.preguntas_criticas_n})
            </h3>
            <div className="space-y-3">
              {audit.preguntas_criticas.map((q) => (
                <div
                  key={q.id}
                  className="flex items-start gap-3 bg-danger/5 border border-danger/15 rounded-xl p-4"
                >
                  <span className="text-danger text-xs font-semibold shrink-0 mt-0.5">
                    {q.s_name?.split(" ")[0]}
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="text-ink text-sm leading-snug">{q.question_text}</p>
                    <p className="text-ink/50 text-xs mt-1">
                      Respuesta: {q.response_percent}% · Puntos perdidos: {q.points_lost}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </GlassCard>
        </div>
      )}
    </div>
  );
}