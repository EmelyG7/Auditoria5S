"""
backend/app/models/task_attachment_models.py

Modelos adicionales para tareas:
  TaskAttachment    — archivo adjunto a una tarea
  TaskActivity      — registro de actividad/historial de cambios
  TaskRelation      — relaciones entre tareas (depende de, bloquea, etc)
  TaskCustomField   — campos personalizados por proyecto
  TaskCustomValue   — valores de campos personalizados por tarea
"""

from datetime import datetime, date
from decimal import Decimal
from typing import Optional

from sqlalchemy import (
    Boolean, Date, DateTime, ForeignKey, Integer,
    String, Text, UniqueConstraint, func, Numeric,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .base import Base, TimestampMixin


# ─── Enums ────────────────────────────────────────────────────────────────────

class RelationType:
    DEPENDS_ON = "depends_on"      # Esta tarea depende de
    BLOCKS     = "blocks"          # Esta tarea bloquea
    RELATES_TO = "relates_to"      # Esta tarea se relaciona con
    DUPLICATES = "duplicates"      # Esta tarea duplica
    IS_SUBTASK_OF = "is_subtask_of"


class ActivityAction:
    CREATED      = "created"
    UPDATED      = "updated"
    STATUS_CHANGED = "status_changed"
    ASSIGNED     = "assigned"
    UNASSIGNED   = "unassigned"
    COMMENTED    = "commented"
    ATTACHED     = "attached"
    TIME_LOGGED  = "time_logged"
    LABEL_ADDED  = "label_added"
    LABEL_REMOVED = "label_removed"
    MOVED        = "moved"         # Movido entre columnas
    CUSTOM_FIELD_CHANGED = "custom_field_changed"


class CustomFieldType:
    TEXT     = "text"
    NUMBER   = "number"
    SELECT   = "select"
    DATE     = "date"
    CHECKBOX = "checkbox"
    TEXTAREA = "textarea"


# ─── Modelos ──────────────────────────────────────────────────────────────────

class TaskAttachment(TimestampMixin, Base):
    """Archivo adjunto a una tarea."""
    __tablename__ = "task_attachments"

    id:       Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    task_id:  Mapped[int] = mapped_column(ForeignKey("tasks.id", ondelete="CASCADE"), nullable=False, index=True)
    user_id:  Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), nullable=True)

    file_name:     Mapped[str]           = mapped_column(String(255), nullable=False)
    file_path:     Mapped[str]           = mapped_column(String(500), nullable=False, comment="Ruta en storage (S3, local, etc)")
    file_size:     Mapped[int]           = mapped_column(Integer, nullable=False, comment="Tamaño en bytes")
    file_type:     Mapped[str]           = mapped_column(String(50), nullable=False, comment="MIME type")
    
    # Para referencia cruzada (URL pública si aplica)
    file_url:      Mapped[Optional[str]] = mapped_column(String(500), nullable=True)

    task: Mapped["Task"] = relationship("Task")
    user: Mapped[Optional["User"]] = relationship("User")

    def __repr__(self) -> str:
        return f"<TaskAttachment id={self.id} file='{self.file_name}'>"


class TaskActivity(TimestampMixin, Base):
    """Historial de cambios/actividad en una tarea."""
    __tablename__ = "task_activities"

    id:       Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    task_id:  Mapped[int] = mapped_column(ForeignKey("tasks.id", ondelete="CASCADE"), nullable=False, index=True)
    user_id:  Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), nullable=True)

    action:   Mapped[str] = mapped_column(String(50), nullable=False, index=True, comment="Ver ActivityAction")
    
    # Para cambios de campo (ej: status_changed)
    field_name:  Mapped[Optional[str]] = mapped_column(String(100), nullable=True, comment="Campo que cambió")
    old_value:   Mapped[Optional[str]] = mapped_column(Text, nullable=True, comment="Valor anterior")
    new_value:   Mapped[Optional[str]] = mapped_column(Text, nullable=True, comment="Valor nuevo")
    
    # Para comentarios inline
    related_id:  Mapped[Optional[int]] = mapped_column(Integer, nullable=True, comment="ID relacionado (comment_id, user_id, etc)")
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    task: Mapped["Task"] = relationship("Task")
    user: Mapped[Optional["User"]] = relationship("User")

    def __repr__(self) -> str:
        return f"<TaskActivity id={self.id} action='{self.action}'>"


class TaskRelation(Base):
    """Relación entre tareas (depende, bloquea, etc)."""
    __tablename__ = "task_relations"

    id:            Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    source_task_id:Mapped[int] = mapped_column(ForeignKey("tasks.id", ondelete="CASCADE"), nullable=False, index=True)
    target_task_id:Mapped[int] = mapped_column(ForeignKey("tasks.id", ondelete="CASCADE"), nullable=False, index=True)

    relation_type: Mapped[str] = mapped_column(String(30), nullable=False, comment="Ver RelationType")
    description:   Mapped[Optional[str]] = mapped_column(String(300), nullable=True)
    created_at:    Mapped[datetime] = mapped_column(DateTime, server_default=func.now())

    source_task: Mapped[Optional["Task"]] = relationship("Task", foreign_keys="[TaskRelation.source_task_id]")
    target_task: Mapped[Optional["Task"]] = relationship("Task", foreign_keys="[TaskRelation.target_task_id]")

    __table_args__ = (
        UniqueConstraint("source_task_id", "target_task_id", "relation_type", name="uq_task_relation"),
    )

    def __repr__(self) -> str:
        return f"<TaskRelation {self.source_task_id} -{self.relation_type}-> {self.target_task_id}>"


class TaskCustomField(TimestampMixin, Base):
    """Definición de campo personalizado en un proyecto."""
    __tablename__ = "task_custom_fields"

    id:         Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    project_id: Mapped[int] = mapped_column(ForeignKey("projects.id", ondelete="CASCADE"), nullable=False, index=True)
    
    name:       Mapped[str] = mapped_column(String(100), nullable=False)
    description:Mapped[Optional[str]] = mapped_column(String(300), nullable=True)
    field_type: Mapped[str] = mapped_column(String(20), nullable=False, comment="Ver CustomFieldType")
    
    # Para tipo SELECT: opciones separadas por |
    options:    Mapped[Optional[str]] = mapped_column(String(500), nullable=True, comment="opción1|opción2|opción3")
    
    is_required:Mapped[bool] = mapped_column(Boolean, default=False)
    order:      Mapped[int] = mapped_column(Integer, default=0)
    is_active:  Mapped[bool] = mapped_column(Boolean, default=True)

    project: Mapped["Project"] = relationship("Project")

    def __repr__(self) -> str:
        return f"<TaskCustomField id={self.id} name='{self.name}' type='{self.field_type}'>"


class TaskCustomValue(Base):
    """Valor de un campo personalizado para una tarea específica."""
    __tablename__ = "task_custom_values"

    id:       Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    task_id:  Mapped[int] = mapped_column(ForeignKey("tasks.id", ondelete="CASCADE"), nullable=False, index=True)
    field_id: Mapped[int] = mapped_column(ForeignKey("task_custom_fields.id", ondelete="CASCADE"), nullable=False, index=True)
    
    value:    Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    updated_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now(), onupdate=func.now())

    task:  Mapped["Task"] = relationship("Task")
    field: Mapped["TaskCustomField"] = relationship("TaskCustomField")

    __table_args__ = (
        UniqueConstraint("task_id", "field_id", name="uq_task_custom_value"),
    )

    def __repr__(self) -> str:
        return f"<TaskCustomValue task_id={self.task_id} field_id={self.field_id}>"
