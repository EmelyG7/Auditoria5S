"""
backend/app/api/projects.py

Router FastAPI para el módulo de gestión de proyectos.

Registrar en main.py:
    from app.api.projects import router as projects_router
    app.include_router(projects_router, prefix="/api/v1")

Endpoints:
    Projects:
        GET    /projects/                   — listar proyectos accesibles
        POST   /projects/                   — crear proyecto
        GET    /projects/{id}               — detalle
        PUT    /projects/{id}               — editar
        DELETE /projects/{id}               — eliminar (solo owner/admin)
        GET    /projects/{id}/kpis          — KPIs de productividad del proyecto

    Members:
        GET    /projects/{id}/members       — listar miembros
        POST   /projects/{id}/members       — agregar miembro
        PUT    /projects/{id}/members/{uid} — cambiar rol
        DELETE /projects/{id}/members/{uid} — remover miembro

    Sprints:
        GET    /projects/{id}/sprints       — listar sprints
        POST   /projects/{id}/sprints       — crear sprint
        PUT    /projects/{id}/sprints/{sid} — editar sprint
        POST   /projects/{id}/sprints/{sid}/start    — iniciar sprint
        POST   /projects/{id}/sprints/{sid}/complete — completar sprint
        DELETE /projects/{id}/sprints/{sid} — eliminar sprint

    Board:
        GET    /projects/{id}/board         — tablero Kanban completo
        POST   /projects/{id}/board/columns — agregar columna
        PUT    /projects/{id}/board/columns/{cid} — editar columna
        DELETE /projects/{id}/board/columns/{cid} — eliminar columna
        POST   /projects/{id}/board/reorder — reordenar columnas

    Tasks:
        GET    /projects/{id}/tasks         — listar tareas (con filtros)
        POST   /projects/{id}/tasks         — crear tarea
        GET    /projects/{id}/tasks/{tid}   — detalle tarea
        PUT    /projects/{id}/tasks/{tid}   — editar tarea
        DELETE /projects/{id}/tasks/{tid}   — eliminar tarea
        POST   /projects/{id}/tasks/{tid}/move — mover en kanban
        POST   /projects/{id}/tasks/{tid}/comments — agregar comentario
        POST   /projects/{id}/tasks/{tid}/time  — registrar tiempo
        GET    /projects/{id}/tasks/{tid}/time  — ver registros de tiempo

    Audit Links:
        GET    /projects/{id}/audit-links   — ver vínculos con auditorías
        POST   /projects/{id}/audit-links   — crear vínculo
        DELETE /projects/{id}/audit-links/{lid} — eliminar vínculo
"""

import logging
from datetime import date
from math     import ceil
from typing   import Optional

from fastapi  import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import and_, func, or_
from sqlalchemy.orm import Session, joinedload

from app.core.database      import get_db
from app.core.dependencies  import get_current_user, require_admin
from app.models.project_models import (
    Project, ProjectMember, Sprint, Board, BoardColumn,
    Task, TaskAssignee, TaskComment, TimeLog, ProjectAuditLink,
    ProjectStatus, SprintStatus, TaskStatus, MemberRole,
)
from app.models.user_models import User
from app.schemas.project_schemas import (
    AuditLinkCreate, AuditLinkResponse,
    BoardKanbanResponse, BoardResponse,
    ColumnCreate, ColumnResponse, ColumnUpdate,
    CommentCreate, CommentResponse,
    MemberAdd, MemberResponse, MemberUpdate,
    MemberProductivity, ProjectKPIs, SprintKPI,
    ProjectCreate, ProjectListResponse, ProjectResponse, ProjectUpdate,
    SprintCreate, SprintResponse, SprintUpdate,
    TaskCreate, TaskDetailResponse, TaskMoveRequest, TaskResponse, TaskUpdate,
    TimeLogCreate, TimeLogResponse,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/projects", tags=["Gestión de Proyectos"])


# ─── Helpers ──────────────────────────────────────────────────────────────────

def _get_project_or_404(project_id: int, db: Session) -> Project:
    p = db.query(Project).filter(Project.id == project_id).first()
    if not p:
        raise HTTPException(status.HTTP_404_NOT_FOUND, f"Proyecto id={project_id} no encontrado.")
    return p


def _check_member(project: Project, user: User, min_role: str = MemberRole.VIEWER) -> ProjectMember:
    """Verifica que el usuario es miembro del proyecto (o admin del sistema)."""
    if user.role == "admin":
        return None   # admin siempre tiene acceso
    if project.visibility == "publico":
        return None   # proyectos públicos son visibles para todos

    member = next((m for m in project.members if m.user_id == user.id), None)
    if not member:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "No eres miembro de este proyecto.")

    role_order = {MemberRole.VIEWER: 0, MemberRole.MEMBER: 1, MemberRole.MANAGER: 2, MemberRole.OWNER: 3}
    if role_order.get(member.role, 0) < role_order.get(min_role, 0):
        raise HTTPException(status.HTTP_403_FORBIDDEN, f"Se requiere rol '{min_role}' o superior.")
    return member


def _can_edit(project: Project, user: User) -> bool:
    if user.role == "admin":
        return True
    member = next((m for m in project.members if m.user_id == user.id), None)
    if not member:
        return False
    return member.role in (MemberRole.OWNER, MemberRole.MANAGER)


def _build_task_response(task: Task) -> TaskResponse:
    return TaskResponse(
        **{c.name: getattr(task, c.name) for c in Task.__table__.columns},
        assignees  = [UserMini(id=a.user.id, full_name=a.user.full_name, email=a.user.email) for a in task.assignees if a.user],
        reporter   = UserMini(id=task.reporter.id, full_name=task.reporter.full_name, email=task.reporter.email) if task.reporter else None,
        column_name= task.column.name if task.column else None,
        sprint_name= task.sprint.name if task.sprint else None,
        is_overdue = task.is_overdue,
    )


