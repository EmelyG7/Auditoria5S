"""
surveys.py — Router FastAPI para encuestas de satisfacción.

Endpoints:
    GET  /surveys/kpis            — KPIs del dashboard
    GET  /surveys/                — Listar con filtros y paginación
    GET  /surveys/{id}            — Detalle
    POST /surveys/                — Crear (admin)
    PUT  /surveys/{id}            — Editar (admin)
    DELETE /surveys/{id}          — Eliminar (admin)
    POST /surveys/import          — Importar Excel
"""

import logging
from decimal import Decimal
from math import ceil
from typing import Optional

from fastapi import (
    APIRouter, Depends, File, HTTPException,
    Query, UploadFile, status,
)
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.dependencies import get_current_user, require_admin
from app.models.survey_models import Survey
from app.models.user_models import User
from app.schemas.survey_schemas import (
    DimensionKPI,
    SurveyCreate,
    SurveyDashboardKPI,
    SurveyImportResponse,
    SurveyKPIPorPeriodo,
    SurveyKPIPorSede,
    SurveyListResponse,
    SurveyResponse,
    SurveyUpdate,
)
from app.services.survey_service import importar_surveys_desde_excel

logger = logging.getLogger(__name__)

router = APIRouter(
    prefix="/surveys",
    tags=["Encuestas de Satisfacción"],
    responses={404: {"description": "Encuesta no encontrada"}},
)

# Dimensiones con sus nombres legibles para el dashboard
DIMENSIONES_MAP = {
    "efficiency":            "Eficiencia",
    "communication":         "Comunicación",
    "technical_quality":     "Calidad Técnica",
    "added_value":           "Valor Agregado",
    "global_experience":     "Experiencia Global",
}


def _estado_satisfaccion(pct: Optional[float]) -> str:
    if pct is None:
        return "Sin datos"
    if pct >= 0.8:
        return "Alto"
    if pct >= 0.6:
        return "Medio"
    return "Bajo"


def _get_survey_or_404(survey_id: int, db: Session) -> Survey:
    survey = db.query(Survey).filter(Survey.id == survey_id).first()
    if not survey:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Encuesta id={survey_id} no encontrada.",
        )
    return survey


def _apply_filters(q, survey_type, department, site, year, quarter, period):
    """Aplica filtros opcionales a la query."""
    if survey_type:
        q = q.filter(Survey.survey_type.ilike(f"%{survey_type}%"))
    if department:
        q = q.filter(Survey.department.ilike(f"%{department}%"))
    if site:
        q = q.filter(Survey.site.ilike(f"%{site}%"))
    if year:
        q = q.filter(Survey.year == year)
    if quarter:
        q = q.filter(Survey.quarter == quarter)
    if period:
        q = q.filter(Survey.period == period)
    return q


# ─────────────────────────────────────────────────────────────────────────────
# KPIs DASHBOARD
# ─────────────────────────────────────────────────────────────────────────────

