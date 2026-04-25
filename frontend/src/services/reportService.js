/**
 * reportService.js — Lógica de generación de conclusiones automáticas
 * y orquestación de la exportación PDF ejecutivo.
 */

const S_NAMES = {
  seiri:    "Seiri (Clasificar)",
  seiton:   "Seiton (Ordenar)",
  seiso:    "Seiso (Limpiar)",
  seiketsu: "Seiketsu (Estandarizar)",
  shitsuke: "Shitsuke (Disciplina)",
};

/**
 * Genera conclusiones automáticas en base a los KPIs de auditorías y encuestas.
 * @returns {{ conclusions: string[], recommendations: string[] }}
 */
export function generateConclusions(auditKPIs, surveyKPIs) {
  const conclusions     = [];
  const recommendations = [];

  // ── Auditorías 5S ────────────────────────────────────────────────────────
  if (auditKPIs && auditKPIs.total_auditorias > 0) {
    const p      = Number(auditKPIs.promedio_global);
    const estado = p >= 80 ? "Excelente" : p >= 60 ? "Aceptable" : "Crítico";

    conclusions.push(
      `El desempeño global de auditorías 5S es ${estado}, con un promedio de ${p.toFixed(1)}% ` +
      `basado en ${auditKPIs.total_auditorias} auditoría(s) registrada(s).`
    );

    // Mejor y peor S
    const s = auditKPIs.promedio_por_s;
    if (s) {
      const entries = Object.entries(s)
        .filter(([, v]) => v != null && !isNaN(Number(v)))
        .sort(([, a], [, b]) => Number(b) - Number(a));

      if (entries.length >= 2) {
        const [bestKey, bestVal]   = entries[0];
        const [worstKey, worstVal] = entries[entries.length - 1];
        conclusions.push(
          `La S más fortalecida es ${S_NAMES[bestKey]} con ${Number(bestVal).toFixed(1)}%, ` +
          `mientras que ${S_NAMES[worstKey]} (${Number(worstVal).toFixed(1)}%) requiere atención prioritaria.`
        );
        if (Number(worstVal) < 70) {
          recommendations.push(
            `Implementar talleres de mejora enfocados en ${S_NAMES[worstKey]} en todas las sucursales, ` +
            `con seguimiento quincenal y registro de avances.`
          );
        }
      }
    }

    // Mejor y peor sucursal
    if (auditKPIs.mejor_sucursal && auditKPIs.peor_sucursal) {
      conclusions.push(
        `La sucursal con mejor desempeño es ${auditKPIs.mejor_sucursal} ` +
        `(${Number(auditKPIs.mejor_sucursal_pct).toFixed(1)}%) y la que requiere mayor atención es ` +
        `${auditKPIs.peor_sucursal} (${Number(auditKPIs.peor_sucursal_pct).toFixed(1)}%).`
      );
    }

    // Recomendación según nivel global
    if (p < 60) {
      recommendations.push(
        "El nivel de cumplimiento está en estado Crítico. Se recomienda activar un plan de acción " +
        "urgente con auditorías de seguimiento semanales y asignación de responsables por sucursal."
      );
    } else if (p < 80) {
      recommendations.push(
        "El cumplimiento está en zona de mejora. Se recomienda reforzar la capacitación en metodología " +
        "5S y establecer rondas de verificación mensuales con indicadores de avance."
      );
    } else {
      recommendations.push(
        "El cumplimiento global es satisfactorio. Se recomienda mantener la frecuencia de auditorías " +
        "y documentar las mejores prácticas para replicarlas en otras sucursales."
      );
    }

    // Sucursales críticas
    const critPct = Number(auditKPIs.sucursales_critico_pct);
    if (critPct > 30) {
      recommendations.push(
        `${critPct.toFixed(1)}% de las sucursales se encuentran en estado Crítico. ` +
        `Priorizar visitas de campo y recursos de mejora en esas sedes de manera inmediata.`
      );
    }
  }

  // ── Satisfacción ─────────────────────────────────────────────────────────
  if (surveyKPIs && surveyKPIs.total_registros > 0) {
    const interna  = Number(surveyKPIs.sat_interna_global) * 100;
    const externa  = Number(surveyKPIs.sat_externa_global) * 100;
    const overall  = Number(surveyKPIs.overall_global)     * 100;

    conclusions.push(
      `En satisfacción, el índice interno es ${interna.toFixed(1)}% y el externo es ` +
      `${externa.toFixed(1)}%, con un promedio general de ${overall.toFixed(1)}%.`
    );

    if (surveyKPIs.mejor_dimension && surveyKPIs.peor_dimension) {
      conclusions.push(
        `La dimensión más valorada es ${surveyKPIs.mejor_dimension}, mientras que ` +
        `${surveyKPIs.peor_dimension} representa la mayor oportunidad de mejora.`
      );
      recommendations.push(
        `Diseñar un plan de mejora específico para la dimensión "${surveyKPIs.peor_dimension}", ` +
        `incluyendo capacitación dirigida y métricas de seguimiento trimestrales.`
      );
    }

    // Brecha interna vs externa
    const gap = interna - externa;
    if (Math.abs(gap) > 10) {
      if (gap > 0) {
        conclusions.push(
          `Existe una brecha de ${gap.toFixed(1)} pp entre satisfacción interna y externa. ` +
          `Los procesos internos están mejor calificados que la percepción del cliente externo.`
        );
        recommendations.push(
          "Alinear los estándares de servicio interno con las expectativas del cliente externo " +
          "mediante jornadas de sensibilización y mecanismos de feedback cruzado."
        );
      } else {
        conclusions.push(
          `La satisfacción externa supera a la interna en ${Math.abs(gap).toFixed(1)} pp. ` +
          `Los equipos internos podrían estar experimentando presión o falta de recursos.`
        );
        recommendations.push(
          "Investigar las causas de la baja satisfacción interna mediante encuestas de clima " +
          "laboral y entrevistas a equipos clave."
        );
      }
    }
  }

  return { conclusions, recommendations };
}
