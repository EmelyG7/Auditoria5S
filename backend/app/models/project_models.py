"""
backend/app/models/project_models.py

Modelos SQLAlchemy para el módulo de gestión de proyectos.

Estructura:
  Project          — proyecto (privado/público, con miembros)
  ProjectMember    — relación usuario ↔ proyecto (con rol)
  Sprint           — sprint del proyecto
  Board            — tablero Kanban del proyecto
  BoardColumn      — columna del tablero (Backlog, En progreso, etc.)
  Task             — tarea (puede estar en sprint y/o columna)
  TaskAssignee     — relación tarea ↔ usuario asignado
  TaskLabel        — etiquetas de tareas
  TaskComment      — comentarios en tareas
  TimeLog          — registro de tiempo real trabajado en una tarea
  ProjectAuditLink — vínculo opcional entre proyecto y auditoría
"""

from datetime  import datetime, date
from decimal   import Decimal
from typing    import Optional

from sqlalchemy import (
    Boolean, Date, DateTime, ForeignKey, Integer,
    Numeric, String, Text, UniqueConstraint, func,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .base import Base, TimestampMixin   # ajusta al import de tu proyecto


# ─── Enums como constantes ────────────────────────────────────────────────────

class ProjectStatus:
    ACTIVE    = "activo"
    PAUSED    = "pausado"
    COMPLETED = "completado"
    ARCHIVED  = "archivado"

class ProjectVisibility:
    PUBLIC  = "publico"
    PRIVATE = "privado"

class MemberRole:
    OWNER    = "owner"
    MANAGER  = "manager"
    MEMBER   = "member"
    VIEWER   = "viewer"

class SprintStatus:
    PLANNED  = "planificado"
    ACTIVE   = "activo"
    COMPLETED = "completado"

class TaskStatus:
    BACKLOG     = "backlog"
    TODO        = "por_hacer"
    IN_PROGRESS = "en_progreso"
    IN_REVIEW   = "en_revision"
    DONE        = "completada"
    CANCELLED   = "cancelada"

class TaskPriority:
    CRITICAL = "critica"
    HIGH     = "alta"
    MEDIUM   = "media"
    LOW      = "baja"

class TaskType:
    STORY  = "historia"
    TASK   = "tarea"
    BUG    = "bug"
    EPIC   = "epic"
    IMPROVEMENT = "mejora"


# ─── Modelos ──────────────────────────────────────────────────────────────────

class Project(TimestampMixin, Base):
    """Proyecto. Puede ser público (todos lo ven) o privado (solo miembros)."""
    __tablename__ = "projects"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)

    name:        Mapped[str]           = mapped_column(String(200), nullable=False, index=True)
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    key:         Mapped[str]           = mapped_column(
        String(10), nullable=False, unique=True,
        comment="Clave corta tipo Jira (AUDIT, MEJ, etc.) para ID de tareas"
    )

    status:     Mapped[str] = mapped_column(String(20), nullable=False, default=ProjectStatus.ACTIVE, index=True)
    visibility: Mapped[str] = mapped_column(String(20), nullable=False, default=ProjectVisibility.PRIVATE)

    # Fechas del proyecto
    start_date: Mapped[Optional[date]] = mapped_column(Date, nullable=True)
    end_date:   Mapped[Optional[date]] = mapped_column(Date, nullable=True)

    # Colores/ícono para UI
    color: Mapped[Optional[str]] = mapped_column(String(7),  nullable=True, default="#0A4F79", comment="HEX color")
    icon:  Mapped[Optional[str]] = mapped_column(String(50), nullable=True, default="folder")

    # Propietario del proyecto
    owner_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="RESTRICT"), nullable=False, index=True
    )

    # Contador de tareas para generar IDs tipo "AUDIT-42"
    task_counter: Mapped[int] = mapped_column(Integer, nullable=False, default=0)

    # Relaciones
    owner:       Mapped["User"]                  = relationship("User", foreign_keys=[owner_id])
    members:     Mapped[list["ProjectMember"]]   = relationship("ProjectMember",  back_populates="project", cascade="all, delete-orphan")
    sprints:     Mapped[list["Sprint"]]          = relationship("Sprint",         back_populates="project", cascade="all, delete-orphan", order_by="Sprint.start_date")
    board:       Mapped[Optional["Board"]]       = relationship("Board",          back_populates="project", uselist=False, cascade="all, delete-orphan")
    tasks:       Mapped[list["Task"]]            = relationship("Task",           back_populates="project", cascade="all, delete-orphan")
    audit_links: Mapped[list["ProjectAuditLink"]]= relationship("ProjectAuditLink", back_populates="project", cascade="all, delete-orphan")

    def __repr__(self) -> str:
        return f"<Project id={self.id} key='{self.key}' name='{self.name}'>"


