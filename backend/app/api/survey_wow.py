"""
survey_wow.py — Router del módulo Servicio WOW 2026 (encuestas).

Endpoints (prefix /servicio-wow):
    GET  /cycles                 — ciclos
    GET  /departments            — departamentos evaluados
    GET  /criteria               — los 6 criterios de la rúbrica interna
    GET  /forms                  — formularios (filtros: cycle_id, department_id, survey_type, branch)
    GET  /responses              — respuestas importadas, paginadas (SIN datos del respondiente; filtros: form_id,
                                   department_id, survey_type, cycle_id, branch)
    GET  /dashboard/interno      — % (puntos / respuestas×5) por criterio / departamento / formulario
    GET  /dashboard/externo      — % por pregunta de cada formulario
    GET  /nominations            — votos por nominado (Embajador del Servicio WOW; filtros: cycle_id, department_id, branch)

Los tres endpoints del dashboard y /responses aceptan los mismos filtros
(cycle_id, department_id, branch): los reportes de resultados (api/reports_wow.py)
los consumen tal cual, filtrados a un departamento / sucursal / ciclo.
    GET  /forms/{id}             — detalle con preguntas
    POST /forms/{id}/import      — importar Excel exportado de Microsoft Forms (admin)
    POST /forms/nominees         — cargar nominados desde los .txt de Forms (admin; los usa el sorteo)
"""

import logging
from math import ceil
from typing import Optional

from fastapi import APIRouter, Depends, File, HTTPException, Query, UploadFile, status
from sqlalchemy import func
from sqlalchemy.orm import Session, selectinload

from app.core.database import get_db
from app.core.dependencies import get_current_user, require_admin
from app.models.survey_wow_models import (
    QuestionType, SurveyCriteria, SurveyCycle, SurveyDepartment, SurveyForm,
    SurveyResponse, SurveyType,
)
from app.models.user_models import User
from app.schemas.survey_wow_schemas import (
    WowAnswerOut, WowCriteriaOut, WowCycleOut, WowDepartmentOut, WowExternalDashboard,
    WowFormDetail, WowFormOut, WowImportResponse, WowInternalDashboard, WowNominationOut,
    WowNomineesImportResponse, WowQuestionOut, WowResponseListResponse, WowResponseOut,
)
from app.services import survey_wow_service
from app.services.roster_import_service import importar_nominados
from app.services.survey_wow_import_service import (
    SurveyWowFilenameMismatch, SurveyWowImportError, importar_respuestas_desde_excel,
)

logger = logging.getLogger(__name__)

router = APIRouter(
    prefix="/servicio-wow",
    tags=["Servicio WOW — Encuestas"],
    responses={404: {"description": "Recurso no encontrado"}},
)


def _get_form_or_404(form_id: int, db: Session) -> SurveyForm:
    form = (
        db.query(SurveyForm)
        .options(selectinload(SurveyForm.questions))
        .filter(SurveyForm.id == form_id)
        .first()
    )
    if not form:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Formulario id={form_id} no encontrado.",
        )
    return form


def _form_out(form: SurveyForm, n_responses: int = 0, last_at=None, cls=WowFormOut):
    data = dict(
        id=form.id, cycle_id=form.cycle_id, department_id=form.department_id,
        department_name=form.department.name, group_name=form.department.group_name,
        survey_type=form.survey_type, branch=form.branch, subprocess=form.subprocess,
        title=form.title, list_name=form.list_name,
        n_questions=len(form.questions), n_responses=n_responses, last_response_at=last_at,
        n_nominees=(len(form.nominees) if form.nominees is not None else None)
        if form.survey_type == SurveyType.INTERNO.value else None,
    )
    if cls is WowFormDetail:
        data["questions"] = [
            WowQuestionOut(
                id=q.id, order=q.order, text=q.text, question_type=q.question_type,
                criteria_id=q.criteria_id, criteria_code=q.criteria.code if q.criteria else None,
                is_required=q.is_required,
            )
            for q in sorted(form.questions, key=lambda q: q.order)
        ]
        data["nominees"] = list(form.nominees or [])
    return cls(**data)


