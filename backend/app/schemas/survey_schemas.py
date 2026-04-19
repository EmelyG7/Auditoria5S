"""
survey_schemas.py — Schemas Pydantic para encuestas de satisfacción.

El modelo de datos refleja exactamente la hoja 'Hechos_Satisfaccion'
del archivo Satisfaccion_Estructura_Mejorada.xlsx:

    Columnas Excel              → Campo en schema
    ─────────────────────────────────────────────
    Departamento                → department
    Eficiencia                  → efficiency         (float 0-1)
    Comunicacion                → communication      (float 0-1)
    CalidadTecnica              → technical_quality  (float 0-1)
    ValorAgregado               → added_value        (float 0-1)
    ExperienciaGlobal           → global_experience  (float 0-1)
    Sat_Interna                 → internal_satisfaction (float 0-1, nullable)
    Sat_Externa                 → external_satisfaction (float 0-1, nullable)
    Area                        → area
    Sede                        → site
    Tipo                        → survey_type
    Periodo                     → period             ('2026_Q1')
    Periodo_Nombre              → period_name        ('Nov 2025 - Feb 2026')
    Año                         → year
    Trimestre                   → quarter
"""

from datetime import date
from decimal import Decimal
from typing import Any, Optional

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator


# ─────────────────────────────────────────────────────────────────────────────
# VALIDADOR COMPARTIDO DE SCORES (escala 0-1)
# ─────────────────────────────────────────────────────────────────────────────

def _validar_score(v: Any, field_name: str) -> Optional[float]:
    """Score debe estar entre 0.0 y 1.0 si se proporciona."""
    if v is None:
        return None
    try:
        f = float(v)
    except (TypeError, ValueError):
        raise ValueError(f"{field_name} debe ser un número entre 0 y 1.")
    if not (0.0 <= f <= 1.0):
        raise ValueError(f"{field_name} debe estar entre 0.0 y 1.0. Recibido: {f}")
    return round(f, 6)


# ─────────────────────────────────────────────────────────────────────────────
# BASE
# ─────────────────────────────────────────────────────────────────────────────

class SurveyBase(BaseModel):
    """Campos comunes a todas las variantes de encuesta."""

    # Clasificación
    survey_type:  str           = Field(..., description="Tipo/departamento (ej: 'ALMACENES', 'TI')")
    department:   str           = Field(..., description="Nombre del departamento")
    area:         Optional[str] = Field(None, description="Área dentro del departamento")
    site:         Optional[str] = Field(None, description="Sede o sucursal")

    # Período
    period:       Optional[str] = Field(None, description="Código período, ej: '2026_Q1'")
    period_name:  Optional[str] = Field(None, description="Nombre legible: 'Nov 2025 - Feb 2026'")
    year:         Optional[int] = Field(None, ge=2000, le=2100)
    quarter:      Optional[int] = Field(None, ge=1, le=4)
    month:        Optional[int] = Field(None, ge=1, le=12)

    # Dimensiones de satisfacción (escala 0-1)
    efficiency:            Optional[float] = Field(None, ge=0.0, le=1.0, description="Eficiencia (0-1)")
    communication:         Optional[float] = Field(None, ge=0.0, le=1.0, description="Comunicación (0-1)")
    technical_quality:     Optional[float] = Field(None, ge=0.0, le=1.0, description="Calidad Técnica (0-1)")
    added_value:           Optional[float] = Field(None, ge=0.0, le=1.0, description="Valor Agregado (0-1)")
    global_experience:     Optional[float] = Field(None, ge=0.0, le=1.0, description="Experiencia Global (0-1)")

    # Índices de satisfacción
    internal_satisfaction: Optional[float] = Field(None, ge=0.0, le=1.0, description="Sat. Interna (0-1)")
    external_satisfaction: Optional[float] = Field(None, ge=0.0, le=1.0,
                                                    description="Sat. Externa (0-1). Nulo si no aplica.")

    # Metadatos
    score_scale:  str           = Field(default="0-1", description="Escala de los scores")
    comments:     Optional[str] = Field(None, description="Comentarios cualitativos")


# ─────────────────────────────────────────────────────────────────────────────
# CREATE / UPDATE
# ─────────────────────────────────────────────────────────────────────────────

class SurveyCreate(SurveyBase):
    """Schema para POST /surveys/."""

    @model_validator(mode="after")
    def validar_al_menos_una_dimension(self) -> "SurveyCreate":
        dims = [
            self.efficiency, self.communication, self.technical_quality,
            self.added_value, self.global_experience,
            self.internal_satisfaction, self.external_satisfaction,
        ]
        if all(d is None for d in dims):
            raise ValueError(
                "Debe proporcionar al menos una dimensión de satisfacción "
                "(efficiency, communication, technical_quality, etc.)."
            )
        return self