@router.get(
    "/kpis",
    response_model=SurveyDashboardKPI,
    summary="KPIs del dashboard de satisfacción",
)
def get_survey_kpis(
    year:          Optional[int] = Query(None, ge=2000, le=2100),
    quarter:       Optional[int] = Query(None, ge=1, le=4),
    survey_type:   Optional[str] = Query(None, description="Filtrar por tipo/departamento"),
    site:          Optional[str] = Query(None, description="Filtrar por sede"),
    current_user:  User          = Depends(get_current_user),
    db:            Session       = Depends(get_db),
):
    q = db.query(Survey)
    q = _apply_filters(q, survey_type, None, site, year, quarter, None)
    surveys = q.all()

    if not surveys:
        return SurveyDashboardKPI(
            total_registros=0,
            periodos_disponibles=[],
        )

    # ── Promedios globales ────────────────────────────────────────────────────
    def avg_field(field_name: str) -> Optional[float]:
        vals = [
            float(getattr(s, field_name))
            for s in surveys
            if getattr(s, field_name) is not None
        ]
        return round(sum(vals) / len(vals), 4) if vals else None

    sat_int  = avg_field("internal_satisfaction")
    sat_ext  = avg_field("external_satisfaction")
    overall  = None
    if sat_int is not None and sat_ext is not None:
        overall = round((sat_int + sat_ext) / 2, 4)
    elif sat_int is not None:
        overall = sat_int

    # ── Dimensiones ───────────────────────────────────────────────────────────
    dimensiones = []
    for field_name, nombre in DIMENSIONES_MAP.items():
        prom = avg_field(field_name)
        if prom is not None:
            dimensiones.append(DimensionKPI(
                nombre=nombre,
                promedio=prom,
                estado=_estado_satisfaccion(prom),
            ))

    mejor_dim = max(dimensiones, key=lambda d: d.promedio).nombre if dimensiones else None
    peor_dim  = min(dimensiones, key=lambda d: d.promedio).nombre if dimensiones else None

    # ── Por período ───────────────────────────────────────────────────────────
    periodos_dict: dict[str, list] = {}
    for s in surveys:
        key = s.period or "Sin período"
        periodos_dict.setdefault(key, []).append(s)

    por_periodo = []
    for period_key, period_surveys in sorted(periodos_dict.items()):
        s0 = period_surveys[0]
        int_vals = [float(s.internal_satisfaction) for s in period_surveys if s.internal_satisfaction]
        ext_vals = [float(s.external_satisfaction) for s in period_surveys if s.external_satisfaction]
        por_periodo.append(SurveyKPIPorPeriodo(
            period=period_key,
            period_name=s0.period_name or period_key,
            year=s0.year or 0,
            quarter=s0.quarter or 0,
            sat_interna=round(sum(int_vals) / len(int_vals), 4) if int_vals else None,
            sat_externa=round(sum(ext_vals) / len(ext_vals), 4) if ext_vals else None,
            n_registros=len(period_surveys),
        ))

    # ── Por sede ──────────────────────────────────────────────────────────────
    sedes_dict: dict[str, list] = {}
    for s in surveys:
        key = s.site or "Sin sede"
        sedes_dict.setdefault(key, []).append(s)

    por_sede = []
    for sede, sede_surveys in sorted(sedes_dict.items()):
        int_vals = [float(s.internal_satisfaction) for s in sede_surveys if s.internal_satisfaction]
        ext_vals = [float(s.external_satisfaction) for s in sede_surveys if s.external_satisfaction]
        por_sede.append(SurveyKPIPorSede(
            site=sede,
            sat_interna=round(sum(int_vals) / len(int_vals), 4) if int_vals else None,
            sat_externa=round(sum(ext_vals) / len(ext_vals), 4) if ext_vals else None,
            n_registros=len(sede_surveys),
        ))

    # ── Por departamento ──────────────────────────────────────────────────────
    dept_dict: dict[str, list] = {}
    for s in surveys:
        dept_dict.setdefault(s.department, []).append(s)

    por_departamento = []
    for dept, dept_surveys in sorted(dept_dict.items()):
        int_vals = [float(s.internal_satisfaction) for s in dept_surveys if s.internal_satisfaction]
        ext_vals = [float(s.external_satisfaction) for s in dept_surveys if s.external_satisfaction]
        por_departamento.append({
            "departamento": dept,
            "sat_interna":  round(sum(int_vals)/len(int_vals), 4) if int_vals else None,
            "sat_externa":  round(sum(ext_vals)/len(ext_vals), 4) if ext_vals else None,
            "n_registros":  len(dept_surveys),
            "estado":       _estado_satisfaccion(
                round(sum(int_vals)/len(int_vals), 4) if int_vals else None
            ),
        })

    return SurveyDashboardKPI(
        total_registros=len(surveys),
        periodos_disponibles=sorted(periodos_dict.keys()),
        sat_interna_global=sat_int,
        sat_externa_global=sat_ext,
        overall_global=overall,
        dimensiones=dimensiones,
        mejor_dimension=mejor_dim,
        peor_dimension=peor_dim,
        por_periodo=por_periodo,
        por_sede=por_sede,
        por_departamento=por_departamento,
    )


# ─────────────────────────────────────────────────────────────────────────────
# IMPORTACIÓN (antes de las rutas con {id})
# ─────────────────────────────────────────────────────────────────────────────

@router.post(
    "/import",
    response_model=SurveyImportResponse,
    summary="Importar encuestas desde Excel",
    description=(
        "Acepta el formato exacto de `Satisfaccion_Estructura_Mejorada.xlsx`. "
        "Lee la hoja `Hechos_Satisfaccion` por defecto."
    ),
)
async def import_surveys(
    file:       UploadFile = File(...),
    overwrite:  bool       = Query(False, description="Actualizar duplicados"),
    sheet_name: str        = Query("Hechos_Satisfaccion", description="Nombre de la hoja a leer"),
    _:          User       = Depends(require_admin),
    db:         Session    = Depends(get_db),
):
    if not file.filename or not file.filename.lower().endswith((".xlsx", ".xls")):
        raise HTTPException(400, "Solo se aceptan archivos Excel (.xlsx o .xls).")

    file_bytes = await file.read()
    if not file_bytes:
        raise HTTPException(400, "El archivo está vacío.")

    logger.info(f"Importando surveys: '{file.filename}' | {len(file_bytes)} bytes")

    result = importar_surveys_desde_excel(
        file_bytes=file_bytes,
        db=db,
        sheet_name=sheet_name,
        overwrite_if_exists=overwrite,
    )

    return SurveyImportResponse(
        message=(
            f"Importación completada: {result.nuevas} nuevas, "
            f"{result.actualizadas} actualizadas, "
            f"{result.omitidas} omitidas."
        ),
        total_filas=result.total_filas,
        nuevas=result.nuevas,
        actualizadas=result.actualizadas,
        omitidas=result.omitidas,
        errores_n=len(result.errores),
        errores=result.errores[:50],
        survey_ids=result.survey_ids,
    )


