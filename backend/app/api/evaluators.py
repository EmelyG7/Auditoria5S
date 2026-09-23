"""
evaluators.py — Router de programación y asignación de evaluadores (Servicio WOW 2026).

Endpoints (prefix /servicio-wow/evaluadores):
    GET  /schedule               — cronograma: una fila por lista de evaluación
    GET  /assignments            — asignaciones paginadas (filtros: lista, depto, estado, rol)
    GET  /participation-matrix   — replica 'Matriz_Participacion' (calculada)
    GET  /sample-summary         — replica 'Resumen_Muestra' (calculada)
    GET  /sampling-config        — parámetros del muestreo
    PUT  /sampling-config        — (admin) editar parámetros, excluidos y reglas de no repetición
    POST /import                 — (admin) importar Servicio_WOW_2026_Evaluadores.xlsx
    POST /roster/import          — (admin) importar el listado de personal (LISTADO_DE_PERSONAL_2026.xlsx)
    GET  /employees              — buscar colaboradores (para la configuración)
    GET  /sorteo/evaluaciones    — evaluaciones del cronograma y si se pueden re-sortear
    POST /sorteo/preview         — (admin) calcular el sorteo sin guardar
    POST /sorteo/apply           — (admin) confirmar el sorteo de la vista previa
    PUT  /schedule/{id}          — (admin) ajustar fechas / muestras / cierre de una lista
    GET  /schedule/{id}/candidatos  — (admin) personas elegibles para ampliar la lista, con sugeridas
    POST /schedule/{id}/assignments — (admin) agregar titulares a una lista (también cerrada)
    PATCH  /assignments/{id}     — (admin) marcar respondió / pendiente a mano
    DELETE /assignments/{id}     — (admin) quitar una asignación pendiente

Si no se pasa cycle_id se usa el ciclo activo más reciente.
"""

import logging
import re
from math import ceil
from typing import Optional

from fastapi import APIRouter, Depends, File, HTTPException, Query, UploadFile, status
from sqlalchemy.orm import Session, joinedload

from app.core.database import get_db
from app.core.dependencies import get_current_user, require_admin
from app.models.evaluator_models import (
    AssignmentStatus, Employee, EvaluationAssignment, SamplingConfig, ScheduleEntry,
)
from app.models.survey_wow_models import SurveyCycle
from app.models.user_models import User
from app.schemas.evaluator_schemas import (
    AdicionalesPreview, AgregarEvaluadoresRequest, AgregarEvaluadoresResponse,
    AssignmentStatusUpdate, AssignmentListResponse, AssignmentOut, EmployeeOut, EvaluatorImportResponse, ParticipationMatrix,
    RosterImportResponse, SampleSummary, SamplingConfigOut, SamplingConfigUpdate, ScheduleEntryOut,
    ScheduleEntryUpdate, SorteoApplyRequest, SorteoApplyResponse, SorteoEvaluacion, SorteoPreview,
    SorteoRequest,
)
from app.services import evaluator_service, sampling_service
from app.services.evaluator_import_service import importar_evaluadores_desde_excel
from app.services.roster_import_service import importar_listado_personal
from app.services.sampling_rules import EVALUACION_POR_CLAVE
from app.services.sampling_service import SamplingError

logger = logging.getLogger(__name__)

router = APIRouter(
    prefix="/servicio-wow/evaluadores",
    tags=["Servicio WOW — Evaluadores"],
    responses={404: {"description": "Recurso no encontrado"}},
)


def _resolve_cycle_id(cycle_id: Optional[int], db: Session) -> int:
    if cycle_id:
        if not db.query(SurveyCycle.id).filter(SurveyCycle.id == cycle_id).first():
            raise HTTPException(status.HTTP_404_NOT_FOUND, f"Ciclo id={cycle_id} no encontrado.")
        return cycle_id
    cycle = (
        db.query(SurveyCycle)
        .filter(SurveyCycle.is_active == True)  # noqa: E712
        .order_by(SurveyCycle.year.desc())
        .first()
    )
    if not cycle:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "No hay un ciclo activo del Servicio WOW.")
    return cycle.id


def _entry_out(e: ScheduleEntry) -> ScheduleEntryOut:
    return ScheduleEntryOut(
        id=e.id, cycle_id=e.cycle_id, list_name=e.list_name, schedule_number=e.schedule_number,
        department_id=e.department_id, department_name=e.department.name, branch=e.branch,
        send_date=e.send_date, tabulation_date=e.tabulation_date,
        disclosure_date=e.disclosure_date, report_delivery_date=e.report_delivery_date,
        evaluator_areas_raw=e.evaluator_areas_raw,
        internal_sample_raw=e.internal_sample_raw, external_sample_raw=e.external_sample_raw,
        internal_sample_size=e.internal_sample_size, external_sample_size=e.external_sample_size,
        is_closed=e.is_closed,
        titulares=sum(1 for a in e.assignments if a.role == "titular"),
        suplentes=sum(1 for a in e.assignments if a.role == "suplente"),
        completados=sum(1 for a in e.assignments if a.status == "completo"),
    )


