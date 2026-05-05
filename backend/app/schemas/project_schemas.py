"""
backend/app/schemas/project_schemas.py
Schemas Pydantic para el módulo de gestión de proyectos.
"""

from datetime  import date, datetime
from decimal   import Decimal
from typing    import Any, Optional
from pydantic  import BaseModel, ConfigDict, Field, field_validator


# ─── Schemas de usuario embebido (mini) ──────────────────────────────────────

class UserMini(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id:        int
    full_name: str
    email:     str
    role:      Optional[str] = None


# ─── PROJECT ──────────────────────────────────────────────────────────────────

class ProjectCreate(BaseModel):
    name:       str = Field(..., min_length=2, max_length=200)
    description:Optional[str] = None
    key:        str = Field(..., min_length=2, max_length=10, description="Clave corta: AUDIT, MEJ, etc.")
    visibility: str = Field("privado", pattern="^(publico|privado)$")
    color:      Optional[str] = Field(None, pattern=r"^#[0-9A-Fa-f]{6}$")
    icon:       Optional[str] = None
    start_date: Optional[date] = None
    end_date:   Optional[date] = None

    @field_validator("key")
    @classmethod
    def key_uppercase(cls, v: str) -> str:
        return v.upper().strip()


class ProjectUpdate(BaseModel):
    name:       Optional[str]  = Field(None, min_length=2, max_length=200)
    description:Optional[str]  = None
    visibility: Optional[str]  = Field(None, pattern="^(publico|privado)$")
    status:     Optional[str]  = Field(None, pattern="^(activo|pausado|completado|archivado)$")
    color:      Optional[str]  = None
    icon:       Optional[str]  = None
    start_date: Optional[date] = None
    end_date:   Optional[date] = None


class ProjectResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id:           int
    name:         str
    description:  Optional[str]
    key:          str
    status:       str
    visibility:   str
    color:        Optional[str]
    icon:         Optional[str]
    start_date:   Optional[date]
    end_date:     Optional[date]
    task_counter: int
    owner_id:     int
    owner:        Optional[UserMini] = None
    created_at:   Optional[datetime]

    # Calculados
    total_tasks:     Optional[int]     = None
    completed_tasks: Optional[int]     = None
    open_tasks:      Optional[int]     = None
    member_count:    Optional[int]     = None
    progress_pct:    Optional[float]   = None
    active_sprint:   Optional[str]     = None


class ProjectListResponse(BaseModel):
    items:       list[ProjectResponse]
    total:       int
    page:        int
    page_size:   int
    total_pages: int


# ─── MEMBER ───────────────────────────────────────────────────────────────────

class MemberAdd(BaseModel):
    user_id: int
    role:    str = Field("member", pattern="^(owner|manager|member|viewer)$")


class MemberUpdate(BaseModel):
    role: str = Field(..., pattern="^(owner|manager|member|viewer)$")


class MemberResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id:         int
    user_id:    int
    project_id: int
    role:       str
    joined_at:  Optional[datetime]
    user:       Optional[UserMini] = None


# ─── SPRINT ───────────────────────────────────────────────────────────────────

class SprintCreate(BaseModel):
    name:           str  = Field(..., min_length=1, max_length=100)
    goal:           Optional[str]     = None
    start_date:     Optional[date]    = None
    end_date:       Optional[date]    = None
    planned_points: Optional[Decimal] = None


class SprintUpdate(BaseModel):
    name:             Optional[str]     = None
    goal:             Optional[str]     = None
    status:           Optional[str]     = Field(None, pattern="^(planificado|activo|completado)$")
    start_date:       Optional[date]    = None
    end_date:         Optional[date]    = None
    planned_points:   Optional[Decimal] = None
    completed_points: Optional[Decimal] = None


class SprintResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id:               int
    project_id:       int
    name:             str
    goal:             Optional[str]
    status:           str
    start_date:       Optional[date]
    end_date:         Optional[date]
    planned_points:   Optional[Decimal]
    completed_points: Optional[Decimal]
    order:            int
    is_overdue:       Optional[bool]    = None
    # Calculados
    total_tasks:     Optional[int]   = None
    completed_tasks: Optional[int]   = None
    velocity:        Optional[float] = None   # completed_points / planned_points


# ─── BOARD / COLUMN ───────────────────────────────────────────────────────────

class ColumnCreate(BaseModel):
    name:      str = Field(..., min_length=1, max_length=100)
    color:     Optional[str] = None
    order:     int = 0
    is_done:   bool = False
    wip_limit: Optional[int] = None


class ColumnUpdate(BaseModel):
    name:      Optional[str] = None
    color:     Optional[str] = None
    order:     Optional[int] = None
    is_done:   Optional[bool] = None
    wip_limit: Optional[int] = None


class ColumnResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id:        int
    board_id:  int
    name:      str
    color:     Optional[str]
    order:     int
    is_done:   bool
    wip_limit: Optional[int]
    task_count: Optional[int] = None


class BoardResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id:         int
    project_id: int
    name:       str
    columns:    list[ColumnResponse] = []


# ─── TASK ─────────────────────────────────────────────────────────────────────

class TaskCreate(BaseModel):
    title:           str  = Field(..., min_length=1, max_length=300)
    description:     Optional[str]     = None
    task_type:       str  = Field("tarea", pattern="^(historia|tarea|bug|epic|mejora)$")
    priority:        str  = Field("media", pattern="^(critica|alta|media|baja)$")
    status:          str  = Field("backlog", pattern="^(backlog|por_hacer|en_progreso|en_revision|completada|cancelada)$")
    sprint_id:       Optional[int]     = None
    column_id:       Optional[int]     = None
    parent_id:       Optional[int]     = None
    story_points:    Optional[Decimal] = None
    estimated_hours: Optional[Decimal] = None
    remaining_hours: Optional[Decimal] = None
    due_date:        Optional[date]    = None
    assignee_ids:    list[int]         = []


class TaskUpdate(BaseModel):
    title:           Optional[str]     = None
    description:     Optional[str]     = None
    task_type:       Optional[str]     = None
    priority:        Optional[str]     = None
    status:          Optional[str]     = None
    sprint_id:       Optional[int]     = None
    column_id:       Optional[int]     = None
    parent_id:       Optional[int]     = None
    story_points:    Optional[Decimal] = None
    estimated_hours: Optional[Decimal] = None
    remaining_hours: Optional[Decimal] = None
    due_date:        Optional[date]    = None
    position:        Optional[int]     = None
    assignee_ids:    Optional[list[int]] = None
    labels:          Optional[list[str]] = None


class TaskMoveRequest(BaseModel):
    """Para mover una tarea en el tablero Kanban."""
    column_id: int
    position:  int = 0


class TaskResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id:              int
    project_id:      int
    task_key:        str
    title:           str
    description:     Optional[str]
    task_type:       str
    status:          str
    priority:        str
    sprint_id:       Optional[int]
    column_id:       Optional[int]
    parent_id:       Optional[int]
    story_points:    Optional[Decimal]
    estimated_hours: Optional[Decimal]
    logged_hours:    Optional[Decimal]
    remaining_hours: Optional[Decimal]
    due_date:        Optional[date]
    completed_at:    Optional[datetime]
    position:        int
    reporter_id:     Optional[int]
    is_overdue:      Optional[bool] = None
    created_at:      Optional[datetime]
    updated_at:      Optional[datetime]

    # Embeds
    assignees:   list[UserMini]  = []
    labels:      list[str]       = []
    reporter:    Optional[UserMini] = None
    column_name: Optional[str]   = None
    sprint_name: Optional[str]   = None

    @field_validator("logged_hours", "estimated_hours", "remaining_hours", "story_points", mode="before")
    @classmethod
    def decimal_to_float(cls, v: Any) -> Optional[float]:
        return float(v) if v is not None else None


class TaskDetailResponse(TaskResponse):
    """Detalle completo con comentarios y subtareas."""
    comments: list["CommentResponse"] = []
    subtasks: list[TaskResponse]      = []
    time_logs: list["TimeLogResponse"] = []


# ─── COMMENT ─────────────────────────────────────────────────────────────────

class CommentCreate(BaseModel):
    content: str = Field(..., min_length=1)


class CommentResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id:         int
    task_id:    int
    content:    str
    is_deleted: bool
    edited_at:  Optional[datetime]
    created_at: Optional[datetime]
    user:       Optional[UserMini] = None


# ─── TIME LOG ─────────────────────────────────────────────────────────────────

class TimeLogCreate(BaseModel):
    hours:       Decimal = Field(..., gt=0, le=24, description="Horas trabajadas (ej: 1.5)")
    date_worked: date    = Field(default_factory=date.today)
    description: Optional[str] = Field(None, max_length=300)


class TimeLogResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id:          int
    task_id:     int
    user_id:     int
    hours:       float
    date_worked: date
    description: Optional[str]
    created_at:  Optional[datetime]
    user:        Optional[UserMini] = None

    @field_validator("hours", mode="before")
    @classmethod
    def to_float(cls, v: Any) -> float:
        return float(v) if v is not None else 0.0


# ─── AUDIT LINK ───────────────────────────────────────────────────────────────

class AuditLinkCreate(BaseModel):
    audit_id: int
    note:     Optional[str] = None


class AuditLinkResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id:         int
    project_id: int
    audit_id:   int
    note:       Optional[str]
    linked_at:  Optional[datetime]


# ─── KPIs ─────────────────────────────────────────────────────────────────────

class MemberProductivity(BaseModel):
    user_id:         int
    full_name:       str
    email:           str
    total_tasks:     int
    completed_tasks: int
    in_progress:     int
    completion_rate: float      # %
    total_hours_logged: float
    avg_hours_per_task: float
    overdue_tasks:   int
    story_points_completed: float


class SprintKPI(BaseModel):
    sprint_id:        int
    sprint_name:      str
    status:           str
    planned_points:   Optional[float]
    completed_points: Optional[float]
    velocity:         Optional[float]   # completed / planned * 100
    total_tasks:      int
    completed_tasks:  int
    completion_rate:  float
    total_hours_logged: float
    days_remaining:   Optional[int]
    is_overdue:       bool


class ProjectKPIs(BaseModel):
    project_id:      int
    project_name:    str
    project_key:     str
    status:          str
    progress_pct:    float      # tareas completadas / total
    total_tasks:     int
    completed_tasks: int
    open_tasks:      int
    overdue_tasks:   int
    in_progress:     int
    total_hours_logged: float
    total_hours_estimated: float
    hours_variance:  float      # logged - estimated
    active_sprint:   Optional[SprintKPI]
    member_count:    int
    member_productivity: list[MemberProductivity]
    sprint_velocity_avg: Optional[float]
    days_remaining:  Optional[int]


class BoardKanbanResponse(BaseModel):
    """Tablero completo con columnas y tareas agrupadas para el Kanban."""
    board_id:   int
    board_name: str
    project_id: int
    columns: list[dict]   # { column: ColumnResponse, tasks: list[TaskResponse] }