class ProjectMember(Base):
    """Relación usuario ↔ proyecto con rol."""
    __tablename__ = "project_members"

    id:         Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    project_id: Mapped[int] = mapped_column(ForeignKey("projects.id", ondelete="CASCADE"), nullable=False, index=True)
    user_id:    Mapped[int] = mapped_column(ForeignKey("users.id",    ondelete="CASCADE"), nullable=False, index=True)
    role:       Mapped[str] = mapped_column(String(20), nullable=False, default=MemberRole.MEMBER)
    joined_at:  Mapped[datetime] = mapped_column(DateTime, server_default=func.now())

    project: Mapped["Project"] = relationship("Project", back_populates="members")
    user:    Mapped["User"]    = relationship("User")

    __table_args__ = (
        UniqueConstraint("project_id", "user_id", name="uq_project_member"),
    )


class Sprint(TimestampMixin, Base):
    """Sprint de un proyecto."""
    __tablename__ = "sprints"

    id:         Mapped[int]           = mapped_column(primary_key=True, autoincrement=True)
    project_id: Mapped[int]           = mapped_column(ForeignKey("projects.id", ondelete="CASCADE"), nullable=False, index=True)
    name:       Mapped[str]           = mapped_column(String(100), nullable=False)
    goal:       Mapped[Optional[str]] = mapped_column(Text, nullable=True, comment="Objetivo del sprint")
    status:     Mapped[str]           = mapped_column(String(20),  nullable=False, default=SprintStatus.PLANNED, index=True)

    start_date: Mapped[Optional[date]] = mapped_column(Date, nullable=True)
    end_date:   Mapped[Optional[date]] = mapped_column(Date, nullable=True)

    # Velocidad planificada vs real (en story points o horas)
    planned_points:   Mapped[Optional[Decimal]] = mapped_column(Numeric(8, 2), nullable=True)
    completed_points: Mapped[Optional[Decimal]] = mapped_column(Numeric(8, 2), nullable=True)

    order: Mapped[int] = mapped_column(Integer, nullable=False, default=0)

    project: Mapped["Project"]  = relationship("Project",  back_populates="sprints")
    tasks:   Mapped[list["Task"]] = relationship("Task",   back_populates="sprint")

    @property
    def is_overdue(self) -> bool:
        return bool(self.end_date and self.end_date < date.today() and self.status == SprintStatus.ACTIVE)

    def __repr__(self) -> str:
        return f"<Sprint id={self.id} name='{self.name}' status='{self.status}'>"


class Board(TimestampMixin, Base):
    """Tablero Kanban de un proyecto (uno por proyecto)."""
    __tablename__ = "boards"

    id:         Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    project_id: Mapped[int] = mapped_column(ForeignKey("projects.id", ondelete="CASCADE"), nullable=False, unique=True)
    name:       Mapped[str] = mapped_column(String(100), nullable=False, default="Tablero principal")

    project: Mapped["Project"]        = relationship("Project",    back_populates="board")
    columns: Mapped[list["BoardColumn"]] = relationship("BoardColumn", back_populates="board", cascade="all, delete-orphan", order_by="BoardColumn.order")


