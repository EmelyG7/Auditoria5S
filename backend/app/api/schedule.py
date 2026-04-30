"""
schedule.py — Router FastAPI para el calendario de planificación de auditorías.

Endpoints:
    GET   /schedule/calendar     — Vista calendario por mes
    GET   /schedule/             — Listar con filtros
    GET   /schedule/{id}         — Detalle
    POST  /schedule/             — Crear evento (admin/auditor)
    PUT   /schedule/{id}         — Editar evento
    DELETE /schedule/{id}        — Eliminar (admin)
    PATCH /schedule/{id}/complete — Marcar como completado
"""

import logging
from datetime import date, timedelta
from math import ceil
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.dependencies import get_current_user, require_admin
from app.models.audit_models import AuditType
from app.models.schedule_models import AuditSchedule
from app.models.user_models import User
from app.schemas.schedule_schemas import (
    CalendarEvent,
    CalendarResponse,
    ScheduleCompleteRequest,
    ScheduleConflictWarning,
    ScheduleCreate,
    ScheduleListResponse,
    ScheduleResponse,
    ScheduleUpdate,
)

logger = logging.getLogger(__name__)

router = APIRouter(
    prefix="/schedule",
    tags=["Calendario de Planificación"],
    responses={404: {"description": "Evento no encontrado"}},
)

# Colores por prioridad para el calendario (compatibles con FullCalendar)
PRIORITY_COLORS = {
    "Alta":  "#DF4585",   # Rosa fuerte (del design system)
    "Media": "#EA9947",   # Ámbar
    "Baja":  "#98C062",   # Verde
}
STATUS_COLORS = {
    "Completada": "#98C062",
    "Cancelada":  "#9CA3AF",
    "Pendiente":  None,    # Usa color de prioridad
}


def _get_schedule_or_404(schedule_id: int, db: Session) -> AuditSchedule:
    s = db.query(AuditSchedule).filter(AuditSchedule.id == schedule_id).first()
    if not s:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Evento de planificación id={schedule_id} no encontrado.",
        )
    return s


def _event_color(schedule: AuditSchedule) -> str:
    """Retorna el color del evento para el calendario."""
    status_color = STATUS_COLORS.get(schedule.status)
    if status_color:
        return status_color
    return PRIORITY_COLORS.get(schedule.priority, "#0A4F79")


def _check_conflicts(
    db: Session,
    branch: str,
    scheduled_date: date,
    audit_type_id: int,
    exclude_id: Optional[int] = None,
) -> ScheduleConflictWarning:
    """
    Verifica si ya hay un evento pendiente para la misma sucursal,
    tipo de auditoría y fecha.
    """
    q = db.query(AuditSchedule).filter(
        AuditSchedule.branch          == branch,
        AuditSchedule.scheduled_date  == scheduled_date,
        AuditSchedule.audit_type_id   == audit_type_id,
        AuditSchedule.status          == "Pendiente",
    )
    if exclude_id:
        q = q.filter(AuditSchedule.id != exclude_id)

    conflicts = q.all()
    if not conflicts:
        return ScheduleConflictWarning(has_conflict=False)

    return ScheduleConflictWarning(
        has_conflict=True,
        conflicting_ids=[c.id for c in conflicts],
        message=(
            f"Ya existe un evento pendiente para '{branch}' "
            f"el {scheduled_date} con el mismo tipo de auditoría. "
            f"IDs en conflicto: {[c.id for c in conflicts]}"
        ),
    )


# ─────────────────────────────────────────────────────────────────────────────
# VISTA CALENDARIO
# ─────────────────────────────────────────────────────────────────────────────

