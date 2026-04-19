"""
audit_schemas.py — Schemas Pydantic para el módulo de Auditorías 5S.

Jerarquía de schemas:
    AuditTypeResponse               — Para serializar el catálogo de tipos

    AuditQuestionBase               — Campos comunes de una pregunta
    AuditQuestionCreate             — Al crear (viene del formulario)
    AuditQuestionResponse           — Lo que devuelve la API

    AuditBase                       — Campos comunes de una auditoría
    AuditCreate                     — POST /audits/  (formulario web)
    AuditUpdate                     — PUT  /audits/{id}
    AuditResponse                   — Respuesta básica (listados)
    AuditDetailResponse             — Respuesta completa (con preguntas)

    AuditImportResponse             — Resultado de POST /audits/import
    AuditListResponse               — Wrapper paginado para GET /audits/
    AuditDashboardKPI               — KPIs para el dashboard principal

NOTA: Todos los Decimal del modelo SQLAlchemy se serializan como float
en la API para que el frontend no tenga problemas (JSON no tiene Decimal).
"""

from datetime import date, datetime, time
from decimal import Decimal
from typing import Any, Optional
from pydantic import (
    BaseModel,
    ConfigDict,
    EmailStr,
    Field,
    field_validator,
    model_validator,
)


# ─────────────────────────────────────────────────────────────────────────────
# TIPO DE AUDITORÍA
# ─────────────────────────────────────────────────────────────────────────────

class AuditTypeResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id:                  int
    name:                str
    description:         Optional[str] = None
    checklist_filename:  Optional[str] = None


# ─────────────────────────────────────────────────────────────────────────────
# PREGUNTAS
# ─────────────────────────────────────────────────────────────────────────────

class AuditQuestionBase(BaseModel):
    s_name:           str   = Field(..., description="Nombre de la S (ej: 'Seiri (Clasificar)')")
    s_index:          int   = Field(..., ge=0, le=4, description="Índice de la S (0-4)")
    question_text:    str   = Field(..., min_length=1)
    question_order:   int   = Field(default=0, ge=0)
    weight:           float = Field(..., gt=0, description="Peso de la pregunta en puntos")
    response_percent: float = Field(
        ..., ge=0, le=100,
        description="Respuesta: 0 (no cumple), 50 (parcial), 100 (cumple)"
    )
    observation:      Optional[str] = Field(None, description="Observación para este bloque S")

    @field_validator("response_percent")
    @classmethod
    def validar_respuesta(cls, v: float) -> float:
        """Solo acepta 0, 50 o 100 — los únicos valores válidos del checklist."""
        if v not in (0.0, 50.0, 100.0):
            raise ValueError(
                f"response_percent debe ser 0, 50 o 100. Valor recibido: {v}"
            )
        return v


class AuditQuestionCreate(AuditQuestionBase):
    """Schema para crear preguntas desde el formulario web."""
    pass


class AuditQuestionResponse(AuditQuestionBase):
    """Schema para serializar una AuditQuestion desde la BD."""
    model_config = ConfigDict(from_attributes=True)

    id:             int
    audit_id:       int
    points_earned:  float
    points_lost:    float
    is_critical:    bool

    @field_validator("points_earned", "points_lost", "weight", mode="before")
    @classmethod
    def decimal_a_float(cls, v: Any) -> float:
        """Convierte Decimal de SQLAlchemy a float para JSON."""
        return float(v) if v is not None else 0.0


# ─────────────────────────────────────────────────────────────────────────────
# AUDITORÍA — BASE Y VARIANTES
# ─────────────────────────────────────────────────────────────────────────────

class AuditBase(BaseModel):
    """Campos comunes a todas las variantes de auditoría."""
    audit_type_id:        int            = Field(..., description="ID del tipo (1=Almacenes, 2=Centro, 3=RMA)")
    audit_date:           date           = Field(..., description="Fecha de realización")
    branch:               str            = Field(..., min_length=1, description="Sucursal auditada")
    auditor_name:         Optional[str]  = Field(None, description="Nombre del auditor")
    auditor_email:        Optional[str]  = Field(None, description="Email del auditor")
    start_time:           Optional[time] = Field(None, description="Hora de inicio")
    end_time:             Optional[time] = Field(None, description="Hora de fin")
    general_observations: Optional[str]  = Field(None, description="Observaciones generales de la visita")

    @model_validator(mode="after")
    def validar_horas(self) -> "AuditBase":
        """Verifica que hora de fin sea posterior a hora de inicio."""
        if self.start_time and self.end_time:
            if self.end_time <= self.start_time:
                raise ValueError("end_time debe ser posterior a start_time")
        return self