# ─────────────────────────────────────────────────────────────────────────────
# CRONOGRAMA Y ASIGNACIONES
# ─────────────────────────────────────────────────────────────────────────────

@router.get("/schedule", response_model=list[ScheduleEntryOut], summary="Cronograma de listas de evaluación")
def list_schedule(
    cycle_id:     Optional[int] = Query(None),
    current_user: User          = Depends(get_current_user),
    db:           Session       = Depends(get_db),
):
    cid = _resolve_cycle_id(cycle_id, db)
    entries = (
        db.query(ScheduleEntry)
        .options(joinedload(ScheduleEntry.assignments))
        .filter(ScheduleEntry.cycle_id == cid)
        .order_by(ScheduleEntry.send_date, ScheduleEntry.schedule_number, ScheduleEntry.list_name)
        .all()
    )
    return [_entry_out(e) for e in entries]


@router.get("/assignments", response_model=AssignmentListResponse, summary="Asignaciones de evaluadores")
def list_assignments(
    cycle_id:          Optional[int] = Query(None),
    schedule_entry_id: Optional[int] = Query(None),
    department_id:     Optional[int] = Query(None),
    status_filter:     Optional[str] = Query(None, alias="status", pattern="^(pendiente|completo)$"),
    role:              Optional[str] = Query(None, pattern="^(titular|suplente)$"),
    search:            Optional[str] = Query(None, description="Buscar por nombre del colaborador"),
    page:              int           = Query(1, ge=1),
    page_size:         int           = Query(50, ge=1, le=200),
    current_user:      User          = Depends(get_current_user),
    db:                Session       = Depends(get_db),
):
    cid = _resolve_cycle_id(cycle_id, db)
    q = (
        db.query(EvaluationAssignment)
        .join(ScheduleEntry, EvaluationAssignment.schedule_entry_id == ScheduleEntry.id)
        .join(Employee, EvaluationAssignment.employee_id == Employee.id)
        .filter(ScheduleEntry.cycle_id == cid)
    )
    if schedule_entry_id:
        q = q.filter(EvaluationAssignment.schedule_entry_id == schedule_entry_id)
    if department_id:
        q = q.filter(ScheduleEntry.department_id == department_id)
    if status_filter:
        q = q.filter(EvaluationAssignment.status == status_filter)
    if role:
        q = q.filter(EvaluationAssignment.role == role)
    if search:
        q = q.filter(Employee.full_name.ilike(f"%{search.strip()}%"))

    total = q.count()
    rows = (
        q.options(joinedload(EvaluationAssignment.schedule_entry).joinedload(ScheduleEntry.department))
        .order_by(ScheduleEntry.send_date, ScheduleEntry.list_name, EvaluationAssignment.role.desc(), Employee.full_name)
        .offset((page - 1) * page_size)
        .limit(page_size)
        .all()
    )
    items = [
        AssignmentOut(
            id=a.id, schedule_entry_id=a.schedule_entry_id,
            list_name=a.schedule_entry.list_name,
            department_name=a.schedule_entry.department.name,
            employee_id=a.employee_id, employee_name=a.employee.full_name,
            position=a.employee.position,
            employee_area=a.employee.area.name if a.employee.area else None,
            location=a.employee.location,
            evaluator_area=a.evaluator_area.name if a.evaluator_area else None,
            role=a.role, status=a.status,
        )
        for a in rows
    ]
    total_pages = ceil(total / page_size) if total > 0 else 1
    return AssignmentListResponse(
        items=items, total=total, page=page, page_size=page_size,
        total_pages=total_pages, has_next=page < total_pages, has_prev=page > 1,
    )


# ─────────────────────────────────────────────────────────────────────────────
# VISTAS DERIVADAS
# ─────────────────────────────────────────────────────────────────────────────

@router.get("/participation-matrix", response_model=ParticipationMatrix, summary="Matriz de participación (calculada)")
def get_participation_matrix(
    cycle_id:     Optional[int] = Query(None),
    current_user: User          = Depends(get_current_user),
    db:           Session       = Depends(get_db),
):
    return evaluator_service.participation_matrix(db, _resolve_cycle_id(cycle_id, db))


