/**
 * AuditFormPage.jsx — Formulario completo para crear/editar auditorías 5S.
 *
 * Flujo:
 *   1. Carga el catálogo de tipos de auditoría desde /audits/types
 *   2. El usuario selecciona el tipo → se carga el checklist de preguntas
 *      (hardcoded basado en los pesos reales de los Excel, o desde la BD si
 *       en el futuro se expone un endpoint /audits/types/{id}/questions)
 *   3. Por cada S muestra sus preguntas con opciones 0 / 50 / 100 %
 *   4. Al enviar, llama a auditsService.create() o .update()
 *   5. Los puntajes se calculan en el backend (audit_service.py)
 *
 * Props de ruta:
 *   /audits/new          → crear
 *   /audits/:id/edit     → editar (carga datos existentes)
 */

import { useState, useEffect, useMemo } from "react";
import { useNavigate, useParams, Link } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  ChevronLeft, ChevronRight, Check, Save,
  Loader2, AlertCircle, CheckCircle2, ClipboardCheck,
} from "lucide-react";
import { auditsService } from "../services/audits";
import Header from "../components/Layout/Header";
import GlassCard from "../components/Layout/GlassCard";
import { fmt } from "../utils/format";

// ─────────────────────────────────────────────────────────────────────────────
// CHECKLISTS HARDCODED
// Basados en los pesos reales de los archivos Excel proporcionados.
// Estructura: { [audit_type_name]: [ { s_name, s_index, preguntas: [...] } ] }
//
// NOTA: En el futuro, este objeto puede reemplazarse por un endpoint
//   GET /audits/types/{id}/checklist  que retorne la estructura dinámica
//   detectada por detectar_grupos_desde_df() del backend.
// ─────────────────────────────────────────────────────────────────────────────