def _project_stats(project: Project, db: Session) -> dict:
    tasks = db.query(Task).filter(Task.project_id == project.id).all()
    total     = len(tasks)
    completed = sum(1 for t in tasks if t.status == TaskStatus.DONE)
    open_t    = sum(1 for t in tasks if t.status not in (TaskStatus.DONE, TaskStatus.CANCELLED))
    progress  = round(completed / total * 100, 1) if total > 0 else 0.0
    active_sprint = next(
        (s.name for s in project.sprints if s.status == SprintStatus.ACTIVE), None
    )
    return {
        "total_tasks":     total,
        "completed_tasks": completed,
        "open_tasks":      open_t,
        "member_count":    len(project.members),
        "progress_pct":    progress,
        "active_sprint":   active_sprint,
    }


# ══════════════════════════════════════════════════════════════════════════════
# PROJECTS
# ══════════════════════════════════════════════════════════════════════════════

@router.get("/", response_model=ProjectListResponse)
def list_projects(
    status_filter: Optional[str] = Query(None, alias="status"),
    search:        Optional[str] = Query(None),
    page:          int           = Query(1, ge=1),
    page_size:     int           = Query(20, ge=1, le=50),
    current_user:  User          = Depends(get_current_user),
    db:            Session       = Depends(get_db),
):
    """Lista proyectos accesibles: públicos + privados donde el usuario es miembro."""
    q = db.query(Project).options(
        joinedload(Project.owner),
        joinedload(Project.members).joinedload(ProjectMember.user),
        joinedload(Project.sprints),
    )

    if current_user.role != "admin":
        # Ver públicos + privados donde es miembro
        member_project_ids = db.query(ProjectMember.project_id).filter(
            ProjectMember.user_id == current_user.id
        ).subquery()
        q = q.filter(or_(
            Project.visibility == "publico",
            Project.id.in_(member_project_ids),
            Project.owner_id == current_user.id,
        ))

    if status_filter:
        q = q.filter(Project.status == status_filter)
    if search:
        q = q.filter(or_(
            Project.name.ilike(f"%{search}%"),
            Project.key.ilike(f"%{search}%"),
        ))

    total       = q.count()
    projects    = q.order_by(Project.created_at.desc()).offset((page - 1) * page_size).limit(page_size).all()
    total_pages = ceil(total / page_size) if total > 0 else 1

    items = []
    for p in projects:
        stats = _project_stats(p, db)
        r = ProjectResponse(
            id=p.id, name=p.name, description=p.description, key=p.key,
            status=p.status, visibility=p.visibility, color=p.color, icon=p.icon,
            start_date=p.start_date, end_date=p.end_date,
            task_counter=p.task_counter, owner_id=p.owner_id,
            owner=UserMini(id=p.owner.id, full_name=p.owner.full_name, email=p.owner.email) if p.owner else None,
            created_at=p.created_at, **stats,
        )
        items.append(r)

    return ProjectListResponse(items=items, total=total, page=page, page_size=page_size, total_pages=total_pages)


@router.post("/", response_model=ProjectResponse, status_code=status.HTTP_201_CREATED)
def create_project(
    data:         ProjectCreate,
    current_user: User    = Depends(get_current_user),
    db:           Session = Depends(get_db),
):
    # Validar key única
    if db.query(Project).filter(Project.key == data.key.upper()).first():
        raise HTTPException(status.HTTP_409_CONFLICT, f"La clave '{data.key}' ya está en uso.")

    project = Project(
        **data.model_dump(),
        owner_id=current_user.id,
        key=data.key.upper(),
    )
    db.add(project)
    db.flush()

    # Agregar owner como miembro
    db.add(ProjectMember(project_id=project.id, user_id=current_user.id, role=MemberRole.OWNER))

    # Crear tablero Kanban con columnas por defecto
    board = Board(project_id=project.id, name="Tablero principal")
    db.add(board)
    db.flush()

    default_columns = [
        BoardColumn(board_id=board.id, name="Backlog",      color="#94a3b8", order=0, is_done=False),
        BoardColumn(board_id=board.id, name="Por Hacer",    color="#0A4F79", order=1, is_done=False),
        BoardColumn(board_id=board.id, name="En Progreso",  color="#EA9947", order=2, is_done=False),
        BoardColumn(board_id=board.id, name="En Revisión",  color="#B4427F", order=3, is_done=False),
        BoardColumn(board_id=board.id, name="Completada",   color="#98C062", order=4, is_done=True),
    ]
    for col in default_columns:
        db.add(col)

    db.commit()
    db.refresh(project)
    logger.info(f"Proyecto '{project.name}' ({project.key}) creado por '{current_user.email}'")

    stats = _project_stats(project, db)
    return ProjectResponse(
        id=project.id, name=project.name, description=project.description, key=project.key,
        status=project.status, visibility=project.visibility, color=project.color, icon=project.icon,
        start_date=project.start_date, end_date=project.end_date,
        task_counter=project.task_counter, owner_id=project.owner_id, created_at=project.created_at,
        **stats,
    )