# ─────────────────────────────────────────────────────────────────────────────
# CRUD
# ─────────────────────────────────────────────────────────────────────────────

@router.get(
    "/",
    response_model=SurveyListResponse,
    summary="Listar encuestas con filtros",
)
def list_surveys(
    survey_type:  Optional[str] = Query(None, description="Filtrar por tipo (ej: 'ALMACENES')"),
    department:   Optional[str] = Query(None, description="Búsqueda parcial por departamento"),
    site:         Optional[str] = Query(None, description="Filtrar por sede"),
    year:         Optional[int] = Query(None, ge=2000, le=2100),
    quarter:      Optional[int] = Query(None, ge=1, le=4),
    period:       Optional[str] = Query(None, description="Código período, ej: '2026_Q1'"),
    page:         int           = Query(1, ge=1),
    page_size:    int           = Query(20, ge=1, le=100),
    order_by:     str           = Query("department"),
    order_dir:    str           = Query("asc", pattern="^(asc|desc)$"),
    current_user: User          = Depends(get_current_user),
    db:           Session       = Depends(get_db),
):
    q = db.query(Survey)
    q = _apply_filters(q, survey_type, department, site, year, quarter, period)

    total = q.count()

    # Ordenamiento
    order_map = {
        "department":            Survey.department,
        "site":                  Survey.site,
        "internal_satisfaction": Survey.internal_satisfaction,
        "external_satisfaction": Survey.external_satisfaction,
        "year":                  Survey.year,
        "quarter":               Survey.quarter,
    }
    order_col = order_map.get(order_by, Survey.department)
    q = q.order_by(order_col.desc() if order_dir == "desc" else order_col.asc())

    surveys    = q.offset((page - 1) * page_size).limit(page_size).all()
    total_pages = ceil(total / page_size) if total > 0 else 1

    return SurveyListResponse(
        items=[SurveyResponse.from_orm_with_extras(s) for s in surveys],
        total=total,
        page=page,
        page_size=page_size,
        total_pages=total_pages,
        has_next=page < total_pages,
        has_prev=page > 1,
    )


@router.get("/{survey_id}", response_model=SurveyResponse, summary="Detalle de encuesta")
def get_survey(
    survey_id:    int,
    current_user: User    = Depends(get_current_user),
    db:           Session = Depends(get_db),
):
    return SurveyResponse.from_orm_with_extras(_get_survey_or_404(survey_id, db))


@router.post(
    "/",
    response_model=SurveyResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Crear encuesta (admin)",
)
def create_survey(
    survey_in: SurveyCreate,
    _:         User    = Depends(require_admin),
    db:        Session = Depends(get_db),
):
    # Verificar unicidad
    existing = db.query(Survey).filter(
        Survey.survey_type == survey_in.survey_type,
        Survey.department  == survey_in.department,
        Survey.site        == survey_in.site,
        Survey.period      == survey_in.period,
    ).first()
    if existing:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=(
                f"Ya existe una encuesta para tipo='{survey_in.survey_type}', "
                f"departamento='{survey_in.department}', sede='{survey_in.site}', "
                f"período='{survey_in.period}'."
            ),
        )

    survey = Survey(
        **{
            k: (Decimal(str(v)) if isinstance(v, float) and v is not None else v)
            for k, v in survey_in.model_dump().items()
        },
        import_source="manual",
    )
    db.add(survey)
    db.commit()
    db.refresh(survey)
    return SurveyResponse.from_orm_with_extras(survey)


@router.put("/{survey_id}", response_model=SurveyResponse, summary="Editar encuesta (admin)")
def update_survey(
    survey_id:  int,
    survey_in:  SurveyUpdate,
    _:          User    = Depends(require_admin),
    db:         Session = Depends(get_db),
):
    survey = _get_survey_or_404(survey_id, db)

    for field_name, value in survey_in.model_dump(exclude_unset=True).items():
        if isinstance(value, float) and value is not None:
            setattr(survey, field_name, Decimal(str(value)))
        else:
            setattr(survey, field_name, value)

    db.commit()
    db.refresh(survey)
    return SurveyResponse.from_orm_with_extras(survey)


@router.delete(
    "/{survey_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Eliminar encuesta (admin)",
)
def delete_survey(
    survey_id: int,
    _:         User    = Depends(require_admin),
    db:        Session = Depends(get_db),
):
    survey = _get_survey_or_404(survey_id, db)
    db.delete(survey)
    db.commit()