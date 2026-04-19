"""
schedule_schemas.py — Schemas para el calendario de planificación de auditorías.
"""

from datetime import date, datetime, time
from typing import Optional

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

from app.schemas.audit_schemas import AuditTypeResponse


VALID_PRIORITIES = ("Alta", "Media", "Baja")
VALID_STATUSES   = ("Pendiente", "Completada", "Cancelada")


class ScheduleBase(BaseModel):
    title:              str           = Field(..., min_length=3, description="Título del evento")
    description:        Optional[str] = None
    audit_type_id:      int           = Field(..., description="ID del tipo de auditoría")
    branch:             str           = Field(..., min_length=1, description="Sucursal")
    scheduled_date:     date          = Field(..., description="Fecha programada")
    scheduled_time:     Optional[time]= None
    priority:           str           = Field(default="Media")
    notify_days_before: int           = Field(default=2, ge=0, le=30)

    @field_validator("priority")
    @classmethod
    def validar_priority(cls, v: str) -> str:
        if v not in VALID_PRIORITIES:
            raise ValueError(f"priority debe ser uno de: {VALID_PRIORITIES}")
        return v

    @field_validator("scheduled_date")
    @classmethod
    def validar_fecha_futura(cls, v: date) -> date:
        # Permitimos fechas pasadas para importar eventos históricos;
        # el frontend puede advertir al usuario si la fecha ya pasó.
        return v


class ScheduleCreate(ScheduleBase):
    """Schema para POST /schedule/."""
    assigned_auditor_id: Optional[int] = Field(None, description="ID del usuario auditor asignado")


class ScheduleUpdate(BaseModel):
    """Schema para PUT /schedule/{id} — todos opcionales."""
    title:               Optional[str]  = Field(None, min_length=3)
    description:         Optional[str]  = None
    audit_type_id:       Optional[int]  = None
    branch:              Optional[str]  = Field(None, min_length=1)
    scheduled_date:      Optional[date] = None
    scheduled_time:      Optional[time] = None
    priority:            Optional[str]  = None
    status:              Optional[str]  = None
    assigned_auditor_id: Optional[int]  = None
    notify_days_before:  Optional[int]  = Field(None, ge=0, le=30)
    cancellation_reason: Optional[str]  = None

    @field_validator("priority")
    @classmethod
    def validar_priority(cls, v: Optional[str]) -> Optional[str]:
        if v is not None and v not in VALID_PRIORITIES:
            raise ValueError(f"priority debe ser uno de: {VALID_PRIORITIES}")
        return v

    @field_validator("status")
    @classmethod
    def validar_status(cls, v: Optional[str]) -> Optional[str]:
        if v is not None and v not in VALID_STATUSES:
            raise ValueError(f"status debe ser uno de: {VALID_STATUSES}")
        return v


class ScheduleCompleteRequest(BaseModel):
    """
    Body de PATCH /schedule/{id}/complete.
    Permite vincular el evento con una auditoría real ya existente,
    o indica que se debe crear una nueva desde este evento.
    """
    linked_audit_id:   Optional[int]  = Field(
        None,
        description="ID de la auditoría real ya creada. Si None, el frontend "
                    "debe redirigir al formulario de nueva auditoría."
    )
    completion_notes:  Optional[str]  = None


class AssignedAuditorInfo(BaseModel):
    """Info mínima del auditor asignado (evita exponer datos sensibles)."""
    id:        int
    full_name: str
    email:     str


class ScheduleResponse(BaseModel):
    """Respuesta completa de un evento de planificación."""
    model_config = ConfigDict(from_attributes=True)

    id:                  int
    title:               str
    description:         Optional[str]  = None
    audit_type_id:       int
    audit_type:          Optional[AuditTypeResponse] = None
    branch:              str
    scheduled_date:      date
    scheduled_time:      Optional[time] = None
    priority:            str
    status:              str
    assigned_auditor_id: Optional[int]  = None
    assigned_auditor:    Optional[AssignedAuditorInfo] = None
    created_by_id:       Optional[int]  = None
    linked_audit_id:     Optional[int]  = None
    notification_sent:   bool
    notify_days_before:  int
    cancellation_reason: Optional[str]  = None
    created_at:          Optional[datetime] = None
    updated_at:          Optional[datetime] = None

    # Campos calculados
    is_overdue:          bool = False
    days_until_scheduled: Optional[int] = None

    @classmethod
    def from_orm_with_extras(cls, schedule) -> "ScheduleResponse":
        auditor_info = None
        if schedule.assigned_auditor:
            auditor_info = AssignedAuditorInfo(
                id=schedule.assigned_auditor.id,
                full_name=schedule.assigned_auditor.full_name,
                email=schedule.assigned_auditor.email,
            )
        return cls(
            id=schedule.id,
            title=schedule.title,
            description=schedule.description,
            audit_type_id=schedule.audit_type_id,
            audit_type=AuditTypeResponse.model_validate(schedule.audit_type)
                       if schedule.audit_type else None,
            branch=schedule.branch,
            scheduled_date=schedule.scheduled_date,
            scheduled_time=schedule.scheduled_time,
            priority=schedule.priority,
            status=schedule.status,
            assigned_auditor_id=schedule.assigned_auditor_id,
            assigned_auditor=auditor_info,
            created_by_id=schedule.created_by_id,
            linked_audit_id=schedule.linked_audit_id,
            notification_sent=schedule.notification_sent,
            notify_days_before=schedule.notify_days_before,
            cancellation_reason=schedule.cancellation_reason,
            created_at=schedule.created_at,
            updated_at=schedule.updated_at,
            is_overdue=schedule.is_overdue,
            days_until_scheduled=schedule.days_until_scheduled,
        )


class CalendarEvent(BaseModel):
    """Formato compacto para el widget de calendario (FullCalendar / React Big Calendar)."""
    id:             int
    title:          str
    start:          str             # ISO date string "YYYY-MM-DD" o datetime
    end:            Optional[str]   = None
    color:          str             # Color según prioridad
    status:         str
    priority:       str
    branch:         str
    audit_type:     Optional[str]   = None
    is_overdue:     bool            = False
    days_until:     Optional[int]   = None


class CalendarResponse(BaseModel):
    """Respuesta de GET /schedule/calendar."""
    month:          str             # "YYYY-MM"
    events:         list[CalendarEvent]
    total_events:   int
    pendientes:     int
    completadas:    int
    canceladas:     int


class ScheduleListResponse(BaseModel):
    """Respuesta paginada para GET /schedule/."""
    items:       list[ScheduleResponse]
    total:       int
    page:        int
    page_size:   int
    total_pages: int
    has_next:    bool
    has_prev:    bool


class ScheduleConflictWarning(BaseModel):
    """Advertencia de conflicto de fechas para una sucursal."""
    has_conflict:    bool
    conflicting_ids: list[int] = []
    message:         str       = ""