class SurveyUpdate(BaseModel):
    """Schema para PUT /surveys/{id} — todos los campos opcionales."""
    survey_type:           Optional[str]   = None
    department:            Optional[str]   = None
    area:                  Optional[str]   = None
    site:                  Optional[str]   = None
    period:                Optional[str]   = None
    period_name:           Optional[str]   = None
    year:                  Optional[int]   = Field(None, ge=2000, le=2100)
    quarter:               Optional[int]   = Field(None, ge=1, le=4)
    month:                 Optional[int]   = Field(None, ge=1, le=12)
    efficiency:            Optional[float] = Field(None, ge=0.0, le=1.0)
    communication:         Optional[float] = Field(None, ge=0.0, le=1.0)
    technical_quality:     Optional[float] = Field(None, ge=0.0, le=1.0)
    added_value:           Optional[float] = Field(None, ge=0.0, le=1.0)
    global_experience:     Optional[float] = Field(None, ge=0.0, le=1.0)
    internal_satisfaction: Optional[float] = Field(None, ge=0.0, le=1.0)
    external_satisfaction: Optional[float] = Field(None, ge=0.0, le=1.0)
    comments:              Optional[str]   = None


# ─────────────────────────────────────────────────────────────────────────────
# RESPONSES
# ─────────────────────────────────────────────────────────────────────────────

class SurveyResponse(SurveyBase):
    """Respuesta completa de una encuesta."""
    model_config = ConfigDict(from_attributes=True)

    id:                int
    import_source:     Optional[str] = None
    source_row_id:     Optional[str] = None

    # Campos calculados (no en BD, se agregan al serializar)
    overall_satisfaction: Optional[float] = None

    @field_validator(
        "efficiency", "communication", "technical_quality",
        "added_value", "global_experience",
        "internal_satisfaction", "external_satisfaction",
        mode="before",
    )
    @classmethod
    def decimal_a_float(cls, v: Any) -> Optional[float]:
        return float(v) if v is not None else None

    @classmethod
    def from_orm_with_extras(cls, survey: Any) -> "SurveyResponse":
        obj = cls.model_validate(survey)
        # Calcular overall_satisfaction
        vals = [
            v for v in [survey.internal_satisfaction, survey.external_satisfaction]
            if v is not None
        ]
        obj.overall_satisfaction = round(float(sum(vals)) / len(vals), 4) if vals else None
        return obj


class SurveyListResponse(BaseModel):
    """Respuesta paginada para GET /surveys/."""
    items:       list[SurveyResponse]
    total:       int
    page:        int
    page_size:   int
    total_pages: int
    has_next:    bool
    has_prev:    bool


class SurveyImportResponse(BaseModel):
    """Resultado de POST /surveys/import."""
    message:     str
    total_filas: int
    nuevas:      int
    actualizadas: int
    omitidas:    int
    errores_n:   int
    errores:     list[dict] = []
    survey_ids:  list[int]  = []


# ─────────────────────────────────────────────────────────────────────────────
# KPIs DASHBOARD
# ─────────────────────────────────────────────────────────────────────────────

class DimensionKPI(BaseModel):
    """Promedio de una dimensión con su estado."""
    nombre:   str
    promedio: float
    estado:   str           # 'Alto' ≥0.8, 'Medio' ≥0.6, 'Bajo' <0.6


class SurveyKPIPorPeriodo(BaseModel):
    """KPI de satisfacción por período (para gráfica de evolución temporal)."""
    period:       str
    period_name:  str
    year:         int
    quarter:      int
    sat_interna:  Optional[float] = None
    sat_externa:  Optional[float] = None
    n_registros:  int


class SurveyKPIPorSede(BaseModel):
    """KPI de satisfacción por sede (para gráfica de barras)."""
    site:          str
    sat_interna:   Optional[float] = None
    sat_externa:   Optional[float] = None
    n_registros:   int


class SurveyDashboardKPI(BaseModel):
    """KPIs globales para el dashboard de satisfacción."""
    # Totales
    total_registros:        int
    periodos_disponibles:   list[str]

    # Promedios globales
    sat_interna_global:     Optional[float] = None
    sat_externa_global:     Optional[float] = None
    overall_global:         Optional[float] = None

    # Dimensiones
    dimensiones:            list[DimensionKPI] = []

    # Mejor y peor dimensión
    mejor_dimension:        Optional[str]  = None
    peor_dimension:         Optional[str]  = None

    # Desglose temporal y geográfico
    por_periodo:            list[SurveyKPIPorPeriodo] = []
    por_sede:               list[SurveyKPIPorSede]    = []

    # Desglose por departamento (para tabla dinámica)
    por_departamento:       list[dict] = []