class BoardColumn(Base):
    """Columna del tablero Kanban."""
    __tablename__ = "board_columns"

    id:       Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    board_id: Mapped[int] = mapped_column(ForeignKey("boards.id", ondelete="CASCADE"), nullable=False, index=True)
    name:     Mapped[str] = mapped_column(String(100), nullable=False)
    color:    Mapped[Optional[str]] = mapped_column(String(7),  nullable=True)
    order:    Mapped[int]           = mapped_column(Integer, nullable=False, default=0)
    is_done:  Mapped[bool]          = mapped_column(Boolean, nullable=False, default=False, comment="Si True, mover acá cierra la tarea")
    wip_limit:Mapped[Optional[int]] = mapped_column(Integer, nullable=True, comment="Work In Progress limit")

    board: Mapped["Board"]     = relationship("Board",   back_populates="columns")
    tasks: Mapped[list["Task"]] = relationship("Task",   back_populates="column", foreign_keys="Task.column_id")

    __table_args__ = (
        UniqueConstraint("board_id", "order", name="uq_board_column_order"),
    )


class TaskLabel(TimestampMixin, Base):
    """Etiquetas reutilizables dentro de un proyecto."""
    __tablename__ = "task_labels"

    id:         Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    project_id: Mapped[int] = mapped_column(ForeignKey("projects.id", ondelete="CASCADE"), nullable=False, index=True)
    name:       Mapped[str] = mapped_column(String(50),  nullable=False)
    color:      Mapped[str] = mapped_column(String(7),   nullable=False, default="#0A4F79")


class Task(TimestampMixin, Base):
    """
    Tarea. Puede estar en:
      - El backlog del proyecto (sprint_id = None, column = primera columna)
      - Un sprint activo (sprint_id != None)
      - Una columna del tablero (column_id != None)
    """
    __tablename__ = "tasks"

    id:         Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    project_id: Mapped[int] = mapped_column(ForeignKey("projects.id",     ondelete="CASCADE"), nullable=False, index=True)
    sprint_id:  Mapped[Optional[int]] = mapped_column(ForeignKey("sprints.id", ondelete="SET NULL"), nullable=True, index=True)
    column_id:  Mapped[Optional[int]] = mapped_column(ForeignKey("board_columns.id", ondelete="SET NULL"), nullable=True, index=True)
    parent_id:  Mapped[Optional[int]] = mapped_column(ForeignKey("tasks.id", ondelete="SET NULL"), nullable=True, comment="Subtarea de otra tarea")

    # Identificador legible tipo Jira (ej: "AUDIT-42")
    task_key: Mapped[str] = mapped_column(String(20), nullable=False, unique=True, index=True)

    title:       Mapped[str]           = mapped_column(String(300), nullable=False)
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    task_type: Mapped[str] = mapped_column(String(20), nullable=False, default=TaskType.TASK, index=True)
    status:    Mapped[str] = mapped_column(String(20), nullable=False, default=TaskStatus.BACKLOG, index=True)
    priority:  Mapped[str] = mapped_column(String(20), nullable=False, default=TaskPriority.MEDIUM, index=True)

    # Story points y tiempo
    story_points:   Mapped[Optional[Decimal]] = mapped_column(Numeric(5, 1), nullable=True)
    estimated_hours:Mapped[Optional[Decimal]] = mapped_column(Numeric(7, 2), nullable=True, comment="Horas estimadas")
    logged_hours:   Mapped[Optional[Decimal]] = mapped_column(Numeric(7, 2), nullable=True, default=Decimal("0"), comment="Horas registradas (calculado)")
    remaining_hours:Mapped[Optional[Decimal]] = mapped_column(Numeric(7, 2), nullable=True, comment="Horas restantes estimadas")

    # Fechas
    due_date:     Mapped[Optional[date]]     = mapped_column(Date,     nullable=True)
    completed_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)

    # Posición en la columna (para ordenar en kanban)
    position: Mapped[int] = mapped_column(Integer, nullable=False, default=0)

    # Reportado por
    reporter_id: Mapped[Optional[int]] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )

    # Etiqueta CSV (simple, para no crear tabla de join)
    label_ids_csv: Mapped[Optional[str]] = mapped_column(String(200), nullable=True)

    # Relaciones
    project:   Mapped["Project"]               = relationship("Project",     back_populates="tasks")
    sprint:    Mapped[Optional["Sprint"]]       = relationship("Sprint",      back_populates="tasks")
    column:    Mapped[Optional["BoardColumn"]]  = relationship("BoardColumn", back_populates="tasks", foreign_keys=[column_id])
    reporter:  Mapped[Optional["User"]]         = relationship("User",        foreign_keys=[reporter_id])
    assignees: Mapped[list["TaskAssignee"]]     = relationship("TaskAssignee", back_populates="task", cascade="all, delete-orphan")
    comments:  Mapped[list["TaskComment"]]      = relationship("TaskComment",  back_populates="task", cascade="all, delete-orphan", order_by="TaskComment.created_at")
    time_logs: Mapped[list["TimeLog"]]          = relationship("TimeLog",      back_populates="task", cascade="all, delete-orphan")
    subtasks:  Mapped[list["Task"]]             = relationship("Task",         foreign_keys=[parent_id])

    @property
    def is_overdue(self) -> bool:
        return bool(
            self.due_date
            and self.due_date < date.today()
            and self.status not in (TaskStatus.DONE, TaskStatus.CANCELLED)
        )

    def __repr__(self) -> str:
        return f"<Task key='{self.task_key}' title='{self.title[:40]}'>"


