"""
audit_action_plan_schemas.py — Schemas Pydantic para los planes de acción
("Pasos a Seguir") de una auditoría 5S, y para el proxy de generación de
texto con IA (GET /audits/{id}/ai-generate).
"""

from datetime import date, datetime
from typing import Optional

from pydantic import BaseModel, ConfigDict, Field, field_validator

_VALID_STATUSES = {"pendiente", "en_progreso", "completado"}


# ─────────────────────────────────────────────────────────────────────────────
# PLANES DE ACCIÓN
# ─────────────────────────────────────────────────────────────────────────────

class AuditActionPlanCreate(BaseModel):
    item_text:   str            = Field(..., min_length=1)
    responsible: Optional[str]  = Field(None, max_length=200)
    due_date:    Optional[date] = None
    status:      str            = Field("pendiente")
    order_index: Optional[int]  = None

    @field_validator("status")
    @classmethod
    def validar_status(cls, v: str) -> str:
        if v not in _VALID_STATUSES:
            raise ValueError(f"status debe ser uno de {sorted(_VALID_STATUSES)}")
        return v


class AuditActionPlanUpdate(BaseModel):
    item_text:   Optional[str]  = Field(None, min_length=1)
    responsible: Optional[str]  = Field(None, max_length=200)
    due_date:    Optional[date] = None
    status:      Optional[str]  = None
    order_index: Optional[int]  = None

    @field_validator("status")
    @classmethod
    def validar_status(cls, v: Optional[str]) -> Optional[str]:
        if v is not None and v not in _VALID_STATUSES:
            raise ValueError(f"status debe ser uno de {sorted(_VALID_STATUSES)}")
        return v


class AuditActionPlanResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id:          int
    audit_id:    int
    item_text:   str
    responsible: Optional[str] = None
    due_date:    Optional[date] = None
    status:      str
    order_index: int
    created_at:  Optional[datetime] = None
    updated_at:  Optional[datetime] = None


# ─────────────────────────────────────────────────────────────────────────────
# PROXY DE GENERACIÓN DE TEXTO CON IA
# ─────────────────────────────────────────────────────────────────────────────

class AIGenerateRequest(BaseModel):
    """
    El frontend ya construye el prompt completo (con los datos de la
    auditoría embebidos); este endpoint solo reenvía la solicitud a la
    API de Claude usando la API key del servidor, que nunca se expone
    al cliente.
    """
    prompt:     str           = Field(..., min_length=1)
    max_tokens: Optional[int] = Field(1000, ge=1, le=4000)


class AIGenerateResponse(BaseModel):
    text: str


# ─────────────────────────────────────────────────────────────────────────────
# CONCLUSIONES MEJORADAS DEL REPORTE PDF
# ─────────────────────────────────────────────────────────────────────────────

class ReportConclusionsRequest(BaseModel):
    total_auditorias: int
    promedio_global: float
    promedio_por_s: dict
    por_tipo: list[dict] = []
    por_sucursal: list[dict] = []


class ReportConclusionsResponse(BaseModel):
    hallazgo_01: str
    hallazgo_02: str
    hallazgo_03: str
    recomendacion_principal: str
