"""
survey_service.py — Importación de encuestas desde Excel.

Mapea exactamente las columnas de Satisfaccion_Estructura_Mejorada.xlsx
(hoja 'Hechos_Satisfaccion') al modelo Survey.

Columnas esperadas:
    Departamento, Eficiencia, Comunicacion, CalidadTecnica, ValorAgregado,
    ExperienciaGlobal, Sat_Interna, Sat_Externa, Area, Sede, Tipo,
    Periodo, Periodo_Nombre, Fecha_Inicio, Fecha_Fin, Año, Trimestre
"""

import io
import logging
from dataclasses import dataclass, field
from decimal import Decimal
from typing import Optional

import pandas as pd
from sqlalchemy.orm import Session

from app.models.survey_models import Survey

logger = logging.getLogger(__name__)

# Mapeo columna Excel → campo del modelo Survey
COLUMN_MAP: dict[str, str] = {
    "Departamento":    "department",
    "Eficiencia":      "efficiency",
    "Comunicacion":    "communication",
    "CalidadTecnica":  "technical_quality",
    "ValorAgregado":   "added_value",
    "ExperienciaGlobal": "global_experience",
    "Sat_Interna":     "internal_satisfaction",
    "Sat_Externa":     "external_satisfaction",
    "Area":            "area",
    "Sede":            "site",
    "Tipo":            "survey_type",
    "Periodo":         "period",
    "Periodo_Nombre":  "period_name",
    "Año":             "year",
    "Trimestre":       "quarter",
}

# Columnas de scores (deben estar en rango 0-1)
SCORE_COLUMNS = [
    "efficiency", "communication", "technical_quality",
    "added_value", "global_experience",
    "internal_satisfaction", "external_satisfaction",
]


@dataclass
class SurveyImportResult:
    total_filas:    int = 0
    nuevas:         int = 0
    actualizadas:   int = 0
    omitidas:       int = 0
    errores:        list[dict] = field(default_factory=list)
    survey_ids:     list[int]  = field(default_factory=list)


def _to_decimal(val) -> Optional[Decimal]:
    """Convierte float/None a Decimal, manejando NaN."""
    if val is None:
        return None
    try:
        if pd.isna(val):
            return None
        f = float(val)
        # Normalizar: si el valor viene en escala 0-100, convertir a 0-1
        if f > 1.0:
            f = f / 100.0
        return Decimal(str(round(f, 6)))
    except (TypeError, ValueError):
        return None


def _build_dedup_key(row: dict) -> str:
    """
    Construye una clave única para deduplicación.
    Combina tipo+departamento+sede+período.
    """
    return "|".join([
        str(row.get("survey_type",  "") or ""),
        str(row.get("department",   "") or ""),
        str(row.get("site",         "") or ""),
        str(row.get("period",       "") or ""),
    ]).lower()


