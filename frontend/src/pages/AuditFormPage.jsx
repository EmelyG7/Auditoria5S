/**
 * AuditFormPage.jsx — Wizard de auditoría 5S
 *
 * Modos:
 *   /audits/new          → crear nueva (auto-completa usuario logueado)
 *   /audits/:id/edit     → editar existente
 *   /audits/new + location.state.prefilled → crear desde evento de calendario
 *
 * Flujo desde calendario:
 *   1. SchedulePage navega a /audits/new con state.prefilled = { schedule_id, branch,
 *      audit_type_id, scheduled_date, auditor_name, auditor_email, ... }
 *   2. Este formulario precarga los datos y muestra un banner de contexto
 *   3. Al guardar exitosamente, llama a scheduleService.complete(schedule_id) para
 *      marcar el evento como "Completada" antes de redirigir al listado
 */

import { useState, useEffect, useMemo } from "react";
import { useNavigate, useParams, useLocation } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  ChevronLeft, ChevronRight, Check, Save,
  Loader2, AlertCircle, CheckCircle2, ClipboardCheck,
  UserCog, ArrowLeft, CalendarCheck,
} from "lucide-react";
import { auditsService }   from "../services/audits";
import { authService }     from "../services/auth";
import { scheduleService } from "../services/schedule";
import { useAuth }         from "../store/AuthContext";
import Header              from "../components/Layout/Header";
import GlassCard           from "../components/Layout/GlassCard";
import { fmt }             from "../utils/format";

// ─── Sucursales fijas ──────────────────────────────────────────────────────────
const SUCURSALES = [
  "Oficina Principal",
  "Tienda Gurabo",
  "Tienda El Portal",
  "Tienda Tiradentes",
  "Tienda Rómulo",
  "Almacén Finca",
];

