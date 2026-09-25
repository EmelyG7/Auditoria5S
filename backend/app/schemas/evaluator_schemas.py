"""
evaluator_schemas.py — Schemas Pydantic de programación y asignación de evaluadores
(Servicio WOW 2026).
"""

from datetime import date
from typing import Optional

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator


# ─────────────────────────────────────────────────────────────────────────────
# CRONOGRAMA
# ─────────────────────────────────────────────────────────────────────────────

class ScheduleEntryOut(BaseModel):
    id:                   int
    cycle_id:             int
    list_name:            str
    schedule_number:      Optional[int] = None
    department_id:        int
    department_name:      str
    branch:               Optional[str] = None
    send_date:            Optional[date] = None
    tabulation_date:      Optional[date] = None
    disclosure_date:      Optional[date] = None
    report_delivery_date: Optional[date] = None
    evaluator_areas_raw:  Optional[str] = None
    internal_sample_raw:  Optional[str] = None
    external_sample_raw:  Optional[str] = None
    internal_sample_size: Optional[int] = None
    external_sample_size: Optional[int] = None
    is_closed:            bool
    # Conteos
    titulares:     int = 0
    suplentes:     int = 0
    completados:   int = 0


class ScheduleEntryUpdate(BaseModel):
    """PUT /servicio-wow/evaluadores/schedule/{id} — todos opcionales."""
    send_date:            Optional[date] = None
    tabulation_date:      Optional[date] = None
    disclosure_date:      Optional[date] = None
    report_delivery_date: Optional[date] = None
    internal_sample_size: Optional[int]  = Field(None, ge=0)
    external_sample_size: Optional[int]  = Field(None, ge=0)
    is_closed:            Optional[bool] = None

    @model_validator(mode="after")
    def fechas_en_orden(self) -> "ScheduleEntryUpdate":
        pares = [
            (self.send_date, self.tabulation_date, "La tabulación"),
            (self.tabulation_date, self.disclosure_date, "La divulgación"),
        ]
        for antes, despues, nombre in pares:
            if antes and despues and despues < antes:
                raise ValueError(f"{nombre} no puede ser anterior a la fecha previa del cronograma.")
        return self


# ─────────────────────────────────────────────────────────────────────────────
# ASIGNACIONES
# ─────────────────────────────────────────────────────────────────────────────

class AssignmentOut(BaseModel):
    id:                  int
    schedule_entry_id:   int
    list_name:           str
    department_name:     str
    employee_id:         int
    employee_name:       str
    position:            Optional[str] = None
    employee_area:       Optional[str] = None
    location:            Optional[str] = None
    evaluator_area:      Optional[str] = None
    role:                str
    status:              str


class AssignmentListResponse(BaseModel):
    items:       list[AssignmentOut]
    total:       int
    page:        int
    page_size:   int
    total_pages: int
    has_next:    bool
    has_prev:    bool


# ─────────────────────────────────────────────────────────────────────────────
# IMPORTACIÓN
# ─────────────────────────────────────────────────────────────────────────────

class EvaluatorImportResponse(BaseModel):
    message:                   str
    listas_creadas:            int
    listas_actualizadas:       int
    colaboradores_creados:     int
    asignaciones_creadas:      int
    asignaciones_actualizadas: int
    asignaciones_eliminadas:   int
    departamentos_creados:     list[str]  = []
    advertencias:              list[str]  = []
    errores_n:                 int
    errores:                   list[dict] = []


# ─────────────────────────────────────────────────────────────────────────────
# VISTAS DERIVADAS (Matriz_Participacion / Resumen_Muestra)
# ─────────────────────────────────────────────────────────────────────────────

class ParticipationCell(BaseModel):
    titular:  int = 0
    suplente: int = 0


class ParticipationRow(BaseModel):
    employee_id:    int
    colaborador:    str
    area:           Optional[str] = None
    ubicacion:      Optional[str] = None
    celdas:         dict[str, ParticipationCell] = {}   # nombre de departamento → conteos
    total_titular:  int
    total_suplente: int
    carga_alta:     bool


class ParticipationMatrix(BaseModel):
    columnas:     list[str]
    carga_alerta: int
    filas:        list[ParticipationRow]


class SampleSummaryRow(BaseModel):
    schedule_entry_id:   int
    list_name:           str
    departamento:        str
    muestra_requerida:   Optional[int] = None
    titulares:           int
    suplentes:           int
    respondieron:        int
    pct_respuesta:       Optional[float] = None   # sobre titulares, 0-1
    areas_representadas: list[str] = []
    alerta:              bool                      # titulares < muestra requerida


class SampleSummary(BaseModel):
    filas:                list[SampleSummaryRow]
    total_requerida:      int
    total_titulares:      int
    total_suplentes:      int
    total_respondieron:   int


# ─────────────────────────────────────────────────────────────────────────────
# CONFIGURACIÓN DE MUESTREO
# ─────────────────────────────────────────────────────────────────────────────

class SamplingConfigOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id:                            int
    cycle_id:                      int
    seed:                          int
    titular_cap:                   int
    suplentes_por_departamento:    int
    antiguedad_minima_dias:        int
    carga_alerta:                  int
    areas_excluidas:               list[str]      = []
    personas_excluidas:            list[str]      = []
    evitar_repeticion:             dict           = {}
    permitir_repetir:              list[str]      = []
    puestos_sin_interaccion_regex: Optional[str] = None

    @field_validator("areas_excluidas", "personas_excluidas", "permitir_repetir", mode="before")
    @classmethod
    def _lista(cls, v):
        return v or []

    @field_validator("evitar_repeticion", mode="before")
    @classmethod
    def _dict(cls, v):
        return v or {}