@router.get("/{project_id}", response_model=ProjectResponse)
def get_project(
    project_id:   int,
    current_user: User    = Depends(get_current_user),
    db:           Session = Depends(get_db),
):
    project = _get_project_or_404(project_id, db)
    _check_member(project, current_user)
    stats = _project_stats(project, db)
    return ProjectResponse(
        id=project.id, name=project.name, description=project.description, key=project.key,
        status=project.status, visibility=project.visibility, color=project.color, icon=project.icon,
        start_date=project.start_date, end_date=project.end_date,
        task_counter=project.task_counter, owner_id=project.owner_id, created_at=project.created_at,
        **stats,
    )


@router.put("/{project_id}", response_model=ProjectResponse)
def update_project(
    project_id:   int,
    data:         ProjectUpdate,
    current_user: User    = Depends(get_current_user),
    db:           Session = Depends(get_db),
):
    project = _get_project_or_404(project_id, db)
    if not _can_edit(project, current_user):
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Se requiere rol manager o superior.")

    for k, v in data.model_dump(exclude_unset=True).items():
        setattr(project, k, v)

    db.commit()
    db.refresh(project)
    stats = _project_stats(project, db)
    return ProjectResponse(
        id=project.id, name=project.name, description=project.description, key=project.key,
        status=project.status, visibility=project.visibility, color=project.color, icon=project.icon,
        start_date=project.start_date, end_date=project.end_date,
        task_counter=project.task_counter, owner_id=project.owner_id, created_at=project.created_at,
        **stats,
    )


@router.delete("/{project_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_project(
    project_id:   int,
    current_user: User    = Depends(get_current_user),
    db:           Session = Depends(get_db),
):
    project = _get_project_or_404(project_id, db)
    if project.owner_id != current_user.id and current_user.role != "admin":
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Solo el propietario o admin puede eliminar el proyecto.")
    db.delete(project)
    db.commit()


# ══════════════════════════════════════════════════════════════════════════════
# KPIs DE PRODUCTIVIDAD
# ══════════════════════════════════════════════════════════════════════════════

@router.get("/{project_id}/kpis", response_model=ProjectKPIs)
def get_project_kpis(
    project_id:   int,
    current_user: User    = Depends(get_current_user),
    db:           Session = Depends(get_db),
):
    project = _get_project_or_404(project_id, db)
    _check_member(project, current_user)

    tasks    = db.query(Task).filter(Task.project_id == project_id).all()
    members  = db.query(ProjectMember).filter(ProjectMember.project_id == project_id).options(
        joinedload(ProjectMember.user)
    ).all()

    # ── Totales globales ────────────────────────────────────────────────────
    total_tasks     = len(tasks)
    completed_tasks = sum(1 for t in tasks if t.status == TaskStatus.DONE)
    open_tasks      = sum(1 for t in tasks if t.status not in (TaskStatus.DONE, TaskStatus.CANCELLED))
    overdue_tasks   = sum(1 for t in tasks if t.is_overdue)
    in_progress     = sum(1 for t in tasks if t.status == "en_progreso")
    progress_pct    = round(completed_tasks / total_tasks * 100, 1) if total_tasks else 0.0

    # ── Horas ───────────────────────────────────────────────────────────────
    all_logs = db.query(TimeLog).filter(
        TimeLog.task_id.in_([t.id for t in tasks])
    ).all()
    total_logged    = sum(float(l.hours) for l in all_logs)
    total_estimated = sum(float(t.estimated_hours or 0) for t in tasks)
    hours_variance  = round(total_logged - total_estimated, 2)

    # ── Productividad por miembro ───────────────────────────────────────────
    member_productivity = []
    for m in members:
        u = m.user
        if not u:
            continue
        user_tasks     = [t for t in tasks if any(a.user_id == u.id for a in t.assignees)]
        u_completed    = sum(1 for t in user_tasks if t.status == TaskStatus.DONE)
        u_in_progress  = sum(1 for t in user_tasks if t.status == "en_progreso")
        u_overdue      = sum(1 for t in user_tasks if t.is_overdue)
        u_logs         = [l for l in all_logs if l.user_id == u.id]
        u_logged       = sum(float(l.hours) for l in u_logs)
        u_sp           = sum(float(t.story_points or 0) for t in user_tasks if t.status == TaskStatus.DONE)
        completion_rate = round(u_completed / len(user_tasks) * 100, 1) if user_tasks else 0.0
        avg_hours       = round(u_logged / u_completed, 2) if u_completed > 0 else 0.0

        member_productivity.append(MemberProductivity(
            user_id              = u.id,
            full_name            = u.full_name,
            email                = u.email,
            total_tasks          = len(user_tasks),
            completed_tasks      = u_completed,
            in_progress          = u_in_progress,
            completion_rate      = completion_rate,
            total_hours_logged   = round(u_logged, 2),
            avg_hours_per_task   = avg_hours,
            overdue_tasks        = u_overdue,
            story_points_completed = u_sp,
        ))

    # ── Sprint activo ───────────────────────────────────────────────────────
    active_sprint_obj = next((s for s in project.sprints if s.status == SprintStatus.ACTIVE), None)
    active_sprint_kpi = None
    sprint_velocity_avg = None

    if active_sprint_obj:
        sp_tasks    = [t for t in tasks if t.sprint_id == active_sprint_obj.id]
        sp_done     = sum(1 for t in sp_tasks if t.status == TaskStatus.DONE)
        sp_rate     = round(sp_done / len(sp_tasks) * 100, 1) if sp_tasks else 0.0
        sp_logs     = [l for l in all_logs if any(t.sprint_id == active_sprint_obj.id and t.id == l.task_id for t in tasks)]
        sp_logged   = sum(float(l.hours) for l in sp_logs)
        days_rem    = (active_sprint_obj.end_date - date.today()).days if active_sprint_obj.end_date else None
        velocity    = None
        if active_sprint_obj.planned_points and float(active_sprint_obj.planned_points) > 0:
            cp = float(active_sprint_obj.completed_points or active_sprint_obj.planned_points or 0)
            velocity = round(cp / float(active_sprint_obj.planned_points) * 100, 1)

        active_sprint_kpi = SprintKPI(
            sprint_id        = active_sprint_obj.id,
            sprint_name      = active_sprint_obj.name,
            status           = active_sprint_obj.status,
            planned_points   = float(active_sprint_obj.planned_points) if active_sprint_obj.planned_points else None,
            completed_points = float(active_sprint_obj.completed_points) if active_sprint_obj.completed_points else None,
            velocity         = velocity,
            total_tasks      = len(sp_tasks),
            completed_tasks  = sp_done,
            completion_rate  = sp_rate,
            total_hours_logged = round(sp_logged, 2),
            days_remaining   = days_rem,
            is_overdue       = active_sprint_obj.is_overdue,
        )

    # Velocidad promedio de sprints completados
    completed_sprints = [s for s in project.sprints if s.status == SprintStatus.COMPLETED]
    if completed_sprints:
        velocities = [
            float(s.completed_points or 0) / float(s.planned_points) * 100
            for s in completed_sprints
            if s.planned_points and float(s.planned_points) > 0
        ]
        sprint_velocity_avg = round(sum(velocities) / len(velocities), 1) if velocities else None

    # Días restantes del proyecto
    days_remaining = None
    if project.end_date:
        days_remaining = (project.end_date - date.today()).days

    return ProjectKPIs(
        project_id          = project.id,
        project_name        = project.name,
        project_key         = project.key,
        status              = project.status,
        progress_pct        = progress_pct,
        total_tasks         = total_tasks,
        completed_tasks     = completed_tasks,
        open_tasks          = open_tasks,
        overdue_tasks       = overdue_tasks,
        in_progress         = in_progress,
        total_hours_logged  = round(total_logged, 2),
        total_hours_estimated = round(total_estimated, 2),
        hours_variance      = hours_variance,
        active_sprint       = active_sprint_kpi,
        member_count        = len(members),
        member_productivity = sorted(member_productivity, key=lambda x: x.completed_tasks, reverse=True),
        sprint_velocity_avg = sprint_velocity_avg,
        days_remaining      = days_remaining,
    )


