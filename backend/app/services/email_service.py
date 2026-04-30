"""
backend/app/services/email_service.py

Servicio de correo electrónico para notificaciones del sistema.

Funcionalidades:
  - Recordatorios de auditorías próximas (configurable: 1, 3, 7 días antes)
  - Notificación cuando se crea un evento de calendario
  - Notificación cuando se completa una auditoría

Configuración (variables de entorno en .env):
  SMTP_HOST       — servidor SMTP (ej: smtp.gmail.com)
  SMTP_PORT       — puerto (587 para TLS, 465 para SSL, 25 sin cifrado)
  SMTP_USER       — usuario/email del remitente
  SMTP_PASSWORD   — contraseña o app password
  SMTP_FROM       — dirección "De:" (puede diferir del usuario)
  SMTP_TLS        — True/False (usar STARTTLS)
  NOTIFICATIONS_ENABLED — True/False (deshabilitar en desarrollo)

Para Gmail:
  - Activar "Contraseñas de aplicación" en la cuenta de Google
  - SMTP_HOST=smtp.gmail.com, SMTP_PORT=587, SMTP_TLS=True

Para Outlook/Office365:
  - SMTP_HOST=smtp.office365.com, SMTP_PORT=587, SMTP_TLS=True
"""

import logging
import smtplib
from datetime import date, datetime, timedelta
from email.mime.multipart import MIMEMultipart
from email.mime.text       import MIMEText
from typing                import List, Optional

from sqlalchemy.orm import Session

from app.core.config         import settings   # ajusta el import a tu estructura
from app.models.schedule_models import AuditSchedule
from app.models.user_models  import User

logger = logging.getLogger(__name__)


# ─── Template HTML de email ───────────────────────────────────────────────────

def _html_reminder(
    event_title:  str,
    branch:       str,
    audit_type:   str,
    scheduled_date: str,
    scheduled_time: Optional[str],
    auditor_name: Optional[str],
    days_until:   int,
    app_url:      str = "",
) -> str:
    urgency_color = (
        "#DF4585" if days_until == 0 else
        "#EA9947" if days_until <= 2 else
        "#0A4F79"
    )
    urgency_text = (
        "¡Hoy!" if days_until == 0 else
        f"Mañana ({scheduled_date})" if days_until == 1 else
        f"En {days_until} días ({scheduled_date})"
    )

    hora_html = f"<p style='margin:4px 0;color:#555;font-size:14px;'>Hora: <b>{scheduled_time}</b></p>" if scheduled_time else ""
    auditor_html = f"<p style='margin:4px 0;color:#555;font-size:14px;'>Auditor: <b>{auditor_name}</b></p>" if auditor_name else ""
    link_html = f"<a href='{app_url}/schedule' style='display:inline-block;margin-top:16px;padding:10px 24px;background:#0A4F79;color:white;text-decoration:none;border-radius:8px;font-size:14px;font-weight:600;'>Ver Calendario</a>" if app_url else ""

    return f"""
<!DOCTYPE html>
<html lang="es">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin:0;padding:0;font-family:'Segoe UI',Arial,sans-serif;background-color:#F0EDE8;">
  <div style="max-width:560px;margin:32px auto;background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.08);">
    <!-- Header -->
    <div style="background:linear-gradient(135deg,#0A4F79,#185F9A);padding:24px 32px;">
      <p style="margin:0;color:rgba(255,255,255,0.7);font-size:12px;text-transform:uppercase;letter-spacing:0.1em;">Sistema de Auditorías 5S</p>
      <h1 style="margin:8px 0 0;color:#fff;font-size:20px;font-weight:600;">Recordatorio de Auditoría</h1>
    </div>

    <!-- Cuerpo -->
    <div style="padding:24px 32px;">
      <!-- Urgencia -->
      <div style="background:{urgency_color}15;border-left:4px solid {urgency_color};border-radius:0 8px 8px 0;padding:12px 16px;margin-bottom:20px;">
        <p style="margin:0;font-weight:700;color:{urgency_color};font-size:15px;">{urgency_text}</p>
      </div>

      <!-- Datos del evento -->
      <h2 style="margin:0 0 16px;color:#1E1E2F;font-size:17px;font-weight:600;">{event_title}</h2>

      <div style="background:#F8F7F5;border-radius:10px;padding:16px;margin-bottom:20px;">
        <p style="margin:0 0 6px;color:#555;font-size:14px;">Tipo: <b>{audit_type}</b></p>
        <p style="margin:4px 0;color:#555;font-size:14px;">Sucursal: <b>{branch}</b></p>
        <p style="margin:4px 0;color:#555;font-size:14px;">Fecha: <b>{scheduled_date}</b></p>
        {hora_html}
        {auditor_html}
      </div>

      <p style="color:#666;font-size:13px;line-height:1.6;">
        Este es un recordatorio automático del sistema de gestión de auditorías 5S.
        Por favor, asegúrate de tener listos los materiales y el personal necesario.
      </p>

      {link_html}
    </div>

    <!-- Footer -->
    <div style="background:#F5F5F5;padding:16px 32px;text-align:center;">
      <p style="margin:0;color:#999;font-size:11px;">
        Sistema de Auditorías 5S · Notificación automática<br>
        Para no recibir estos correos, contacta al administrador del sistema.
      </p>
    </div>
  </div>
</body>
</html>
"""