class SamplingConfigUpdate(BaseModel):
    """PUT /servicio-wow/evaluadores/sampling-config — lo usa la pestaña Configuración."""
    seed:                          Optional[int]       = None
    titular_cap:                   Optional[int]       = Field(None, ge=1)
    suplentes_por_departamento:    Optional[int]       = Field(None, ge=0)
    antiguedad_minima_dias:        Optional[int]       = Field(None, ge=0)
    carga_alerta:                  Optional[int]       = Field(None, ge=1)
    areas_excluidas:               Optional[list[str]] = None
    personas_excluidas:            Optional[list[str]] = None
    evitar_repeticion:             Optional[dict[str, list[str]]] = None
    permitir_repetir:              Optional[list[str]] = None
    puestos_sin_interaccion_regex: Optional[str]       = None

    @field_validator("areas_excluidas", "personas_excluidas", "permitir_repetir", mode="after")
    @classmethod
    def _limpiar(cls, v):
        if v is None:
            return v
        vistos, out = set(), []
        for x in (s.strip() for s in v):
            if x and x.lower() not in vistos:
                vistos.add(x.lower())
                out.append(x)
        return out


# ─────────────────────────────────────────────────────────────────────────────
# LISTADO DE PERSONAL
# ─────────────────────────────────────────────────────────────────────────────

class RosterImportResponse(BaseModel):
    message:           str
    total:             int
    creados:           int
    actualizados:      int
    fuera_del_listado: int
    advertencias:      list[str] = []


class EmployeeOut(BaseModel):
    id:           int
    full_name:    str
    position:     Optional[str] = None
    area:         Optional[str] = None
    location:     Optional[str] = None
    hire_date:    Optional[date] = None
    en_listado:   bool


# ─────────────────────────────────────────────────────────────────────────────
# SORTEO (Fase 2)
# ─────────────────────────────────────────────────────────────────────────────

class SorteoEvaluacion(BaseModel):
    """Una evaluación del cronograma (una o varias listas, ej. CAJA = 5 entidades)."""
    clave:          str
    listas:         list[str]
    numero:         Optional[int] = None
    envio:          Optional[date] = None
    titulares:      int
    completados:    int
    recalculable:   bool
    motivo_bloqueo: Optional[str] = None


class SorteoRequest(BaseModel):
    claves: list[str] = Field(..., min_length=1, description="Evaluaciones a re-sortear")


class SorteoApplyRequest(SorteoRequest):
    token: str = Field(..., description="Token devuelto por la vista previa")


class SorteoResumenRow(BaseModel):
    lista:     str
    numero:    Optional[int] = None
    requerida: Optional[int] = None
    titulares: int
    pool:      Optional[int] = None
    estado:    str            # recalculada | ajustada


class SorteoCambioFila(BaseModel):
    employee_id:     int
    colaborador:     str
    puesto:          Optional[str] = None
    ubicacion:       Optional[str] = None
    area_evaluadora: str
    rol:             str      # titular | suplente
    cambio:          str      # entra | pasa a titular | pasa a suplente | se mantiene | sale


class SorteoCambioLista(BaseModel):
    lista:        str
    entran:       int
    salen:        int
    cambian_rol:  int = 0
    se_mantienen: int
    filas:        list[SorteoCambioFila]


class SorteoPreview(BaseModel):
    token:        str
    recalculadas: list[str]
    ajustadas:    list[str]
    resumen:      list[SorteoResumenRow]
    alertas:      list[str]
    carga:        dict[int, int]          # nº de encuestas titulares → nº de personas
    cambios:      list[SorteoCambioLista]


class SorteoApplyResponse(BaseModel):
    message:                   str
    recalculadas:              list[str]
    ajustadas:                 list[str]
    asignaciones_creadas:      int
    asignaciones_eliminadas:   int
    asignaciones_actualizadas: int
    alertas:                   list[str] = []


# ─────────────────────────────────────────────────────────────────────────────
# AMPLIAR UNA LISTA / SEGUIMIENTO
# ─────────────────────────────────────────────────────────────────────────────

class AdicionalCandidato(BaseModel):
    employee_id:   int
    colaborador:   str
    puesto:        Optional[str] = None
    area:          Optional[str] = None
    area_evaluadora: Optional[str] = None   # estrato de sampling_rules por el que evalúa esta lista
    ubicacion:     Optional[str] = None
    carga_titular: int            # listas que ya evalúa como titular
    sugerido:      bool


class AdicionalesPreview(BaseModel):
    schedule_entry_id: int
    lista:             str
    en_lista:          int
    n:                 int
    solo_lideres:      bool
    representacion:    dict[str, int]   # área evaluadora → personas ya en la lista
    areas_evaluadoras: list[str] = []   # áreas que evalúan la lista (vacío = todas)
    candidatos:        list[AdicionalCandidato]
    alertas:           list[str] = []


class AgregarEvaluadoresRequest(BaseModel):
    employee_ids: list[int] = Field(..., min_length=1, max_length=100)


class AgregarEvaluadoresResponse(BaseModel):
    message:      str
    agregados:    int
    omitidos:     list[str] = []    # ya estaban en la lista
    advertencias: list[str] = []


class AssignmentStatusUpdate(BaseModel):
    status: str = Field(..., pattern="^(pendiente|completo)$")