class AuditCreate(AuditBase):
    """
    Schema para POST /audits/ (formulario web).

    El frontend envía las preguntas respondidas; el backend calcula
    los puntajes automáticamente usando audit_service.py.

    'questions' contiene TODAS las preguntas del checklist con sus respuestas.
    El orden y agrupación en S viene definido por s_index y question_order.
    """
    questions: list[AuditQuestionCreate] = Field(
        ...,
        min_length=1,
        description="Lista de preguntas con respuestas (0, 50 o 100)",
    )

    @field_validator("questions")
    @classmethod
    def validar_preguntas(cls, v: list) -> list:
        if not v:
            raise ValueError("Debe incluir al menos una pregunta.")
        # Verificar que hay al menos una S representada
        s_names = {q.s_name for q in v}
        if len(s_names) == 0:
            raise ValueError("Las preguntas deben pertenecer a al menos una S.")
        return v


class AuditUpdate(BaseModel):
    """
    Schema para PUT /audits/{id}.

    Todos los campos son opcionales — solo se actualizan los enviados.
    Si se envían 'questions', se recalculan todos los puntajes.
    """
    audit_date:           Optional[date]                     = None
    branch:               Optional[str]                      = Field(None, min_length=1)
    auditor_name:         Optional[str]                      = None
    auditor_email:        Optional[str]                      = None
    start_time:           Optional[time]                     = None
    end_time:             Optional[time]                     = None
    general_observations: Optional[str]                      = None
    questions:            Optional[list[AuditQuestionCreate]] = None

    @model_validator(mode="after")
    def validar_horas(self) -> "AuditUpdate":
        if self.start_time and self.end_time:
            if self.end_time <= self.start_time:
                raise ValueError("end_time debe ser posterior a start_time")
        return self


# ─────────────────────────────────────────────────────────────────────────────
# RESPUESTAS DE LA API
# ─────────────────────────────────────────────────────────────────────────────

class PuntajesPorS(BaseModel):
    """Porcentajes de cumplimiento por cada S, para el radar chart."""
    seiri:     float = Field(0.0, description="% Seiri (Clasificar)")
    seiton:    float = Field(0.0, description="% Seiton (Ordenar)")
    seiso:     float = Field(0.0, description="% Seiso (Limpiar)")
    seiketsu:  float = Field(0.0, description="% Seiketsu (Estandarizar)")
    shitsuke:  float = Field(0.0, description="% Shitsuke (Disciplina)")


class AuditResponse(BaseModel):
    """
    Respuesta básica — usada en listados (GET /audits/).
    No incluye el detalle de preguntas para mantener las respuestas ligeras.
    """
    model_config = ConfigDict(from_attributes=True)

    id:                   int
    audit_type_id:        int
    audit_type_name:      Optional[str]  = None   # Nombre del tipo (JOIN)
    audit_date:           date
    quarter:              Optional[str]  = None   # Calculado por la property del modelo
    year:                 Optional[int]  = None
    branch:               str
    auditor_name:         Optional[str]  = None
    auditor_email:        Optional[str]  = None
    start_time:           Optional[time] = None
    end_time:             Optional[time] = None
    total_score:          float          = 0.0
    max_score:            float          = 0.0
    percentage:           float          = 0.0
    status:               Optional[str]  = None
    puntajes_por_s:       PuntajesPorS   = Field(default_factory=PuntajesPorS)
    general_observations: Optional[str]  = None
    import_source:        Optional[str]  = None
    created_at:           Optional[datetime] = None
    updated_at:           Optional[datetime] = None

    @field_validator("total_score", "max_score", "percentage", mode="before")
    @classmethod
    def decimal_a_float(cls, v: Any) -> float:
        return float(v) if v is not None else 0.0

    @classmethod
    def from_orm_with_extras(cls, audit: Any) -> "AuditResponse":
        """
        Factory method que construye el response incluyendo los campos
        calculados (quarter, year, audit_type_name, puntajes_por_s)
        que no se mapean directamente con from_attributes.
        """
        return cls(
            id=audit.id,
            audit_type_id=audit.audit_type_id,
            audit_type_name=audit.audit_type.name if audit.audit_type else None,
            audit_date=audit.audit_date,
            quarter=audit.quarter,
            year=audit.year,
            branch=audit.branch,
            auditor_name=audit.auditor_name,
            auditor_email=audit.auditor_email,
            start_time=audit.start_time,
            end_time=audit.end_time,
            total_score=float(audit.total_score or 0),
            max_score=float(audit.max_score or 0),
            percentage=float(audit.percentage or 0),
            status=audit.status,
            puntajes_por_s=PuntajesPorS(
                seiri=    float(audit.seiri_percentage    or 0),
                seiton=   float(audit.seiton_percentage   or 0),
                seiso=    float(audit.seiso_percentage    or 0),
                seiketsu= float(audit.seiketsu_percentage or 0),
                shitsuke= float(audit.shitsuke_percentage or 0),
            ),
            general_observations=audit.general_observations,
            import_source=audit.import_source,
            created_at=audit.created_at,
            updated_at=audit.updated_at,
        )