@router.get(
    "/calendar",
    response_model=CalendarResponse,
    summary="Vista calendario por mes",
    description=(
        "Retorna todos los eventos del mes en formato optimizado para "
        "FullCalendar o React Big Calendar. "
        "Formato del parámetro month: 'YYYY-MM' (ej: '2026-04')."
    ),
)
def get_calendar(
    month:        str           = Query(..., pattern=r"^\d{4}-\d{2}$",
                                        description="Mes en formato YYYY-MM"),
    branch:       Optional[str] = Query(None),
    audit_type_id: Optional[int]= Query(None),
    current_user: User          = Depends(get_current_user),
    db:           Session       = Depends(get_db),
):
    try:
        year_m, month_m = int(month[:4]), int(month[5:7])
    except (ValueError, IndexError):
        raise HTTPException(400, f"Formato de mes inválido: '{month}'. Usa YYYY-MM.")

    # Calcular primer y último día del mes
    import calendar as cal_module
    last_day = cal_module.monthrange(year_m, month_m)[1]
    date_from = date(year_m, month_m, 1)
    date_to   = date(year_m, month_m, last_day)

    q = db.query(AuditSchedule).filter(
        AuditSchedule.scheduled_date >= date_from,
        AuditSchedule.scheduled_date <= date_to,
    )
    if branch:
        q = q.filter(AuditSchedule.branch.ilike(f"%{branch}%"))
    if audit_type_id:
        q = q.filter(AuditSchedule.audit_type_id == audit_type_id)

    events_db = q.order_by(AuditSchedule.scheduled_date, AuditSchedule.scheduled_time).all()

    events = []
    for ev in events_db:
        # Construir string de fecha/hora de inicio
        start_str = str(ev.scheduled_date)
        if ev.scheduled_time:
            start_str = f"{ev.scheduled_date}T{ev.scheduled_time}"

        events.append(CalendarEvent(
            id=ev.id,
            title=ev.title,
            start=start_str,
            end=start_str,  # Eventos de un día — el frontend puede ampliar esto
            color=_event_color(ev),
            status=ev.status,
            priority=ev.priority,
            branch=ev.branch,
            audit_type=ev.audit_type.name if ev.audit_type else None,
            is_overdue=ev.is_overdue,
            days_until=ev.days_until_scheduled,
        ))

    return CalendarResponse(
        month=month,
        events=events,
        total_events=len(events),
        pendientes=sum(1 for e in events_db if e.status == "Pendiente"),
        completadas=sum(1 for e in events_db if e.status == "Completada"),
        canceladas=sum(1 for e in events_db if e.status == "Cancelada"),
    )


# ─────────────────────────────────────────────────────────────────────────────
# Upcoming & Reminders
# ─────────────────────────────────────────────────────────────────────────────

@router.get(
    "/upcoming",
    summary="Eventos próximos (widget Home)",
    description="Retorna eventos Pendientes con scheduled_date entre hoy y hoy+days.",
)
def get_upcoming(
    days:         int     = Query(7, ge=1, le=60, description="Días hacia adelante"),
    current_user: User    = Depends(get_current_user),
    db:           Session = Depends(get_db),
):
    today    = date.today()
    date_to  = today + timedelta(days=days)
    events   = (
        db.query(AuditSchedule)
        .filter(
            AuditSchedule.status          == "Pendiente",
            AuditSchedule.scheduled_date  >= today,
            AuditSchedule.scheduled_date  <= date_to,
        )
        .order_by(AuditSchedule.scheduled_date, AuditSchedule.scheduled_time)
        .all()
    )
    return [
        {
            "id":                    ev.id,
            "title":                 ev.title,
            "branch":                ev.branch,
            "audit_type_id":         ev.audit_type_id,
            "audit_type":            ev.audit_type.name if ev.audit_type else None,
            "scheduled_date":        str(ev.scheduled_date),
            "scheduled_time":        str(ev.scheduled_time)[:5] if ev.scheduled_time else None,
            "priority":              ev.priority,
            "status":                ev.status,
            "assigned_auditor_name": ev.assigned_auditor_name,
            "days_until":            (ev.scheduled_date - today).days,
        }
        for ev in events
    ]