def _html_audit_completed(
    event_title:    str,
    branch:         str,
    audit_type:     str,
    audit_date:     str,
    auditor_name:   Optional[str],
    score_pct:      Optional[float],
    app_url:        str = "",
) -> str:
    score_html = ""
    if score_pct is not None:
        color = "#98C062" if score_pct >= 80 else "#EA9947" if score_pct >= 60 else "#DF4585"
        label = "Cumple" if score_pct >= 80 else "Por mejorar" if score_pct >= 60 else "Crítico"
        score_html = f"""
        <div style="text-align:center;margin:20px 0;">
          <p style="font-size:40px;font-weight:700;color:{color};margin:0;">{score_pct:.1f}%</p>
          <span style="background:{color}20;color:{color};font-size:12px;font-weight:600;
                       padding:4px 12px;border-radius:99px;border:1px solid {color}40;">{label}</span>
        </div>
        """

    link_html = f"<a href='{app_url}/audits' style='display:inline-block;margin-top:16px;padding:10px 24px;background:#98C062;color:white;text-decoration:none;border-radius:8px;font-size:14px;font-weight:600;'>Ver Auditoría</a>" if app_url else ""

    return f"""
<!DOCTYPE html>
<html lang="es">
<head><meta charset="UTF-8"></head>
<body style="margin:0;padding:0;font-family:'Segoe UI',Arial,sans-serif;background-color:#F0EDE8;">
  <div style="max-width:560px;margin:32px auto;background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.08);">
    <div style="background:linear-gradient(135deg,#98C062,#6aaa3a);padding:24px 32px;">
      <p style="margin:0;color:rgba(255,255,255,0.8);font-size:12px;text-transform:uppercase;letter-spacing:0.1em;">Auditoría Completada ✓</p>
      <h1 style="margin:8px 0 0;color:#fff;font-size:20px;font-weight:600;">Auditoría 5S Registrada</h1>
    </div>
    <div style="padding:24px 32px;">
      <h2 style="margin:0 0 16px;color:#1E1E2F;font-size:17px;">{event_title}</h2>
      <div style="background:#F8F7F5;border-radius:10px;padding:16px;margin-bottom:16px;">
        <p style="margin:0 0 6px;color:#555;font-size:14px;">Tipo: <b>{audit_type}</b></p>
        <p style="margin:4px 0;color:#555;font-size:14px;">Sucursal: <b>{branch}</b></p>
        <p style="margin:4px 0;color:#555;font-size:14px;">Fecha: <b>{audit_date}</b></p>
        {"<p style='margin:4px 0;color:#555;font-size:14px;'>Auditor: <b>" + auditor_name + "</b></p>" if auditor_name else ""}
      </div>
      {score_html}
      {link_html}
    </div>
    <div style="background:#F5F5F5;padding:16px 32px;text-align:center;">
      <p style="margin:0;color:#999;font-size:11px;">Sistema de Auditorías 5S · Notificación automática</p>
    </div>
  </div>
</body>
</html>
"""


# ─── Envío de email ───────────────────────────────────────────────────────────

def _send_email(
    to_addresses: List[str],
    subject:      str,
    html_body:    str,
    text_body:    str = "",
) -> bool:
    """
    Envía un email HTML. Retorna True si fue exitoso.
    Captura todas las excepciones para no romper el flujo principal.
    """
    if not getattr(settings, "NOTIFICATIONS_ENABLED", False):
        logger.info(f"[EMAIL DESHABILITADO] Para: {to_addresses} | Asunto: {subject}")
        return True  # simular éxito en desarrollo

    smtp_host     = getattr(settings, "SMTP_HOST",     "")
    smtp_port     = getattr(settings, "SMTP_PORT",     587)
    smtp_user     = getattr(settings, "SMTP_USER",     "")
    smtp_password = getattr(settings, "SMTP_PASSWORD", "")
    smtp_from     = getattr(settings, "SMTP_FROM",     smtp_user)
    smtp_tls      = getattr(settings, "SMTP_TLS",      True)

    if not smtp_host or not smtp_user:
        logger.warning("SMTP no configurado. Email no enviado.")
        return False

    msg = MIMEMultipart("alternative")
    msg["Subject"] = subject
    msg["From"]    = f"Sistema Auditorías 5S <{smtp_from}>"
    msg["To"]      = ", ".join(to_addresses)

    if text_body:
        msg.attach(MIMEText(text_body, "plain", "utf-8"))
    msg.attach(MIMEText(html_body, "html", "utf-8"))

    try:
        with smtplib.SMTP(smtp_host, smtp_port, timeout=10) as server:
            if smtp_tls:
                server.starttls()
            if smtp_password:
                server.login(smtp_user, smtp_password)
            server.sendmail(smtp_from, to_addresses, msg.as_string())
        logger.info(f"Email enviado → {to_addresses} | {subject}")
        return True
    except smtplib.SMTPAuthenticationError:
        logger.error("SMTP: Error de autenticación. Verifica SMTP_USER y SMTP_PASSWORD.")
    except smtplib.SMTPConnectError:
        logger.error(f"SMTP: No se pudo conectar a {smtp_host}:{smtp_port}.")
    except Exception as e:
        logger.error(f"SMTP: Error inesperado al enviar email: {e}")
    return False