@router.get("/sample-summary", response_model=SampleSummary, summary="Resumen de muestra (calculado)")
def get_sample_summary(
    cycle_id:     Optional[int] = Query(None),
    current_user: User          = Depends(get_current_user),
    db:           Session       = Depends(get_db),
):
    return evaluator_service.sample_summary(db, _resolve_cycle_id(cycle_id, db))


# ─────────────────────────────────────────────────────────────────────────────
# CONFIGURACIÓN DE MUESTREO
# ─────────────────────────────────────────────────────────────────────────────

def _get_config_or_404(cycle_id: int, db: Session) -> SamplingConfig:
    cfg = db.query(SamplingConfig).filter(SamplingConfig.cycle_id == cycle_id).first()
    if not cfg:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "El ciclo no tiene configuración de muestreo.")
    return cfg


@router.get("/sampling-config", response_model=SamplingConfigOut, summary="Parámetros del muestreo")
def get_sampling_config(
    cycle_id:     Optional[int] = Query(None),
    current_user: User          = Depends(get_current_user),
    db:           Session       = Depends(get_db),
):
    return _get_config_or_404(_resolve_cycle_id(cycle_id, db), db)


@router.put("/sampling-config", response_model=SamplingConfigOut, summary="Editar parámetros del muestreo (admin)")
def update_sampling_config(
    payload:  SamplingConfigUpdate,
    cycle_id: Optional[int] = Query(None),
    _:        User          = Depends(require_admin),
    db:       Session       = Depends(get_db),
):
    cfg = _get_config_or_404(_resolve_cycle_id(cycle_id, db), db)
    data = payload.model_dump(exclude_unset=True)
    if data.get("evitar_repeticion"):
        malas = sorted({c for k, v in data["evitar_repeticion"].items() for c in [k, *v]} - set(EVALUACION_POR_CLAVE))
        if malas:
            raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY,
                                f"Listas desconocidas en la regla de no repetición: {malas}")
    if data.get("puestos_sin_interaccion_regex"):
        try:
            re.compile(data["puestos_sin_interaccion_regex"])
        except re.error as e:
            raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, f"Expresión de puestos no válida: {e}")
    for field_name, value in data.items():
        setattr(cfg, field_name, value)
    db.commit()
    db.refresh(cfg)
    return cfg


# ─────────────────────────────────────────────────────────────────────────────
# IMPORTACIÓN
# ─────────────────────────────────────────────────────────────────────────────

@router.post(
    "/import",
    response_model=EvaluatorImportResponse,
    summary="Importar Servicio_WOW_2026_Evaluadores.xlsx (admin)",
    description=(
        "Lee las hojas Cronograma, Evaluadores y la columna 'Muestra requerida' de "
        "Resumen_Muestra. Reemplazo manual: las asignaciones pendientes que ya no "
        "aparecen en el Excel se eliminan; las completas se conservan."
    ),
)
async def import_evaluators(
    file:     UploadFile    = File(...),
    cycle_id: Optional[int] = Query(None),
    _:        User          = Depends(require_admin),
    db:       Session       = Depends(get_db),
):
    if not file.filename or not file.filename.lower().endswith((".xlsx", ".xls")):
        raise HTTPException(400, "Solo se aceptan archivos Excel (.xlsx o .xls).")
    file_bytes = await file.read()
    if not file_bytes:
        raise HTTPException(400, "El archivo está vacío.")
    cid = _resolve_cycle_id(cycle_id, db)

    logger.info(f"Importando evaluadores Servicio WOW: '{file.filename}' | {len(file_bytes)} bytes")
    result = importar_evaluadores_desde_excel(file_bytes=file_bytes, db=db, cycle_id=cid)
    if result.errores and not (result.listas_creadas or result.listas_actualizadas):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=result.errores[0].get("error", "No se pudo importar el archivo."),
        )

    return EvaluatorImportResponse(
        message=(
            f"Importación completada: {result.listas_creadas + result.listas_actualizadas} listas, "
            f"{result.asignaciones_creadas} asignaciones nuevas, "
            f"{result.asignaciones_eliminadas} eliminadas."
        ),
        listas_creadas=result.listas_creadas,
        listas_actualizadas=result.listas_actualizadas,
        colaboradores_creados=result.colaboradores_creados,
        asignaciones_creadas=result.asignaciones_creadas,
        asignaciones_actualizadas=result.asignaciones_actualizadas,
        asignaciones_eliminadas=result.asignaciones_eliminadas,
        departamentos_creados=result.departamentos_creados,
        advertencias=result.advertencias,
        errores_n=len(result.errores),
        errores=result.errores[:50],
    )


