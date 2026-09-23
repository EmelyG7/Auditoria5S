"""
survey_wow_import_service.py — Importación de respuestas exportadas de Microsoft Forms.

Un archivo por SurveyForm. Estructura del export (verificada con el Excel real
de Gestión Humana):

    1 ID | 2 Hora de inicio | 3 Hora de finalización | 4 Correo electrónico |
    5 Nombre | [6 Hora de la última modificación] | preguntas del formulario |
    (solo internos) penúltima = nominado, última = justificación

    'Hora de la última modificación' no siempre viene (depende del export de
    Forms): las columnas de metadatos se detectan por encabezado.

ANONIMATO
    'Correo electrónico' y 'Nombre' se leen únicamente dentro de
    _consume_row_identity() para marcar como 'completo' al evaluador pendiente
    que calce, y se descartan ahí mismo: no se guardan en ninguna tabla, no se
    devuelven en el resultado ni se escriben en logs. Tampoco se guarda qué
    respuesta corresponde a qué evaluador.

PREGUNTAS
    Si el formulario aún no tiene preguntas, se crean a partir de los
    encabezados de este primer Excel (texto exacto de Forms). En importaciones
    posteriores, el número y el texto de las columnas deben coincidir con las
    preguntas guardadas; si no, se aborta (evita subir el Excel de otro depto).

ESCALA LIKERT
    Internos: Forms exporta '1'..'5'. Externos (matriz Likert de Forms):
    exporta la etiqueta; se traduce con LIKERT_LABELS (1 = Totalmente
    insatisfecho … 5 = Totalmente satisfecho).
"""

import io
import logging
import re
from dataclasses import dataclass, field
from datetime import datetime, timedelta, timezone
from typing import Optional

import openpyxl
from sqlalchemy.orm import Session, selectinload

from app.models.evaluator_models import AssignmentStatus, EvaluationAssignment, ScheduleEntry
from app.models.survey_wow_models import (
    QuestionType, SurveyAnswer, SurveyCriteria, SurveyForm, SurveyNomination,
    SurveyQuestion, SurveyResponse, SurveyType,
)
from app.services.evaluator_import_service import name_matches, norm_label, norm_name

logger = logging.getLogger(__name__)

# Forms exporta la hora local sin zona. República Dominicana = UTC-4 todo el año (sin horario de verano).
FORMS_TZ = timezone(timedelta(hours=-4))

# Columnas de metadatos del export de Forms (la de última modificación es opcional)
META_HEADERS = {
    "id", "hora de inicio", "hora de finalizacion", "correo electronico", "nombre",
    "hora de la ultima modificacion",
}

LIKERT_LABELS = {
    "totalmente insatisfecho": 1,
    "insatisfecho": 2,
    "no me siento identificado": 3,
    "satisfecho": 4,
    "totalmente satisfecho": 5,
    # Escala de acuerdo, por si algún formulario la usa
    "totalmente en desacuerdo": 1,
    "en desacuerdo": 2,
    "ni de acuerdo ni en desacuerdo": 3,
    "de acuerdo": 4,
    "totalmente de acuerdo": 5,
}

IDENTIFIER_HEADERS = {"colaborador que asistio", "cliente", "telefono"}


@dataclass
class SurveyWowImportResult:
    importadas:              int = 0
    duplicadas:              int = 0
    sin_match_evaluador:     int = 0
    evaluadores_completados: int = 0
    preguntas_creadas:       int = 0
    errores:                 list[dict] = field(default_factory=list)
    advertencias:            list[str]  = field(default_factory=list)


class SurveyWowImportError(ValueError):
    """Error de estructura del archivo: aborta la importación completa."""


class SurveyWowFilenameMismatch(SurveyWowImportError):
    """Primera importación con un archivo cuyo nombre no corresponde al formulario."""


# ─────────────────────────────────────────────────────────────────────────────
# PARSERS
# ─────────────────────────────────────────────────────────────────────────────

