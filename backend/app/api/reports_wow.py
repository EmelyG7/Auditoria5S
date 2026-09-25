"""
reports_wow.py — Borrador de los reportes de resultados del Servicio WOW 2026
(informe detallado y resumen ejecutivo).

Mismo patrón que app/api/reports_presentation.py (reporte de presentación 5S),
con una diferencia deliberada: aquí NO hay endpoint de "datos del reporte". El
editor consume los mismos endpoints que el dashboard (/servicio-wow/dashboard/interno,
/dashboard/externo, /nominations, /responses), filtrados por ciclo + departamento
(+ sucursal), para que el reporte y el dashboard nunca calculen distinto.
La redacción con IA reutiliza el proxy POST /reports/presentation/ai-generate.

Endpoints:
    GET  /reports/servicio-wow/draft  — borrador guardado (o null)
    POST /reports/servicio-wow/draft  — guardar / actualizar el borrador
"""

from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.dependencies import get_current_user
from app.models.survey_wow_models import SurveyCycle, SurveyDepartment, WowReportDraft
from app.models.user_models import User

router = APIRouter(
    prefix="/reports",
    tags=["Reportes — Servicio WOW"],
)


class WowReportDraftSavePayload(BaseModel):
    cycle_id:      int
    department_id: int
    draft_data:    dict = Field(default_factory=dict, description="Estado editable completo del reporte")


class WowReportDraftResponse(BaseModel):
    cycle_id:      int
    department_id: int
    draft_data:    dict
    updated_at:    Optional[str] = None


def _get_draft_or_none(db: Session, cycle_id: int, department_id: int) -> Optional[WowReportDraft]:
    return (
        db.query(WowReportDraft)
        .filter(WowReportDraft.cycle_id == cycle_id, WowReportDraft.department_id == department_id)
        .first()
    )


def _out(draft: WowReportDraft) -> WowReportDraftResponse:
    return WowReportDraftResponse(
        cycle_id=draft.cycle_id,
        department_id=draft.department_id,
        draft_data=draft.draft_data or {},
        updated_at=draft.updated_at.isoformat() if draft.updated_at else None,
    )


@router.post(
    "/servicio-wow/draft",
    response_model=WowReportDraftResponse,
    summary="Guardar (o actualizar) el borrador del reporte del Servicio WOW",
)
def save_wow_report_draft(
    payload:      WowReportDraftSavePayload,
    current_user: User = Depends(get_current_user),
    db:           Session = Depends(get_db),
):
    if not db.get(SurveyCycle, payload.cycle_id):
        raise HTTPException(status.HTTP_404_NOT_FOUND, f"Ciclo id={payload.cycle_id} no existe.")
    if not db.get(SurveyDepartment, payload.department_id):
        raise HTTPException(status.HTTP_404_NOT_FOUND, f"Departamento id={payload.department_id} no existe.")

    draft = _get_draft_or_none(db, payload.cycle_id, payload.department_id)
    if draft:
        draft.draft_data = payload.draft_data
    else:
        draft = WowReportDraft(
            cycle_id=payload.cycle_id,
            department_id=payload.department_id,
            draft_data=payload.draft_data,
        )
        db.add(draft)

    db.commit()
    db.refresh(draft)
    return _out(draft)


@router.get(
    "/servicio-wow/draft",
    response_model=Optional[WowReportDraftResponse],
    summary="Obtener el borrador guardado del reporte del Servicio WOW (o null)",
)
def get_wow_report_draft(
    cycle_id:      int = Query(...),
    department_id: int = Query(...),
    current_user:  User = Depends(get_current_user),
    db:            Session = Depends(get_db),
):
    draft = _get_draft_or_none(db, cycle_id, department_id)
    return _out(draft) if draft else None