# ─────────────────────────────────────────────────────────────────────────────
# CATÁLOGOS
# ─────────────────────────────────────────────────────────────────────────────

@router.get("/cycles", response_model=list[WowCycleOut], summary="Listar ciclos del Servicio WOW")
def list_cycles(
    current_user: User    = Depends(get_current_user),
    db:           Session = Depends(get_db),
):
    return db.query(SurveyCycle).order_by(SurveyCycle.year.desc()).all()


@router.get("/departments", response_model=list[WowDepartmentOut], summary="Listar departamentos evaluados")
def list_departments(
    current_user: User    = Depends(get_current_user),
    db:           Session = Depends(get_db),
):
    return db.query(SurveyDepartment).order_by(SurveyDepartment.name).all()


@router.get("/criteria", response_model=list[WowCriteriaOut], summary="Criterios de la rúbrica interna")
def list_criteria(
    current_user: User    = Depends(get_current_user),
    db:           Session = Depends(get_db),
):
    return db.query(SurveyCriteria).order_by(SurveyCriteria.order).all()


@router.get("/forms", response_model=list[WowFormOut], summary="Listar formularios")
def list_forms(
    cycle_id:      Optional[int] = Query(None),
    department_id: Optional[int] = Query(None),
    survey_type:   Optional[str] = Query(None, pattern="^(interno|externo)$"),
    branch:        Optional[str] = Query(None),
    current_user:  User          = Depends(get_current_user),
    db:            Session       = Depends(get_db),
):
    q = db.query(SurveyForm).options(selectinload(SurveyForm.questions))
    if cycle_id:
        q = q.filter(SurveyForm.cycle_id == cycle_id)
    if department_id:
        q = q.filter(SurveyForm.department_id == department_id)
    if survey_type:
        q = q.filter(SurveyForm.survey_type == survey_type)
    if branch:
        q = q.filter(SurveyForm.branch == branch)
    forms = q.all()

    stats = {
        form_id: (n, last)
        for form_id, n, last in db.query(
            SurveyResponse.form_id, func.count(SurveyResponse.id), func.max(SurveyResponse.completed_at),
        ).group_by(SurveyResponse.form_id)
    }
    out = [_form_out(f, *stats.get(f.id, (0, None))) for f in forms]
    out.sort(key=lambda f: (f.survey_type, f.department_name, f.subprocess or "", f.branch or ""))
    return out


# ─────────────────────────────────────────────────────────────────────────────
# RESPUESTAS (anónimas)
# ─────────────────────────────────────────────────────────────────────────────

