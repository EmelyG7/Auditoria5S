"""
audit_analysis.py — Router FastAPI con extras de análisis de auditorías 5S.

El análisis comparativo (current/previous/delta) vive dentro de la respuesta
de GET /audits/{audit_id}/analysis (ver audits.py + audit_analysis_service.py).
Este router solo agrega lo que no existía antes:

    GET    /audits/{audit_id}/action-plans              — Listar plan de acción
    POST   /audits/{audit_id}/action-plans               — Crear paso
    PUT    /audits/{audit_id}/action-plans/{plan_id}     — Editar paso
    DELETE /audits/{audit_id}/action-plans/{plan_id}     — Eliminar paso
    POST   /audits/{audit_id}/ai-generate                — Proxy seguro hacia Claude

El proxy hacia Claude existe para que la API key del servicio nunca se
exponga al navegador: el frontend construye el prompt y este endpoint lo
reenvía usando la API key guardada en el servidor (ANTHROPIC_API_KEY).
"""

import json
import logging
import re
import urllib.error
import urllib.request

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.database import get_db
from app.core.dependencies import get_current_user
from app.models.audit_models import Audit, AuditActionPlan
from app.models.user_models import User
from app.schemas.audit_action_plan_schemas import (
    AIGenerateRequest,
    AIGenerateResponse,
    AuditActionPlanCreate,
    AuditActionPlanResponse,
    AuditActionPlanUpdate,
    ReportConclusionsRequest,
    ReportConclusionsResponse,
)

logger = logging.getLogger(__name__)

router = APIRouter(
    prefix="/audits",
    tags=["Auditorías 5S — Planes de acción e IA"],
    responses={404: {"description": "Auditoría o plan de acción no encontrado"}},
)


# ─────────────────────────────────────────────────────────────────────────────
# HELPERS
# ─────────────────────────────────────────────────────────────────────────────

def _get_audit_or_404(audit_id: int, db: Session) -> Audit:
    audit = db.query(Audit).filter(Audit.id == audit_id).first()
    if not audit:
        raise HTTPException(
            status.HTTP_404_NOT_FOUND,
            f"Auditoría con id={audit_id} no encontrada.",
        )
    return audit


def _get_plan_or_404(audit_id: int, plan_id: int, db: Session) -> AuditActionPlan:
    plan = (
        db.query(AuditActionPlan)
        .filter(AuditActionPlan.id == plan_id, AuditActionPlan.audit_id == audit_id)
        .first()
    )
    if not plan:
        raise HTTPException(
            status.HTTP_404_NOT_FOUND,
            f"Plan de acción id={plan_id} no encontrado para la auditoría {audit_id}.",
        )
    return plan


# ─────────────────────────────────────────────────────────────────────────────
# PLANES DE ACCIÓN
# ─────────────────────────────────────────────────────────────────────────────

