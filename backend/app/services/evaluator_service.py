"""
evaluator_service.py — Vistas derivadas de las asignaciones de evaluadores.

Replican on-demand las hojas `Matriz_Participacion` y `Resumen_Muestra` del
Excel del script (no son tablas: COUNT/GROUP BY sobre EvaluationAssignment),
igual que Pivot_Sucursal en auditorías 5S.
"""

from collections import defaultdict

from sqlalchemy.orm import Session, joinedload

from app.models.evaluator_models import (
    AssignmentRole, AssignmentStatus, EvaluationAssignment, SamplingConfig, ScheduleEntry,
)
from app.schemas.evaluator_schemas import (
    ParticipationCell, ParticipationMatrix, ParticipationRow, SampleSummary, SampleSummaryRow,
)

CARGA_ALERTA_DEFAULT = 4


def _entries(db: Session, cycle_id: int) -> list[ScheduleEntry]:
    return (
        db.query(ScheduleEntry)
        .options(joinedload(ScheduleEntry.assignments))
        .filter(ScheduleEntry.cycle_id == cycle_id)
        .order_by(ScheduleEntry.schedule_number, ScheduleEntry.list_name)
        .all()
    )


def participation_matrix(db: Session, cycle_id: int) -> ParticipationMatrix:
    cfg = db.query(SamplingConfig).filter(SamplingConfig.cycle_id == cycle_id).first()
    carga_alerta = cfg.carga_alerta if cfg else CARGA_ALERTA_DEFAULT

    entries = _entries(db, cycle_id)
    # Columnas = departamentos, en el orden del cronograma
    columnas: list[str] = []
    for e in entries:
        if e.department.name not in columnas:
            columnas.append(e.department.name)

    filas: dict[int, dict] = {}
    for e in entries:
        col = e.department.name
        for a in e.assignments:
            emp = a.employee
            f = filas.setdefault(emp.id, {
                "emp": emp,
                "celdas": defaultdict(ParticipationCell),
                "tit": 0, "sup": 0,
            })
            celda = f["celdas"][col]
            if a.role == AssignmentRole.SUPLENTE.value:
                celda.suplente += 1
                f["sup"] += 1
            else:
                celda.titular += 1
                f["tit"] += 1

    rows = [
        ParticipationRow(
            employee_id=f["emp"].id,
            colaborador=f["emp"].full_name,
            area=f["emp"].area.name if f["emp"].area else None,
            ubicacion=f["emp"].location,
            celdas=dict(f["celdas"]),
            total_titular=f["tit"],
            total_suplente=f["sup"],
            carga_alta=f["tit"] > carga_alerta,
        )
        for f in filas.values()
    ]
    rows.sort(key=lambda r: (r.area or "", r.ubicacion or "", r.colaborador))
    return ParticipationMatrix(columnas=columnas, carga_alerta=carga_alerta, filas=rows)


def sample_summary(db: Session, cycle_id: int) -> SampleSummary:
    filas = []
    for e in _entries(db, cycle_id):
        tit = [a for a in e.assignments if a.role == AssignmentRole.TITULAR.value]
        sup = [a for a in e.assignments if a.role == AssignmentRole.SUPLENTE.value]
        resp = [a for a in e.assignments if a.status == AssignmentStatus.COMPLETO.value]
        areas = sorted({a.evaluator_area.name for a in e.assignments if a.evaluator_area})
        req = e.internal_sample_size
        filas.append(SampleSummaryRow(
            schedule_entry_id=e.id,
            list_name=e.list_name,
            departamento=e.department.name,
            muestra_requerida=req,
            titulares=len(tit),
            suplentes=len(sup),
            respondieron=len(resp),
            pct_respuesta=round(len(resp) / len(tit), 4) if tit else None,
            areas_representadas=areas,
            alerta=req is not None and len(tit) < req,
        ))
    return SampleSummary(
        filas=filas,
        total_requerida=sum(f.muestra_requerida or 0 for f in filas),
        total_titulares=sum(f.titulares for f in filas),
        total_suplentes=sum(f.suplentes for f in filas),
        total_respondieron=sum(f.respondieron for f in filas),
    )