# ─────────────────────────────────────────────────────────────────────────────
# LISTADO DE PERSONAL
# ─────────────────────────────────────────────────────────────────────────────

@router.post(
    "/roster/import",
    response_model=RosterImportResponse,
    summary="Importar el listado de personal (admin)",
    description=(
        "Columnas por posición: Nombre, Primera fecha del contrato, Puesto de trabajo, "
        "Departamento (ruta) y Ubicación de trabajo. Quien ya no aparece deja de participar "
        "en el sorteo; sus asignaciones existentes no se tocan."
    ),
)
async def import_roster(
    file:     UploadFile    = File(...),
    cycle_id: Optional[int] = Query(None),
    _:        User          = Depends(require_admin),
    db:       Session       = Depends(get_db),
):
    if not file.filename or not file.filename.lower().endswith((".xlsx", ".xls")):
        raise HTTPException(400, "Solo se aceptan archivos Excel (.xlsx o .xls).")
    file_bytes = await file.read()
    if not file_bytes:
        raise HTTPException(400, "El archivo está vacío.")
    cfg = db.query(SamplingConfig).filter(SamplingConfig.cycle_id == _resolve_cycle_id(cycle_id, db)).first()
    try:
        r = importar_listado_personal(file_bytes, db, cfg.puestos_sin_interaccion_regex if cfg else "")
    except ValueError as e:
        db.rollback()
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, str(e))
    return RosterImportResponse(
        message=f"Listado importado: {r.total} colaboradores ({r.creados} nuevos, {r.fuera_del_listado} ya no están).",
        total=r.total, creados=r.creados, actualizados=r.actualizados,
        fuera_del_listado=r.fuera_del_listado, advertencias=r.advertencias,
    )


@router.get("/employees", response_model=list[EmployeeOut], summary="Buscar colaboradores")
def search_employees(
    search:       Optional[str] = Query(None, min_length=2),
    solo_listado: bool          = Query(True, description="Solo quienes están en el listado vigente"),
    limit:        int           = Query(20, ge=1, le=100),
    current_user: User          = Depends(get_current_user),
    db:           Session       = Depends(get_db),
):
    q = db.query(Employee).options(joinedload(Employee.area))
    if solo_listado:
        q = q.filter(Employee.roster_order.isnot(None))
    if search:
        q = q.filter(Employee.full_name.ilike(f"%{search.strip()}%"))
    return [
        EmployeeOut(id=e.id, full_name=e.full_name, position=e.position,
                    area=e.area.name if e.area else None, location=e.location,
                    hire_date=e.hire_date, en_listado=e.roster_order is not None)
        for e in q.order_by(Employee.full_name).limit(limit).all()
    ]


# ─────────────────────────────────────────────────────────────────────────────
# SORTEO (Fase 2: motor de asignar_evaluadores_wow.py dentro de la app)
# ─────────────────────────────────────────────────────────────────────────────

@router.get("/sorteo/evaluaciones", response_model=list[SorteoEvaluacion],
            summary="Evaluaciones del cronograma y si se pueden re-sortear")
def list_sorteo_evaluaciones(
    cycle_id:     Optional[int] = Query(None),
    current_user: User          = Depends(get_current_user),
    db:           Session       = Depends(get_db),
):
    return sampling_service.evaluaciones_disponibles(db, _resolve_cycle_id(cycle_id, db))


@router.post(
    "/sorteo/preview",
    response_model=SorteoPreview,
    summary="Calcular el sorteo sin guardar (admin)",
    description=(
        "Re-sortea las evaluaciones indicadas; el resto se conserva y su carga cuenta. "
        "Listas cerradas o con respuestas completadas no se pueden re-sortear. "
        "Devuelve un `token` que hay que enviar a /sorteo/apply para confirmar."
    ),
)
def sorteo_preview(
    payload:  SorteoRequest,
    cycle_id: Optional[int] = Query(None),
    _:        User          = Depends(require_admin),
    db:       Session       = Depends(get_db),
):
    try:
        return sampling_service.preview(db, _resolve_cycle_id(cycle_id, db), payload.claves)
    except SamplingError as e:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, str(e))


@router.post("/sorteo/apply", response_model=SorteoApplyResponse, summary="Confirmar el sorteo (admin)")
def sorteo_apply(
    payload:  SorteoApplyRequest,
    cycle_id: Optional[int] = Query(None),
    user:     User          = Depends(require_admin),
    db:       Session       = Depends(get_db),
):
    try:
        r = sampling_service.apply(db, _resolve_cycle_id(cycle_id, db), payload.claves, payload.token)
    except SamplingError as e:
        db.rollback()
        raise HTTPException(status.HTTP_409_CONFLICT, str(e))
    logger.info(f"Sorteo confirmado por {user.email}: {payload.claves}")
    return SorteoApplyResponse(
        message=(f"Sorteo guardado: {r['asignaciones_creadas']} asignaciones nuevas, "
                 f"{r['asignaciones_eliminadas']} eliminadas."),
        **r,
    )