@router.get(
    "/{audit_id}/action-plans",
    response_model=list[AuditActionPlanResponse],
    summary="Listar el plan de acción de una auditoría",
)
def list_action_plans(
    audit_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    _get_audit_or_404(audit_id, db)
    return (
        db.query(AuditActionPlan)
        .filter(AuditActionPlan.audit_id == audit_id)
        .order_by(AuditActionPlan.order_index, AuditActionPlan.id)
        .all()
    )


@router.post(
    "/{audit_id}/action-plans",
    response_model=AuditActionPlanResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Agregar un paso al plan de acción",
)
def create_action_plan(
    audit_id: int,
    payload: AuditActionPlanCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    _get_audit_or_404(audit_id, db)

    if payload.order_index is not None:
        order_index = payload.order_index
    else:
        order_index = db.query(AuditActionPlan).filter(AuditActionPlan.audit_id == audit_id).count()

    plan = AuditActionPlan(
        audit_id=audit_id,
        item_text=payload.item_text,
        responsible=payload.responsible,
        due_date=payload.due_date,
        status=payload.status,
        order_index=order_index,
    )
    db.add(plan)
    db.commit()
    db.refresh(plan)
    return plan


@router.put(
    "/{audit_id}/action-plans/{plan_id}",
    response_model=AuditActionPlanResponse,
    summary="Editar un paso del plan de acción",
)
def update_action_plan(
    audit_id: int,
    plan_id: int,
    payload: AuditActionPlanUpdate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    plan = _get_plan_or_404(audit_id, plan_id, db)
    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(plan, field, value)
    db.commit()
    db.refresh(plan)
    return plan


@router.delete(
    "/{audit_id}/action-plans/{plan_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Eliminar un paso del plan de acción",
)
def delete_action_plan(
    audit_id: int,
    plan_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    plan = _get_plan_or_404(audit_id, plan_id, db)
    db.delete(plan)
    db.commit()


# ─────────────────────────────────────────────────────────────────────────────
# PROXY SEGURO HACIA LA API DE CLAUDE
# ─────────────────────────────────────────────────────────────────────────────

_ANTHROPIC_URL     = "https://api.anthropic.com/v1/messages"
_ANTHROPIC_VERSION = "2023-06-01"
_AI_MODEL          = "claude-sonnet-4-6"


def _call_claude(prompt: str, max_tokens: int) -> str:
    if not settings.ANTHROPIC_API_KEY:
        raise HTTPException(
            status.HTTP_503_SERVICE_UNAVAILABLE,
            "La generación con IA no está configurada en el servidor "
            "(falta la variable de entorno ANTHROPIC_API_KEY).",
        )

    body = json.dumps({
        "model":      _AI_MODEL,
        "max_tokens": max_tokens,
        "messages":   [{"role": "user", "content": prompt}],
    }).encode("utf-8")

    req = urllib.request.Request(
        _ANTHROPIC_URL,
        data=body,
        method="POST",
        headers={
            "x-api-key":         settings.ANTHROPIC_API_KEY,
            "anthropic-version": _ANTHROPIC_VERSION,
            "content-type":      "application/json",
        },
    )
    try:
        with urllib.request.urlopen(req, timeout=60) as resp:
            data = json.loads(resp.read())
    except urllib.error.HTTPError as e:
        detail = e.read().decode("utf-8", errors="ignore")
        logger.error(f"Error de la API de Claude ({e.code}): {detail}")
        raise HTTPException(status.HTTP_502_BAD_GATEWAY, "Error al generar el análisis con IA.")
    except urllib.error.URLError as e:
        logger.error(f"No se pudo conectar con la API de Claude: {e}")
        raise HTTPException(status.HTTP_502_BAD_GATEWAY, "No se pudo conectar con el servicio de IA.")

    return "".join(
        part.get("text", "")
        for part in data.get("content", [])
        if part.get("type") == "text"
    )


@router.post(
    "/{audit_id}/ai-generate",
    response_model=AIGenerateResponse,
    summary="Generar texto con IA (proxy seguro hacia Claude)",
    description=(
        "Recibe un prompt ya construido por el frontend y lo reenvía a la "
        "API de Claude usando la API key del servidor. La key nunca se "
        "expone al cliente."
    ),
)
def generate_ai_text(
    audit_id: int,
    payload: AIGenerateRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    _get_audit_or_404(audit_id, db)
    text = _call_claude(payload.prompt, payload.max_tokens or 1000)
    return AIGenerateResponse(text=text)


# ─────────────────────────────────────────────────────────────────────────────
# CONCLUSIONES MEJORADAS DEL REPORTE PDF (sin audit_id — usa KPIs globales)
# ─────────────────────────────────────────────────────────────────────────────

@router.post(
    "/ai-report-conclusions",
    response_model=ReportConclusionsResponse,
    summary="Generar conclusiones mejoradas del reporte PDF (proxy seguro hacia Claude)",
    description=(
        "Recibe los KPIs agregados del reporte, construye el prompt y llama a Claude "
        "para obtener hallazgos y una recomendación ejecutiva. La API key nunca se "
        "expone al cliente."
    ),
)
def generate_report_conclusions(
    payload: ReportConclusionsRequest,
    current_user: User = Depends(get_current_user),
):
    s = payload.promedio_por_s
    s_entries = sorted(s.items(), key=lambda kv: kv[1])
    worst_s = s_entries[0] if s_entries else ("—", 0)
    best_s  = s_entries[-1] if s_entries else ("—", 0)

    suc = payload.por_sucursal
    suc_sorted = sorted(suc, key=lambda x: x.get("promedio_pct", 0))
    peor_suc   = suc_sorted[0]  if suc_sorted else None
    mejor_suc  = suc_sorted[-1] if suc_sorted else None

    cumplen    = sum(1 for x in suc if x.get("promedio_pct", 0) >= 80)
    por_mejorar = sum(1 for x in suc if 60 <= x.get("promedio_pct", 0) < 80)
    criticas   = sum(1 for x in suc if x.get("promedio_pct", 0) < 60)

    pct    = payload.promedio_global
    estado = "Cumple" if pct >= 80 else ("Por Mejorar" if pct >= 60 else "Crítico")

    tipos_str = "\n".join(
        f"- {t.get('tipo', '—')}: {t.get('promedio', 0):.1f}%"
        for t in payload.por_tipo
    ) or "Sin datos por tipo de área"

    mejor_str = f"{mejor_suc['branch']} ({mejor_suc['promedio_pct']:.1f}%)" if mejor_suc else "—"
    peor_str  = f"{peor_suc['branch']} ({peor_suc['promedio_pct']:.1f}%)"   if peor_suc  else "—"

    prompt = f"""Eres analista de calidad de Cecomsa. \
Genera análisis ejecutivo para reporte de auditorías 5S.

DATOS DEL PERÍODO:
- Total auditorías: {payload.total_auditorias}
- Promedio global: {pct:.1f}%
- Estado: {estado}
- Sucursales en Cumple (≥80%): {cumplen}
- Sucursales Por Mejorar (60-79%): {por_mejorar}
- Sucursales Críticas (<60%): {criticas}

DESEMPEÑO POR DIMENSIÓN 5S:
- Seiri: {s.get('seiri', 0):.1f}%
- Seiton: {s.get('seiton', 0):.1f}%
- Seiso: {s.get('seiso', 0):.1f}%
- Seiketsu: {s.get('seiketsu', 0):.1f}%
- Shitsuke: {s.get('shitsuke', 0):.1f}%

DESEMPEÑO POR TIPO DE ÁREA:
{tipos_str}

MEJORES Y PEORES SUCURSALES:
- Mejor: {mejor_str}
- Peor: {peor_str}

Genera en español profesional ejecutivo:
1. hallazgo_01: El desempeño global (menciona % y cantidad de auditorías, califica el nivel)
2. hallazgo_02: La S más fortalecida ({best_s[0]}: {best_s[1]:.1f}%) y la que requiere más atención ({worst_s[0]}: {worst_s[1]:.1f}%)
3. hallazgo_03: Comparativa entre tipos de área (cuál lidera, cuál requiere atención)
4. recomendacion_principal: Acción concreta basada en los datos (1-2 oraciones directas y operativas)

Responde SOLO con JSON válido, sin texto adicional ni bloques de código:
{{
  "hallazgo_01": "...",
  "hallazgo_02": "...",
  "hallazgo_03": "...",
  "recomendacion_principal": "..."
}}"""

    raw = _call_claude(prompt, 1000)
    clean = re.sub(r"```(?:json)?|```", "", raw).strip()

    try:
        data = json.loads(clean)
    except json.JSONDecodeError:
        raise HTTPException(
            status.HTTP_502_BAD_GATEWAY,
            "La IA no devolvió un JSON válido. Intente de nuevo.",
        )

    return ReportConclusionsResponse(**data)
