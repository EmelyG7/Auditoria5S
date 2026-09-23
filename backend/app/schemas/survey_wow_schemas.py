"""
survey_wow_schemas.py — Schemas Pydantic del módulo Servicio WOW 2026 (encuestas).

ANONIMATO: ningún schema de salida expone nombre ni correo del respondiente
(no existen en la BD). Las respuestas a preguntas 'identifier' (Cliente,
Teléfono... de Almacén externo) solo se devuelven a administradores; el
router las enmascara para el resto.
"""

from datetime import datetime
from typing import Optional

from pydantic import BaseModel, ConfigDict


# ─────────────────────────────────────────────────────────────────────────────
# CATÁLOGOS
# ─────────────────────────────────────────────────────────────────────────────

class WowCycleOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id:        int
    name:      str
    year:      int
    is_active: bool


class WowDepartmentOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id:         int
    name:       str
    group_name: Optional[str] = None
    color:      Optional[str] = None
    is_active:  bool


class WowCriteriaOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id:    int
    code:  str
    order: int
    label: str


class WowQuestionOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id:            int
    order:         int
    text:          str
    question_type: str
    criteria_id:   Optional[int] = None
    criteria_code: Optional[str] = None
    is_required:   bool


class WowFormOut(BaseModel):
    """Formulario en el listado (sin preguntas)."""
    id:              int
    cycle_id:        int
    department_id:   int
    department_name: str
    group_name:      Optional[str] = None
    survey_type:     str
    branch:          Optional[str] = None
    subprocess:      Optional[str] = None
    title:           str
    list_name:       Optional[str] = None
    n_questions:     int = 0
    n_nominees:      Optional[int] = None   # solo internos; None = aún no cargados
    n_responses:     int = 0
    last_response_at: Optional[datetime] = None


class WowFormDetail(WowFormOut):
    questions: list[WowQuestionOut] = []
    nominees:  list[str] = []


class WowNomineesImportResponse(BaseModel):
    message:                  str
    formularios_actualizados: int
    sin_formulario:           list[str] = []
    sin_nominados:            list[str] = []
    detalle:                  list[dict] = []


# ─────────────────────────────────────────────────────────────────────────────
# IMPORTACIÓN
# ─────────────────────────────────────────────────────────────────────────────

class WowImportResponse(BaseModel):
    message:                 str
    importadas:              int
    duplicadas:              int
    sin_match_evaluador:     int
    evaluadores_completados: int
    preguntas_creadas:       int
    errores_n:               int
    errores:                 list[dict] = []
    advertencias:            list[str]  = []


# ─────────────────────────────────────────────────────────────────────────────
# RESPUESTAS
# ─────────────────────────────────────────────────────────────────────────────

class WowAnswerOut(BaseModel):
    question_id:   int
    order:         int
    question_type: str
    value_score:   Optional[int] = None
    value_text:    Optional[str] = None


class WowResponseOut(BaseModel):
    id:                   int
    form_id:              int
    form_title:           str
    department_name:      str
    branch:               Optional[str] = None
    survey_type:          str
    external_response_id: int
    completed_at:         Optional[datetime] = None
    promedio:             Optional[float] = None   # promedio de las Likert 1-5 de esta respuesta
    porcentaje:           Optional[float] = None   # puntos / (preguntas Likert × 5) × 100
    answers:              list[WowAnswerOut] = []
    nominee_name:         Optional[str] = None
    nomination_reason:    Optional[str] = None


class WowResponseListResponse(BaseModel):
    items:       list[WowResponseOut]
    total:       int
    page:        int
    page_size:   int
    total_pages: int
    has_next:    bool
    has_prev:    bool


# ─────────────────────────────────────────────────────────────────────────────
# DASHBOARD
# ─────────────────────────────────────────────────────────────────────────────

class WowScale(BaseModel):
    """Cortes del semáforo en % (ver survey_wow_service: puntos / (respuestas × 5) × 100)."""
    unidad:      str = "%"
    puntaje_max: int = 5
    excelente:   float
    aceptable:   float


class WowCriteriaKPI(BaseModel):
    code:     str
    label:    str
    promedio:   Optional[float] = None   # 1-5
    porcentaje: Optional[float] = None   # 0-100
    n:          int = 0
    estado:     str


class WowDepartmentKPI(BaseModel):
    department_id:   int
    departamento:    str
    group_name:      Optional[str] = None
    n_respuestas:    int
    promedio:        Optional[float] = None   # 1-5
    porcentaje:      Optional[float] = None   # 0-100
    estado:          str
    criterios:       dict[str, Optional[float]] = {}   # code → porcentaje (0-100)


class WowFormKPI(BaseModel):
    form_id:      int
    title:        str
    departamento: str
    branch:       Optional[str] = None
    n_respuestas: int
    promedio:     Optional[float] = None
    porcentaje:   Optional[float] = None
    estado:       str


class WowInternalDashboard(BaseModel):
    escala:           WowScale
    total_respuestas: int
    promedio_global:   Optional[float] = None
    porcentaje_global: Optional[float] = None
    estado_global:     str
    criterios:        list[WowCriteriaKPI]   = []
    por_departamento: list[WowDepartmentKPI] = []
    por_formulario:   list[WowFormKPI]       = []


class WowQuestionKPI(BaseModel):
    question_id:  int
    order:        int
    text:         str
    promedio:     Optional[float] = None
    porcentaje:   Optional[float] = None
    n:            int = 0
    estado:       str
    distribucion: dict[int, int] = {}   # 1..5 → cantidad


class WowExternalFormKPI(BaseModel):
    form_id:      int
    title:        str
    departamento: str
    branch:       Optional[str] = None
    subprocess:   Optional[str] = None
    n_respuestas: int
    promedio:     Optional[float] = None
    porcentaje:   Optional[float] = None
    estado:       str
    preguntas:    list[WowQuestionKPI] = []


class WowExternalDashboard(BaseModel):
    escala:           WowScale
    total_respuestas: int
    promedio_global:   Optional[float] = None
    porcentaje_global: Optional[float] = None
    estado_global:     str
    formularios:      list[WowExternalFormKPI] = []


class WowNominationOut(BaseModel):
    nominee_name:  str
    department_id: int
    departamento:  str
    form_id:       int
    form_title:    str
    branch:        Optional[str] = None
    votos:         int
    motivos:       list[str] = []