def importar_surveys_desde_excel(
    file_bytes: bytes,
    db: Session,
    sheet_name: str = "Hechos_Satisfaccion",
    overwrite_if_exists: bool = False,
) -> SurveyImportResult:
    """
    Importa encuestas de satisfacción desde el Excel.

    Acepta el formato exacto de Satisfaccion_Estructura_Mejorada.xlsx.
    También acepta archivos con solo las columnas de datos
    (sin las hojas de dimensiones).

    Args:
        file_bytes:          Bytes del archivo Excel.
        db:                  Sesión SQLAlchemy.
        sheet_name:          Nombre de la hoja a leer (default: 'Hechos_Satisfaccion').
        overwrite_if_exists: Si True, actualiza registros existentes.

    Returns:
        SurveyImportResult con el resumen de la operación.
    """
    result = SurveyImportResult()

    # ── 1. Leer Excel ─────────────────────────────────────────────────────────
    try:
        # Intentar leer la hoja específica; si no existe, leer la primera
        try:
            df = pd.read_excel(io.BytesIO(file_bytes), sheet_name=sheet_name)
        except Exception:
            logger.warning(
                f"Hoja '{sheet_name}' no encontrada. Leyendo primera hoja."
            )
            df = pd.read_excel(io.BytesIO(file_bytes), sheet_name=0)
    except Exception as e:
        result.errores.append({"fila": "N/A", "error": f"No se pudo leer el Excel: {e}"})
        return result

    logger.info(f"Excel leído: {len(df)} filas | columnas: {list(df.columns)}")
    result.total_filas = len(df)

    # ── 2. Mapear columnas ────────────────────────────────────────────────────
    # Renombrar usando COLUMN_MAP (solo las columnas que existan)
    rename = {k: v for k, v in COLUMN_MAP.items() if k in df.columns}
    df = df.rename(columns=rename)

    # Verificar columnas mínimas requeridas
    required = {"department", "survey_type", "period"}
    missing = required - set(df.columns)
    if missing:
        result.errores.append({
            "fila": "N/A",
            "error": (
                f"Columnas requeridas no encontradas: {missing}. "
                f"Columnas disponibles: {list(df.columns)}"
            ),
        })
        return result

    # ── 3. Obtener claves ya existentes en BD para deduplicación ─────────────
    existing_surveys = db.query(
        Survey.survey_type, Survey.department, Survey.site, Survey.period, Survey.id
    ).all()

    existing_keys: dict[str, int] = {
        _build_dedup_key({
            "survey_type": s.survey_type,
            "department":  s.department,
            "site":        s.site,
            "period":      s.period,
        }): s.id
        for s in existing_surveys
    }

    # ── 4. Procesar fila por fila ─────────────────────────────────────────────
    for idx, row in df.iterrows():
        row_dict = row.to_dict()

        # Construir clave de deduplicación
        dedup_key = _build_dedup_key(row_dict)
        existing_id = existing_keys.get(dedup_key)

        if existing_id and not overwrite_if_exists:
            result.omitidas += 1
            continue

        try:
            # Construir objeto Survey
            survey_data = {
                "department":            str(row_dict.get("department", "") or "").strip(),
                "survey_type":           str(row_dict.get("survey_type", "") or "").strip(),
                "area":                  str(row_dict.get("area", "") or "").strip() or None,
                "site":                  str(row_dict.get("site", "") or "").strip() or None,
                "period":                str(row_dict.get("period", "") or "").strip() or None,
                "period_name":           str(row_dict.get("period_name", "") or "").strip() or None,
                "year":                  _safe_int(row_dict.get("year")),
                "quarter":               _safe_int(row_dict.get("quarter")),
                "efficiency":            _to_decimal(row_dict.get("efficiency")),
                "communication":         _to_decimal(row_dict.get("communication")),
                "technical_quality":     _to_decimal(row_dict.get("technical_quality")),
                "added_value":           _to_decimal(row_dict.get("added_value")),
                "global_experience":     _to_decimal(row_dict.get("global_experience")),
                "internal_satisfaction": _to_decimal(row_dict.get("internal_satisfaction")),
                "external_satisfaction": _to_decimal(row_dict.get("external_satisfaction")),
                "score_scale":           "0-1",
                "import_source":         "excel_import",
                "source_row_id":         str(idx),
            }

            if existing_id and overwrite_if_exists:
                # Actualizar registro existente
                db.query(Survey).filter(Survey.id == existing_id).update(
                    survey_data, synchronize_session="fetch"
                )
                result.actualizadas += 1
                result.survey_ids.append(existing_id)
            else:
                # Crear nuevo registro
                survey = Survey(**survey_data)
                db.add(survey)
                db.flush()
                result.nuevas += 1
                result.survey_ids.append(survey.id)
                existing_keys[dedup_key] = survey.id

        except Exception as e:
            result.errores.append({
                "fila": int(idx),
                "departamento": row_dict.get("department", "?"),
                "error": str(e),
            })
            logger.error(f"Error procesando fila {idx}: {e}", exc_info=True)

    # ── 5. Commit ─────────────────────────────────────────────────────────────
    try:
        db.commit()
    except Exception as e:
        db.rollback()
        result.errores.append({"fila": "commit", "error": str(e)})
        logger.error(f"Error en commit de surveys: {e}", exc_info=True)

    logger.info(
        f"Import surveys: {result.nuevas} nuevas | "
        f"{result.actualizadas} actualizadas | "
        f"{result.omitidas} omitidas | "
        f"{len(result.errores)} errores"
    )
    return result


def _safe_int(val) -> Optional[int]:
    """Convierte a int de forma segura."""
    if val is None:
        return None
    try:
        if pd.isna(val):
            return None
        return int(val)
    except (TypeError, ValueError):
        return None