class TaskAssignee(Base):
    """Relación tarea ↔ usuario asignado (múltiples asignados)."""
    __tablename__ = "task_assignees"

    id:      Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    task_id: Mapped[int] = mapped_column(ForeignKey("tasks.id",  ondelete="CASCADE"), nullable=False, index=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id",  ondelete="CASCADE"), nullable=False, index=True)

    task: Mapped["Task"] = relationship("Task", back_populates="assignees")
    user: Mapped["User"] = relationship("User")

    __table_args__ = (
        UniqueConstraint("task_id", "user_id", name="uq_task_assignee"),
    )


class TaskComment(TimestampMixin, Base):
    """Comentario en una tarea."""
    __tablename__ = "task_comments"

    id:      Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    task_id: Mapped[int] = mapped_column(ForeignKey("tasks.id",  ondelete="CASCADE"), nullable=False, index=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id",  ondelete="CASCADE"), nullable=False)

    content:    Mapped[str]            = mapped_column(Text, nullable=False)
    edited_at:  Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    is_deleted: Mapped[bool]           = mapped_column(Boolean, nullable=False, default=False)

    task: Mapped["Task"] = relationship("Task", back_populates="comments")
    user: Mapped["User"] = relationship("User")


class TimeLog(TimestampMixin, Base):
    """
    Registro de tiempo trabajado en una tarea.
    Cada entrada = una sesión de trabajo manual o por timer.
    """
    __tablename__ = "time_logs"

    id:          Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    task_id:     Mapped[int] = mapped_column(ForeignKey("tasks.id",  ondelete="CASCADE"), nullable=False, index=True)
    user_id:     Mapped[int] = mapped_column(ForeignKey("users.id",  ondelete="CASCADE"), nullable=False, index=True)

    hours:       Mapped[Decimal]       = mapped_column(Numeric(6, 2), nullable=False, comment="Horas registradas")
    date_worked: Mapped[date]          = mapped_column(Date, nullable=False, default=date.today)
    description: Mapped[Optional[str]] = mapped_column(String(300), nullable=True, comment="Descripción de lo trabajado")

    task: Mapped["Task"] = relationship("Task", back_populates="time_logs")
    user: Mapped["User"] = relationship("User")


class ProjectAuditLink(Base):
    """
    Vínculo opcional entre un proyecto y una auditoría.
    Permite trazar proyectos de mejora generados a partir de hallazgos.
    """
    __tablename__ = "project_audit_links"

    id:         Mapped[int]           = mapped_column(primary_key=True, autoincrement=True)
    project_id: Mapped[int]           = mapped_column(ForeignKey("projects.id", ondelete="CASCADE"), nullable=False, index=True)
    audit_id:   Mapped[int]           = mapped_column(ForeignKey("audits.id",   ondelete="CASCADE"), nullable=False, index=True)
    note:       Mapped[Optional[str]] = mapped_column(String(300), nullable=True, comment="Por qué se vincularon")
    linked_at:  Mapped[datetime]      = mapped_column(DateTime, server_default=func.now())

    project: Mapped["Project"] = relationship("Project", back_populates="audit_links")

    __table_args__ = (
        UniqueConstraint("project_id", "audit_id", name="uq_project_audit"),
    )