@router.get(
    "/responses",
    response_model=WowResponseListResponse,
    summary="Listar respuestas importadas (anónimas)",
    description=(
        "Nunca incluye nombre ni correo del respondiente (no se guardan). "
        "Las respuestas a campos identificadores (Cliente, Teléfono...) solo se "
        "muestran a administradores."
    ),
)
def list_responses(
    form_id:       Optional[int] = Query(None),
    department_id: Optional[int] = Query(None),
    survey_type:   Optional[str] = Query(None, pattern="^(interno|externo)$"),
    cycle_id:      Optional[int] = Query(None),
    branch:        Optional[str] = Query(None),
    page:          int           = Query(1, ge=1),
    page_size:     int           = Query(20, ge=1, le=100),
    current_user:  User          = Depends(get_current_user),
    db:            Session       = Depends(get_db),
):
    q = db.query(SurveyResponse).join(SurveyForm, SurveyResponse.form_id == SurveyForm.id)
    if form_id:
        q = q.filter(SurveyResponse.form_id == form_id)
    if department_id:
        q = q.filter(SurveyForm.department_id == department_id)
    if survey_type:
        q = q.filter(SurveyForm.survey_type == survey_type)
    if cycle_id:
        q = q.filter(SurveyForm.cycle_id == cycle_id)
    if branch:
        q = q.filter(SurveyForm.branch == branch)

    total = q.count()
    responses = (
        q.options(
            selectinload(SurveyResponse.answers),
            selectinload(SurveyResponse.nomination),
            selectinload(SurveyResponse.form).selectinload(SurveyForm.questions),
        )
        .order_by(SurveyResponse.completed_at.desc(), SurveyResponse.id.desc())
        .offset((page - 1) * page_size)
        .limit(page_size)
        .all()
    )

    items = []
    for r in responses:
        q_by_id = {q.id: q for q in r.form.questions}
        answers = []
        for a in r.answers:
            question = q_by_id.get(a.question_id)
            if question is None:
                continue
            value_text = a.value_text
            if question.question_type == QuestionType.IDENTIFIER.value and not current_user.is_admin:
                value_text = "••••" if value_text else None
            answers.append(WowAnswerOut(
                question_id=a.question_id, order=question.order,
                question_type=question.question_type,
                value_score=a.value_score, value_text=value_text,
            ))
        answers.sort(key=lambda x: x.order)
        scores = [a.value_score for a in answers if a.value_score is not None]
        items.append(WowResponseOut(
            id=r.id, form_id=r.form_id, form_title=r.form.title,
            department_name=r.form.department.name, branch=r.form.branch,
            survey_type=r.form.survey_type, external_response_id=r.external_response_id,
            completed_at=r.completed_at,
            promedio=round(sum(scores) / len(scores), 2) if scores else None,
            porcentaje=round(sum(scores) / (len(scores) * 5) * 100, 1) if scores else None,
            answers=answers,
            nominee_name=r.nomination.nominee_name if r.nomination else None,
            nomination_reason=r.nomination.reason if r.nomination else None,
        ))

    total_pages = ceil(total / page_size) if total > 0 else 1
    return WowResponseListResponse(
        items=items, total=total, page=page, page_size=page_size,
        total_pages=total_pages, has_next=page < total_pages, has_prev=page > 1,
    )


# ─────────────────────────────────────────────────────────────────────────────
# DASHBOARD Y NOMINACIONES
# ─────────────────────────────────────────────────────────────────────────────

@router.get("/dashboard/interno", response_model=WowInternalDashboard, summary="Dashboard cliente interno (por criterio)")
def get_dashboard_interno(
    cycle_id:      Optional[int] = Query(None),
    department_id: Optional[int] = Query(None),
    branch:        Optional[str] = Query(None),
    current_user:  User          = Depends(get_current_user),
    db:            Session       = Depends(get_db),
):
    return survey_wow_service.dashboard_interno(db, cycle_id, department_id, branch)


@router.get("/dashboard/externo", response_model=WowExternalDashboard, summary="Dashboard cliente externo (por pregunta)")
def get_dashboard_externo(
    cycle_id:      Optional[int] = Query(None),
    department_id: Optional[int] = Query(None),
    branch:        Optional[str] = Query(None),
    current_user:  User          = Depends(get_current_user),
    db:            Session       = Depends(get_db),
):
    return survey_wow_service.dashboard_externo(db, cycle_id, department_id, branch)


@router.get("/nominations", response_model=list[WowNominationOut], summary="Votos por nominado a Embajador del Servicio WOW")
def list_nominations(
    cycle_id:      Optional[int] = Query(None),
    department_id: Optional[int] = Query(None),
    branch:        Optional[str] = Query(None),
    current_user:  User          = Depends(get_current_user),
    db:            Session       = Depends(get_db),
):
    return survey_wow_service.nominaciones(db, cycle_id, department_id, branch)