const CHECKLISTS = {
  "Almacenes": [
    {
      s_index: 0, nombre_s: "Seiri (Clasificar)",
      preguntas: [
        { texto: "¿Existen materiales, herramientas o equipos innecesarios en el área?", peso: 4.55 },
        { texto: "¿Los artículos en el área están claramente identificados como necesarios o innecesarios?", peso: 4.55 },
        { texto: "¿Se dispone de un criterio claro para clasificar artículos necesarios vs innecesarios?", peso: 4.55 },
        { texto: "¿El área está libre de documentos o papeles obsoletos?", peso: 4.55 },
        { texto: "¿Los materiales o equipos dañados/inservibles están separados y marcados para disposición?", peso: 4.55 },
        { texto: "¿Existe un proceso definido para la disposición de artículos innecesarios?", peso: 4.55 },
        { texto: "¿Se revisan periódicamente los artículos del área para clasificar y eliminar lo innecesario?", peso: 4.55 },
      ],
    },
    {
      s_index: 1, nombre_s: "Seiton (Ordenar)",
      preguntas: [
        { texto: "¿Cada artículo tiene un lugar designado y claramente marcado?", peso: 4.55 },
        { texto: "¿Los artículos están almacenados en su lugar asignado?", peso: 4.55 },
        { texto: "¿Las áreas de almacenamiento están etiquetadas de forma clara y visible?", peso: 4.55 },
        { texto: "¿Los artículos de uso frecuente están ubicados en lugares de fácil acceso?", peso: 4.55 },
        { texto: "¿Los pasillos y zonas de tránsito están libres de obstáculos?", peso: 4.55 },
        { texto: "¿Las herramientas y equipos están ordenados de forma lógica (por tamaño, tipo, frecuencia de uso)?", peso: 4.55 },
        { texto: "¿El sistema de ordenamiento facilita la devolución rápida de artículos después de su uso?", peso: 4.55 },
      ],
    },
    {
      s_index: 2, nombre_s: "Seiso (Limpiar)",
      preguntas: [
        { texto: "¿El área de trabajo está limpia y libre de polvo, suciedad o residuos?", peso: 4.55 },
        { texto: "¿Los equipos, herramientas y maquinaria están limpios y en buen estado?", peso: 4.55 },
        { texto: "¿Existe un programa de limpieza definido con responsables y frecuencias?", peso: 4.55 },
        { texto: "¿El área cuenta con los materiales de limpieza necesarios disponibles?", peso: 4.55 },
        { texto: "¿Se identifican y eliminan las fuentes de suciedad o desorden?", peso: 4.55 },
        { texto: "¿Los registros de limpieza están actualizados?", peso: 4.55 },
        { texto: "¿El área tiene buena iluminación y ventilación para facilitar la limpieza?", peso: 4.55 },
      ],
    },
    {
      s_index: 3, nombre_s: "Seiketsu (Estandarizar)",
      preguntas: [
        { texto: "¿Existen procedimientos o instructivos documentados para las 3S anteriores?", peso: 5.0 },
        { texto: "¿Los estándares de orden y limpieza están visualmente comunicados en el área?", peso: 5.0 },
        { texto: "¿El personal conoce y aplica los estándares establecidos?", peso: 5.0 },
        { texto: "¿Se realizan auditorías regulares para verificar el cumplimiento de los estándares?", peso: 5.0 },
        { texto: "¿Los resultados de las auditorías anteriores están publicados en el área?", peso: 5.0 },
      ],
    },
    {
      s_index: 4, nombre_s: "Shitsuke (Disciplina)",
      preguntas: [
        { texto: "¿El personal mantiene de forma autónoma los estándares 5S sin supervisión constante?", peso: 5.0 },
        { texto: "¿Existe un programa de capacitación en 5S para el personal del área?", peso: 5.0 },
        { texto: "¿La mejora continua es parte de la cultura del área (sugerencias, iniciativas propias)?", peso: 5.0 },
        { texto: "¿Los líderes del área participan activamente en las actividades 5S?", peso: 5.0 },
        { texto: "¿El área ha mostrado mejora sostenida en las auditorías consecutivas?", peso: 5.0 },
      ],
    },
  ],
  "Centro de Servicios": [
    {
      s_index: 0, nombre_s: "Seiri (Clasificar)",
      preguntas: [
        { texto: "¿Existen herramientas, equipos o repuestos innecesarios en el área de trabajo?", peso: 4.55 },
        { texto: "¿Los equipos en reparación están identificados y separados de los listos para entrega?", peso: 4.55 },
        { texto: "¿Los repuestos y componentes están clasificados correctamente (usados vs nuevos)?", peso: 4.55 },
        { texto: "¿Existe un área designada para equipos en espera de diagnóstico?", peso: 4.55 },
        { texto: "¿El área está libre de equipos o materiales sin propietario identificado?", peso: 4.55 },
        { texto: "¿Los documentos de trabajo (órdenes de servicio) están organizados y actualizados?", peso: 4.55 },
        { texto: "¿Se revisa periódicamente el inventario de repuestos para eliminar obsoletos?", peso: 4.55 },
      ],
    },
    {
      s_index: 1, nombre_s: "Seiton (Ordenar)",
      preguntas: [
        { texto: "¿Las herramientas de servicio tienen un lugar definido y marcado?", peso: 4.55 },
        { texto: "¿Los repuestos e insumos están organizados por categoría o tipo de equipo?", peso: 4.55 },
        { texto: "¿Los equipos del cliente están ordenados y etiquetados con información de seguimiento?", peso: 4.55 },
        { texto: "¿El área de recepción de equipos está diferenciada del área de entrega?", peso: 4.55 },
        { texto: "¿Las estaciones de trabajo están organizadas para optimizar el flujo de servicio?", peso: 4.55 },
        { texto: "¿Los cables y accesorios están ordenados y almacenados correctamente?", peso: 4.55 },
        { texto: "¿Existe señalización clara de los diferentes sectores del área?", peso: 4.55 },
      ],
    },
    {
      s_index: 2, nombre_s: "Seiso (Limpiar)",
      preguntas: [
        { texto: "¿Las estaciones de trabajo están limpias antes y después de cada servicio?", peso: 4.55 },
        { texto: "¿Los equipos de los clientes se manejan con cuidado y sin generar suciedad adicional?", peso: 4.55 },
        { texto: "¿Las herramientas están limpias y en buen estado de conservación?", peso: 4.55 },
        { texto: "¿Existe un procedimiento de limpieza al inicio/fin del turno?", peso: 4.55 },
        { texto: "¿El área de espera del cliente está limpia y ordenada?", peso: 4.55 },
        { texto: "¿Se desechan correctamente los materiales de embalaje y residuos generados?", peso: 4.55 },
        { texto: "¿Los baños y áreas comunes asociadas están limpios?", peso: 4.55 },
      ],
    },
    {
      s_index: 3, nombre_s: "Seiketsu (Estandarizar)",
      preguntas: [
        { texto: "¿Existen procedimientos escritos para la recepción, diagnóstico y entrega de equipos?", peso: 5.0 },
        { texto: "¿Los técnicos siguen un proceso estandarizado de diagnóstico?", peso: 5.0 },
        { texto: "¿Las órdenes de servicio tienen un formato estándar y se completan correctamente?", peso: 5.0 },
        { texto: "¿Los estándares de calidad del servicio están documentados y comunicados?", peso: 5.0 },
        { texto: "¿Se realizan revisiones periódicas de los estándares del área?", peso: 5.0 },
      ],
    },
    {
      s_index: 4, nombre_s: "Shitsuke (Disciplina)",
      preguntas: [
        { texto: "¿El personal técnico mantiene los estándares 5S de forma autónoma?", peso: 5.0 },
        { texto: "¿Existe capacitación continua en procedimientos y estándares de calidad?", peso: 5.0 },
        { texto: "¿El personal propone mejoras al proceso de servicio activamente?", peso: 5.0 },
        { texto: "¿La supervisión verifica el cumplimiento 5S de forma regular?", peso: 5.0 },
        { texto: "¿El área muestra mejora continua medible en indicadores de servicio?", peso: 5.0 },
      ],
    },
  ],
  "RMA": [
    {
      s_index: 0, nombre_s: "Seiri (Clasificar)",
      preguntas: [
        { texto: "¿Los productos en proceso de RMA están separados de los demás inventarios?", peso: 4.55 },
        { texto: "¿Existe clasificación clara entre: por evaluar, aprobados, rechazados, en tránsito?", peso: 4.55 },
        { texto: "¿Los productos sin documentación o autorización están identificados y segregados?", peso: 4.55 },
        { texto: "¿El área está libre de materiales o productos sin proceso RMA activo?", peso: 4.55 },
        { texto: "¿Los embalajes y materiales de empaque están clasificados y almacenados correctamente?", peso: 4.55 },
        { texto: "¿Se revisa periódicamente el inventario para identificar RMAs vencidos o estancados?", peso: 4.55 },
        { texto: "¿Los productos con defectos físicos visibles están marcados y separados?", peso: 4.55 },
      ],
    },
    {
      s_index: 1, nombre_s: "Seiton (Ordenar)",
      preguntas: [
        { texto: "¿Cada estado de RMA tiene un área o zona designada y claramente marcada?", peso: 4.55 },
        { texto: "¿Los productos están organizados por prioridad o fecha de ingreso al proceso?", peso: 4.55 },
        { texto: "¿El sistema de etiquetado permite rastrear el estado de cada unidad rápidamente?", peso: 4.55 },
        { texto: "¿Los pasillos y zonas de trabajo están libres para el tránsito seguro?", peso: 4.55 },
        { texto: "¿Las herramientas de inspección tienen un lugar designado y accesible?", peso: 4.55 },
        { texto: "¿La documentación de RMA (formularios, reportes) está organizada y accesible?", peso: 4.55 },
        { texto: "¿Existe señalización visual del flujo del proceso RMA dentro del área?", peso: 4.55 },
      ],
    },
    {
      s_index: 2, nombre_s: "Seiso (Limpiar)",
      preguntas: [
        { texto: "¿El área de recepción y evaluación de RMAs está limpia?", peso: 4.55 },
        { texto: "¿Los productos se inspeccionan en condiciones de limpieza adecuadas?", peso: 4.55 },
        { texto: "¿Las superficies de trabajo están libres de polvo y contaminantes?", peso: 4.55 },
        { texto: "¿Existe un programa de limpieza con responsables asignados?", peso: 4.55 },
        { texto: "¿Los embalajes y materiales de desecho se gestionan correctamente?", peso: 4.55 },
        { texto: "¿El área de almacenamiento temporal de RMAs está limpia y ventilada?", peso: 4.55 },
        { texto: "¿Los registros de limpieza están actualizados y visibles?", peso: 4.55 },
      ],
    },
    {
      s_index: 3, nombre_s: "Seiketsu (Estandarizar)",
      preguntas: [
        { texto: "¿El proceso de RMA tiene procedimientos documentados y actualizados?", peso: 5.0 },
        { texto: "¿Los criterios de aprobación/rechazo de productos están estandarizados?", peso: 5.0 },
        { texto: "¿Los formatos de RMA son uniformes y se completan consistentemente?", peso: 5.0 },
        { texto: "¿Se realizan auditorías periódicas del área y se publican los resultados?", peso: 5.0 },
        { texto: "¿Los tiempos de ciclo del proceso RMA están definidos y monitoreados?", peso: 5.0 },
      ],
    },
    {
      s_index: 4, nombre_s: "Shitsuke (Disciplina)",
      preguntas: [
        { texto: "¿El personal sigue los procedimientos RMA de forma consistente y autónoma?", peso: 5.0 },
        { texto: "¿Existe capacitación regular en el proceso RMA y estándares de calidad?", peso: 5.0 },
        { texto: "¿El equipo propone mejoras al proceso basadas en problemas identificados?", peso: 5.0 },
        { texto: "¿La tasa de error en el proceso RMA muestra tendencia a la mejora?", peso: 5.0 },
        { texto: "¿Los líderes del área modelan activamente los comportamientos 5S esperados?", peso: 5.0 },
      ],
    },
  ],
};