@router.post(
    "/send-reminders",
    summary="Enviar recordatorios por email (admin)",
    description=(
        "Recorre los eventos Pendientes cuya fecha coincide con hoy+N "
        "y envía un email al auditor asignado. Solo accesible por admins."
    ),
)
def send_reminders(
    days_ahead: list[int] = Query(default=[1, 3, 7], description="Días de anticipación"),
    app_url:    str       = Query(default="",         description="URL base de la app"),
    _:          User      = Depends(require_admin),
    db:         Session   = Depends(get_db),
):
    from app.services.email_service import run_scheduled_reminders
    from app.core.config import settings as cfg

    result = run_scheduled_reminders(
        db         = db,
        days_ahead = days_ahead,
        app_url    = app_url or cfg.APP_URL,
    )
    return result


# ─────────────────────────────────────────────────────────────────────────────
# CRUD
# ─────────────────────────────────────────────────────────────────────────────

@router.get(
    "/",
    response_model=ScheduleListResponse,
    summary="Listar eventos de planificación",
)
def list_schedule(
    status_filter:  Optional[str]  = Query(None, alias="status",
                                           description="'Pendiente', 'Completada', 'Cancelada'"),
    priority:       Optional[str]  = Query(None, description="'Alta', 'Media', 'Baja'"),
    branch:         Optional[str]  = Query(None),
    audit_type_id:  Optional[int]  = Query(None),
    date_from:      Optional[str]  = Query(None, description="YYYY-MM-DD"),
    date_to:        Optional[str]  = Query(None, description="YYYY-MM-DD"),
    overdue_only:   bool           = Query(False, description="Solo eventos vencidos y pendientes"),
    page:           int            = Query(1, ge=1),
    page_size:      int            = Query(20, ge=1, le=100),
    current_user:   User           = Depends(get_current_user),
    db:             Session        = Depends(get_db),
):
    q = db.query(AuditSchedule)

    if status_filter:
        q = q.filter(AuditSchedule.status == status_filter)
    if priority:
        q = q.filter(AuditSchedule.priority == priority)
    if branch:
        q = q.filter(AuditSchedule.branch.ilike(f"%{branch}%"))
    if audit_type_id:
        q = q.filter(AuditSchedule.audit_type_id == audit_type_id)
    if date_from:
        try:
            q = q.filter(AuditSchedule.scheduled_date >= date.fromisoformat(date_from))
        except ValueError:
            raise HTTPException(400, f"date_from inválido: '{date_from}'")
    if date_to:
        try:
            q = q.filter(AuditSchedule.scheduled_date <= date.fromisoformat(date_to))
        except ValueError:
            raise HTTPException(400, f"date_to inválido: '{date_to}'")
    if overdue_only:
        q = q.filter(
            AuditSchedule.scheduled_date < date.today(),
            AuditSchedule.status == "Pendiente",
        )

    total       = q.count()
    schedules   = (
        q.order_by(AuditSchedule.scheduled_date.asc(), AuditSchedule.priority.asc())
         .offset((page - 1) * page_size)
         .limit(page_size)
         .all()
    )
    total_pages = ceil(total / page_size) if total > 0 else 1

    return ScheduleListResponse(
        items=[ScheduleResponse.from_orm_with_extras(s) for s in schedules],
        total=total,
        page=page,
        page_size=page_size,
        total_pages=total_pages,
        has_next=page < total_pages,
        has_prev=page > 1,
    )


@router.get("/{schedule_id}", response_model=ScheduleResponse, summary="Detalle de evento")
def get_schedule(
    schedule_id:  int,
    current_user: User    = Depends(get_current_user),
    db:           Session = Depends(get_db),
):
    return ScheduleResponse.from_orm_with_extras(_get_schedule_or_404(schedule_id, db))


