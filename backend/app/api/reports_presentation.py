"""
reports_presentation.py — Router FastAPI para el generador de "Reportes de
Presentación" departamentales (réplica visual de los PDF de auditoría 5S
existentes de Cecomsa).

Endpoints:
    GET  /reports/presentation/data        — Datos completos para armar el reporte
    POST /reports/presentation/draft       — Guardar borrador (resumir edición)
    GET  /reports/presentation/draft       — Obtener borrador guardado (o null)
    POST /reports/presentation/ai-generate — Proxy seguro hacia Claude

El proxy hacia Claude reutiliza el mismo patrón de seguridad que
app/api/audit_analysis.py: el frontend construye el prompt y este endpoint
lo reenvía usando la API key guardada en el servidor (ANTHROPIC_API_KEY),
que nunca se expone al navegador.
"""

import json
import logging
import urllib.error
import urllib.request
from collections import defaultdict
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.database import get_db
from app.core.dependencies import get_current_user
from app.models.audit_models import Audit, AuditAttachment, AuditQuestion, AuditType, ReportDraft
from app.models.user_models import User

logger = logging.getLogger(__name__)

router = APIRouter(
    prefix="/reports",
    tags=["Reportes — Presentación"],
)


# ─────────────────────────────────────────────────────────────────────────────
# CONSTANTES
# ─────────────────────────────────────────────────────────────────────────────

S_KEYS = ["seiri", "seiton", "seiso", "seiketsu", "shitsuke"]

S_NAMES_PRETTY = {
    "seiri":    "Clasificar (Seiri)",
    "seiton":   "Ordenar (Seiton)",
    "seiso":    "Limpiar (Seiso)",
    "seiketsu": "Estandarizar (Seiketsu)",
    "shitsuke": "Disciplina (Shitsuke)",
}

DEPARTMENT_COLORS: dict[str, str] = {
    "Almacenes":           "#7B2D6E",
    "Centro de Servicios": "#E05A1E",
    "RMA":                 "#6BAF3C",
    "Mobiliario":           "#7B2D6E",
}

QUARTER_LABELS = {
    1: "Primer Trimestre",
    2: "Segundo Trimestre",
    3: "Tercer Trimestre",
    4: "Cuarto Trimestre",
}

MESES_ES = [
    "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
    "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre",
]


def _quarter_of(month: int) -> int:
    return (month - 1) // 3 + 1


def _safe_float(v) -> float:
    try:
        return float(v) if v is not None else 0.0
    except (TypeError, ValueError):
        return 0.0


def _s_label(resp: float) -> str:
    if resp >= 100:
        return "SI"
    if resp >= 50:
        return "PARCIAL"
    return "NO"


# ─────────────────────────────────────────────────────────────────────────────
# HELPERS DE CONSTRUCCIÓN DE DATOS
# ─────────────────────────────────────────────────────────────────────────────

def _build_scores(questions: list[AuditQuestion]) -> dict:
    """Agrupa las preguntas por S y retorna {pct, points, max, questions[]} por cada una."""
    by_s: dict[int, list[AuditQuestion]] = defaultdict(list)
    for q in questions:
        by_s[q.s_index].append(q)

    scores: dict = {}
    for si in range(5):
        qs      = sorted(by_s.get(si, []), key=lambda q: q.question_order)
        points  = round(sum(_safe_float(q.points_earned) for q in qs), 2)
        max_pts = round(sum(_safe_float(q.weight)        for q in qs), 2)
        pct     = round((points / max_pts * 100) if max_pts > 0 else 0, 2)
        scores[S_KEYS[si]] = {
            "pct":    pct,
            "points": points,
            "max":    max_pts,
            "questions": [
                {
                    "text":     q.question_text,
                    "weight":   _safe_float(q.weight),
                    "response": _safe_float(q.response_percent),
                    "points":   _safe_float(q.points_earned),
                    "s_label":  _s_label(_safe_float(q.response_percent)),
                }
                for q in qs
            ],
        }
    return scores


def _observations_by_s(questions: list[AuditQuestion]) -> dict:
    by_s: dict[int, list[AuditQuestion]] = defaultdict(list)
    for q in questions:
        by_s[q.s_index].append(q)

    result: dict = {}
    for si in range(5):
        qs  = by_s.get(si, [])
        obs = next((q.observation for q in qs if q.observation and q.observation.strip()), "")
        result[S_KEYS[si]] = obs
    return result


def _build_criteria_template(questions: list[AuditQuestion]) -> list[dict]:
    """Construye la plantilla de criterios (5S → preguntas + peso) a partir
    de las preguntas de UNA auditoría representativa del período."""
    by_s: dict[int, list[AuditQuestion]] = defaultdict(list)
    for q in questions:
        by_s[q.s_index].append(q)

    template: list[dict] = []
    for si in range(5):
        qs = sorted(by_s.get(si, []), key=lambda q: q.question_order)
        if not qs:
            continue
        s_key = S_KEYS[si]
        template.append({
            "s_index":      si + 1,
            "s_key":        s_key,
            "s_name":       S_NAMES_PRETTY[s_key],
            "s_weight_pct": round(sum(_safe_float(q.weight) for q in qs), 2),
            "questions": [
                {"text": q.question_text, "weight_pct": _safe_float(q.weight)}
                for q in qs
            ],
        })
    return template