// Colores y etiquetas para los botones de respuesta
const RESPUESTAS = [
  { value: 0,   label: "0%",   desc: "No cumple",  bg: "bg-danger/10  border-danger/30  text-danger",  active: "bg-danger   text-white border-danger" },
  { value: 50,  label: "50%",  desc: "Parcial",    bg: "bg-warning/10 border-warning/30 text-warning", active: "bg-warning  text-white border-warning" },
  { value: 100, label: "100%", desc: "Cumple",     bg: "bg-success/10 border-success/30 text-success", active: "bg-success  text-white border-success" },
];

const S_COLORS = [
  "from-primary/10 to-primary/5 border-primary/20",
  "from-secondary/10 to-secondary/5 border-secondary/20",
  "from-success/10 to-success/5 border-success/20",
  "from-warning/10 to-warning/5 border-warning/20",
  "from-danger/10 to-danger/5 border-danger/20",
];
const S_ACCENT = ["text-primary", "text-secondary", "text-success", "text-warning", "text-danger"];

// ─────────────────────────────────────────────────────────────────────────────
// COMPONENTE PRINCIPAL
// ─────────────────────────────────────────────────────────────────────────────

export default function AuditFormPage() {
  const { id }    = useParams();          // Definido → modo edición
  const isEdit    = Boolean(id);
  const navigate  = useNavigate();
  const qc        = useQueryClient();

  // Paso activo del wizard (0 = metadatos, 1-5 = cada S, 6 = resumen)
  const [step, setStep]                   = useState(0);
  const [selectedTypeName, setTypeName]   = useState("");
  const [meta, setMeta]                   = useState({
    audit_type_id: "", audit_date: new Date().toISOString().split("T")[0],
    branch: "", auditor_name: "", auditor_email: "",
    start_time: "", end_time: "", general_observations: "",
  });
  // respuestas[s_index][pregunta_index] = { response_percent, observation }
  const [respuestas, setRespuestas] = useState({});
  const [submitError, setSubmitError]     = useState("");
  const [submitted, setSubmitted]         = useState(false);

  // ── Cargar tipos de auditoría ─────────────────────────────────────────────
  const { data: types = [], isLoading: loadingTypes } = useQuery({
    queryKey: ["audit-types"],
    queryFn:  auditsService.getTypes,
  });

  // ── Si es edición, cargar datos existentes ────────────────────────────────
  const { data: existingAudit, isLoading: loadingExisting } = useQuery({
    queryKey:  ["audit", id],
    queryFn:   () => auditsService.getById(id),
    enabled:   isEdit,
  });

  // Poblar formulario cuando llegan los datos de edición
  useEffect(() => {
    if (!existingAudit || !types.length) return;
    const auditType = types.find((t) => t.id === existingAudit.audit_type_id);
    if (auditType) setTypeName(auditType.name);

    setMeta({
      audit_type_id:        existingAudit.audit_type_id,
      audit_date:           existingAudit.audit_date,
      branch:               existingAudit.branch || "",
      auditor_name:         existingAudit.auditor_name || "",
      auditor_email:        existingAudit.auditor_email || "",
      start_time:           existingAudit.start_time || "",
      end_time:             existingAudit.end_time || "",
      general_observations: existingAudit.general_observations || "",
    });

    // Reconstruir respuestas desde el detalle de preguntas
    if (existingAudit.questions?.length > 0) {
      const rebuilt = {};
      existingAudit.questions.forEach((q) => {
        if (!rebuilt[q.s_index]) rebuilt[q.s_index] = {};
        rebuilt[q.s_index][q.question_order] = {
          response_percent: Number(q.response_percent),
          observation:      q.observation || "",
        };
      });
      setRespuestas(rebuilt);
    }
  }, [existingAudit, types]);

  // ── Checklist activo basado en el tipo seleccionado ───────────────────────
  const checklist = useMemo(
    () => CHECKLISTS[selectedTypeName] || [],
    [selectedTypeName]
  );

  const totalSteps = checklist.length + 2; // 0=meta, 1..N=S, last=resumen

  // ── Helpers de respuesta ──────────────────────────────────────────────────
  const getRespuesta = (s_index, preg_index) =>
    respuestas[s_index]?.[preg_index]?.response_percent ?? null;

  const setRespuesta = (s_index, preg_index, value) =>
    setRespuestas((prev) => ({
      ...prev,
      [s_index]: {
        ...(prev[s_index] || {}),
        [preg_index]: {
          ...(prev[s_index]?.[preg_index] || {}),
          response_percent: value,
        },
      },
    }));

  const getObservacion = (s_index) =>
    respuestas[s_index]?.__obs || "";

  const setObservacion = (s_index, text) =>
    setRespuestas((prev) => ({
      ...prev,
      [s_index]: { ...(prev[s_index] || {}), __obs: text },
    }));

  // ── Calcular puntaje local para preview ──────────────────────────────────
  const calcularPuntajeS = (s_index) => {
    const grupo = checklist.find((g) => g.s_index === s_index);
    if (!grupo) return null;
    let pts = 0, max = 0;
    grupo.preguntas.forEach((p, i) => {
      const r = getRespuesta(s_index, i);
      if (r !== null) { pts += (r / 100) * p.peso; }
      max += p.peso;
    });
    return max > 0 ? { pts: round2(pts), max: round2(max), pct: round2((pts / max) * 100) } : null;
  };

  const calcularTotal = () => {
    let pts = 0, max = 0;
    checklist.forEach((g) => {
      const s = calcularPuntajeS(g.s_index);
      if (s) { pts += s.pts; max += s.max; }
    });
    return max > 0 ? { pts: round2(pts), max: round2(max), pct: round2((pts / max) * 100) } : null;
  };

  // ── Validaciones por paso ─────────────────────────────────────────────────
  const stepValid = useMemo(() => {
    if (step === 0) {
      return meta.audit_type_id && meta.audit_date && meta.branch.trim();
    }
    const sIdx = step - 1;
    const grupo = checklist[sIdx];
    if (!grupo) return true; // resumen
    return grupo.preguntas.every((_, i) => getRespuesta(sIdx, i) !== null);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, meta, respuestas, checklist]);

  const preguntasRespondidas = () => {
    let total = 0, resp = 0;
    checklist.forEach((g) => {
      g.preguntas.forEach((_, i) => {
        total++;
        if (getRespuesta(g.s_index, i) !== null) resp++;
      });
    });
    return { total, resp };
  };

  // ── Mutación de submit ────────────────────────────────────────────────────
  const saveMut = useMutation({
    mutationFn: (payload) => isEdit
      ? auditsService.update(id, payload)
      : auditsService.create(payload),
    onSuccess: () => {
      qc.invalidateQueries(["audits"]);
      qc.invalidateQueries(["audit-kpis"]);
      setSubmitted(true);
      setTimeout(() => navigate("/audits"), 2000);
    },
    onError: (err) => {
      setSubmitError(err.response?.data?.detail || "Error al guardar la auditoría.");
    },
  });

  const handleSubmit = () => {
    setSubmitError("");
    const questions = [];
    checklist.forEach((grupo) => {
      grupo.preguntas.forEach((preg, i) => {
        questions.push({
          s_name:           grupo.nombre_s,
          s_index:          grupo.s_index,
          question_text:    preg.texto,
          question_order:   i,
          weight:           preg.peso,
          response_percent: getRespuesta(grupo.s_index, i) ?? 0,
          observation:      getObservacion(grupo.s_index) || null,
        });
      });
    });

    const payload = {
      audit_type_id:        Number(meta.audit_type_id),
      audit_date:           meta.audit_date,
      branch:               meta.branch.trim(),
      auditor_name:         meta.auditor_name.trim() || null,
      auditor_email:        meta.auditor_email.trim() || null,
      start_time:           meta.start_time || null,
      end_time:             meta.end_time   || null,
      general_observations: meta.general_observations.trim() || null,
      questions,
    };
    saveMut.mutate(payload);
  };

  // ── Handlers de navegación ────────────────────────────────────────────────
  const handleTypeChange = (e) => {
    const typeId = Number(e.target.value);
    const t = types.find((t) => t.id === typeId);
    setMeta((p) => ({ ...p, audit_type_id: typeId }));
    setTypeName(t?.name || "");
    setRespuestas({});
    setStep(0);
  };

  // ─────────────────────────────────────────────────────────────────────────
  // RENDER — Estado de éxito
  // ─────────────────────────────────────────────────────────────────────────
  if (submitted) {
    return (
      <div className="min-h-screen relative z-10 flex items-center justify-center">
        <div className="glass-card text-center max-w-sm mx-auto animate-fade-up">
          <div className="w-16 h-16 rounded-full bg-success/15 flex items-center justify-center mx-auto mb-4">
            <CheckCircle2 size={32} className="text-success" />
          </div>
          <h2 className="text-xl font-semibold text-ink mb-2">
            {isEdit ? "Auditoría actualizada" : "Auditoría guardada"}
          </h2>
          <p className="text-ink/50 text-sm">Redirigiendo al listado...</p>
        </div>
      </div>
    );
  }

  // ─────────────────────────────────────────────────────────────────────────
  // RENDER — Cargando (modo edición)
  // ─────────────────────────────────────────────────────────────────────────
  if (isEdit && loadingExisting) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 size={28} className="animate-spin text-primary/40" />
      </div>
    );
  }

  // ── Calcular progreso ─────────────────────────────────────────────────────
  const { total: totalPreg, resp: respPreg } = preguntasRespondidas();
  const progresoPct = totalPreg > 0 ? Math.round((respPreg / totalPreg) * 100) : 0;
  const totalScore  = calcularTotal();
  const isLastStep  = step === checklist.length + 1;
  const isSStep     = step > 0 && !isLastStep;
  const currentS    = isSStep ? checklist[step - 1] : null;

  return (
    <div className="min-h-screen relative z-10">
      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <Header
        title={isEdit ? "Editar Auditoría" : "Nueva Auditoría 5S"}
        subtitle={selectedTypeName ? `${selectedTypeName} · ${meta.branch || "Sin sucursal"}` : "Completa el formulario paso a paso"}
      />

      {/* ── Barra de progreso global ────────────────────────────────────────── */}
      {checklist.length > 0 && (
        <div className="mb-6 animate-fade-in">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              {totalScore && (
                <span className="text-sm font-semibold" style={{ color: fmt.semaforoColor(totalScore.pct) }}>
                  {fmt.pct(totalScore.pct)} estimado
                </span>
              )}
              <span className="text-xs text-ink/40">
                {respPreg}/{totalPreg} preguntas respondidas
              </span>
            </div>
            <span className="text-xs text-ink/40">{progresoPct}% completado</span>
          </div>
          <div className="h-2 bg-ink/10 rounded-full overflow-hidden">
            <div
              className="h-full rounded-full transition-all duration-500"
              style={{
                width:      `${progresoPct}%`,
                background: `linear-gradient(90deg, #0A4F79, ${fmt.semaforoColor(totalScore?.pct || 0)})`,
              }}
            />
          </div>
        </div>
      )}

      {/* ── Stepper de S ───────────────────────────────────────────────────── */}
      {checklist.length > 0 && (
        <div className="flex items-center gap-1.5 mb-6 overflow-x-auto pb-1 animate-fade-in">
          {/* Paso 0: metadatos */}
          <StepPill
            label="Info" active={step === 0} done={step > 0}
            onClick={() => setStep(0)} index={0}
          />
          {/* Pasos S */}
          {checklist.map((g, i) => {
            const sc = calcularPuntajeS(g.s_index);
            return (
              <StepPill
                key={g.s_index}
                label={g.nombre_s.split(" ")[0]}
                active={step === i + 1}
                done={step > i + 1 || (sc && g.preguntas.every((_, pi) => getRespuesta(g.s_index, pi) !== null))}
                warning={sc && sc.pct < 60}
                onClick={() => { if (step > i + 1 || step === i + 1) setStep(i + 1); }}
                index={i + 1}
                score={sc?.pct}
              />
            );
          })}
          {/* Resumen */}
          <StepPill
            label="Resumen" active={isLastStep} done={false}
            onClick={() => { if (respPreg === totalPreg) setStep(checklist.length + 1); }}
            index={checklist.length + 1}
          />
        </div>
      )}

      {/* ── PASO 0: Metadatos ───────────────────────────────────────────────── */}
      {step === 0 && (
        <GlassCard className="animate-fade-up max-w-2xl">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-10 h-10 rounded-2xl bg-primary flex items-center justify-center">
              <ClipboardCheck size={18} className="text-white" />
            </div>
            <div>
              <h2 className="text-base font-semibold text-ink">Información General</h2>
              <p className="text-ink/50 text-xs">Completa los datos básicos de la auditoría</p>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* Tipo de auditoría */}
            <div className="sm:col-span-2">
              <label className="field-label">Tipo de Auditoría *</label>
              {loadingTypes ? (
                <div className="input-glass animate-pulse bg-ink/5" />
              ) : (
                <select
                  value={meta.audit_type_id}
                  onChange={handleTypeChange}
                  required
                  className="input-glass text-sm"
                >
                  <option value="">Selecciona un tipo...</option>
                  {types.map((t) => (
                    <option key={t.id} value={t.id}>{t.name}</option>
                  ))}
                </select>
              )}
            </div>

            {/* Fecha */}
            <div>
              <label className="field-label">Fecha de Auditoría *</label>
              <input
                type="date" required
                value={meta.audit_date}
                onChange={(e) => setMeta((p) => ({ ...p, audit_date: e.target.value }))}
                className="input-glass text-sm"
              />
            </div>

            {/* Sucursal */}
            <div>
              <label className="field-label">Sucursal / Sede *</label>
              <input
                type="text" required placeholder="Oficina Principal"
                value={meta.branch}
                onChange={(e) => setMeta((p) => ({ ...p, branch: e.target.value }))}
                className="input-glass text-sm"
              />
            </div>

            {/* Auditor */}
            <div>
              <label className="field-label">Nombre del Auditor</label>
              <input
                type="text" placeholder="Juan Pérez"
                value={meta.auditor_name}
                onChange={(e) => setMeta((p) => ({ ...p, auditor_name: e.target.value }))}
                className="input-glass text-sm"
              />
            </div>

            {/* Email */}
            <div>
              <label className="field-label">Email del Auditor</label>
              <input
                type="email" placeholder="juan@empresa.com"
                value={meta.auditor_email}
                onChange={(e) => setMeta((p) => ({ ...p, auditor_email: e.target.value }))}
                className="input-glass text-sm"
              />
            </div>

            {/* Hora inicio */}
            <div>
              <label className="field-label">Hora de Inicio</label>
              <input
                type="time"
                value={meta.start_time}
                onChange={(e) => setMeta((p) => ({ ...p, start_time: e.target.value }))}
                className="input-glass text-sm"
              />
            </div>

            {/* Hora fin */}
            <div>
              <label className="field-label">Hora de Finalización</label>
              <input
                type="time"
                value={meta.end_time}
                onChange={(e) => setMeta((p) => ({ ...p, end_time: e.target.value }))}
                className="input-glass text-sm"
              />
            </div>

            {/* Observaciones generales */}
            <div className="sm:col-span-2">
              <label className="field-label">Observaciones Generales</label>
              <textarea
                rows={3} placeholder="Contexto general de la visita, condiciones especiales..."
                value={meta.general_observations}
                onChange={(e) => setMeta((p) => ({ ...p, general_observations: e.target.value }))}
                className="input-glass text-sm resize-none"
              />
            </div>
          </div>

          {/* Aviso si no hay tipo seleccionado */}
          {!selectedTypeName && meta.audit_type_id && (
            <div className="mt-4 bg-warning/10 border border-warning/20 text-warning text-xs rounded-xl px-4 py-2.5">
              El tipo seleccionado no tiene checklist configurado. Verifica la configuración.
            </div>
          )}

          <div className="flex justify-end mt-6">
            <button
              onClick={() => setStep(1)}
              disabled={!stepValid || !checklist.length}
              className="btn-primary flex items-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Comenzar Checklist
              <ChevronRight size={16} />
            </button>
          </div>
        </GlassCard>
      )}

      {/* ── PASOS 1..N: Una S por paso ──────────────────────────────────────── */}
      {isSStep && currentS && (
        <div className="animate-fade-up max-w-3xl">
          {/* Header de la S */}
          <div className={`rounded-2xl p-4 mb-5 bg-gradient-to-br border ${S_COLORS[currentS.s_index]}`}>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-semibold text-ink/50 uppercase tracking-wide mb-0.5">
                  Paso {step} de {checklist.length}
                </p>
                <h2 className={`text-xl font-semibold ${S_ACCENT[currentS.s_index]}`}>
                  {currentS.nombre_s}
                </h2>
              </div>
              {/* Score parcial de esta S */}
              {(() => {
                const sc = calcularPuntajeS(currentS.s_index);
                return sc ? (
                  <div className="text-right">
                    <p className="text-2xl font-bold" style={{ color: fmt.semaforoColor(sc.pct) }}>
                      {fmt.pct(sc.pct)}
                    </p>
                    <p className="text-xs text-ink/40">{sc.pts}/{sc.max} pts</p>
                  </div>
                ) : null;
              })()}
            </div>
          </div>

          {/* Preguntas */}
          <div className="space-y-3 mb-5">
            {currentS.preguntas.map((preg, i) => {
              const respActual = getRespuesta(currentS.s_index, i);
              return (
                <GlassCard key={i} className="!p-4 animate-fade-up" style={{ animationDelay: `${i * 0.04}s` }}>
                  <div className="flex flex-col sm:flex-row sm:items-start gap-4">
                    {/* Número y texto */}
                    <div className="flex items-start gap-3 flex-1 min-w-0">
                      <span className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold shrink-0 mt-0.5 ${
                        respActual !== null
                          ? respActual === 100 ? "bg-success text-white"
                          : respActual === 50  ? "bg-warning text-white"
                          : "bg-danger text-white"
                          : "bg-ink/10 text-ink/40"
                      }`}>
                        {respActual !== null
                          ? respActual === 100 ? <Check size={12} />
                          : respActual === 50  ? "½"
                          : "✕"
                          : i + 1
                        }
                      </span>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-ink leading-snug">{preg.texto}</p>
                        <p className="text-xs text-ink/40 mt-0.5">Peso: {preg.peso}%</p>
                      </div>
                    </div>

                    {/* Botones 0/50/100 */}
                    <div className="flex gap-2 shrink-0">
                      {RESPUESTAS.map((r) => (
                        <button
                          key={r.value}
                          onClick={() => setRespuesta(currentS.s_index, i, r.value)}
                          title={r.desc}
                          className={`px-3 py-1.5 rounded-xl border text-xs font-semibold transition-all duration-150 active:scale-95 ${
                            respActual === r.value ? r.active : r.bg
                          }`}
                        >
                          {r.label}
                        </button>
                      ))}
                    </div>
                  </div>
                </GlassCard>
              );
            })}
          </div>

          {/* Observaciones de la S */}
          <GlassCard className="!p-4 mb-6">
            <label className="field-label">
              Observaciones — {currentS.nombre_s.split(" ")[0]}
            </label>
            <textarea
              rows={3}
              placeholder={`Notas, hallazgos o comentarios sobre ${currentS.nombre_s}...`}
              value={getObservacion(currentS.s_index)}
              onChange={(e) => setObservacion(currentS.s_index, e.target.value)}
              className="input-glass text-sm resize-none"
            />
          </GlassCard>

          {/* Aviso si hay preguntas sin responder */}
          {!stepValid && (
            <div className="flex items-center gap-2 bg-warning/10 border border-warning/20 text-warning text-xs rounded-xl px-4 py-2.5 mb-4">
              <AlertCircle size={14} />
              Responde todas las preguntas de esta S para continuar.
            </div>
          )}

          {/* Navegación */}
          <div className="flex items-center justify-between">
            <button onClick={() => setStep(step - 1)} className="btn-secondary flex items-center gap-2 text-sm">
              <ChevronLeft size={16} /> Anterior
            </button>
            <button
              onClick={() => setStep(step + 1)}
              disabled={!stepValid}
              className="btn-primary flex items-center gap-2 text-sm disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {step === checklist.length ? "Ver Resumen" : "Siguiente S"}
              <ChevronRight size={16} />
            </button>
          </div>
        </div>
      )}

      {/* ── ÚLTIMO PASO: Resumen y confirmación ────────────────────────────── */}
      {isLastStep && (
        <div className="animate-fade-up max-w-3xl">
          <h2 className="text-lg font-semibold text-ink mb-5">Resumen de la Auditoría</h2>

          {/* Score total */}
          {totalScore && (
            <div
              className="rounded-2xl p-6 mb-5 text-center border"
              style={{
                background:   `${fmt.semaforoColor(totalScore.pct)}12`,
                borderColor:  `${fmt.semaforoColor(totalScore.pct)}40`,
              }}
            >
              <p className="text-5xl font-bold mb-1" style={{ color: fmt.semaforoColor(totalScore.pct) }}>
                {fmt.pct(totalScore.pct)}
              </p>
              <span className={fmt.badgeClass(fmt.semaforo(totalScore.pct))}>
                {fmt.semaforo(totalScore.pct)}
              </span>
              <p className="text-ink/50 text-sm mt-2">{totalScore.pts} / {totalScore.max} puntos totales</p>
            </div>
          )}

          {/* Puntajes por S */}
          <GlassCard className="mb-5">
            <h3 className="text-xs font-semibold text-ink/50 uppercase tracking-wide mb-4">Desempeño por S</h3>
            <div className="space-y-3">
              {checklist.map((g) => {
                const sc = calcularPuntajeS(g.s_index);
                if (!sc) return null;
                return (
                  <div key={g.s_index}>
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-sm font-medium text-ink">{g.nombre_s}</span>
                      <div className="flex items-center gap-3">
                        <span className="text-xs text-ink/40">{sc.pts}/{sc.max} pts</span>
                        <span className="text-sm font-bold" style={{ color: fmt.semaforoColor(sc.pct) }}>
                          {fmt.pct(sc.pct)}
                        </span>
                        <span className={fmt.badgeClass(fmt.semaforo(sc.pct)) + " text-[10px]"}>
                          {fmt.semaforo(sc.pct)}
                        </span>
                      </div>
                    </div>
                    <div className="h-1.5 bg-ink/8 rounded-full overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all duration-700"
                        style={{ width: `${sc.pct}%`, background: fmt.semaforoColor(sc.pct) }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </GlassCard>

          {/* Info de la auditoría */}
          <GlassCard className="mb-5">
            <h3 className="text-xs font-semibold text-ink/50 uppercase tracking-wide mb-3">Datos de la Auditoría</h3>
            <div className="grid grid-cols-2 gap-3 text-sm">
              {[
                ["Tipo",      types.find((t) => t.id === Number(meta.audit_type_id))?.name || "—"],
                ["Sucursal",  meta.branch || "—"],
                ["Fecha",     fmt.date(meta.audit_date)],
                ["Auditor",   meta.auditor_name || "—"],
              ].map(([k, v]) => (
                <div key={k}>
                  <p className="text-xs text-ink/40">{k}</p>
                  <p className="font-medium text-ink">{v}</p>
                </div>
              ))}
            </div>
          </GlassCard>

          {/* Error de envío */}
          {submitError && (
            <div className="flex items-center gap-2 bg-danger/10 border border-danger/20 text-danger text-sm rounded-xl px-4 py-3 mb-4">
              <AlertCircle size={15} />
              {submitError}
            </div>
          )}

          {/* Botones finales */}
          <div className="flex items-center justify-between">
            <button onClick={() => setStep(checklist.length)} className="btn-secondary flex items-center gap-2 text-sm">
              <ChevronLeft size={16} /> Revisar
            </button>
            <button
              onClick={handleSubmit}
              disabled={saveMut.isPending}
              className="btn-primary flex items-center gap-2 text-sm disabled:opacity-60"
            >
              {saveMut.isPending
                ? <><Loader2 size={16} className="animate-spin" /> Guardando...</>
                : <><Save size={16} /> {isEdit ? "Guardar Cambios" : "Guardar Auditoría"}</>
              }
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// SUB-COMPONENTES
// ─────────────────────────────────────────────────────────────────────────────

function StepPill({ label, active, done, warning, onClick, index, score }) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap transition-all duration-200 border ${
        active
          ? "bg-primary text-white border-primary shadow-kpi"
          : done
          ? warning
            ? "bg-danger/10 text-danger border-danger/20"
            : "bg-success/10 text-success border-success/20"
          : "glass text-ink/50 border-transparent hover:text-ink"
      }`}
    >
      {done && !active && !warning && <Check size={11} />}
      {label}
      {score !== undefined && done && (
        <span className="opacity-70 font-normal">{fmt.pct(score, 0)}</span>
      )}
    </button>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────────────────────

function round2(n) {
  return Math.round(n * 100) / 100;
}