# ─────────────────────────────────────────────────────────────────────────────
# LISTA POR ID (siempre después de las rutas estáticas)
# ─────────────────────────────────────────────────────────────────────────────

@router.put("/schedule/{entry_id}", response_model=ScheduleEntryOut, summary="Editar fechas de una lista (admin)")
def update_schedule_entry(
    entry_id: int,
    payload:  ScheduleEntryUpdate,
    _:        User    = Depends(require_admin),
    db:       Session = Depends(get_db),
):
    entry = db.query(ScheduleEntry).filter(ScheduleEntry.id == entry_id).first()
    if not entry:
        raise HTTPException(status.HTTP_404_NOT_FOUND, f"Lista id={entry_id} no encontrada.")
    for field_name, value in payload.model_dump(exclude_unset=True).items():
        setattr(entry, field_name, value)
    db.commit()
    db.refresh(entry)
    return _entry_out(entry)


@router.get("/schedule/{entry_id}/candidatos", response_model=AdicionalesPreview,
            summary="Personas elegibles para ampliar una lista (admin)")
def list_candidatos_adicionales(
    entry_id:     int,
    n:            int  = Query(8, ge=1, le=100, description="Cuántas sugerir"),
    solo_lideres: bool = Query(True, description="Solo gerentes, encargados, coordinadores, etc."),
    _:            User    = Depends(require_admin),
    db:           Session = Depends(get_db),
):
    entry = db.query(ScheduleEntry).filter(ScheduleEntry.id == entry_id).first()
    if not entry:
        raise HTTPException(status.HTTP_404_NOT_FOUND, f"Lista id={entry_id} no encontrada.")
    try:
        return sampling_service.candidatos_adicionales(db, entry.cycle_id, entry_id, n, solo_lideres)
    except SamplingError as e:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, str(e))


@router.post("/schedule/{entry_id}/assignments", response_model=AgregarEvaluadoresResponse,
             summary="Agregar titulares a una lista (admin)")
def add_assignments(
    entry_id: int,
    payload:  AgregarEvaluadoresRequest,
    user:     User    = Depends(require_admin),
    db:       Session = Depends(get_db),
):
    entry = db.query(ScheduleEntry).filter(ScheduleEntry.id == entry_id).first()
    if not entry:
        raise HTTPException(status.HTTP_404_NOT_FOUND, f"Lista id={entry_id} no encontrada.")
    try:
        r = sampling_service.agregar_evaluadores(db, entry.cycle_id, entry_id, payload.employee_ids)
    except SamplingError as e:
        db.rollback()
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, str(e))
    logger.info(f"{user.email} agregó {r['agregados']} evaluador(es) a la lista id={entry_id}")
    return AgregarEvaluadoresResponse(
        message=f"{r['agregados']} evaluador(es) agregado(s) a {entry.list_name}.", **r,
    )


def _get_assignment_or_404(assignment_id: int, db: Session) -> EvaluationAssignment:
    a = db.query(EvaluationAssignment).filter(EvaluationAssignment.id == assignment_id).first()
    if not a:
        raise HTTPException(status.HTTP_404_NOT_FOUND, f"Asignación id={assignment_id} no encontrada.")
    return a


@router.patch("/assignments/{assignment_id}", summary="Marcar respondió / pendiente a mano (admin)")
def update_assignment_status(
    assignment_id: int,
    payload:       AssignmentStatusUpdate,
    _:             User    = Depends(require_admin),
    db:            Session = Depends(get_db),
):
    a = _get_assignment_or_404(assignment_id, db)
    a.status = payload.status
    db.commit()
    return {"id": a.id, "status": a.status}


@router.delete("/assignments/{assignment_id}", status_code=status.HTTP_204_NO_CONTENT,
               summary="Quitar una asignación pendiente (admin)")
def delete_assignment(
    assignment_id: int,
    _:             User    = Depends(require_admin),
    db:            Session = Depends(get_db),
):
    a = _get_assignment_or_404(assignment_id, db)
    if a.status == AssignmentStatus.COMPLETO.value:
        raise HTTPException(status.HTTP_409_CONFLICT,
                            "Esta persona ya respondió; márcala como pendiente antes de quitarla.")
    db.delete(a)
    db.commit()