// ─── Checklists ────────────────────────────────────────────────────────────────
const CHECKLISTS = {
  "Almacenes": [
    {
      s_index: 0,
      nombre_s: "Seiri (Clasificar)",
      preguntas: [
        { texto: "Solo se mantienen en el almacén artículos necesarios para las operaciones.", peso: 4.0 },
        { texto: "La mercancía obsoleta, dañada o en desuso está identificada y separada.", peso: 4.0 },
        { texto: "Los equipos o productos en espera (proyectos, devoluciones, RMA) están identificados.", peso: 4.0 },
        { texto: "No existen cajas vacías, empaques innecesarios o materiales sin uso ocupando espacio.", peso: 4.0 },
        { texto: "Los artículos están separados por tipo: stock, proyectos, devoluciones, tránsito, etc.", peso: 4.0 },
      ],
    },
    {
      s_index: 1,
      nombre_s: "Seiton (Ordenar)",
      preguntas: [
        { texto: "La mercancía está organizada por categorías, marcas o códigos.", peso: 3.33 },
        { texto: "Los tramos, pasillos y ubicaciones están claramente identificados.", peso: 3.33 },
        { texto: "Los pasillos se encuentran despejados y permiten el tránsito seguro.", peso: 3.33 },
        { texto: "Los productos están colocados de forma que facilitan su localización y despacho.", peso: 3.33 },
        { texto: "Las herramientas y equipos de trabajo tienen un lugar asignado.", peso: 3.33 },
        { texto: "La jaula y áreas de almacenamiento especial están organizadas.", peso: 3.33 },
      ],
    },
    {
      s_index: 2,
      nombre_s: "Seiso (Limpiar)",
      preguntas: [
        { texto: "El área del almacén se mantiene limpia y libre de polvo o residuos.", peso: 4.0 },
        { texto: "Los pasillos y áreas de carga/descarga están limpios.", peso: 4.0 },
        { texto: "Las estaciones de trabajo están ordenadas y limpias.", peso: 4.0 },
        { texto: "Los contenedores de basura están disponibles y no se encuentran saturados.", peso: 4.0 },
        { texto: "Se realiza limpieza periódica del área.", peso: 4.0 },
      ],
    },
    {
      s_index: 3,
      nombre_s: "Seiketsu (Estandarizar)",
      preguntas: [
        { texto: "Existen procedimientos definidos para recepción, almacenamiento y despacho.", peso: 5.0 },
        { texto: "Las áreas del almacén están señalizadas.", peso: 5.0 },
        { texto: "Se utilizan etiquetas o códigos para identificar productos y ubicaciones.", peso: 5.0 },
        { texto: "Se mantienen tableros o pizarras con información operativa actualizada.", peso: 5.0 },
      ],
    },
    {
      s_index: 4,
      nombre_s: "Shitsuke (Disciplina)",
      preguntas: [
        { texto: "El personal respeta los estándares de organización y limpieza.", peso: 5.0 },
        { texto: "Las observaciones de auditorías anteriores han sido corregidas.", peso: 5.0 },
        { texto: "Los procesos en el sistema (transferencias, recepciones, conduces) se realizan correctamente.", peso: 5.0 },
        { texto: "Se mantiene una cultura de orden, seguridad y mejora continua.", peso: 5.0 },
      ],
    },
  ],
  "Centro de Servicios": [
    {
      s_index: 0,
      nombre_s: "Seiri (Clasificar)",
      preguntas: [
        { texto: "Solo se mantienen herramientas necesarias para reparación y pruebas.", peso: 5.0 },
        { texto: "Equipos en reparación están claramente identificados.", peso: 5.0 },
        { texto: "Equipos reparados están separados de equipos pendientes.", peso: 5.0 },
        { texto: "Equipos en desahucio han sido identificados y separados.", peso: 5.0 },
        { texto: "Documentación técnica y manuales están disponibles y organizados.", peso: 5.0 },
      ],
    },
    {
      s_index: 1,
      nombre_s: "Seiton (Ordenar)",
      preguntas: [
        { texto: "Herramientas están ordenadas y etiquetadas en paneles o gabinetes.", peso: 5.0 },
        { texto: "Estaciones de trabajo tienen layout definido.", peso: 5.0 },
        { texto: "Repuestos están organizados por tipo, modelo o código.", peso: 5.0 },
        { texto: "Equipos en proceso tienen bandejas o racks designados.", peso: 5.0 },
        { texto: "Equipos tienen orden de servicio visible.", peso: 5.0 },
      ],
    },
    {
      s_index: 2,
      nombre_s: "Seiso (Limpiar)",
      preguntas: [
        { texto: "Mesas de trabajo y bancos de reparación están limpios.", peso: 5.0 },
        { texto: "Equipos de prueba están en condiciones adecuadas.", peso: 5.0 },
        { texto: "No hay polvo acumulado en equipos electrónicos sensibles.", peso: 5.0 },
        { texto: "Se limpian herramientas después de su uso.", peso: 5.0 },
        { texto: "Contenedores de residuos electrónicos están disponibles.", peso: 5.0 },
      ],
    },
    {
      s_index: 3,
      nombre_s: "Seiketsu (Estandarizar)",
      preguntas: [
        { texto: "Existen procedimientos de reparación documentados.", peso: 3.33 },
        { texto: "Los flujos de trabajo están señalizados.", peso: 3.33 },
        { texto: "Se aplican listas de verificación de mantenimiento y limpieza.", peso: 3.33 },
      ],
    },
    {
      s_index: 4,
      nombre_s: "Shitsuke (Disciplina)",
      preguntas: [
        { texto: "Técnicos siguen los procedimientos de reparación establecidos.", peso: 3.0 },
        { texto: "Se realizan auditorías periódicas de 5S.", peso: 3.0 },
        { texto: "Se mantienen registros de reparaciones y pruebas.", peso: 3.0 },
        { texto: "Las desviaciones detectadas se corrigen oportunamente.", peso: 3.0 },
        { texto: "El personal mantiene hábitos de orden y limpieza.", peso: 3.0 },
      ],
    },
  ],
  "RMA": [
    {
      s_index: 0,
      nombre_s: "Seiri (Clasificar)",
      preguntas: [
        { texto: "Solo se mantienen en el área herramientas y repuestos necesarios para diagnóstico de RMA.", peso: 5.0 },
        { texto: "Equipos recibidos están claramente identificados como RMA (etiqueta, ticket o sistema).", peso: 5.0 },
        { texto: "Equipos defectuosos están separados de equipos reparados o listos para devolución.", peso: 5.0 },
        { texto: "No existen equipos obsoletos o irreparables acumulados sin disposición definida.", peso: 5.0 },
        { texto: "Materiales innecesarios (cajas vacías, cables sueltos, empaques dañados) fueron retirados.", peso: 5.0 },
      ],
    },
    {
      s_index: 1,
      nombre_s: "Seiton (Ordenar)",
      preguntas: [
        { texto: "Las herramientas de diagnóstico tienen ubicación designada y etiquetada.", peso: 3.57 },
        { texto: "Estaciones de revisión RMA están claramente identificadas.", peso: 3.57 },
        { texto: "Equipos están ordenados por estado (recibido / diagnóstico / reparación / listo).", peso: 3.57 },
        { texto: "Las bandejas o racks tienen capacidad definida y señalizada.", peso: 3.57 },
        { texto: "Cada equipo RMA tiene número de orden o ticket visible.", peso: 3.57 },
        { texto: "Repuestos usados para RMA están clasificados por tipo o modelo.", peso: 3.57 },
      ],
    },
    {
      s_index: 2,
      nombre_s: "Seiso (Limpiar)",
      preguntas: [
        { texto: "Mesas de diagnóstico y estaciones de trabajo están limpias.", peso: 5.0 },
        { texto: "Equipos RMA no tienen polvo excesivo antes de inspección.", peso: 5.0 },
        { texto: "No hay acumulación de basura, cajas o empaques.", peso: 5.0 },
        { texto: "Contenedores para residuos electrónicos están disponibles.", peso: 5.0 },
        { texto: "Herramientas de diagnóstico están limpias y en buen estado.", peso: 5.0 },
      ],
    },
    {
      s_index: 3,
      nombre_s: "Seiketsu (Estandarizar)",
      preguntas: [
        { texto: "Existe procedimiento documentado para recepción de RMA.", peso: 3.33 },
        { texto: "Existe procedimiento para diagnóstico y registro del fallo.", peso: 3.33 },
        { texto: "Estaciones RMA tienen instrucciones visibles.", peso: 3.33 },
      ],
    },
    {
      s_index: 4,
      nombre_s: "Shitsuke (Disciplina)",
      preguntas: [
        { texto: "El personal conoce y aplica las 5S en el área de RMA.", peso: 3.75 },
        { texto: "Se realizan auditorías periódicas de 5S.", peso: 3.75 },
        { texto: "Los técnicos siguen el flujo estándar de manejo de RMA.", peso: 3.75 },
        { texto: "Se mantiene la actualización de registros de RMA.", peso: 3.75 },
      ],
    },
  ],
};