# ══════════════════════════════════════════════════════════════════════════════
# MEMBERS
# ══════════════════════════════════════════════════════════════════════════════

@router.get("/{project_id}/members", response_model=list[MemberResponse])
def list_members(project_id: int, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    project = _get_project_or_404(project_id, db)
    _check_member(project, current_user)
    members = db.query(ProjectMember).filter(ProjectMember.project_id == project_id).options(joinedload(ProjectMember.user)).all()
    return [MemberResponse(
        id=m.id, user_id=m.user_id, project_id=m.project_id, role=m.role, joined_at=m.joined_at,
        user=UserMini(id=m.user.id, full_name=m.user.full_name, email=m.user.email) if m.user else None,
    ) for m in members]


@router.post("/{project_id}/members", response_model=MemberResponse, status_code=status.HTTP_201_CREATED)
def add_member(project_id: int, data: MemberAdd, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    project = _get_project_or_404(project_id, db)
    if not _can_edit(project, current_user):
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Se requiere rol manager o superior.")
    if db.query(ProjectMember).filter_by(project_id=project_id, user_id=data.user_id).first():
        raise HTTPException(status.HTTP_409_CONFLICT, "El usuario ya es miembro del proyecto.")
    user = db.query(User).filter(User.id == data.user_id).first()
    if not user:
        raise HTTPException(status.HTTP_404_NOT_FOUND, f"Usuario id={data.user_id} no encontrado.")
    m = ProjectMember(project_id=project_id, user_id=data.user_id, role=data.role)
    db.add(m)
    db.commit()
    db.refresh(m)
    return MemberResponse(id=m.id, user_id=m.user_id, project_id=m.project_id, role=m.role, joined_at=m.joined_at,
        user=UserMini(id=user.id, full_name=user.full_name, email=user.email))


@router.put("/{project_id}/members/{user_id}", response_model=MemberResponse)
def update_member_role(project_id: int, user_id: int, data: MemberUpdate, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    project = _get_project_or_404(project_id, db)
    if not _can_edit(project, current_user):
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Se requiere rol manager o superior.")
    m = db.query(ProjectMember).filter_by(project_id=project_id, user_id=user_id).first()
    if not m:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Miembro no encontrado.")
    m.role = data.role
    db.commit()
    db.refresh(m)
    return MemberResponse(id=m.id, user_id=m.user_id, project_id=m.project_id, role=m.role, joined_at=m.joined_at)


@router.delete("/{project_id}/members/{user_id}", status_code=status.HTTP_204_NO_CONTENT)
def remove_member(project_id: int, user_id: int, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    project = _get_project_or_404(project_id, db)
    if not _can_edit(project, current_user):
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Se requiere rol manager o superior.")
    m = db.query(ProjectMember).filter_by(project_id=project_id, user_id=user_id).first()
    if not m:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Miembro no encontrado.")
    if m.role == MemberRole.OWNER:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "No se puede remover al propietario del proyecto.")
    db.delete(m)
    db.commit()


# ══════════════════════════════════════════════════════════════════════════════
# SPRINTS
# ══════════════════════════════════════════════════════════════════════════════

@router.get("/{project_id}/sprints", response_model=list[SprintResponse])
def list_sprints(project_id: int, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    project = _get_project_or_404(project_id, db)
    _check_member(project, current_user)
    sprints = db.query(Sprint).filter(Sprint.project_id == project_id).order_by(Sprint.order).all()
    result  = []
    for s in sprints:
        tasks    = db.query(Task).filter(Task.sprint_id == s.id).all()
        total    = len(tasks)
        done     = sum(1 for t in tasks if t.status == TaskStatus.DONE)
        velocity = None
        if s.planned_points and float(s.planned_points) > 0:
            cp = float(s.completed_points or 0)
            velocity = round(cp / float(s.planned_points) * 100, 1)
        result.append(SprintResponse(
            id=s.id, project_id=s.project_id, name=s.name, goal=s.goal,
            status=s.status, start_date=s.start_date, end_date=s.end_date,
            planned_points=s.planned_points, completed_points=s.completed_points, order=s.order,
            is_overdue=s.is_overdue, total_tasks=total, completed_tasks=done,
            completion_rate=round(done/total*100,1) if total else 0.0, velocity=velocity,
        ))
    return result


@router.post("/{project_id}/sprints", response_model=SprintResponse, status_code=status.HTTP_201_CREATED)
def create_sprint(project_id: int, data: SprintCreate, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    project = _get_project_or_404(project_id, db)
    if not _can_edit(project, current_user):
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Se requiere rol manager o superior.")
    max_order = db.query(func.max(Sprint.order)).filter(Sprint.project_id == project_id).scalar() or 0
    s = Sprint(project_id=project_id, order=max_order + 1, **data.model_dump())
    db.add(s)
    db.commit()
    db.refresh(s)
    return SprintResponse(id=s.id, project_id=s.project_id, name=s.name, goal=s.goal,
        status=s.status, start_date=s.start_date, end_date=s.end_date,
        planned_points=s.planned_points, completed_points=s.completed_points, order=s.order,
        is_overdue=s.is_overdue, total_tasks=0, completed_tasks=0, completion_rate=0.0)


@router.put("/{project_id}/sprints/{sprint_id}", response_model=SprintResponse)
def update_sprint(project_id: int, sprint_id: int, data: SprintUpdate, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    project = _get_project_or_404(project_id, db)
    if not _can_edit(project, current_user):
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Se requiere rol manager o superior.")
    s = db.query(Sprint).filter_by(id=sprint_id, project_id=project_id).first()
    if not s:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Sprint no encontrado.")
    for k, v in data.model_dump(exclude_unset=True).items():
        setattr(s, k, v)
    db.commit()
    db.refresh(s)
    tasks = db.query(Task).filter(Task.sprint_id == s.id).all()
    done  = sum(1 for t in tasks if t.status == TaskStatus.DONE)
    return SprintResponse(id=s.id, project_id=s.project_id, name=s.name, goal=s.goal,
        status=s.status, start_date=s.start_date, end_date=s.end_date,
        planned_points=s.planned_points, completed_points=s.completed_points, order=s.order,
        is_overdue=s.is_overdue, total_tasks=len(tasks), completed_tasks=done,
        completion_rate=round(done/len(tasks)*100,1) if tasks else 0.0)


@router.post("/{project_id}/sprints/{sprint_id}/start", response_model=SprintResponse)
def start_sprint(project_id: int, sprint_id: int, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    project = _get_project_or_404(project_id, db)
    if not _can_edit(project, current_user):
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Se requiere rol manager o superior.")
    if db.query(Sprint).filter_by(project_id=project_id, status=SprintStatus.ACTIVE).first():
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Ya existe un sprint activo. Complétalo antes de iniciar otro.")
    s = db.query(Sprint).filter_by(id=sprint_id, project_id=project_id).first()
    if not s:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Sprint no encontrado.")
    s.status = SprintStatus.ACTIVE
    if not s.start_date:
        s.start_date = date.today()
    db.commit()
    db.refresh(s)
    return SprintResponse(id=s.id, project_id=s.project_id, name=s.name, goal=s.goal,
        status=s.status, start_date=s.start_date, end_date=s.end_date,
        planned_points=s.planned_points, completed_points=s.completed_points, order=s.order,
        is_overdue=s.is_overdue, total_tasks=0, completed_tasks=0, completion_rate=0.0)


@router.post("/{project_id}/sprints/{sprint_id}/complete")
def complete_sprint(project_id: int, sprint_id: int, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    project = _get_project_or_404(project_id, db)
    if not _can_edit(project, current_user):
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Se requiere rol manager o superior.")
    s = db.query(Sprint).filter_by(id=sprint_id, project_id=project_id).first()
    if not s:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Sprint no encontrado.")
    s.status = SprintStatus.COMPLETED
    if not s.end_date:
        s.end_date = date.today()
    # Calcular puntos completados
    done_sp = db.query(func.sum(Task.story_points)).filter(
        Task.sprint_id == sprint_id, Task.status == TaskStatus.DONE
    ).scalar() or 0
    s.completed_points = done_sp
    db.commit()
    return {"message": f"Sprint '{s.name}' completado.", "completed_points": float(done_sp)}


@router.delete("/{project_id}/sprints/{sprint_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_sprint(project_id: int, sprint_id: int, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    project = _get_project_or_404(project_id, db)
    if not _can_edit(project, current_user):
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Se requiere rol manager o superior.")
    s = db.query(Sprint).filter_by(id=sprint_id, project_id=project_id).first()
    if not s:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Sprint no encontrado.")
    if s.status == SprintStatus.ACTIVE:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "No puedes eliminar un sprint activo.")
    # Mover tareas de este sprint al backlog
    db.query(Task).filter(Task.sprint_id == sprint_id).update({"sprint_id": None})
    db.delete(s)
    db.commit()


# ══════════════════════════════════════════════════════════════════════════════
# BOARD (KANBAN)
# ══════════════════════════════════════════════════════════════════════════════

@router.get("/{project_id}/board")
def get_board(project_id: int, sprint_id: Optional[int] = Query(None), current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """Tablero Kanban con columnas y tareas. Filtra por sprint si se indica."""
    project = _get_project_or_404(project_id, db)
    _check_member(project, current_user)
    board   = db.query(Board).filter(Board.project_id == project_id).first()
    if not board:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Tablero no encontrado.")

    columns = db.query(BoardColumn).filter(BoardColumn.board_id == board.id).order_by(BoardColumn.order).all()

    task_q = db.query(Task).filter(Task.project_id == project_id).options(
        joinedload(Task.assignees).joinedload(TaskAssignee.user),
        joinedload(Task.reporter),
        joinedload(Task.column),
        joinedload(Task.sprint),
    )
    if sprint_id:
        task_q = task_q.filter(Task.sprint_id == sprint_id)

    all_tasks = task_q.order_by(Task.position).all()

    result_columns = []
    for col in columns:
        col_tasks = [t for t in all_tasks if t.column_id == col.id]
        result_columns.append({
            "id":        col.id,
            "name":      col.name,
            "color":     col.color,
            "order":     col.order,
            "is_done":   col.is_done,
            "wip_limit": col.wip_limit,
            "task_count": len(col_tasks),
            "tasks": [_build_task_response(t).model_dump() for t in col_tasks],
        })

    return {
        "board_id":   board.id,
        "board_name": board.name,
        "project_id": project_id,
        "columns":    result_columns,
    }


@router.post("/{project_id}/board/columns", response_model=ColumnResponse, status_code=status.HTTP_201_CREATED)
def add_column(project_id: int, data: ColumnCreate, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    project = _get_project_or_404(project_id, db)
    if not _can_edit(project, current_user):
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Se requiere rol manager o superior.")
    board = db.query(Board).filter(Board.project_id == project_id).first()
    if not board:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Tablero no encontrado.")
    col = BoardColumn(board_id=board.id, **data.model_dump())
    db.add(col)
    db.commit()
    db.refresh(col)
    return ColumnResponse(id=col.id, board_id=col.board_id, name=col.name, color=col.color,
        order=col.order, is_done=col.is_done, wip_limit=col.wip_limit, task_count=0)


@router.put("/{project_id}/board/columns/{column_id}", response_model=ColumnResponse)
def update_column(project_id: int, column_id: int, data: ColumnUpdate, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    project = _get_project_or_404(project_id, db)
    if not _can_edit(project, current_user):
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Se requiere rol manager o superior.")
    board = db.query(Board).filter(Board.project_id == project_id).first()
    col   = db.query(BoardColumn).filter_by(id=column_id, board_id=board.id).first()
    if not col:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Columna no encontrada.")
    for k, v in data.model_dump(exclude_unset=True).items():
        setattr(col, k, v)
    db.commit()
    db.refresh(col)
    tc = db.query(func.count(Task.id)).filter(Task.column_id == column_id).scalar()
    return ColumnResponse(id=col.id, board_id=col.board_id, name=col.name, color=col.color,
        order=col.order, is_done=col.is_done, wip_limit=col.wip_limit, task_count=tc)


@router.delete("/{project_id}/board/columns/{column_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_column(project_id: int, column_id: int, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    project = _get_project_or_404(project_id, db)
    if not _can_edit(project, current_user):
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Se requiere rol manager o superior.")
    board = db.query(Board).filter(Board.project_id == project_id).first()
    col   = db.query(BoardColumn).filter_by(id=column_id, board_id=board.id).first()
    if not col:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Columna no encontrada.")
    task_count = db.query(func.count(Task.id)).filter(Task.column_id == column_id).scalar()
    if task_count > 0:
        raise HTTPException(status.HTTP_400_BAD_REQUEST,
            f"La columna tiene {task_count} tarea(s). Muévelas antes de eliminarla.")
    db.delete(col)
    db.commit()


# ══════════════════════════════════════════════════════════════════════════════
# TASKS
# ══════════════════════════════════════════════════════════════════════════════

@router.get("/{project_id}/tasks", response_model=list[TaskResponse])
def list_tasks(
    project_id:    int,
    sprint_id:     Optional[int] = Query(None),
    column_id:     Optional[int] = Query(None),
    status_filter: Optional[str] = Query(None, alias="status"),
    assignee_id:   Optional[int] = Query(None),
    task_type:     Optional[str] = Query(None),
    search:        Optional[str] = Query(None),
    current_user:  User          = Depends(get_current_user),
    db:            Session       = Depends(get_db),
):
    project = _get_project_or_404(project_id, db)
    _check_member(project, current_user)

    q = db.query(Task).filter(Task.project_id == project_id).options(
        joinedload(Task.assignees).joinedload(TaskAssignee.user),
        joinedload(Task.reporter),
        joinedload(Task.column),
        joinedload(Task.sprint),
    )
    if sprint_id is not None:
        q = q.filter(Task.sprint_id == sprint_id)
    if column_id is not None:
        q = q.filter(Task.column_id == column_id)
    if status_filter:
        q = q.filter(Task.status == status_filter)
    if task_type:
        q = q.filter(Task.task_type == task_type)
    if assignee_id:
        q = q.join(TaskAssignee, TaskAssignee.task_id == Task.id).filter(TaskAssignee.user_id == assignee_id)
    if search:
        q = q.filter(or_(Task.title.ilike(f"%{search}%"), Task.task_key.ilike(f"%{search}%")))

    tasks = q.order_by(Task.position, Task.created_at).all()
    return [_build_task_response(t) for t in tasks]


@router.post("/{project_id}/tasks", response_model=TaskResponse, status_code=status.HTTP_201_CREATED)
def create_task(
    project_id:   int,
    data:         TaskCreate,
    current_user: User    = Depends(get_current_user),
    db:           Session = Depends(get_db),
):
    project = _get_project_or_404(project_id, db)
    _check_member(project, current_user, MemberRole.MEMBER)

    # Generar task_key: "AUDIT-43"
    project.task_counter += 1
    task_key = f"{project.key}-{project.task_counter}"

    # Si no se indica columna, usar la primera del tablero
    column_id = data.column_id
    if not column_id and project.board:
        first_col = db.query(BoardColumn).filter(
            BoardColumn.board_id == project.board.id
        ).order_by(BoardColumn.order).first()
        if first_col:
            column_id = first_col.id

    # Posición al final de la columna
    max_pos = db.query(func.max(Task.position)).filter(Task.column_id == column_id).scalar() or 0

    task = Task(
        project_id   = project_id,
        task_key     = task_key,
        title        = data.title,
        description  = data.description,
        task_type    = data.task_type,
        priority     = data.priority,
        status       = data.status,
        sprint_id    = data.sprint_id,
        column_id    = column_id,
        parent_id    = data.parent_id,
        story_points = data.story_points,
        estimated_hours = data.estimated_hours,
        remaining_hours = data.remaining_hours or data.estimated_hours,
        due_date     = data.due_date,
        reporter_id  = current_user.id,
        position     = max_pos + 1,
        logged_hours = 0,
    )
    db.add(task)
    db.flush()

    # Asignados
    for uid in data.assignee_ids:
        db.add(TaskAssignee(task_id=task.id, user_id=uid))

    db.commit()
    db.refresh(task)
    logger.info(f"Tarea '{task.task_key}' creada en proyecto '{project.key}'")
    return _build_task_response(task)


@router.get("/{project_id}/tasks/{task_id}", response_model=TaskDetailResponse)
def get_task(project_id: int, task_id: int, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    project = _get_project_or_404(project_id, db)
    _check_member(project, current_user)
    task = db.query(Task).filter_by(id=task_id, project_id=project_id).options(
        joinedload(Task.assignees).joinedload(TaskAssignee.user),
        joinedload(Task.reporter),
        joinedload(Task.comments).joinedload(TaskComment.user),
        joinedload(Task.time_logs).joinedload(TimeLog.user),
        joinedload(Task.subtasks),
        joinedload(Task.column),
        joinedload(Task.sprint),
    ).first()
    if not task:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Tarea no encontrada.")

    base = _build_task_response(task)
    comments = [CommentResponse(
        id=c.id, task_id=c.task_id, content=c.content if not c.is_deleted else "[Eliminado]",
        is_deleted=c.is_deleted, edited_at=c.edited_at, created_at=c.created_at,
        user=UserMini(id=c.user.id, full_name=c.user.full_name, email=c.user.email) if c.user else None
    ) for c in task.comments]
    time_logs_resp = [TimeLogResponse(
        id=l.id, task_id=l.task_id, user_id=l.user_id,
        hours=float(l.hours), date_worked=l.date_worked,
        description=l.description, created_at=l.created_at,
        user=UserMini(id=l.user.id, full_name=l.user.full_name, email=l.user.email) if l.user else None
    ) for l in task.time_logs]
    subtasks = [_build_task_response(st) for st in task.subtasks]

    return TaskDetailResponse(**base.model_dump(), comments=comments, subtasks=subtasks, time_logs=time_logs_resp)


@router.put("/{project_id}/tasks/{task_id}", response_model=TaskResponse)
def update_task(project_id: int, task_id: int, data: TaskUpdate, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    project = _get_project_or_404(project_id, db)
    _check_member(project, current_user, MemberRole.MEMBER)
    task = db.query(Task).filter_by(id=task_id, project_id=project_id).first()
    if not task:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Tarea no encontrada.")

    update_data = data.model_dump(exclude_unset=True)
    assignee_ids = update_data.pop("assignee_ids", None)

    for k, v in update_data.items():
        setattr(task, k, v)

    # Marcar fecha completada
    if data.status == TaskStatus.DONE and not task.completed_at:
        from datetime import datetime as dt
        task.completed_at = dt.utcnow()

    if assignee_ids is not None:
        db.query(TaskAssignee).filter(TaskAssignee.task_id == task_id).delete()
        for uid in assignee_ids:
            db.add(TaskAssignee(task_id=task_id, user_id=uid))

    db.commit()
    db.refresh(task)
    return _build_task_response(task)


@router.post("/{project_id}/tasks/{task_id}/move", response_model=TaskResponse)
def move_task(project_id: int, task_id: int, data: TaskMoveRequest, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """Mueve una tarea a otra columna del Kanban y actualiza su posición."""
    project = _get_project_or_404(project_id, db)
    _check_member(project, current_user, MemberRole.MEMBER)
    task = db.query(Task).filter_by(id=task_id, project_id=project_id).first()
    if not task:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Tarea no encontrada.")

    col = db.query(BoardColumn).filter(BoardColumn.id == data.column_id).first()
    if not col:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Columna no encontrada.")

    # Actualizar posición de otras tareas en la columna destino
    db.query(Task).filter(
        Task.column_id == data.column_id, Task.position >= data.position, Task.id != task_id
    ).update({"position": Task.position + 1})

    task.column_id = data.column_id
    task.position  = data.position

    # Si la columna tiene is_done, marcar como completada
    if col.is_done and task.status != TaskStatus.DONE:
        from datetime import datetime as dt
        task.status       = TaskStatus.DONE
        task.completed_at = dt.utcnow()
    elif not col.is_done and task.status == TaskStatus.DONE:
        task.status       = TaskStatus.IN_PROGRESS if col.order > 1 else TaskStatus.TODO
        task.completed_at = None

    db.commit()
    db.refresh(task)
    return _build_task_response(task)


@router.delete("/{project_id}/tasks/{task_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_task(project_id: int, task_id: int, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    project = _get_project_or_404(project_id, db)
    if not _can_edit(project, current_user):
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Se requiere rol manager o superior.")
    task = db.query(Task).filter_by(id=task_id, project_id=project_id).first()
    if not task:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Tarea no encontrada.")
    db.delete(task)
    db.commit()


# ── Comentarios ───────────────────────────────────────────────────────────────

@router.post("/{project_id}/tasks/{task_id}/comments", response_model=CommentResponse, status_code=status.HTTP_201_CREATED)
def add_comment(project_id: int, task_id: int, data: CommentCreate, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    project = _get_project_or_404(project_id, db)
    _check_member(project, current_user, MemberRole.MEMBER)
    task = db.query(Task).filter_by(id=task_id, project_id=project_id).first()
    if not task:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Tarea no encontrada.")
    c = TaskComment(task_id=task_id, user_id=current_user.id, content=data.content)
    db.add(c)
    db.commit()
    db.refresh(c)
    return CommentResponse(id=c.id, task_id=c.task_id, content=c.content, is_deleted=c.is_deleted,
        edited_at=c.edited_at, created_at=c.created_at,
        user=UserMini(id=current_user.id, full_name=current_user.full_name, email=current_user.email))


# ── Time Tracking ──────────────────────────────────────────────────────────────

@router.post("/{project_id}/tasks/{task_id}/time", response_model=TimeLogResponse, status_code=status.HTTP_201_CREATED)
def log_time(project_id: int, task_id: int, data: TimeLogCreate, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    project = _get_project_or_404(project_id, db)
    _check_member(project, current_user, MemberRole.MEMBER)
    task = db.query(Task).filter_by(id=task_id, project_id=project_id).first()
    if not task:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Tarea no encontrada.")
    log = TimeLog(task_id=task_id, user_id=current_user.id, **data.model_dump())
    db.add(log)

    # Recalcular logged_hours en la tarea
    total = db.query(func.sum(TimeLog.hours)).filter(TimeLog.task_id == task_id).scalar() or 0
    task.logged_hours = float(total) + float(data.hours)

    db.commit()
    db.refresh(log)
    return TimeLogResponse(id=log.id, task_id=log.task_id, user_id=log.user_id,
        hours=float(log.hours), date_worked=log.date_worked, description=log.description,
        created_at=log.created_at,
        user=UserMini(id=current_user.id, full_name=current_user.full_name, email=current_user.email))


@router.get("/{project_id}/tasks/{task_id}/time", response_model=list[TimeLogResponse])
def get_time_logs(project_id: int, task_id: int, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    project = _get_project_or_404(project_id, db)
    _check_member(project, current_user)
    logs = db.query(TimeLog).filter(TimeLog.task_id == task_id).options(joinedload(TimeLog.user)).order_by(TimeLog.date_worked.desc()).all()
    return [TimeLogResponse(id=l.id, task_id=l.task_id, user_id=l.user_id,
        hours=float(l.hours), date_worked=l.date_worked, description=l.description, created_at=l.created_at,
        user=UserMini(id=l.user.id, full_name=l.user.full_name, email=l.user.email) if l.user else None
    ) for l in logs]


# ══════════════════════════════════════════════════════════════════════════════
# AUDIT LINKS
# ══════════════════════════════════════════════════════════════════════════════

@router.get("/{project_id}/audit-links", response_model=list[AuditLinkResponse])
def list_audit_links(project_id: int, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    project = _get_project_or_404(project_id, db)
    _check_member(project, current_user)
    links = db.query(ProjectAuditLink).filter(ProjectAuditLink.project_id == project_id).all()
    return [AuditLinkResponse(id=l.id, project_id=l.project_id, audit_id=l.audit_id, note=l.note, linked_at=l.linked_at) for l in links]


@router.post("/{project_id}/audit-links", response_model=AuditLinkResponse, status_code=status.HTTP_201_CREATED)
def add_audit_link(project_id: int, data: AuditLinkCreate, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    project = _get_project_or_404(project_id, db)
    if not _can_edit(project, current_user):
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Se requiere rol manager o superior.")
    if db.query(ProjectAuditLink).filter_by(project_id=project_id, audit_id=data.audit_id).first():
        raise HTTPException(status.HTTP_409_CONFLICT, "Este vínculo ya existe.")
    link = ProjectAuditLink(project_id=project_id, **data.model_dump())
    db.add(link)
    db.commit()
    db.refresh(link)
    return AuditLinkResponse(id=link.id, project_id=link.project_id, audit_id=link.audit_id, note=link.note, linked_at=link.linked_at)


@router.delete("/{project_id}/audit-links/{link_id}", status_code=status.HTTP_204_NO_CONTENT)
def remove_audit_link(project_id: int, link_id: int, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    project = _get_project_or_404(project_id, db)
    if not _can_edit(project, current_user):
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Se requiere rol manager o superior.")
    link = db.query(ProjectAuditLink).filter_by(id=link_id, project_id=project_id).first()
    if not link:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Vínculo no encontrado.")
    db.delete(link)
    db.commit()