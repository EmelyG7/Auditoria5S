"""
survey_wow_service.py — Agregados de lectura del Servicio WOW 2026 (dashboard y nominaciones).

Escala: cada respuesta Likert vale 1-5 puntos. El resultado se expresa en %
sobre el máximo posible:

    porcentaje = puntos obtenidos / (respuestas × 5) × 100   (= promedio / 5 × 100)

Así 5 en todo = 100 %, 4 en todo = 80 % y 1 en todo = 20 % (no 0 %).
El semáforo se aplica sobre ese % con los mismos cortes del módulo de
Encuestas: ≥90 % Excelente, ≥80 % Aceptable, <80 % Crítico.
También se devuelve `promedio` (1-5) como referencia.
"""

from collections import defaultdict
from typing import Optional

from sqlalchemy import func
from sqlalchemy.orm import Session

from app.models.survey_wow_models import (
    QuestionType, SurveyAnswer, SurveyCriteria, SurveyDepartment, SurveyForm,
    SurveyNomination, SurveyQuestion, SurveyResponse, SurveyType,
)
from app.schemas.survey_wow_schemas import (
    WowCriteriaKPI, WowDepartmentKPI, WowExternalDashboard, WowExternalFormKPI,
    WowFormKPI, WowInternalDashboard, WowNominationOut, WowQuestionKPI, WowScale,
)

PUNTAJE_MAXIMO = 5
SEMAFORO_EXCELENTE = 90.0   # %
SEMAFORO_ACEPTABLE = 80.0   # %

ESCALA = WowScale(excelente=SEMAFORO_EXCELENTE, aceptable=SEMAFORO_ACEPTABLE)


def estado_wow(porcentaje: Optional[float]) -> str:
    if porcentaje is None:
        return "Sin datos"
    if porcentaje >= SEMAFORO_EXCELENTE:
        return "Excelente"
    if porcentaje >= SEMAFORO_ACEPTABLE:
        return "Aceptable"
    return "Crítico"


def _r(v) -> Optional[float]:
    """Promedio 1-5 redondeado."""
    return round(float(v), 2) if v is not None else None


def _pct(avg) -> Optional[float]:
    """Promedio 1-5 → % sobre el puntaje máximo (puntos / (respuestas × 5) × 100)."""
    return round(float(avg) / PUNTAJE_MAXIMO * 100, 1) if avg is not None else None


def _likert_answers(db: Session, survey_type: str, cycle_id=None, department_id=None, branch=None):
    """Query base: respuestas Likert (1-5) de formularios del tipo dado, con filtros."""
    q = (
        db.query(SurveyAnswer)
        .join(SurveyQuestion, SurveyAnswer.question_id == SurveyQuestion.id)
        .join(SurveyResponse, SurveyAnswer.response_id == SurveyResponse.id)
        .join(SurveyForm, SurveyResponse.form_id == SurveyForm.id)
        .filter(
            SurveyForm.survey_type == survey_type,
            SurveyQuestion.question_type == QuestionType.LIKERT_5.value,
            SurveyAnswer.value_score.isnot(None),
        )
    )
    return _apply_form_filters(q, cycle_id, department_id, branch)


def _apply_form_filters(q, cycle_id=None, department_id=None, branch=None):
    if cycle_id:
        q = q.filter(SurveyForm.cycle_id == cycle_id)
    if department_id:
        q = q.filter(SurveyForm.department_id == department_id)
    if branch:
        q = q.filter(SurveyForm.branch == branch)
    return q


def _count_responses(db: Session, survey_type: str, cycle_id=None, department_id=None, branch=None) -> int:
    q = db.query(func.count(SurveyResponse.id)).join(SurveyForm, SurveyResponse.form_id == SurveyForm.id)
    q = q.filter(SurveyForm.survey_type == survey_type)
    return _apply_form_filters(q, cycle_id, department_id, branch).scalar() or 0


def _responses_by_form(db: Session, survey_type: str, cycle_id=None, department_id=None, branch=None):
    """[(SurveyForm, nº respuestas)] de los formularios con respuestas.
    Se cuenta por id y los formularios se cargan aparte: agrupar por la entidad
    completa falla en PostgreSQL (el departamento se carga con JOIN y sus columnas
    quedarían fuera del GROUP BY)."""
    q = db.query(SurveyForm.id, func.count(SurveyResponse.id)).join(
        SurveyResponse, SurveyResponse.form_id == SurveyForm.id,
    ).filter(SurveyForm.survey_type == survey_type)
    counts = dict(_apply_form_filters(q, cycle_id, department_id, branch).group_by(SurveyForm.id).all())
    forms = db.query(SurveyForm).filter(SurveyForm.id.in_(list(counts) or [0])).order_by(SurveyForm.id).all()
    return [(f, counts[f.id]) for f in forms]


