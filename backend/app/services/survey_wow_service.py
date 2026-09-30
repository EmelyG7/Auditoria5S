"""
survey_wow_service.py — Agregados de lectura del Servicio WOW 2026 (dashboard y nominaciones).

Escala Likert 1-5. El % de satisfacción se calcula solo sobre respuestas válidas:

    4 y 5 → satisfacción · 1 y 2 → insatisfacción · 3 → se excluye
    porcentaje = respuestas 4-5 / (respuestas 1, 2, 4 y 5) × 100

Ej.: 50 respuestas = 48 entre 4-5, una en 3 y una en 2 → 48 / 49 = 98 %;
el 2 es el % faltante (insatisfacción). Si todas son 3 no hay % ("Sin datos").
El semáforo se aplica sobre ese % con los mismos cortes del módulo de
Encuestas: ≥90 % Excelente, ≥80 % Aceptable, <80 % Crítico.
También se devuelve `promedio` (1-5, todas las respuestas) como referencia.
"""

import json
from collections import defaultdict
from functools import lru_cache
from pathlib import Path
from typing import Optional

from sqlalchemy import case, func
from sqlalchemy.orm import Session

from app.models.survey_wow_models import (
    QuestionType, SurveyAnswer, SurveyCriteria, SurveyDepartment, SurveyForm,
    SurveyNomination, SurveyQuestion, SurveyResponse, SurveyType,
)
from app.schemas.survey_wow_schemas import (
    WowComparativo2025, WowCriteriaKPI, WowCriterio2025, WowDepartmentKPI, WowExternalDashboard,
    WowExternalFormKPI, WowFormKPI, WowInternalDashboard, WowNominationOut, WowQuestionKPI,
    WowResultado2025, WowScale,
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


# Agregados SQL: (promedio 1-5, nº respuestas 4-5, nº respuestas válidas ≠ 3)
_AVG = func.avg(SurveyAnswer.value_score)
_SATISFECHAS = func.sum(case((SurveyAnswer.value_score >= 4, 1), else_=0))
_VALIDAS = func.sum(case((SurveyAnswer.value_score != 3, 1), else_=0))
AGG = (_AVG, _SATISFECHAS, _VALIDAS)


def _pct(satisfechas, validas) -> Optional[float]:
    """% de satisfacción = respuestas 4-5 / respuestas válidas (sin los 3) × 100."""
    return round(float(satisfechas) / float(validas) * 100, 1) if validas else None


def porcentaje_satisfaccion(scores) -> Optional[float]:
    """Mismo cálculo que `_pct` sobre una lista de puntajes 1-5 (p. ej. una respuesta)."""
    validas = [s for s in scores if s != 3]
    return _pct(sum(1 for s in validas if s >= 4), len(validas))


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
    avg_global, sat_global, val_global = base.with_entities(*AGG).one()
    pct_global = _pct(sat_global, val_global)

    criterios_cat = db.query(SurveyCriteria).order_by(SurveyCriteria.order).all()

    # Por criterio
    por_crit = {
        cid: (avg, _pct(sat, val), n) for cid, avg, sat, val, n in base.with_entities(
            SurveyQuestion.criteria_id, *AGG, func.count(SurveyAnswer.id),
        ).group_by(SurveyQuestion.criteria_id)
    }
    sin_datos = (None, None, 0)
    criterios = [
        WowCriteriaKPI(
            code=c.code, label=c.label,
            promedio=_r(por_crit.get(c.id, sin_datos)[0]),
            porcentaje=por_crit.get(c.id, sin_datos)[1],
            n=por_crit.get(c.id, sin_datos)[2],
            estado=estado_wow(por_crit.get(c.id, sin_datos)[1]),
        )
        for c in criterios_cat
    ]

    # Por departamento × criterio (heatmap)
    code_by_id = {c.id: c.code for c in criterios_cat}
    celdas: dict[int, dict[str, Optional[float]]] = defaultdict(dict)
    for dept_id, crit_id, sat, val in base.with_entities(
        SurveyForm.department_id, SurveyQuestion.criteria_id, _SATISFECHAS, _VALIDAS,
    ).group_by(SurveyForm.department_id, SurveyQuestion.criteria_id):
        if crit_id in code_by_id:
            celdas[dept_id][code_by_id[crit_id]] = _pct(sat, val)

    dept_avg = {
        d: (avg, _pct(sat, val)) for d, avg, sat, val in base.with_entities(
            SurveyForm.department_id, *AGG,
        ).group_by(SurveyForm.department_id)
    }
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
                promedio=_r(dept_avg.get(d_id, (None, None))[0]),
                porcentaje=dept_avg.get(d_id, (None, None))[1],
                estado=estado_wow(dept_avg.get(d_id, (None, None))[1]),
                criterios=celdas.get(d_id, {}),
            )
            for d_id, n in dept_n.items() if d_id in depts
        ],
        key=lambda x: x.departamento,
    )

    # Por formulario (sucursal)
    form_avg = {
        f: (avg, _pct(sat, val))
        for f, avg, sat, val in base.with_entities(SurveyForm.id, *AGG).group_by(SurveyForm.id)
    }
    por_formulario = [
        WowFormKPI(
            form_id=f.id, title=f.title, departamento=f.department.name, branch=f.branch,
            n_respuestas=n, promedio=_r(form_avg.get(f.id, (None, None))[0]), porcentaje=form_avg.get(f.id, (None, None))[1],
            estado=estado_wow(form_avg.get(f.id, (None, None))[1]),
        )
        for f, n in _responses_by_form(db, tipo, cycle_id, department_id, branch)
    ]
    por_formulario.sort(key=lambda x: (x.departamento, x.branch or ""))

    return WowInternalDashboard(
        escala=ESCALA,
        total_respuestas=total,
        promedio_global=_r(avg_global),
        porcentaje_global=pct_global,
        estado_global=estado_wow(pct_global),
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
    avg_global, sat_global, val_global = base.with_entities(*AGG).one()
    pct_global = _pct(sat_global, val_global)

    # Distribución por pregunta
    dist: dict[int, dict[int, int]] = defaultdict(dict)
    for q_id, score, n in base.with_entities(
        SurveyQuestion.id, SurveyAnswer.value_score, func.count(SurveyAnswer.id),
    ).group_by(SurveyQuestion.id, SurveyAnswer.value_score):
        dist[q_id][int(score)] = n

    q_stats = {
        q_id: (avg, _pct(sat, val), n) for q_id, avg, sat, val, n in base.with_entities(
            SurveyQuestion.id, *AGG, func.count(SurveyAnswer.id),
        ).group_by(SurveyQuestion.id)
    }
    form_avg = {
        f: (avg, _pct(sat, val))
        for f, avg, sat, val in base.with_entities(SurveyForm.id, *AGG).group_by(SurveyForm.id)
    }
    formularios = []
    for f, n in _responses_by_form(db, tipo, cycle_id, department_id, branch):
        preguntas = [
            WowQuestionKPI(
                question_id=q.id, order=q.order, text=q.text,
                promedio=_r(q_stats.get(q.id, (None, None, 0))[0]),
                porcentaje=q_stats.get(q.id, (None, None, 0))[1],
                n=q_stats.get(q.id, (None, None, 0))[2],
                estado=estado_wow(q_stats.get(q.id, (None, None, 0))[1]),
                distribucion={k: dist[q.id].get(k, 0) for k in range(1, 6)},
            )
            for q in f.questions if q.question_type == QuestionType.LIKERT_5.value
        ]
        formularios.append(WowExternalFormKPI(
            form_id=f.id, title=f.title, departamento=f.department.name,
            branch=f.branch, subprocess=f.subprocess, n_respuestas=n,
            promedio=_r(form_avg.get(f.id, (None, None))[0]), porcentaje=form_avg.get(f.id, (None, None))[1],
            estado=estado_wow(form_avg.get(f.id, (None, None))[1]),
            preguntas=preguntas,
        ))
    formularios.sort(key=lambda x: (x.departamento, x.subprocess or "", x.branch or ""))

    return WowExternalDashboard(
        escala=ESCALA,
        total_respuestas=total,
        promedio_global=_r(avg_global),
        porcentaje_global=pct_global,
        estado_global=estado_wow(pct_global),
        formularios=formularios,
    )


# ─────────────────────────────────────────────────────────────────────────────
# NOMINACIONES — Embajador del Servicio WOW
# ─────────────────────────────────────────────────────────────────────────────

def nominaciones(db: Session, cycle_id=None, department_id=None, branch=None) -> list[WowNominationOut]:
    q = (
        db.query(SurveyNomination, SurveyForm)
        .join(SurveyResponse, SurveyNomination.response_id == SurveyResponse.id)
        .join(SurveyForm, SurveyResponse.form_id == SurveyForm.id)
    )
    q = _apply_form_filters(q, cycle_id, department_id, branch)

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


# ─────────────────────────────────────────────────────────────────────────────
# COMPARATIVO 2025 — resultados del ciclo anterior (Excel "SATISFACCION GENERAL")
# ─────────────────────────────────────────────────────────────────────────────

_DATA_2025 = Path(__file__).resolve().parent.parent / "data" / "servicio_wow_2025.json"


@lru_cache(maxsize=1)
def _datos_2025() -> dict:
    with open(_DATA_2025, encoding="utf-8") as f:
        return json.load(f)


def _resultado_2025(filas: list[dict], criterios_cat: list[dict]) -> Optional[WowResultado2025]:
    """Promedio simple de las filas 2025 (igual que la hoja 'Comprimido Interno' del Excel)."""
    if not filas:
        return None
    prom = lambda vals: round(sum(vals) / len(vals), 1) if vals else None  # noqa: E731
    criterios = [
        WowCriterio2025(
            code=c["code"], label=c["label"], criterios_2026=c["criterios_2026"],
            porcentaje=prom([f["criterios"][c["code"]] for f in filas if c["code"] in f.get("criterios", {})]),
        )
        for c in criterios_cat
    ] if any("criterios" in f for f in filas) else []
    return WowResultado2025(
        porcentaje=prom([f["porcentaje"] for f in filas]),
        origen=[f["origen"] for f in filas],
        criterios=criterios,
    )


def comparativo_2025(db: Session, department_id: int, branch: Optional[str] = None) -> WowComparativo2025:
    """
    Resultados 2025 del departamento (y sucursal) para compararlos con el ciclo actual.
    Con sucursal: la fila de esa sucursal o, si en 2025 el departamento no se midió
    por sucursal, la del departamento. Sin sucursal: promedio de todas sus filas.
    """
    dept = db.get(SurveyDepartment, department_id)
    data = _datos_2025()
    if dept is None:
        return WowComparativo2025(anio=data["anio"])

    def filas(tipo: str) -> list[dict]:
        del_dept = [f for f in data[tipo] if dept.name in f["departamentos"]]
        if not branch:
            return del_dept
        return [f for f in del_dept if f["branch"] == branch] or [f for f in del_dept if f["branch"] is None]

    return WowComparativo2025(
        anio=data["anio"],
        interno=_resultado_2025(filas("interno"), data["criterios"]),
        externo=_resultado_2025(filas("externo"), data["criterios"]),
    )