def _query_audits(db: Session, audit_type_id: int, period_month: int, period_year: int) -> list[Audit]:
    return (
        db.query(Audit)
        .filter(
            Audit.audit_type_id == audit_type_id,
            Audit.period_month  == period_month,
            Audit.period_year   == period_year,
        )
        .order_by(Audit.branch.asc(), Audit.audit_date.asc())
        .all()
    )


def _build_audit_payload(audit: Audit, db: Session) -> dict:
    questions = sorted(audit.questions, key=lambda q: (q.s_index, q.question_order))
    attachments = (
        db.query(AuditAttachment)
        .filter(AuditAttachment.audit_id == audit.id)
        .order_by(AuditAttachment.created_at.asc())
        .all()
    )

    return {
        "audit_id":           audit.id,
        "sucursal":           audit.branch,
        "audit_date":         audit.audit_date.strftime("%d/%m/%Y") if audit.audit_date else None,
        "audit_date_iso":     audit.audit_date.isoformat() if audit.audit_date else None,
        "scores":             _build_scores(questions),
        "total_pct":          _safe_float(audit.percentage),
        "status":             audit.status,
        "observations_by_s":  _observations_by_s(questions),
        "attachments": [
            {
                "id":          a.id,
                "filename":    a.file_name,
                "url":         a.file_url,
                "is_external": a.is_external,
                "selected":    False,
            }
            for a in attachments
        ],
        "is_mobiliario": False,
    }


# ─────────────────────────────────────────────────────────────────────────────
# ENDPOINT — DATOS DEL REPORTE
# ─────────────────────────────────────────────────────────────────────────────

@router.get(
    "/presentation/data",
    summary="Datos completos para armar el reporte de presentación departamental",
    description=(
        "Retorna todas las auditorías de un tipo en un período, agrupadas por "
        "sucursal, con el detalle pregunta-por-pregunta necesario para "
        "replicar el reporte de presentación. Para 'Almacenes' también "
        "incluye, al final, las auditorías de 'Mobiliario' del mismo período "
        "marcadas con is_mobiliario=true."
    ),
)
def get_presentation_data(
    audit_type_id: int = Query(..., description="ID del tipo de auditoría (departamento)"),
    period_month:  int = Query(..., ge=1, le=12, description="Mes del período (1-12)"),
    period_year:   int = Query(..., ge=2000, le=2100, description="Año del período"),
    current_user:  User = Depends(get_current_user),
    db:            Session = Depends(get_db),
):
    audit_type = db.query(AuditType).filter(AuditType.id == audit_type_id).first()
    if not audit_type:
        raise HTTPException(
            status.HTTP_404_NOT_FOUND,
            f"Tipo de auditoría id={audit_type_id} no existe.",
        )

    department = audit_type.name
    audits     = _query_audits(db, audit_type_id, period_month, period_year)

    audit_payloads: list[dict] = [_build_audit_payload(a, db) for a in audits]
    all_dates = [a.audit_date for a in audits if a.audit_date]

    # ── Almacenes: anexar Mobiliario del mismo período al final ──────────────
    if department == "Almacenes":
        mobiliario_type = db.query(AuditType).filter(AuditType.name == "Mobiliario").first()
        if mobiliario_type:
            mob_audits = _query_audits(db, mobiliario_type.id, period_month, period_year)
            for a in mob_audits:
                payload = _build_audit_payload(a, db)
                payload["is_mobiliario"] = True
                audit_payloads.append(payload)
                if a.audit_date:
                    all_dates.append(a.audit_date)

    # ── Plantilla de criterios (a partir de la primera auditoría del depto) ──
    criteria_source_questions: list[AuditQuestion] = []
    if audits:
        criteria_source_questions = sorted(audits[0].questions, key=lambda q: (q.s_index, q.question_order))
    criteria_template = _build_criteria_template(criteria_source_questions)

    # ── Trimestre y rango de fechas ───────────────────────────────────────────
    quarter_num = _quarter_of(period_month)
    date_range  = ""
    if all_dates:
        date_range = f"{min(all_dates).strftime('%d/%m')} - {max(all_dates).strftime('%d/%m/%Y')}"

    # ── Resumen (solo del departamento principal, sin Mobiliario anexado) ────
    summary: dict = {}
    if audits:
        pcts          = [_safe_float(a.percentage) for a in audits]
        branches_pct  = [(a.branch, _safe_float(a.percentage)) for a in audits]
        best          = max(branches_pct, key=lambda x: x[1])
        worst         = min(branches_pct, key=lambda x: x[1])
        summary = {
            "avg_pct":        round(sum(pcts) / len(pcts), 2),
            "best_sucursal":  best[0],
            "best_pct":       best[1],
            "worst_sucursal": worst[0],
            "worst_pct":      worst[1],
        }

    return {
        "department":       department,
        "department_color": DEPARTMENT_COLORS.get(department, "#0A4F79"),
        "period_month":      period_month,
        "period_year":       period_year,
        "period_label":      MESES_ES[period_month - 1],
        "quarter":           f"Q{quarter_num}",
        "quarter_label":     QUARTER_LABELS[quarter_num],
        "date_range":        date_range,
        "audits":            audit_payloads,
        "criteria_template": criteria_template,
        "summary":           summary,
    }