def parse_likert(val) -> Optional[int]:
    """'4' / 4 / 'Satisfecho' → 4. None si vacío. ValueError si no es interpretable."""
    if val is None or (isinstance(val, str) and not val.strip()):
        return None
    if isinstance(val, (int, float)):
        n = int(val)
    else:
        s = str(val).strip()
        if re.fullmatch(r"\d+(\.0+)?", s):
            n = int(float(s))
        else:
            n = LIKERT_LABELS.get(norm_label(s))
            if n is None:
                raise ValueError(f"valor Likert no reconocido: '{s}'")
    if not 1 <= n <= 5:
        raise ValueError(f"valor Likert fuera de rango 1-5: {n}")
    return n


def _to_dt(val) -> Optional[datetime]:
    if isinstance(val, datetime):
        return val.replace(tzinfo=FORMS_TZ) if val.tzinfo is None else val
    return None


def _text(val) -> Optional[str]:
    if val is None:
        return None
    s = str(val).strip()
    return s or None


def _same_text(a, b) -> bool:
    return norm_label(a) == norm_label(b)


def _words(txt) -> set[str]:
    """Palabras completas (sin tildes, minúsculas): 'TI' no debe calzar dentro de 'satisfacción'."""
    return set(re.findall(r"[a-z0-9&]+", norm_label(txt)))


# ─────────────────────────────────────────────────────────────────────────────
# PREGUNTAS
# ─────────────────────────────────────────────────────────────────────────────

def _infer_question_type(header: str, values: list) -> str:
    h = norm_label(header)
    if h in IDENTIFIER_HEADERS:
        return QuestionType.IDENTIFIER.value
    non_empty = [v for v in values if _text(v) is not None]
    if non_empty:
        try:
            for v in non_empty:
                parse_likert(v)
            return QuestionType.LIKERT_5.value
        except ValueError:
            return QuestionType.TEXT.value
    # Sin datos: decidir por el encabezado
    if "comentario" in h or "sugerencia" in h or h.endswith("?"):
        return QuestionType.TEXT.value
    return QuestionType.LIKERT_5.value


def _bootstrap_questions(
    db: Session, form: SurveyForm, headers: list, data_rows: list, result: SurveyWowImportResult,
    n_meta: int,
) -> None:
    """Crea las SurveyQuestion del formulario a partir de los encabezados del export."""
    criteria = db.query(SurveyCriteria).order_by(SurveyCriteria.order).all()
    likert_seen = 0
    for i, header in enumerate(headers):
        col_values = [r[n_meta + i] if n_meta + i < len(r) else None for r in data_rows]
        qtype = _infer_question_type(header, col_values)
        criteria_id = None
        if form.survey_type == SurveyType.INTERNO.value and qtype == QuestionType.LIKERT_5.value:
            if likert_seen < len(criteria):
                criteria_id = criteria[likert_seen].id
            likert_seen += 1
        q = SurveyQuestion(
            order=i + 1,
            text=str(header).strip(),
            question_type=qtype,
            criteria_id=criteria_id,
            is_required=True,
        )
        form.questions.append(q)
        result.preguntas_creadas += 1

    if form.survey_type == SurveyType.INTERNO.value and likert_seen != len(criteria):
        raise SurveyWowImportError(
            f"Un formulario interno debe tener {len(criteria)} preguntas Likert (una por criterio) "
            f"y este archivo tiene {likert_seen}. No se importó nada."
        )
    db.flush()


def _validate_questions(form: SurveyForm, headers: list) -> None:
    if len(headers) != len(form.questions):
        raise SurveyWowImportError(
            f"El archivo tiene {len(headers)} columnas de preguntas y el formulario "
            f"'{form.title}' tiene {len(form.questions)}. ¿Es el Excel correcto? No se importó nada."
        )
    distintas = [
        q.order for q, h in zip(form.questions, headers) if not _same_text(q.text, h)
    ]
    if distintas:
        raise SurveyWowImportError(
            f"Las preguntas {distintas} del archivo no coinciden con las del formulario "
            f"'{form.title}'. ¿Es el Excel de este formulario? No se importó nada."
        )