// ─── Opciones de respuesta ─────────────────────────────────────────────────────
const RESPUESTAS = [
  { value: 0,   label: "0%",   desc: "No cumple", bg: "bg-danger/10  border-danger/30  text-danger",  active: "bg-danger   text-white border-danger"  },
  { value: 50,  label: "50%",  desc: "Parcial",   bg: "bg-warning/10 border-warning/30 text-warning", active: "bg-warning  text-white border-warning" },
  { value: 100, label: "100%", desc: "Cumple",    bg: "bg-success/10 border-success/30 text-success", active: "bg-success  text-white border-success" },
];

const S_COLORS = [
  "from-primary/10 to-primary/5 border-primary/20",
  "from-secondary/10 to-secondary/5 border-secondary/20",
  "from-success/10 to-success/5 border-success/20",
  "from-warning/10 to-warning/5 border-warning/20",
  "from-danger/10 to-danger/5 border-danger/20",
];
const S_ACCENT = ["text-primary", "text-secondary", "text-success", "text-warning", "text-danger"];

const r2 = (n) => Math.round(n * 100) / 100;

// ─── Componente principal ──────────────────────────────────────────────────────
export default function AuditFormPage() {
  const { id }     = useParams();
  const isEdit     = Boolean(id);
  const location   = useLocation();
  const navigate   = useNavigate();
  const qc         = useQueryClient();
  const { user, isAdmin } = useAuth();

  // Datos precargados desde el calendario
  const prefilled = location.state?.prefilled || null;
  const fromCalendar = Boolean(prefilled?.schedule_id);

  const [step,           setStep]          = useState(0);
  const [selectedType,   setSelectedType]  = useState("");
  const [selectedUserId, setSelectedUser]  = useState("");
  const [submitError,    setSubmitError]   = useState("");
  const [submitted,      setSubmitted]     = useState(false);

  const [meta, setMeta] = useState({
    audit_type_id:        "",
    audit_date:           new Date().toISOString().split("T")[0],
    branch:               "",
    auditor_name:         "",
    auditor_email:        "",
    start_time:           "",
    end_time:             "",
    general_observations: "",
  });
  const [respuestas, setRespuestas] = useState({});

  // ── Queries ──────────────────────────────────────────────────────────────────
  const { data: types = [], isLoading: loadingTypes } = useQuery({
    queryKey: ["audit-types"],
    queryFn:  auditsService.getTypes,
  });

  const { data: users = [] } = useQuery({
    queryKey: ["users"],
    queryFn:  authService.listUsers,
    enabled:  isAdmin,
  });

  const { data: existing, isLoading: loadingExisting } = useQuery({
    queryKey: ["audit", id],
    queryFn:  () => auditsService.getById(id),
    enabled:  isEdit,
  });

  // ── Efecto: usuario logueado → auto-completar (solo en crear desde cero) ────
  useEffect(() => {
    if (!isEdit && !prefilled && user) {
      setMeta((p) => ({
        ...p,
        auditor_name:  user.full_name || "",
        auditor_email: user.email     || "",
      }));
    }
  }, [user, isEdit, prefilled]);

  // ── Efecto: datos precargados desde calendario ────────────────────────────────
  useEffect(() => {
    if (!isEdit && prefilled && types.length > 0) {
      const typeId = prefilled.audit_type_id
        ? Number(prefilled.audit_type_id)
        : null;
      const t = types.find((t) => t.id === typeId);

      setMeta((p) => ({
        ...p,
        audit_type_id:        typeId || p.audit_type_id,
        audit_date:           prefilled.scheduled_date
                                ? prefilled.scheduled_date.split("T")[0]
                                : p.audit_date,
        branch:               prefilled.branch         || p.branch,
        auditor_name:         prefilled.auditor_name   || p.auditor_name  || user?.full_name || "",
        auditor_email:        prefilled.auditor_email  || p.auditor_email || user?.email     || "",
        general_observations: prefilled.general_observations || "",
      }));

      if (t) setSelectedType(t.name);

      // Si el usuario asignado existe en la lista, seleccionarlo en el dropdown
      if (prefilled.assigned_auditor_id && isAdmin) {
        setSelectedUser(String(prefilled.assigned_auditor_id));
      }
    }
  }, [isEdit, prefilled, types, user, isAdmin]);

  // ── Efecto: cargar datos en modo edición ────────────────────────────────────
  useEffect(() => {
    if (!isEdit || !existing || !types.length) return;
    const t = types.find((t) => t.id === existing.audit_type_id);
    if (t) setSelectedType(t.name);

    setMeta({
      audit_type_id:        existing.audit_type_id,
      audit_date:           existing.audit_date || new Date().toISOString().split("T")[0],
      branch:               existing.branch        || "",
      auditor_name:         existing.auditor_name  || "",
      auditor_email:        existing.auditor_email || "",
      start_time:           existing.start_time    || "",
      end_time:             existing.end_time      || "",
      general_observations: existing.general_observations || "",
    });

    if (existing.questions?.length) {
      const rebuilt = {};
      existing.questions.forEach((q) => {
        const si = q.s_index;
        if (si == null) return;
        if (!rebuilt[si]) rebuilt[si] = {};
        rebuilt[si][q.question_order ?? 0] = {
          response_percent: Number(q.response_percent) || 0,
          observation:      q.observation || "",
        };
      });
      setRespuestas(rebuilt);
    }
  }, [existing, types, isEdit]);

  // ── Handlers ────────────────────────────────────────────────────────────────
  const handleTypeChange = (e) => {
    const typeId = Number(e.target.value);
    const t      = types.find((t) => t.id === typeId);
    setMeta((p) => ({ ...p, audit_type_id: typeId }));
    setSelectedType(t?.name || "");
    setRespuestas({});
    setStep(0);
  };

  const handleUserSelect = (e) => {
    const uid = e.target.value;
    setSelectedUser(uid);
    if (!uid) {
      setMeta((p) => ({ ...p, auditor_name: user?.full_name || "", auditor_email: user?.email || "" }));
    } else {
      const u = users.find((u) => String(u.id) === uid);
      if (u) setMeta((p) => ({ ...p, auditor_name: u.full_name || "", auditor_email: u.email || "" }));
    }
  };

  // ── Checklist activo ─────────────────────────────────────────────────────────
  const checklist = useMemo(() => CHECKLISTS[selectedType] || [], [selectedType]);

  // ── Helpers de respuesta ─────────────────────────────────────────────────────
  const getRespuesta = (si, pi) => respuestas[si]?.[pi]?.response_percent ?? null;
  const setRespuesta = (si, pi, v) =>
    setRespuestas((p) => ({
      ...p,
      [si]: { ...(p[si] || {}), [pi]: { ...(p[si]?.[pi] || {}), response_percent: v } },
    }));
  const getObs = (si) => respuestas[si]?.__obs || "";
  const setObs = (si, t) =>
    setRespuestas((p) => ({ ...p, [si]: { ...(p[si] || {}), __obs: t } }));

  // ── Cálculo ──────────────────────────────────────────────────────────────────
  const calcS = (si) => {
    const g = checklist.find((g) => g.s_index === si);
    if (!g) return null;
    let pts = 0, max = 0;
    g.preguntas.forEach((p, i) => {
      const r = getRespuesta(si, i);
      if (r !== null) pts += (r / 100) * p.peso;
      max += p.peso;
    });
    return max > 0 ? { pts: r2(pts), max: r2(max), pct: r2((pts / max) * 100) } : null;
  };

  const calcTotal = () => {
    let pts = 0, max = 0;
    checklist.forEach((g) => {
      const s = calcS(g.s_index);
      if (s) { pts += s.pts; max += s.max; }
    });
    return max > 0 ? { pts: r2(pts), max: r2(max), pct: r2((pts / max) * 100) } : null;
  };

  const preguntasStatus = () => {
    let total = 0, resp = 0;
    checklist.forEach((g) =>
      g.preguntas.forEach((_, i) => {
        total++;
        if (getRespuesta(g.s_index, i) !== null) resp++;
      })
    );
    return { total, resp };
  };

  const stepValid = useMemo(() => {
    if (step === 0) return meta.audit_type_id && meta.audit_date && meta.branch.trim();
    const si = step - 1;
    const g  = checklist[si];
    if (!g) return true;
    return g.preguntas.every((_, i) => getRespuesta(si, i) !== null);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, meta, respuestas, checklist]);

  // ── Submit ───────────────────────────────────────────────────────────────────
  const saveMut = useMutation({
    mutationFn: (payload) =>
      isEdit ? auditsService.update(id, payload) : auditsService.create(payload),

    onSuccess: async (createdAudit) => {
      qc.invalidateQueries(["audits"]);
      qc.invalidateQueries(["audit-kpis"]);

      // Si viene de un evento del calendario → marcar como completada
      if (fromCalendar && prefilled?.schedule_id) {
        try {
          await scheduleService.complete(
            prefilled.schedule_id,
            { audit_id: createdAudit?.id }
          );
          qc.invalidateQueries(["calendar"]);
        } catch (err) {
          // No bloquear el flujo aunque falle el update del evento
          console.warn("No se pudo marcar el evento como completado:", err);
        }
      }

      setSubmitted(true);
      setTimeout(() => navigate(fromCalendar ? "/schedule" : "/audits"), 1800);
    },

    onError: (err) =>
      setSubmitError(err.response?.data?.detail || "Error al guardar la auditoría."),
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
          observation:      getObs(grupo.s_index) || null,
        });
      });
    });
    saveMut.mutate({
      audit_type_id:        Number(meta.audit_type_id),
      audit_date:           meta.audit_date,
      branch:               meta.branch.trim(),
      auditor_name:         meta.auditor_name.trim()  || null,
      auditor_email:        meta.auditor_email.trim() || null,
      start_time:           meta.start_time  || null,
      end_time:             meta.end_time    || null,
      general_observations: meta.general_observations.trim() || null,
      questions,
    });
  };

  // ── Pantalla de éxito ────────────────────────────────────────────────────────
  if (submitted) {
    return (
      <div className="min-h-screen relative z-10 flex items-center justify-center">
        <div className="glass-card text-center max-w-sm mx-auto animate-fade-up p-8">
          <div className="w-16 h-16 rounded-full bg-success/15 flex items-center justify-center mx-auto mb-4">
            <CheckCircle2 size={32} className="text-success" />
          </div>
          <h2 className="text-xl font-semibold text-ink mb-2">
            {isEdit ? "Auditoría actualizada" : "Auditoría guardada"}
          </h2>
          {fromCalendar && (
            <p className="text-sm text-success/80 mb-2 flex items-center justify-center gap-1.5">
              <CalendarCheck size={14} />
              Evento del calendario marcado como completado
            </p>
          )}
          <p className="text-ink/50 text-sm">
            Redirigiendo {fromCalendar ? "al calendario" : "al listado"}…
          </p>
        </div>
      </div>
    );
  }

  if (isEdit && loadingExisting) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 size={28} className="animate-spin text-primary/40" />
      </div>
    );
  }

  const { total: tPreg, resp: rPreg } = preguntasStatus();
  const progPct    = tPreg > 0 ? Math.round((rPreg / tPreg) * 100) : 0;
  const totalScore = calcTotal();
  const isLastStep = step === checklist.length + 1;
  const isSStep    = step > 0 && !isLastStep;
  const currentS   = isSStep ? checklist[step - 1] : null;

  return (
    <div className="min-h-screen relative z-10">
      <Header
        title={isEdit ? "Editar Auditoría" : "Nueva Auditoría 5S"}
        subtitle={
          selectedType
            ? `${selectedType} · ${meta.branch || "Sin sucursal"}`
            : fromCalendar
            ? "Completando auditoría planificada"
            : "Completa el formulario paso a paso"
        }
      />

      {/* Botón de regreso */}
      <div className="mb-4">
        <button
          onClick={() => navigate(fromCalendar ? "/schedule" : "/audits")}
          className="btn-ghost flex items-center gap-2 text-sm"
        >
          <ArrowLeft size={16} />
          {fromCalendar ? "Volver al calendario" : "Volver al listado"}
        </button>
      </div>

      {/* Banner: viene del calendario */}
      {fromCalendar && (
        <div className="flex items-center gap-3 bg-primary/8 border border-primary/20 rounded-2xl px-4 py-3 mb-5 animate-fade-in">
          <div className="w-8 h-8 rounded-xl bg-primary/15 flex items-center justify-center shrink-0">
            <CalendarCheck size={16} className="text-primary" />
          </div>
          <div>
            <p className="text-sm font-semibold text-primary">Auditoría planificada precargada</p>
            <p className="text-xs text-ink/50">
              Los datos del evento han sido cargados automáticamente.
              Al guardar, el evento se marcará como <b>Completado</b>.
            </p>
          </div>
        </div>
      )}

      {/* Barra de progreso */}
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
                {rPreg}/{tPreg} preguntas respondidas
              </span>
            </div>
            <span className="text-xs text-ink/40">{progPct}% completado</span>
          </div>
          <div className="h-2 bg-ink/10 rounded-full overflow-hidden">
            <div
              className="h-full rounded-full transition-all duration-500"
              style={{
                width:      `${progPct}%`,
                background: `linear-gradient(90deg, #0A4F79, ${fmt.semaforoColor(totalScore?.pct || 0)})`,
              }}
            />
          </div>
        </div>
      )}

      {/* Stepper */}
      {checklist.length > 0 && (
        <div className="flex items-center gap-1.5 mb-6 overflow-x-auto pb-1 animate-fade-in">
          <StepPill label="Info" active={step === 0} done={step > 0} onClick={() => setStep(0)} />
          {checklist.map((g, i) => {
            const sc      = calcS(g.s_index);
            const allDone = g.preguntas.every((_, pi) => getRespuesta(g.s_index, pi) !== null);
            return (
              <StepPill
                key={g.s_index}
                label={g.nombre_s.split(" ")[0]}
                active={step === i + 1}
                done={allDone}
                warning={sc && sc.pct < 60}
                onClick={() => setStep(i + 1)}
                score={sc?.pct}
              />
            );
          })}
          <StepPill
            label="Resumen"
            active={isLastStep}
            done={false}
            onClick={() => { if (rPreg === tPreg) setStep(checklist.length + 1); }}
          />
        </div>
      )}

      {/* ══ PASO 0: Metadatos ══════════════════════════════════════════════════ */}
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
            {/* Tipo */}
            <div className="sm:col-span-2">
              <label className="field-label">Tipo de Auditoría *</label>
              {loadingTypes ? (
                <div className="input-glass animate-pulse bg-ink/5 h-10" />
              ) : (
                <select
                  value={meta.audit_type_id}
                  onChange={handleTypeChange}
                  required
                  className="input-glass text-sm"
                >
                  <option value="">Selecciona un tipo…</option>
                  {types.map((t) => (
                    <option key={t.id} value={t.id}>{t.name}</option>
                  ))}
                </select>
              )}
            </div>

            {/* Sucursal */}
            <div>
              <label className="field-label">Sucursal / Sede *</label>
              <select
                value={meta.branch}
                onChange={(e) => setMeta((p) => ({ ...p, branch: e.target.value }))}
                required
                className="input-glass text-sm"
              >
                <option value="">Selecciona una sucursal…</option>
                {SUCURSALES.map((s) => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
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

            {/* Asignar a otro (solo admin) */}
            {isAdmin && users.length > 0 && (
              <div className="sm:col-span-2">
                <label className="field-label flex items-center gap-1.5">
                  <UserCog size={13} className="text-primary/70" />
                  Asignar a otro auditor
                  <span className="text-ink/30 font-normal normal-case tracking-normal ml-1">
                    (opcional — por defecto eres tú)
                  </span>
                </label>
                <select
                  value={selectedUserId}
                  onChange={handleUserSelect}
                  className="input-glass text-sm"
                >
                  <option value="">— Yo mismo ({user?.full_name}) —</option>
                  {users
                    .filter((u) => u.id !== user?.id)
                    .map((u) => (
                      <option key={u.id} value={u.id}>
                        {u.full_name} — {u.email}
                      </option>
                    ))}
                </select>
              </div>
            )}

            {/* Auditor nombre */}
            <div>
              <label className="field-label">Nombre del Auditor</label>
              <input
                type="text" placeholder="Juan Pérez"
                value={meta.auditor_name}
                onChange={(e) => setMeta((p) => ({ ...p, auditor_name: e.target.value }))}
                className="input-glass text-sm"
              />
            </div>

            {/* Auditor email */}
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

            {/* Observaciones */}
            <div className="sm:col-span-2">
              <label className="field-label">Observaciones Generales</label>
              <textarea
                rows={3}
                placeholder="Contexto general de la visita, condiciones especiales…"
                value={meta.general_observations}
                onChange={(e) => setMeta((p) => ({ ...p, general_observations: e.target.value }))}
                className="input-glass text-sm resize-none"
              />
            </div>
          </div>

          {!selectedType && meta.audit_type_id && (
            <div className="mt-4 bg-warning/10 border border-warning/20 text-warning text-xs rounded-xl px-4 py-2.5">
              El tipo seleccionado no tiene checklist configurado.
            </div>
          )}

          <div className="flex justify-end mt-6">
            <button
              onClick={() => setStep(1)}
              disabled={!stepValid || !checklist.length}
              className="btn-primary flex items-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Comenzar Checklist <ChevronRight size={16} />
            </button>
          </div>
        </GlassCard>
      )}

      {/* ══ PASOS 1–N: Preguntas por S ════════════════════════════════════════ */}
      {isSStep && currentS && (
        <div className="animate-fade-up max-w-3xl">
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
              {(() => {
                const sc = calcS(currentS.s_index);
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

          <div className="space-y-3 mb-5">
            {currentS.preguntas.map((preg, i) => {
              const r = getRespuesta(currentS.s_index, i);
              return (
                <GlassCard key={i} className="!p-4 animate-fade-up" style={{ animationDelay: `${i * 0.04}s` }}>
                  <div className="flex flex-col sm:flex-row sm:items-start gap-4">
                    <div className="flex items-start gap-3 flex-1 min-w-0">
                      <span className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold shrink-0 mt-0.5 ${
                        r !== null
                          ? r === 100 ? "bg-success text-white"
                          : r === 50  ? "bg-warning text-white"
                          : "bg-danger text-white"
                          : "bg-ink/10 text-ink/40"
                      }`}>
                        {r !== null ? r === 100 ? <Check size={12} /> : r === 50 ? "½" : "✕" : i + 1}
                      </span>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-ink leading-snug">{preg.texto}</p>
                        <p className="text-xs text-ink/40 mt-0.5">Peso: {preg.peso}%</p>
                      </div>
                    </div>
                    <div className="flex gap-2 shrink-0">
                      {RESPUESTAS.map((op) => (
                        <button
                          key={op.value}
                          onClick={() => setRespuesta(currentS.s_index, i, op.value)}
                          title={op.desc}
                          className={`px-3 py-1.5 rounded-xl border text-xs font-semibold transition-all duration-150 active:scale-95 ${
                            r === op.value ? op.active : op.bg
                          }`}
                        >
                          {op.label}
                        </button>
                      ))}
                    </div>
                  </div>
                </GlassCard>
              );
            })}
          </div>

          <GlassCard className="!p-4 mb-6">
            <label className="field-label">
              Observaciones — {currentS.nombre_s.split(" ")[0]}
            </label>
            <textarea
              rows={3}
              placeholder={`Notas o hallazgos sobre ${currentS.nombre_s}…`}
              value={getObs(currentS.s_index)}
              onChange={(e) => setObs(currentS.s_index, e.target.value)}
              className="input-glass text-sm resize-none"
            />
          </GlassCard>

          {!stepValid && (
            <div className="flex items-center gap-2 bg-warning/10 border border-warning/20 text-warning text-xs rounded-xl px-4 py-2.5 mb-4">
              <AlertCircle size={14} />
              Responde todas las preguntas de esta S para continuar.
            </div>
          )}

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

      {/* ══ RESUMEN ══════════════════════════════════════════════════════════════ */}
      {isLastStep && (
        <div className="animate-fade-up max-w-3xl">
          <h2 className="text-lg font-semibold text-ink mb-5">Resumen de la Auditoría</h2>

          {totalScore && (
            <div
              className="rounded-2xl p-6 mb-5 text-center border"
              style={{
                background:  `${fmt.semaforoColor(totalScore.pct)}12`,
                borderColor: `${fmt.semaforoColor(totalScore.pct)}40`,
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

          <GlassCard className="mb-5">
            <h3 className="text-xs font-semibold text-ink/50 uppercase tracking-wide mb-4">Desempeño por S</h3>
            <div className="space-y-3">
              {checklist.map((g) => {
                const sc = calcS(g.s_index);
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

          <GlassCard className="mb-5">
            <h3 className="text-xs font-semibold text-ink/50 uppercase tracking-wide mb-3">Datos de la Auditoría</h3>
            <div className="grid grid-cols-2 gap-3 text-sm">
              {[
                ["Tipo",     types.find((t) => t.id === Number(meta.audit_type_id))?.name || "—"],
                ["Sucursal", meta.branch    || "—"],
                ["Fecha",    fmt.date(meta.audit_date)],
                ["Auditor",  meta.auditor_name || "—"],
              ].map(([k, v]) => (
                <div key={k}>
                  <p className="text-xs text-ink/40">{k}</p>
                  <p className="font-medium text-ink">{v}</p>
                </div>
              ))}
            </div>
            {fromCalendar && (
              <div className="mt-3 flex items-center gap-2 bg-primary/6 border border-primary/15 rounded-xl px-3 py-2">
                <CalendarCheck size={13} className="text-primary shrink-0" />
                <p className="text-xs text-primary/80">
                  Al guardar, el evento del calendario se marcará automáticamente como <b>Completado</b>.
                </p>
              </div>
            )}
          </GlassCard>

          {submitError && (
            <div className="flex items-center gap-2 bg-danger/10 border border-danger/20 text-danger text-sm rounded-xl px-4 py-3 mb-4">
              <AlertCircle size={15} /> {submitError}
            </div>
          )}

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
                ? <><Loader2 size={16} className="animate-spin" /> Guardando…</>
                : <><Save size={16} /> {isEdit ? "Guardar Cambios" : fromCalendar ? "Guardar y Completar Evento" : "Guardar Auditoría"}</>
              }
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── StepPill ─────────────────────────────────────────────────────────────────
function StepPill({ label, active, done, warning, onClick, score }) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold
                  whitespace-nowrap transition-all duration-200 border ${
        active ? "bg-primary text-white border-primary shadow-sm"
        : done  ? warning
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