@router.post(
    "/",
    response_model=ScheduleResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Crear evento de planificación",
    description="Cualquier usuario autenticado puede crear eventos. "
                "Valida conflictos de fecha/sucursal/tipo antes de guardar.",
)
def create_schedule(
    schedule_in:  ScheduleCreate,
    current_user: User    = Depends(get_current_user),
    db:           Session = Depends(get_db),
):
    # Verificar que el tipo de auditoría existe
    audit_type = db.query(AuditType).filter(
        AuditType.id == schedule_in.audit_type_id
    ).first()
    if not audit_type:
        raise HTTPException(
            404, f"Tipo de auditoría id={schedule_in.audit_type_id} no encontrado."
        )

    # Verificar auditor asignado si se especificó
    if schedule_in.assigned_auditor_id:
        auditor = db.query(User).filter(
            User.id == schedule_in.assigned_auditor_id,
            User.is_active == True,  # noqa: E712
        ).first()
        if not auditor:
            raise HTTPException(
                404,
                f"Usuario id={schedule_in.assigned_auditor_id} no encontrado o inactivo."
            )

    # Verificar conflictos de fecha (advertencia, no bloquea)
    conflict = _check_conflicts(
        db=db,
        branch=schedule_in.branch,
        scheduled_date=schedule_in.scheduled_date,
        audit_type_id=schedule_in.audit_type_id,
    )
    if conflict.has_conflict:
        # Solo advertimos con un log; el frontend puede mostrar el warning
        # Si quisieras bloquear: raise HTTPException(409, conflict.message)
        logger.warning(f"Conflicto detectado al crear schedule: {conflict.message}")

    schedule = AuditSchedule(
        title=schedule_in.title,
        description=schedule_in.description,
        audit_type_id=schedule_in.audit_type_id,
        branch=schedule_in.branch,
        scheduled_date=schedule_in.scheduled_date,
        scheduled_time=schedule_in.scheduled_time,
        priority=schedule_in.priority,
        status="Pendiente",
        assigned_auditor_id=schedule_in.assigned_auditor_id,
        created_by_id=current_user.id,
        notify_days_before=schedule_in.notify_days_before,
        notification_sent=False,
    )
    db.add(schedule)
    db.commit()
    db.refresh(schedule)

    logger.info(
        f"Evento creado: '{schedule.title}' | {schedule.scheduled_date} | "
        f"{schedule.branch} | por '{current_user.email}'"
    )
    return ScheduleResponse.from_orm_with_extras(schedule)


@router.put(
    "/{schedule_id}",
    response_model=ScheduleResponse,
    summary="Editar evento",
)
def update_schedule(
    schedule_id:  int,
    schedule_in:  ScheduleUpdate,
    current_user: User    = Depends(get_current_user),
    db:           Session = Depends(get_db),
):
    schedule = _get_schedule_or_404(schedule_id, db)

    # Solo admin puede editar eventos de otros usuarios
    if not current_user.is_admin and schedule.created_by_id != current_user.id:
        raise HTTPException(
            status.HTTP_403_FORBIDDEN,
            "Solo puedes editar eventos que tú mismo creaste.",
        )

    # Si se cambia fecha/sucursal, verificar conflictos
    new_date   = schedule_in.scheduled_date or schedule.scheduled_date
    new_branch = schedule_in.branch or schedule.branch
    new_type   = schedule_in.audit_type_id or schedule.audit_type_id

    if (schedule_in.scheduled_date or schedule_in.branch or schedule_in.audit_type_id):
        conflict = _check_conflicts(db, new_branch, new_date, new_type, exclude_id=schedule_id)
        if conflict.has_conflict:
            logger.warning(f"Conflicto al editar schedule {schedule_id}: {conflict.message}")

    for field_name, value in schedule_in.model_dump(exclude_unset=True).items():
        setattr(schedule, field_name, value)

    db.commit()
    db.refresh(schedule)
    return ScheduleResponse.from_orm_with_extras(schedule)


@router.delete(
    "/{schedule_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Eliminar evento (admin)",
    description=(
        "Elimina permanentemente un evento. "
        "Solo se permite eliminar eventos con estado Cancelada. "
        "Requiere rol admin."
    ),
)
def delete_schedule(
    schedule_id: int,
    _:           User    = Depends(require_admin),
    db:          Session = Depends(get_db),
):
    schedule = _get_schedule_or_404(schedule_id, db)
    if schedule.status != "Cancelada":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=(
                f"Solo se pueden eliminar eventos Cancelados. "
                f"Estado actual: '{schedule.status}'. "
                f"Cancela el evento primero."
            ),
        )
    title = schedule.title
    db.delete(schedule)
    db.commit()
    logger.info(f"Evento id={schedule_id} '{title}' eliminado permanentemente.")