# ─────────────────────────────────────────────────────────────────────────────
# DASHBOARD INTERNO — por criterio
# ─────────────────────────────────────────────────────────────────────────────

def dashboard_interno(db: Session, cycle_id=None, department_id=None, branch=None) -> WowInternalDashboard:
    tipo = SurveyType.INTERNO.value
    base = _likert_answers(db, tipo, cycle_id, department_id, branch)
    total = _count_responses(db, tipo, cycle_id, department_id, branch)
    avg_global = base.with_entities(func.avg(SurveyAnswer.value_score)).scalar()

    criterios_cat = db.query(SurveyCriteria).order_by(SurveyCriteria.order).all()

    # Por criterio
    por_crit = dict(
        (cid, (avg, n)) for cid, avg, n in base.with_entities(
            SurveyQuestion.criteria_id, func.avg(SurveyAnswer.value_score), func.count(SurveyAnswer.id),
        ).group_by(SurveyQuestion.criteria_id)
    )
    criterios = [
        WowCriteriaKPI(
            code=c.code, label=c.label,
            promedio=_r(por_crit.get(c.id, (None, 0))[0]),
            porcentaje=_pct(por_crit.get(c.id, (None, 0))[0]),
            n=por_crit.get(c.id, (None, 0))[1],
            estado=estado_wow(_pct(por_crit.get(c.id, (None, 0))[0])),
        )
        for c in criterios_cat
    ]

    # Por departamento × criterio (heatmap)
    code_by_id = {c.id: c.code for c in criterios_cat}
    celdas: dict[int, dict[str, Optional[float]]] = defaultdict(dict)
    for dept_id, crit_id, avg in base.with_entities(
        SurveyForm.department_id, SurveyQuestion.criteria_id, func.avg(SurveyAnswer.value_score),
    ).group_by(SurveyForm.department_id, SurveyQuestion.criteria_id):
        if crit_id in code_by_id:
            celdas[dept_id][code_by_id[crit_id]] = _pct(avg)

    dept_avg = dict(
        (d, a) for d, a in base.with_entities(
            SurveyForm.department_id, func.avg(SurveyAnswer.value_score),
        ).group_by(SurveyForm.department_id)
    )
    resp_q = db.query(SurveyForm.department_id, func.count(SurveyResponse.id)).join(
        SurveyResponse, SurveyResponse.form_id == SurveyForm.id,
    ).filter(SurveyForm.survey_type == tipo)
    dept_n = dict(_apply_form_filters(resp_q, cycle_id, department_id, branch).group_by(SurveyForm.department_id).all())

    depts = {d.id: d for d in db.query(SurveyDepartment).filter(SurveyDepartment.id.in_(list(dept_n) or [0]))}
    por_departamento = sorted(
        [
            WowDepartmentKPI(
                department_id=d_id,
                departamento=depts[d_id].name,
                group_name=depts[d_id].group_name,
                n_respuestas=n,
                promedio=_r(dept_avg.get(d_id)),
                porcentaje=_pct(dept_avg.get(d_id)),
                estado=estado_wow(_pct(dept_avg.get(d_id))),
                criterios=celdas.get(d_id, {}),
            )
            for d_id, n in dept_n.items() if d_id in depts
        ],
        key=lambda x: x.departamento,
    )

    # Por formulario (sucursal)
    form_avg = dict(
        (f, a) for f, a in base.with_entities(SurveyForm.id, func.avg(SurveyAnswer.value_score)).group_by(SurveyForm.id)
    )
    por_formulario = [
        WowFormKPI(
            form_id=f.id, title=f.title, departamento=f.department.name, branch=f.branch,
            n_respuestas=n, promedio=_r(form_avg.get(f.id)), porcentaje=_pct(form_avg.get(f.id)),
            estado=estado_wow(_pct(form_avg.get(f.id))),
        )
        for f, n in _responses_by_form(db, tipo, cycle_id, department_id, branch)
    ]
    por_formulario.sort(key=lambda x: (x.departamento, x.branch or ""))

    return WowInternalDashboard(
        escala=ESCALA,
        total_respuestas=total,
        promedio_global=_r(avg_global),
        porcentaje_global=_pct(avg_global),
        estado_global=estado_wow(_pct(avg_global)),
        criterios=criterios,
        por_departamento=por_departamento,
        por_formulario=por_formulario,
    )