# ─────────────────────────────────────────────────────────────────────────────
# CRUCE ANÓNIMO CON EVALUADORES
# ─────────────────────────────────────────────────────────────────────────────

def _consume_row_identity(
    nombre, correo, pending: list[EvaluationAssignment],
) -> Optional[EvaluationAssignment]:
    """
    Devuelve la asignación (de la lista del formulario) que corresponde a quien respondió, o None.
    `nombre` y `correo` no salen de esta función (no se guardan ni se loguean).
    Solo acepta un candidato único, para no marcar a la persona equivocada.
    """
    candidatos = []
    for texto in (nombre, (str(correo).split("@")[0].replace(".", " ").replace("_", " ") if correo else None)):
        if not texto:
            continue
        key = norm_name(texto)
        exactos = [a for a in pending if a.employee.name_key == key]
        if len(exactos) == 1:
            return exactos[0]
        candidatos = [a for a in pending if name_matches(texto, a.employee.name_key)]
        if len(candidatos) == 1:
            return candidatos[0]
    return None


# ─────────────────────────────────────────────────────────────────────────────
# IMPORTACIÓN
# ─────────────────────────────────────────────────────────────────────────────

def importar_respuestas_desde_excel(
    file_bytes: bytes,
    form_id: int,
    db: Session,
    filename: Optional[str] = None,
    force_new_questions: bool = False,
) -> SurveyWowImportResult:
    result = SurveyWowImportResult()

    form = (
        db.query(SurveyForm)
        .options(selectinload(SurveyForm.questions))
        .filter(SurveyForm.id == form_id)
        .first()
    )
    if not form:
        raise SurveyWowImportError(f"Formulario id={form_id} no encontrado.")
    is_internal = form.survey_type == SurveyType.INTERNO.value

    # ── 1. Leer Excel (sin read_only: los exports de Forms no traen dimensión) ─
    try:
        wb = openpyxl.load_workbook(io.BytesIO(file_bytes), data_only=True)
    except Exception as e:
        raise SurveyWowImportError(f"No se pudo leer el Excel: {e}")
    rows = [r for r in wb.worksheets[0].iter_rows(values_only=True)]
    rows = [r for r in rows if any(v is not None and str(v).strip() for v in r)]
    if not rows:
        raise SurveyWowImportError("El archivo está vacío.")

    headers = [h for h in rows[0]]
    while headers and headers[-1] is None:
        headers.pop()
    data_rows = rows[1:]

    # ── 2. Validar columnas fijas del export de Forms ─────────────────────────
    n_meta = 0
    while n_meta < len(headers) and norm_label(headers[n_meta]) in META_HEADERS:
        n_meta += 1
    meta = [norm_label(h) for h in headers[:n_meta]]
    if n_meta < 5 or meta[:5] != ["id", "hora de inicio", "hora de finalizacion", "correo electronico", "nombre"]:
        raise SurveyWowImportError(
            "El archivo no tiene el formato de exportación de Microsoft Forms "
            "(ID, Hora de inicio, Hora de finalización, Correo electrónico, Nombre, ...)."
        )

    question_headers = headers[n_meta:]
    if is_internal:
        if len(question_headers) < 3 or "nominad" not in norm_label(question_headers[-2]):
            raise SurveyWowImportError(
                "Formulario interno: se esperaba que las dos últimas columnas fueran "
                "'Seleccione a su nominado' y la justificación."
            )
        question_headers = question_headers[:-2]
    elif question_headers and "nominad" in norm_label(question_headers[-2] if len(question_headers) > 1 else ""):
        raise SurveyWowImportError(
            "Este archivo trae columnas de nominación, propias de un formulario interno, "
            f"y '{form.title}' es externo. ¿Es el Excel correcto? No se importó nada."
        )

    nombre_corto = re.sub(r"\s*\(Cliente Externo\)", "", form.title.split("—")[-1]).strip()
    filename_ok = bool(filename) and _words(nombre_corto) <= _words(filename)

    # ── 3. Preguntas: crear (primera vez) o validar ───────────────────────────
    if not form.questions:
        # La primera importación define las preguntas del formulario para siempre:
        # exigir que el archivo sea el de este formulario (salvo confirmación explícita).
        if not filename_ok and not force_new_questions:
            raise SurveyWowFilenameMismatch(
                f"Es la primera importación de '{form.title}' y el nombre del archivo "
                f"('{filename or 'sin nombre'}') no menciona '{nombre_corto}'. Las preguntas del "
                "formulario se crearán a partir de este Excel: confirma que es el archivo correcto."
            )
        _bootstrap_questions(db, form, question_headers, data_rows, result, n_meta)
    else:
        _validate_questions(form, question_headers)
        if not filename_ok:
            result.advertencias.append(
                f"El nombre del archivo no menciona '{nombre_corto}'. "
                "Las preguntas coinciden, pero verifica que sea el Excel de este formulario."
            )
    questions = sorted(form.questions, key=lambda q: q.order)

    # ── 4. Dedupe y evaluadores pendientes ────────────────────────────────────
    existing_ids = {
        ext for (ext,) in db.query(SurveyResponse.external_response_id)
        .filter(SurveyResponse.form_id == form.id)
    }
    pending: list[EvaluationAssignment] = []   # asignaciones aún no emparejadas en esta importación
    entry = None
    if is_internal and form.list_name:
        entry = db.query(ScheduleEntry).filter(
            ScheduleEntry.cycle_id == form.cycle_id,
            ScheduleEntry.list_name == form.list_name,
        ).first()
        if entry:
            # Todos (no solo pendientes): quien ya estaba completo no cuenta como "sin match"
            pending = list(entry.assignments)
    if is_internal and entry is None:
        result.advertencias.append(
            "No hay lista de evaluadores importada para este formulario: "
            "no se actualizó el estado de ningún evaluador."
        )

    # ── 5. Filas ──────────────────────────────────────────────────────────────
    for n_fila, r in enumerate(data_rows, start=2):
        r = list(r) + [None] * (len(headers) - len(r))
        try:
            ext_id = int(r[0])
        except (TypeError, ValueError):
            result.errores.append({"fila": n_fila, "error": "Columna ID vacía o no numérica."})
            continue
        if ext_id in existing_ids:
            result.duplicadas += 1
            continue

        try:
            answers = []
            for q, val in zip(questions, r[n_meta:n_meta + len(questions)]):
                if q.question_type == QuestionType.LIKERT_5.value:
                    answers.append(SurveyAnswer(question_id=q.id, value_score=parse_likert(val)))
                else:
                    answers.append(SurveyAnswer(question_id=q.id, value_text=_text(val)))
        except ValueError as e:
            result.errores.append({"fila": n_fila, "id": ext_id, "error": str(e)})
            continue

        resp = SurveyResponse(
            form_id=form.id,
            external_response_id=ext_id,
            started_at=_to_dt(r[1]),
            completed_at=_to_dt(r[2]),
            answers=answers,
        )
        if is_internal:
            nominee = _text(r[len(headers) - 2])
            if nominee:
                resp.nomination = SurveyNomination(
                    nominee_name=nominee[:150], reason=_text(r[len(headers) - 1]),
                )
        db.add(resp)
        existing_ids.add(ext_id)
        result.importadas += 1

        if entry is not None:
            match = _consume_row_identity(r[4], r[3], pending)
            if match is not None:
                if match.status != AssignmentStatus.COMPLETO.value:
                    match.status = AssignmentStatus.COMPLETO.value
                    result.evaluadores_completados += 1
                pending.remove(match)
            else:
                result.sin_match_evaluador += 1
        r[3] = r[4] = None  # descartar correo y nombre de la fila

    db.commit()
    logger.info(
        f"Import Servicio WOW form_id={form.id}: {result.importadas} importadas, "
        f"{result.duplicadas} duplicadas, {result.sin_match_evaluador} sin match, "
        f"{len(result.errores)} errores"
    )
    return result