@router.patch(
    "/{schedule_id}/complete",
    response_model=ScheduleResponse,
    summary="Marcar evento como completado",
    description=(
        "Cambia el status a 'Completada' y opcionalmente vincula la auditoría real. "
        "Si `linked_audit_id` es None, el evento queda marcado como completado "
        "pero sin auditoría vinculada — el frontend debe redirigir al formulario de nueva auditoría."
    ),
)
def complete_schedule(
    schedule_id:  int,
    body:         ScheduleCompleteRequest,
    current_user: User    = Depends(get_current_user),
    db:           Session = Depends(get_db),
):
    schedule = _get_schedule_or_404(schedule_id, db)

    if schedule.status == "Completada":
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST,
            "Este evento ya está marcado como completado.",
        )
    if schedule.status == "Cancelada":
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST,
            "No se puede completar un evento cancelado.",
        )

    # Verificar que la auditoría vinculada existe si se proporcionó
    if body.linked_audit_id:
        from app.models.audit_models import Audit
        audit = db.query(Audit).filter(Audit.id == body.linked_audit_id).first()
        if not audit:
            raise HTTPException(
                404, f"Auditoría id={body.linked_audit_id} no encontrada."
            )
        schedule.linked_audit_id = body.linked_audit_id

    schedule.status = "Completada"
    if body.completion_notes:
        schedule.description = (
            (schedule.description or "") + f"\n[Completado]: {body.completion_notes}"
        ).strip()

    db.commit()
    db.refresh(schedule)

    logger.info(
        f"Evento id={schedule_id} completado por '{current_user.email}' | "
        f"audit_id vinculado: {schedule.linked_audit_id}"
    )
    return ScheduleResponse.from_orm_with_extras(schedule)


@router.patch(
    "/{schedule_id}/cancel",
    response_model=ScheduleResponse,
    summary="Cancelar evento",
)
def cancel_schedule(
    schedule_id:      int,
    cancellation_reason: Optional[str] = Query(None, description="Motivo de cancelación"),
    current_user:     User    = Depends(get_current_user),
    db:               Session = Depends(get_db),
):
    schedule = _get_schedule_or_404(schedule_id, db)

    if schedule.status != "Pendiente":
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST,
            f"Solo se pueden cancelar eventos 'Pendiente'. Estado actual: '{schedule.status}'",
        )

    if not current_user.is_admin and schedule.created_by_id != current_user.id:
        raise HTTPException(
            status.HTTP_403_FORBIDDEN,
            "Solo puedes cancelar eventos que tú mismo creaste.",
        )

    schedule.status = "Cancelada"
    schedule.cancellation_reason = cancellation_reason

    db.commit()
    db.refresh(schedule)
    return ScheduleResponse.from_orm_with_extras(schedule)


@router.patch(
    "/{schedule_id}/reactivate",
    response_model=ScheduleResponse,
    summary="Reactivar evento cancelado",
    description="Cambia el estado de un evento Cancelado a Pendiente.",
)
def reactivate_schedule(
    schedule_id:  int,
    current_user: User    = Depends(get_current_user),
    db:           Session = Depends(get_db),
):
    schedule = _get_schedule_or_404(schedule_id, db)

    if schedule.status != "Cancelada":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Solo se pueden reactivar eventos Cancelados. Estado actual: '{schedule.status}'.",
        )

    schedule.status = "Pendiente"
    schedule.cancellation_reason = None

    db.commit()
    db.refresh(schedule)

    logger.info(
        f"Evento id={schedule_id} '{schedule.title}' reactivado por '{current_user.email}'"
    )
    return ScheduleResponse.from_orm_with_extras(schedule)