# ─────────────────────────────────────────────────────────────────────────────
# DASHBOARD EXTERNO — por pregunta (no comparables entre departamentos)
# ─────────────────────────────────────────────────────────────────────────────

def dashboard_externo(db: Session, cycle_id=None, department_id=None, branch=None) -> WowExternalDashboard:
    tipo = SurveyType.EXTERNO.value
    base = _likert_answers(db, tipo, cycle_id, department_id, branch)
    total = _count_responses(db, tipo, cycle_id, department_id, branch)
    avg_global = base.with_entities(func.avg(SurveyAnswer.value_score)).scalar()

    # Distribución por pregunta
    dist: dict[int, dict[int, int]] = defaultdict(dict)
    for q_id, score, n in base.with_entities(
        SurveyQuestion.id, SurveyAnswer.value_score, func.count(SurveyAnswer.id),
    ).group_by(SurveyQuestion.id, SurveyAnswer.value_score):
        dist[q_id][int(score)] = n

    q_stats = {
        q_id: (avg, n) for q_id, avg, n in base.with_entities(
            SurveyQuestion.id, func.avg(SurveyAnswer.value_score), func.count(SurveyAnswer.id),
        ).group_by(SurveyQuestion.id)
    }
    form_avg = dict(
        (f, a) for f, a in base.with_entities(SurveyForm.id, func.avg(SurveyAnswer.value_score)).group_by(SurveyForm.id)
    )
    formularios = []
    for f, n in _responses_by_form(db, tipo, cycle_id, department_id, branch):
        preguntas = [
            WowQuestionKPI(
                question_id=q.id, order=q.order, text=q.text,
                promedio=_r(q_stats.get(q.id, (None, 0))[0]),
                porcentaje=_pct(q_stats.get(q.id, (None, 0))[0]),
                n=q_stats.get(q.id, (None, 0))[1],
                estado=estado_wow(_pct(q_stats.get(q.id, (None, 0))[0])),
                distribucion={k: dist[q.id].get(k, 0) for k in range(1, 6)},
            )
            for q in f.questions if q.question_type == QuestionType.LIKERT_5.value
        ]
        formularios.append(WowExternalFormKPI(
            form_id=f.id, title=f.title, departamento=f.department.name,
            branch=f.branch, subprocess=f.subprocess, n_respuestas=n,
            promedio=_r(form_avg.get(f.id)), porcentaje=_pct(form_avg.get(f.id)),
            estado=estado_wow(_pct(form_avg.get(f.id))),
            preguntas=preguntas,
        ))
    formularios.sort(key=lambda x: (x.departamento, x.subprocess or "", x.branch or ""))

    return WowExternalDashboard(
        escala=ESCALA,
        total_respuestas=total,
        promedio_global=_r(avg_global),
        porcentaje_global=_pct(avg_global),
        estado_global=estado_wow(_pct(avg_global)),
        formularios=formularios,
    )


# ─────────────────────────────────────────────────────────────────────────────
# NOMINACIONES — Embajador del Servicio WOW
# ─────────────────────────────────────────────────────────────────────────────

def nominaciones(db: Session, cycle_id=None, department_id=None) -> list[WowNominationOut]:
    q = (
        db.query(SurveyNomination, SurveyForm)
        .join(SurveyResponse, SurveyNomination.response_id == SurveyResponse.id)
        .join(SurveyForm, SurveyResponse.form_id == SurveyForm.id)
    )
    q = _apply_form_filters(q, cycle_id, department_id)

    grupos: dict[tuple[int, str], dict] = {}
    for nom, form in q.all():
        key = (form.id, nom.nominee_name.strip().lower())
        g = grupos.setdefault(key, {"form": form, "nombre": nom.nominee_name.strip(), "votos": 0, "motivos": []})
        g["votos"] += 1
        if nom.reason:
            g["motivos"].append(nom.reason)

    out = [
        WowNominationOut(
            nominee_name=g["nombre"],
            department_id=g["form"].department_id,
            departamento=g["form"].department.name,
            form_id=g["form"].id,
            form_title=g["form"].title,
            branch=g["form"].branch,
            votos=g["votos"],
            motivos=g["motivos"],
        )
        for g in grupos.values()
    ]
    out.sort(key=lambda x: (x.departamento, x.branch or "", -x.votos, x.nominee_name))
    return out