@router.post(
    "/forms/nominees",
    response_model=WowNomineesImportResponse,
    summary="Cargar nominados desde los .txt de Microsoft Forms (admin)",
    description=(
        "Acepta varios .txt a la vez (los de 'Formularios Cliente Interno'). Cada archivo se "
        "asocia al formulario interno cuyo título coincide con el nombre del archivo. "
        "El sorteo excluye a los nominados de cada formulario (conflicto de interés)."
    ),
)
async def upload_nominees(
    files:    list[UploadFile] = File(...),
    cycle_id: Optional[int]    = Query(None),
    _:        User             = Depends(require_admin),
    db:       Session          = Depends(get_db),
):
    cid = cycle_id or (
        db.query(SurveyCycle.id).filter(SurveyCycle.is_active == True)  # noqa: E712
        .order_by(SurveyCycle.year.desc()).limit(1).scalar()
    )
    if not cid:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "No hay un ciclo activo del Servicio WOW.")
    archivos = []
    for f in files:
        if not (f.filename or "").lower().endswith(".txt"):
            raise HTTPException(400, f"'{f.filename}' no es un .txt.")
        archivos.append((f.filename, await f.read()))
    r = importar_nominados(archivos, db, cid)
    return WowNomineesImportResponse(
        message=f"Nominados cargados en {r.formularios_actualizados} formulario(s).",
        formularios_actualizados=r.formularios_actualizados,
        sin_formulario=r.sin_formulario, sin_nominados=r.sin_nominados, detalle=r.detalle,
    )


# ─────────────────────────────────────────────────────────────────────────────
# FORMULARIO POR ID (siempre después de las rutas estáticas)
# ─────────────────────────────────────────────────────────────────────────────

@router.get("/forms/{form_id}", response_model=WowFormDetail, summary="Detalle de un formulario con sus preguntas")
def get_form(
    form_id:      int,
    current_user: User    = Depends(get_current_user),
    db:           Session = Depends(get_db),
):
    form = _get_form_or_404(form_id, db)
    n, last = db.query(func.count(SurveyResponse.id), func.max(SurveyResponse.completed_at)).filter(
        SurveyResponse.form_id == form_id,
    ).one()
    return _form_out(form, n, last, cls=WowFormDetail)


@router.post(
    "/forms/{form_id}/import",
    response_model=WowImportResponse,
    summary="Importar respuestas desde el Excel exportado de Microsoft Forms (admin)",
    description=(
        "Deduplica por la columna `ID` del export. Descarta nombre y correo del "
        "respondiente. En formularios internos marca como completo al evaluador "
        "de la lista que calce. La primera importación crea las preguntas del "
        "formulario; si el nombre del archivo no corresponde al formulario responde "
        "409 y hay que reenviar con `forzar=true`."
    ),
)
async def import_form_responses(
    form_id: int,
    file:    UploadFile = File(...),
    forzar:  bool       = Query(False, description="Confirmar que el archivo es de este formulario"),
    _:       User       = Depends(require_admin),
    db:      Session    = Depends(get_db),
):
    _get_form_or_404(form_id, db)
    if not file.filename or not file.filename.lower().endswith((".xlsx", ".xls")):
        raise HTTPException(400, "Solo se aceptan archivos Excel (.xlsx o .xls).")
    file_bytes = await file.read()
    if not file_bytes:
        raise HTTPException(400, "El archivo está vacío.")

    logger.info(f"Importando respuestas Servicio WOW form_id={form_id} | {len(file_bytes)} bytes")
    try:
        result = importar_respuestas_desde_excel(
            file_bytes=file_bytes, form_id=form_id, db=db,
            filename=file.filename, force_new_questions=forzar,
        )
    except SurveyWowFilenameMismatch as e:
        db.rollback()
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(e))
    except SurveyWowImportError as e:
        db.rollback()
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(e))

    return WowImportResponse(
        message=(
            f"Importación completada: {result.importadas} nuevas, "
            f"{result.duplicadas} duplicadas."
        ),
        importadas=result.importadas,
        duplicadas=result.duplicadas,
        sin_match_evaluador=result.sin_match_evaluador,
        evaluadores_completados=result.evaluadores_completados,
        preguntas_creadas=result.preguntas_creadas,
        errores_n=len(result.errores),
        errores=result.errores[:50],
        advertencias=result.advertencias,
    )
