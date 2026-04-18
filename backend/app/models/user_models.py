"""
user_models.py — Modelo de usuarios y roles.

Roles disponibles:
    - 'admin'  : Acceso total (CRUD, eliminar, gestionar usuarios).
    - 'auditor': Puede crear/editar auditorías y ver dashboards. No elimina ni gestiona usuarios.

NOTA DE MIGRACIÓN A POSTGRESQL:
    - String() sin longitud = TEXT en ambos motores. Compatible.
    - password_hash: se guarda el hash bcrypt (siempre 60 chars), String() es suficiente.
    - Para producción en PostgreSQL considera añadir un índice único en email
      (ya está declarado con unique=True en la columna).
"""

from typing import TYPE_CHECKING, List, Optional
from sqlalchemy import Boolean, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .base import Base, TimestampMixin

if TYPE_CHECKING:
    # Importaciones diferidas para evitar ciclos circulares.
    # Solo se usan para anotaciones de tipo, no en tiempo de ejecución.
    from .schedule_models import AuditSchedule


class User(TimestampMixin, Base):
    __tablename__ = "users"

    # ── Clave primaria ────────────────────────────────────────────────────────
    id: Mapped[int] = mapped_column(primary_key=True, index=True, autoincrement=True)

    # ── Campos de identidad ───────────────────────────────────────────────────
    email: Mapped[str] = mapped_column(
        String(),
        unique=True,
        index=True,
        nullable=False,
        comment="Email único del usuario, usado como login",
    )
    full_name: Mapped[str] = mapped_column(
        String(),
        nullable=False,
        comment="Nombre completo para mostrar en reportes y dashboards",
    )
    password_hash: Mapped[str] = mapped_column(
        String(),
        nullable=False,
        comment="Hash bcrypt de la contraseña. NUNCA guardar la contraseña en texto plano.",
    )

    # ── Rol y estado ──────────────────────────────────────────────────────────
    role: Mapped[str] = mapped_column(
        String(),
        default="auditor",
        nullable=False,
        comment="Rol del usuario: 'admin' o 'auditor'",
    )
    is_active: Mapped[bool] = mapped_column(
        Boolean(),
        default=True,
        nullable=False,
        comment="Soft-delete: False deshabilita el acceso sin borrar el registro",
    )

    # ── Relaciones ────────────────────────────────────────────────────────────
    # Un usuario puede tener muchos eventos de planificación asignados
    assigned_schedules: Mapped[List["AuditSchedule"]] = relationship(
        "AuditSchedule",
        back_populates="assigned_auditor",
        foreign_keys="AuditSchedule.assigned_auditor_id",
        lazy="select",
    )
    # Un usuario puede haber creado muchos eventos de planificación
    created_schedules: Mapped[List["AuditSchedule"]] = relationship(
        "AuditSchedule",
        back_populates="created_by_user",
        foreign_keys="AuditSchedule.created_by_id",
        lazy="select",
    )

    def __repr__(self) -> str:
        return f"<User id={self.id} email='{self.email}' role='{self.role}'>"

    @property
    def is_admin(self) -> bool:
        return self.role == "admin"