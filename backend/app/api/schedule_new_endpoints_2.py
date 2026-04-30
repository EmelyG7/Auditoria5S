"""
Nuevos endpoints para agregar a backend/app/api/schedule.py

Endpoints:
  GET  /schedule/upcoming          — auditorías próximas (0–7 días) para el widget del Home
  POST /schedule/send-reminders    — envía recordatorios por email (solo admin)
"""

from datetime  import date, timedelta
from typing    import List, Optional

from fastapi   import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.core.database         import get_db
from app.core.dependencies     import get_current_user, require_admin
from app.models.schedule_models import AuditSchedule
from app.models.user_models    import User
from app.services.email_service import run_scheduled_reminders
import logging

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/schedule", tags=["Calendario"])


# ─────────────────────────────────────────────────────────────────────────────
# GET /schedule/upcoming
# ─────────────────────────────────────────────────────────────────────────────

@router.get(
    "/upcoming",
    summary="Auditorías próximas para el widget del Home",
    description=(
        "Retorna eventos Pendientes cuya scheduled_date está entre hoy "
        "y los próximos `days` días (default 7). "
        "Usado por el widget de HomePage."
    ),
)
def get_upcoming_events(
    days:         int     = Query(7, ge=1, le=30, description="Horizonte en días"),
    current_user: User    = Depends(get_current_user),
    db:           Session = Depends(get_db),
):
    today    = date.today()
    deadline = today + timedelta(days=days)

    events = (
        db.query(AuditSchedule)
        .filter(
            AuditSchedule.status == "Pendiente",
            AuditSchedule.scheduled_date >= today,
            AuditSchedule.scheduled_date <= deadline,
        )
        .order_by(AuditSchedule.scheduled_date.asc(), AuditSchedule.priority.asc())
        .all()
    )

    # Enriquecer con datos del auditor asignado
    result = []
    for ev in events:
        auditor_name  = None
        auditor_email = None
        if ev.assigned_auditor_id:
            u = db.query(User).filter(User.id == ev.assigned_auditor_id).first()
            if u:
                auditor_name  = u.full_name
                auditor_email = u.email

        days_until = (ev.scheduled_date - today).days

        result.append({
            "id":                    ev.id,
            "title":                 ev.title,
            "branch":                ev.branch,
            "audit_type_id":         ev.audit_type_id,
            "scheduled_date":        str(ev.scheduled_date) if ev.scheduled_date else None,
            "scheduled_time":        str(ev.scheduled_time)[:5] if ev.scheduled_time else None,
            "priority":              ev.priority,
            "status":                ev.status,
            "assigned_auditor_id":   ev.assigned_auditor_id,
            "assigned_auditor_name": auditor_name,
            "assigned_auditor_email":auditor_email,
            "days_until":            days_until,
        })

    return {
        "total":  len(result),
        "days":   days,
        "events": result,
    }


# ─────────────────────────────────────────────────────────────────────────────
# POST /schedule/send-reminders
# ─────────────────────────────────────────────────────────────────────────────

@router.post(
    "/send-reminders",
    summary="Enviar recordatorios por email (admin)",
    description=(
        "Recorre los eventos Pendientes para los próximos `days_ahead` días "
        "y envía un email de recordatorio a cada auditor asignado. "
        "Solo accesible para administradores.\n\n"
        "**Uso automático:** Puedes llamar a este endpoint diariamente "
        "desde Windows Task Scheduler o cron:\n"
        "```\ncurl -X POST https://tu-dominio.com/api/v1/schedule/send-reminders "
        "-H 'Authorization: Bearer <token>'\n```"
    ),
)
def send_reminders(
    days_ahead: List[int] = Query(
        [1, 3, 7],
        description="Días de anticipación para los que enviar recordatorios. "
                    "Ej: [1,3,7] envía si faltan 1, 3 o 7 días."
    ),
    app_url:    str       = Query("", description="URL base de la app (para links en el email)"),
    _:          User      = Depends(require_admin),
    db:         Session   = Depends(get_db),
):
    result = run_scheduled_reminders(db=db, days_ahead=days_ahead, app_url=app_url)
    return {
        "message": (
            f"Recordatorios procesados: {result['enviados']} enviados, "
            f"{result['omitidos']} omitidos, {result['errores']} errores."
        ),
        **result,
    }