# ─────────────────────────────────────────────────────────────────────────────
# ENDPOINTS — BORRADOR (RESUMIR EDICIÓN)
# ─────────────────────────────────────────────────────────────────────────────

class ReportDraftSavePayload(BaseModel):
    audit_type_id: int
    period_month:  int  = Field(..., ge=1, le=12)
    period_year:   int  = Field(..., ge=2000, le=2100)
    draft_data:    dict = Field(default_factory=dict, description="Estado editable completo del reporte")


class ReportDraftResponse(BaseModel):
    audit_type_id: int
    period_month:  int
    period_year:   int
    draft_data:    dict
    updated_at:    Optional[str] = None


def _get_draft_or_none(db: Session, audit_type_id: int, period_month: int, period_year: int) -> Optional[ReportDraft]:
    return (
        db.query(ReportDraft)
        .filter(
            ReportDraft.audit_type_id == audit_type_id,
            ReportDraft.period_month  == period_month,
            ReportDraft.period_year   == period_year,
        )
        .first()
    )


@router.post(
    "/presentation/draft",
    response_model=ReportDraftResponse,
    summary="Guardar (o actualizar) el borrador del reporte de presentación",
)
def save_presentation_draft(
    payload:      ReportDraftSavePayload,
    current_user: User = Depends(get_current_user),
    db:           Session = Depends(get_db),
):
    draft = _get_draft_or_none(db, payload.audit_type_id, payload.period_month, payload.period_year)
    if draft:
        draft.draft_data = payload.draft_data
    else:
        draft = ReportDraft(
            audit_type_id=payload.audit_type_id,
            period_month=payload.period_month,
            period_year=payload.period_year,
            draft_data=payload.draft_data,
        )
        db.add(draft)

    db.commit()
    db.refresh(draft)

    return ReportDraftResponse(
        audit_type_id=draft.audit_type_id,
        period_month=draft.period_month,
        period_year=draft.period_year,
        draft_data=draft.draft_data or {},
        updated_at=draft.updated_at.isoformat() if draft.updated_at else None,
    )


@router.get(
    "/presentation/draft",
    response_model=Optional[ReportDraftResponse],
    summary="Obtener el borrador guardado del reporte de presentación (o null)",
)
def get_presentation_draft(
    audit_type_id: int = Query(...),
    period_month:  int = Query(..., ge=1, le=12),
    period_year:   int = Query(..., ge=2000, le=2100),
    current_user:  User = Depends(get_current_user),
    db:            Session = Depends(get_db),
):
    draft = _get_draft_or_none(db, audit_type_id, period_month, period_year)
    if not draft:
        return None

    return ReportDraftResponse(
        audit_type_id=draft.audit_type_id,
        period_month=draft.period_month,
        period_year=draft.period_year,
        draft_data=draft.draft_data or {},
        updated_at=draft.updated_at.isoformat() if draft.updated_at else None,
    )


# ─────────────────────────────────────────────────────────────────────────────
# PROXY SEGURO HACIA LA API DE CLAUDE
# ─────────────────────────────────────────────────────────────────────────────
# NOTA: el frontend NO debe llamar a api.anthropic.com directamente (no tiene
# la API key, y el navegador no puede enviarla de forma segura). Este proxy
# reutiliza el mismo patrón que app/api/audit_analysis.py::_call_claude.

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
        raise HTTPException(status.HTTP_502_BAD_GATEWAY, "Error al generar el texto con IA.")
    except urllib.error.URLError as e:
        logger.error(f"No se pudo conectar con la API de Claude: {e}")
        raise HTTPException(status.HTTP_502_BAD_GATEWAY, "No se pudo conectar con el servicio de IA.")

    return "".join(
        part.get("text", "")
        for part in data.get("content", [])
        if part.get("type") == "text"
    )


class AIGenerateRequest(BaseModel):
    prompt:     str           = Field(..., min_length=1)
    max_tokens: Optional[int] = Field(1000, ge=1, le=4000)


class AIGenerateResponse(BaseModel):
    text: str


@router.post(
    "/presentation/ai-generate",
    response_model=AIGenerateResponse,
    summary="Generar texto con IA (proxy seguro hacia Claude)",
    description=(
        "Recibe un prompt ya construido por el frontend y lo reenvía a la "
        "API de Claude usando la API key del servidor. La key nunca se "
        "expone al cliente."
    ),
)
def generate_presentation_ai_text(
    payload:      AIGenerateRequest,
    current_user: User = Depends(get_current_user),
):
    text = _call_claude(payload.prompt, payload.max_tokens or 1000)
    return AIGenerateResponse(text=text)