# ─── API pública del servicio ─────────────────────────────────────────────────

def send_event_reminder(
    event:        AuditSchedule,
    auditor_email: Optional[str],
    audit_type_name: str = "",
    app_url:      str   = "",
) -> bool:
    """
    Envía recordatorio de auditoría próxima al auditor asignado.
    Se llama desde el endpoint /schedule/reminders o desde un job programado.
    """
    if not auditor_email:
        logger.warning(f"Evento id={event.id}: sin email de auditor, recordatorio omitido.")
        return False

    days = (event.scheduled_date - date.today()).days if event.scheduled_date else None
    if days is None or days < 0:
        return False

    scheduled_str = event.scheduled_date.strftime("%d/%m/%Y") if event.scheduled_date else "—"
    time_str      = str(event.scheduled_time)[:5] if event.scheduled_time else None

    html = _html_reminder(
        event_title    = event.title or "Auditoría 5S",
        branch         = event.branch or "—",
        audit_type     = audit_type_name,
        scheduled_date = scheduled_str,
        scheduled_time = time_str,
        auditor_name   = event.assigned_auditor_name,
        days_until     = days,
        app_url        = app_url,
    )

    subject = (
        f"[Hoy] Auditoría 5S: {event.branch or event.title}" if days == 0 else
        f"[Mañana] Auditoría 5S: {event.branch or event.title}" if days == 1 else
        f"[En {days} días] Auditoría 5S: {event.branch or event.title}"
    )

    return _send_email(
        to_addresses=[auditor_email],
        subject=subject,
        html_body=html,
        text_body=f"Recordatorio: {event.title} — {scheduled_str} en {event.branch or '—'}",
    )


def send_audit_completed_notification(
    event_title:  str,
    branch:       str,
    audit_type:   str,
    audit_date:   str,
    auditor_name: Optional[str],
    score_pct:    Optional[float],
    notify_emails: List[str],
    app_url:      str = "",
) -> bool:
    """
    Notifica a los administradores/interesados que una auditoría fue completada.
    """
    if not notify_emails:
        return False

    html = _html_audit_completed(
        event_title  = event_title,
        branch       = branch,
        audit_type   = audit_type,
        audit_date   = audit_date,
        auditor_name = auditor_name,
        score_pct    = score_pct,
        app_url      = app_url,
    )

    return _send_email(
        to_addresses=notify_emails,
        subject=f"Auditoría completada: {branch} — {audit_type}",
        html_body=html,
        text_body=f"Auditoría completada: {audit_type} en {branch} ({audit_date}).",
    )


# ─── Job de recordatorios (llamar desde un endpoint o APScheduler) ─────────────

def run_scheduled_reminders(
    db:          Session,
    days_ahead:  List[int] = [1, 3, 7],
    app_url:     str       = "",
) -> dict:
    """
    Recorre los eventos pendientes y envía recordatorios a los auditores
    cuyo scheduled_date coincide con today + N días.

    Retorna un resumen: { "enviados": N, "omitidos": M, "errores": K }

    Llamar desde:
      - Endpoint POST /schedule/send-reminders  (manual, solo admin)
      - APScheduler o Celery Beat (automático, diario a las 08:00)
      - Windows Task Scheduler / cron apuntando al endpoint
    """
    today = date.today()
    target_dates = [today + timedelta(days=d) for d in days_ahead]

    events = (
        db.query(AuditSchedule)
        .filter(
            AuditSchedule.status       == "Pendiente",
            AuditSchedule.scheduled_date.in_(target_dates),
        )
        .all()
    )

    enviados = omitidos = errores = 0

    for ev in events:
        # Resolver email del auditor asignado
        email = None
        if ev.assigned_auditor_id:
            u = db.query(User).filter(User.id == ev.assigned_auditor_id).first()
            if u:
                email = u.email

        # Nombre del tipo de auditoría (si tienes relación, ajusta)
        audit_type_name = getattr(ev, "audit_type_name", "") or ""

        if not email:
            omitidos += 1
            logger.debug(f"Evento id={ev.id}: sin auditor o email, omitido.")
            continue

        ok = send_event_reminder(ev, email, audit_type_name, app_url)
        if ok:
            enviados += 1
        else:
            errores += 1

    logger.info(
        f"Recordatorios enviados: {enviados} ok · {omitidos} omitidos · {errores} errores"
    )
    return {"enviados": enviados, "omitidos": omitidos, "errores": errores}