class AuditDetailResponse(AuditResponse):
    """
    Respuesta detallada — usada en GET /audits/{id}.
    Incluye el desglose de preguntas agrupadas por S y las críticas.
    """
    questions:            list[AuditQuestionResponse] = Field(default_factory=list)
    preguntas_criticas:   list[AuditQuestionResponse] = Field(default_factory=list)
    total_preguntas:      int = 0
    preguntas_criticas_n: int = 0

    @classmethod
    def from_orm_with_extras(cls, audit: Any) -> "AuditDetailResponse":  # type: ignore[override]
        base = super().from_orm_with_extras(audit)
        questions = sorted(
            audit.questions,
            key=lambda q: (q.s_index, q.question_order)
        )
        criticas = [q for q in questions if q.is_critical]
        return cls(
            **base.model_dump(),
            questions=[AuditQuestionResponse.model_validate(q) for q in questions],
            preguntas_criticas=[AuditQuestionResponse.model_validate(q) for q in criticas],
            total_preguntas=len(questions),
            preguntas_criticas_n=len(criticas),
        )


# ─────────────────────────────────────────────────────────────────────────────
# PAGINACIÓN Y FILTROS
# ─────────────────────────────────────────────────────────────────────────────

class AuditFilters(BaseModel):
    """
    Parámetros de filtrado para GET /audits/.
    Todos opcionales — se aplican solo si se envían.
    """
    audit_type_id:  Optional[int]        = Field(None, description="Filtrar por tipo")
    branch:         Optional[str]        = Field(None, description="Filtrar por sucursal (contiene)")
    status:         Optional[str]        = Field(None, description="'Cumple', 'Por mejorar', 'Crítico'")
    year:           Optional[int]        = Field(None, ge=2000, le=2100)
    quarter:        Optional[str]        = Field(None, pattern=r"^Q[1-4]$", description="'Q1', 'Q2', 'Q3', 'Q4'")
    date_from:      Optional[date]       = Field(None, description="Fecha de inicio del rango")
    date_to:        Optional[date]       = Field(None, description="Fecha de fin del rango")
    auditor_email:  Optional[str]        = Field(None, description="Filtrar por email del auditor")

    @model_validator(mode="after")
    def validar_rango_fechas(self) -> "AuditFilters":
        if self.date_from and self.date_to:
            if self.date_from > self.date_to:
                raise ValueError("date_from debe ser anterior o igual a date_to")
        return self


class AuditListResponse(BaseModel):
    """Respuesta paginada para GET /audits/."""
    items:      list[AuditResponse]
    total:      int   = Field(..., description="Total de registros sin paginar")
    page:       int   = Field(..., description="Página actual (base 1)")
    page_size:  int   = Field(..., description="Registros por página")
    total_pages: int  = Field(..., description="Total de páginas")
    has_next:   bool
    has_prev:   bool


# ─────────────────────────────────────────────────────────────────────────────
# IMPORTACIÓN DESDE EXCEL
# ─────────────────────────────────────────────────────────────────────────────

class AuditImportResponse(BaseModel):
    """Resultado de POST /audits/import."""
    message:        str
    total_filas:    int
    nuevas:         int
    actualizadas:   int
    omitidas:       int
    errores_n:      int
    errores:        list[dict] = Field(default_factory=list)
    audit_ids:      list[int]  = Field(default_factory=list, description="IDs de auditorías creadas")


# ─────────────────────────────────────────────────────────────────────────────
# KPIs PARA DASHBOARD
# ─────────────────────────────────────────────────────────────────────────────

class AuditKPISucursal(BaseModel):
    """KPI por sucursal para la gráfica de barras del dashboard."""
    branch:           str
    promedio_pct:     float
    min_pct:          float
    max_pct:          float
    n_auditorias:     int
    estado:           str    # Semáforo del promedio


class AuditDashboardKPI(BaseModel):
    """
    KPIs globales para las tarjetas del dashboard principal.
    Equivale al 'RESUMEN EJECUTIVO' impreso en el notebook.
    """
    promedio_global:          float
    estado_global:            str
    total_auditorias:         int
    sucursales_cumple_pct:    float   # % de sucursales con promedio >= 80%
    sucursales_critico_pct:   float   # % de sucursales con promedio < 60%
    mejor_sucursal:           Optional[str]  = None
    mejor_sucursal_pct:       Optional[float] = None
    peor_sucursal:            Optional[str]   = None
    peor_sucursal_pct:        Optional[float] = None
    por_tipo:                 list[dict]      = Field(default_factory=list)
    por_sucursal:             list[AuditKPISucursal] = Field(default_factory=list)
    promedio_por_s:           PuntajesPorS    = Field(default_factory=PuntajesPorS)