import { FileSpreadsheet, Download, ClipboardCheck, Star } from "lucide-react";
import Header from "../components/Layout/Header";
import GlassCard from "../components/Layout/GlassCard";

const REPORTS = [
  {
    title:    "Resumen de Auditorías",
    desc:     "Exporta el listado completo de auditorías con puntajes por S y estado general.",
    icon:     ClipboardCheck,
    color:    "primary",
    endpoint: "/audits/export/summary",
    filename: "auditoria_resumen.xlsx",
  },
  {
    title:    "Detalle de Preguntas",
    desc:     "Exporta todas las preguntas respondidas con observaciones y puntos perdidos.",
    icon:     ClipboardCheck,
    color:    "secondary",
    endpoint: "/audits/export/detail",
    filename: "auditoria_detalle.xlsx",
  },
  {
    title:    "Encuestas de Satisfacción",
    desc:     "Exporta todos los registros de satisfacción interna y externa.",
    icon:     Star,
    color:    "success",
    endpoint: "/surveys/export",
    filename: "satisfaccion.xlsx",
  },
];

export default function ReportsPage() {
  return (
    <div className="min-h-screen relative z-10">
      <Header title="Reportes y Exportaciones" subtitle="Descarga datos en formato Excel" />

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5 stagger">
        {REPORTS.map((r) => {
          const colorMap = { primary: "bg-primary", secondary: "bg-secondary", success: "bg-success" };
          return (
            <GlassCard key={r.title}>
              <div className={`w-10 h-10 rounded-2xl ${colorMap[r.color]} flex items-center justify-center mb-4`}>
                <r.icon size={18} className="text-white" />
              </div>
              <h3 className="text-sm font-semibold text-ink mb-1">{r.title}</h3>
              <p className="text-xs text-ink/50 mb-5 leading-relaxed">{r.desc}</p>
              <button className="btn-secondary flex items-center gap-2 text-sm w-full justify-center" disabled>
                <Download size={15} />
                Descargar Excel
              </button>
              <p className="text-center text-xs text-ink/30 mt-2">Próximamente</p>
            </GlassCard>
          );
        })}
      </div>

      <GlassCard className="mt-6">
        <h3 className="text-sm font-semibold text-ink mb-3">📋 Notas sobre Exportaciones</h3>
        <ul className="text-xs text-ink/60 space-y-2 leading-relaxed">
          <li>• Los archivos Excel tendrán formato condicional (colores semáforo) aplicado automáticamente.</li>
          <li>• El resumen de auditorías incluye una hoja pivot por sucursal y trimestre.</li>
          <li>• Las exportaciones respetan los filtros activos en las páginas de listado.</li>
          <li>• Para exportaciones grandes, el proceso puede tomar unos segundos.</li>
        </ul>
      </GlassCard>
    </div>
  );
}