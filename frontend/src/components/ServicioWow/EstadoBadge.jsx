import { WOW_SEM } from "./wowUtils";

/** Badge del semáforo del Servicio WOW (Excelente / Aceptable / Crítico / Sin datos). */
export default function EstadoBadge({ estado }) {
  const s = WOW_SEM[estado] || WOW_SEM["Sin datos"];
  return (
    <span className={`inline-block text-xs font-semibold px-2 py-0.5 rounded-lg ${s.badge}`}>
      {estado}
    </span>
  );
}
