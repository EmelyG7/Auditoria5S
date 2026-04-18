"""
schedule_models.py — Modelo para el calendario de planificación de auditorías.

Permite programar auditorías futuras antes de realizarlas.
Cuando una auditoría se marca como 'Completada', se puede vincular
al registro real en la tabla 'audits' mediante linked_audit_id.

Estados del ciclo de vida:
    Pendiente → Completada (crea/vincula un Audit real)
              → Cancelada  (no se realizó)

NOTA DE MIGRACIÓN A POSTGRESQL:
    - Para notificaciones en PG, considera pg_notify o una tabla de jobs.
    - El campo notification_sent es suficiente para un sistema de emails por cron.
"""

from datetime import date, time, datetime
from typing import TYPE_CHECKING, Optional

from sqlalchemy import Boolean, Date, ForeignKey, String, Text, Time
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .base import Base, TimestampMixin

if TYPE_CHECKING:
    from .audit_models import AuditType, Audit
    from .user_models import User


class AuditSchedule(TimestampMixin, Base):
    """
    Evento de planificación de una auditoría futura.

    Ciclo de vida típico:
        1. Se crea con status='Pendiente'
        2. El auditor realiza la auditoría y crea un Audit real
        3. Se actualiza status='Completada' y linked_audit_id apunta al Audit creado
    """
    __tablename__ = "audit_schedule"

    # ── Clave primaria ────────────────────────────────────────────────────────
    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)

    # ── Información del evento ────────────────────────────────────────────────
    title: Mapped[str] = mapped_column(
        String(),
        nullable=False,
        comment="Título del evento, ej: 'Auditoría 5S – Almacén Oficina Principal'",
    )
    description: Mapped[Optional[str]] = mapped_column(
        Text(),
        nullable=True,
        comment="Descripción adicional, instrucciones para el auditor, etc.",
    )

    # ── Tipo de auditoría planificada ─────────────────────────────────────────
    audit_type_id: Mapped[int] = mapped_column(
        ForeignKey("audit_types.id", ondelete="RESTRICT"),
        nullable=False,
        index=True,
    )

    # ── Sucursal y fecha ──────────────────────────────────────────────────────
    branch: Mapped[str] = mapped_column(
        String(),
        nullable=False,
        comment="Sucursal donde se realizará la auditoría",
    )
    scheduled_date: Mapped[date] = mapped_column(
        Date(),
        nullable=False,
        index=True,
        comment="Fecha programada para la auditoría",
    )
    scheduled_time: Mapped[Optional[time]] = mapped_column(
        Time(),
        nullable=True,
        comment="Hora programada (opcional)",
    )

    # ── Prioridad y estado ────────────────────────────────────────────────────
    priority: Mapped[str] = mapped_column(
        String(),
        nullable=False,
        default="Media",
        comment="Prioridad: 'Alta', 'Media', 'Baja'",
    )
    status: Mapped[str] = mapped_column(
        String(),
        nullable=False,
        default="Pendiente",
        index=True,
        comment="Estado: 'Pendiente', 'Completada', 'Cancelada'",
    )

    # ── Asignaciones de usuario ───────────────────────────────────────────────
    assigned_auditor_id: Mapped[Optional[int]] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
        comment="Usuario asignado para realizar la auditoría",
    )
    created_by_id: Mapped[Optional[int]] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
        comment="Usuario que creó el evento de planificación",
    )

    # ── Vinculación con auditoría real (al completar) ─────────────────────────
    linked_audit_id: Mapped[Optional[int]] = mapped_column(
        ForeignKey("audits.id", ondelete="SET NULL"),
        nullable=True,
        comment="ID del Audit real creado al marcar este evento como Completado",
    )

    # ── Notificaciones ────────────────────────────────────────────────────────
    notification_sent: Mapped[bool] = mapped_column(
        Boolean(),
        default=False,
        nullable=False,
        comment="True si ya se envió la notificación de recordatorio",
    )
    notify_days_before: Mapped[int] = mapped_column(
        nullable=False,
        default=2,
        comment="Cuántos días antes enviar la notificación de recordatorio",
    )

    # ── Notas de cancelación ──────────────────────────────────────────────────
    cancellation_reason: Mapped[Optional[str]] = mapped_column(
        Text(),
        nullable=True,
        comment="Motivo de cancelación (solo aplica cuando status='Cancelada')",
    )

    # ── Relaciones ────────────────────────────────────────────────────────────
    audit_type: Mapped["AuditType"] = relationship(
        "AuditType",
        back_populates="schedules",
        lazy="joined",
    )
    assigned_auditor: Mapped[Optional["User"]] = relationship(
        "User",
        back_populates="assigned_schedules",
        foreign_keys=[assigned_auditor_id],
        lazy="joined",
    )
    created_by_user: Mapped[Optional["User"]] = relationship(
        "User",
        back_populates="created_schedules",
        foreign_keys=[created_by_id],
        lazy="select",
    )
    linked_audit: Mapped[Optional["Audit"]] = relationship(
        "Audit",
        foreign_keys=[linked_audit_id],
        lazy="select",
    )

    def __repr__(self) -> str:
        return (
            f"<AuditSchedule id={self.id} title='{self.title}' "
            f"date='{self.scheduled_date}' status='{self.status}'>"
        )

    @property
    def is_overdue(self) -> bool:
        """True si la fecha programada ya pasó y sigue Pendiente."""
        if self.status != "Pendiente":
            return False
        return self.scheduled_date < date.today()

    @property
    def days_until_scheduled(self) -> Optional[int]:
        """Días que faltan para la auditoría (negativo si ya pasó)."""
        if self.scheduled_date is None:
            return None
        delta = self.scheduled_date - date.today()
        return delta.days