"""
audit_service.py — Servicio central de cálculo y persistencia de auditorías 5S.

Porta EXACTAMENTE la lógica del notebook Tabular_Auditorias.ipynb:

    Notebook                    →  Este módulo
    ─────────────────────────────────────────────────────
    extraer_peso(header)        →  _extraer_peso()
    limpiar_nombre_col(col)     →  _limpiar_nombre_col()
    parsear_respuesta(valor)    →  _parsear_respuesta()
    trimestre(fecha)            →  _trimestre()
    semaforo(pct)               →  _semaforo()
    detectar_grupos(df)         →  detectar_grupos_desde_df()
    procesar_fila(row, grupos)  →  calcular_puntajes_desde_dict()
    pipeline procesar()         →  importar_desde_excel()
                                   crear_audit_desde_calculo()

FLUJO PRINCIPAL:
    Opción A — Subida de Excel:
        importar_desde_excel(file_bytes, audit_type_id, db)
            → lee pandas → detecta grupos → procesa filas → guarda en BD

    Opción B — Formulario web (respuestas manuales):
        calcular_puntajes_desde_dict(respuestas, grupos)
            → calcula puntajes → retorna AuditCalculationResult
        crear_audit_desde_calculo(resultado, metadata, db)
            → persiste en BD

NOTA DE MIGRACIÓN A POSTGRESQL:
    Este servicio es agnóstico al motor de BD — usa SQLAlchemy ORM.
    No hay SQL crudo, funciona igual con SQLite o PostgreSQL.

NOTA PARA ODOO (futuro):
    Las funciones de cálculo puro (_extraer_peso, _parsear_respuesta,
    calcular_puntajes_desde_dict, detectar_grupos_desde_df) NO tocan la BD.
    Al integrar con Odoo, solo se reemplaza crear_audit_desde_calculo()
    por la escritura al ORM de Odoo. El resto se reutiliza tal cual.
"""

import io
import logging
import re
import warnings
from dataclasses import dataclass, field
from datetime import date, datetime, time
from decimal import Decimal
from typing import Any, Optional

import pandas as pd
from sqlalchemy.orm import Session

from app.models.audit_models import Audit, AuditQuestion, AuditType

logger = logging.getLogger(__name__)

# Suprime el UserWarning de openpyxl sobre estilos (mismo que el notebook)
warnings.filterwarnings("ignore", category=UserWarning)

# ─────────────────────────────────────────────────────────────────────────────
# CONSTANTES — espeja NOMBRES_S del notebook
# ─────────────────────────────────────────────────────────────────────────────

NOMBRES_S: list[str] = [
    "Seiri (Clasificar)",
    "Seiton (Ordenar)",
    "Seiso (Limpiar)",
    "Seiketsu (Estandarizar)",
    "Shitsuke (Disciplina)",
]

# Mapeo de nombre_s → campo de porcentaje en el modelo Audit
# Permite escribir el valor desnormalizado de cada S al guardar
S_TO_AUDIT_FIELD: dict[str, str] = {
    "Seiri (Clasificar)":      "seiri_percentage",
    "Seiton (Ordenar)":        "seiton_percentage",
    "Seiso (Limpiar)":         "seiso_percentage",
    "Seiketsu (Estandarizar)": "seiketsu_percentage",
    "Shitsuke (Disciplina)":   "shitsuke_percentage",
}

# Columnas de metadatos a renombrar desde el Excel
# Espeja el bloque `rename` de la función procesar() del notebook
RENAME_MAP_PATTERNS: dict[str, str] = {
    "fecha":    "FechaAuditoria",
    "realizó":  "Sucursal",
    "realizo":  "Sucursal",
    "nombre":   "Auditor",
    "correo":   "Email",
    "inicio":   "HoraInicio",
    "finaliz":  "HoraFin",
}


# ─────────────────────────────────────────────────────────────────────────────
# DATACLASSES DE RESULTADO
# ─────────────────────────────────────────────────────────────────────────────

@dataclass
class PuntajeS:
    """Resultado del cálculo para una S individual."""
    nombre_s: str
    s_index: int
    puntos_obtenidos: float
    puntos_maximos: float
    porcentaje: float
    estado: str
    observacion: str = ""
    preguntas: list[dict] = field(default_factory=list)
    # preguntas: lista de dicts con keys:
    #   texto, peso, respuesta_pct, puntos, es_critica, puntos_perdidos, orden


@dataclass
class AuditCalculationResult:
    """
    Resultado completo del cálculo de una auditoría.

    Es el equivalente al dict que retorna procesar_fila() en el notebook,
    pero tipado y estructurado para ser consumido por la API y la BD.
    """
    # Metadatos de la auditoría
    fecha: Optional[date] = None
    trimestre: Optional[str] = None
    anio: Optional[int] = None
    sucursal: str = ""
    auditor: str = ""
    email: str = ""
    hora_inicio: Optional[time] = None
    hora_fin: Optional[time] = None

    # Resultados por S
    puntajes_por_s: list[PuntajeS] = field(default_factory=list)

    # Totales
    puntaje_total: float = 0.0
    puntaje_maximo: float = 0.0
    porcentaje_general: float = 0.0
    estado_general: str = ""

    # Listas planas para exportación/API (espeja hojas del notebook)
    detalle_preguntas: list[dict] = field(default_factory=list)
    preguntas_criticas: list[dict] = field(default_factory=list)

    # Trazabilidad
    source_form_id: Optional[str] = None
    errores_procesamiento: list[str] = field(default_factory=list)

    @property
    def es_valido(self) -> bool:
        return len(self.errores_procesamiento) == 0 and self.puntaje_maximo > 0

    def to_dict_resumen(self) -> dict:
        """Serializable para respuesta de API o exportación Excel."""
        resumen = {
            "FechaAuditoria":       str(self.fecha) if self.fecha else None,
            "Trimestre":            self.trimestre,
            "Año":                  self.anio,
            "Sucursal":             self.sucursal,
            "Auditor":              self.auditor,
            "Email":                self.email,
            "Puntaje_Total":        round(self.puntaje_total, 2),
            "Puntaje_Maximo":       round(self.puntaje_maximo, 2),
            "Porcentaje_General_%": round(self.porcentaje_general, 2),
            "Estado_General":       self.estado_general,
        }
        for ps in self.puntajes_por_s:
            resumen[f"{ps.nombre_s}__Porcentaje_%"] = round(ps.porcentaje, 2)
            resumen[f"{ps.nombre_s}__Estado"]       = ps.estado
            resumen[f"{ps.nombre_s}__Observaciones"] = ps.observacion
        return resumen


# ─────────────────────────────────────────────────────────────────────────────
# GRUPO — estructura interna de detección
# ─────────────────────────────────────────────────────────────────────────────

@dataclass
class GrupoS:
    """
    Representa un bloque de preguntas pertenecientes a una S.
    Equivale al dict que retorna detectar_grupos() en el notebook.
    """
    s_index: int
    nombre_s: str
    columnas_preguntas: list[str]   # Nombres de columna del DataFrame
    columna_observacion: Optional[str] = None


# ─────────────────────────────────────────────────────────────────────────────
# FUNCIONES UTILITARIAS PURAS
# (Sin dependencias de BD ni de FastAPI — testeables de forma aislada)
# ─────────────────────────────────────────────────────────────────────────────

def _limpiar_nombre_col(col: str) -> str:
    """
    Elimina \\xa0, espacios extra y saltos de línea de un nombre de columna.
    Espeja limpiar_nombre_col() del notebook.
    """
    return re.sub(r"\s+", " ", str(col).replace("\xa0", " ")).strip()


def _extraer_peso(header: str) -> Optional[float]:
    """
    Extrae el peso porcentual del encabezado de una pregunta.
    Espeja extraer_peso() del notebook.

    Ejemplos:
        "¿Los materiales están ordenados? 4.55%"  →  4.55
        "¿Área limpia? 10%"                        →  10.0
        "Observaciones 1"                          →  None
    """
    m = re.search(r"(\d+(?:\.\d+)?)\s*%", _limpiar_nombre_col(header))
    return float(m.group(1)) if m else None


def _parsear_respuesta(valor: Any) -> float:
    """
    Convierte cualquier formato de respuesta a float 0-100.
    Espeja parsear_respuesta() del notebook.

    Formatos soportados:
        '100%', '50%', '0%'   →  100.0, 50.0, 0.0
        0.5, 1.0              →  50.0, 100.0  (si está en rango 0-1)
        50, 100               →  50.0, 100.0
        NaN, None, ''         →  0.0
    """
    if pd.isna(valor) if not isinstance(valor, str) else (valor.strip() == ""):
        return 0.0
    if isinstance(valor, str):
        v = valor.strip().replace("%", "")
        try:
            n = float(v)
            return n if n > 1 else n * 100
        except ValueError:
            return 0.0
    if isinstance(valor, (int, float)):
        return float(valor) * 100 if 0 < valor <= 1 else float(valor)
    return 0.0


def _trimestre(fecha: Any) -> str:
    """
    Retorna el trimestre como string 'Q1'...'Q4'.
    Espeja trimestre() del notebook.
    """
    if fecha is None or (not isinstance(fecha, str) and pd.isna(fecha)):
        return "Sin fecha"
    try:
        mes = pd.Timestamp(fecha).month
        return f"Q{(mes - 1) // 3 + 1}"
    except Exception:
        return "Sin fecha"


def _semaforo(pct: float) -> str:
    """
    Retorna el estado según el porcentaje de cumplimiento.
    Espeja semaforo() del notebook — MISMOS UMBRALES.

        >= 80%  →  'Cumple'
        60-79%  →  'Por mejorar'
        < 60%   →  'Crítico'
    """
    if pct >= 80:
        return "Cumple"
    if pct >= 60:
        return "Por mejorar"
    return "Crítico"


def _limpiar_texto_pregunta(col: str) -> str:
    """
    Elimina el sufijo '% XX.XX' del nombre de la columna para obtener
    solo el texto de la pregunta.
    Espeja el re.sub() dentro de procesar_fila() del notebook.
    """
    texto = re.sub(r"\s*\d+(?:\.\d+)?\s*%\s*$", "", _limpiar_nombre_col(col))
    return texto.strip()


def _normalizar_columnas_excel(df: pd.DataFrame) -> pd.DataFrame:
    """
    Renombra las columnas de metadatos del Excel a nombres estándar.
    Espeja el bloque `rename` de la función procesar() del notebook.
    """
    rename: dict[str, str] = {}
    for col in df.columns:
        col_lower = col.strip().lower()
        for patron, nombre_std in RENAME_MAP_PATTERNS.items():
            if patron in col_lower and nombre_std not in rename.values():
                rename[col] = nombre_std
                break
        # Caso especial: columna "Nombre" exacto → Auditor
        if col.strip() == "Nombre" and "Auditor" not in rename.values():
            rename[col] = "Auditor"

    return df.rename(columns=rename)


# ─────────────────────────────────────────────────────────────────────────────
# DETECCIÓN DE GRUPOS
# ─────────────────────────────────────────────────────────────────────────────

def detectar_grupos_desde_df(df: pd.DataFrame) -> list[GrupoS]:
    """
    Detecta automáticamente los bloques Seiri/Seiton/etc. a partir de las
    columnas del DataFrame.

    Espeja detectar_grupos() del notebook, pero retorna GrupoS en lugar de dicts.

    Algoritmo:
        1. Recorre las columnas en orden.
        2. Si la columna tiene un peso (%) en el header → es una pregunta.
        3. Si la columna empieza con 'Observaciones' → cierra el bloque actual.
        4. Al cerrar un bloque, crea un GrupoS con las preguntas acumuladas.

    Returns:
        Lista de GrupoS en orden (Seiri=0, Seiton=1, ...).

    Raises:
        ValueError: Si no se detecta ningún grupo (Excel con formato incorrecto).
    """
    columnas = list(df.columns)
    grupos: list[GrupoS] = []
    buffer_preguntas: list[str] = []
    s_idx = 0

    for col in columnas:
        col_limpia = _limpiar_nombre_col(col)
        peso = _extraer_peso(col)

        if peso is not None:
            buffer_preguntas.append(col)
        elif col_limpia.lower().startswith("observaciones") and buffer_preguntas:
            nombre_s = NOMBRES_S[s_idx] if s_idx < len(NOMBRES_S) else f"S{s_idx + 1}"
            grupos.append(GrupoS(
                s_index=s_idx,
                nombre_s=nombre_s,
                columnas_preguntas=buffer_preguntas.copy(),
                columna_observacion=col,
            ))
            buffer_preguntas = []
            s_idx += 1

    # Bloque final sin columna de observación (edge case)
    if buffer_preguntas:
        nombre_s = NOMBRES_S[s_idx] if s_idx < len(NOMBRES_S) else f"S{s_idx + 1}"
        grupos.append(GrupoS(
            s_index=s_idx,
            nombre_s=nombre_s,
            columnas_preguntas=buffer_preguntas,
            columna_observacion=None,
        ))

    if not grupos:
        raise ValueError(
            "No se detectaron grupos de preguntas en el Excel. "
            "Verifica que las columnas de preguntas contengan el peso en % "
            "(ej: '¿Está limpio? 4.55%') y que haya columnas 'Observaciones N'."
        )

    logger.info(
        f"Grupos detectados: {[g.nombre_s for g in grupos]} | "
        f"Total preguntas: {sum(len(g.columnas_preguntas) for g in grupos)}"
    )
    return grupos


def detectar_grupos_desde_bytes(file_bytes: bytes) -> list[GrupoS]:
    """
    Versión de detectar_grupos que acepta bytes (archivo subido por FastAPI).
    Útil para validar el formato antes de importar.
    """
    df = pd.read_excel(io.BytesIO(file_bytes), sheet_name=0)
    df = _normalizar_columnas_excel(df)
    return detectar_grupos_desde_df(df)


# ─────────────────────────────────────────────────────────────────────────────
# CÁLCULO DE PUNTAJES
# ─────────────────────────────────────────────────────────────────────────────

def calcular_puntajes_desde_dict(
    respuestas: dict[str, Any],
    grupos: list[GrupoS],
    metadatos: Optional[dict] = None,
) -> AuditCalculationResult:
    """
    Calcula todos los puntajes a partir de un diccionario de respuestas.

    Espeja procesar_fila() del notebook.

    Args:
        respuestas: Dict donde las claves son los nombres originales de columna
                    (con el % incluido, igual que en el Excel) y los valores
                    son las respuestas (0, 50, 100 o sus equivalentes).
                    Ejemplo: {"¿Área limpia? 4.55%": 100, ...}

        grupos:     Lista de GrupoS retornada por detectar_grupos_desde_df().
                    Define la estructura del checklist.

        metadatos:  Dict opcional con FechaAuditoria, Sucursal, Auditor, etc.

    Returns:
        AuditCalculationResult con todos los puntajes calculados.

    Raises:
        ValueError: Si respuestas está vacío o grupos está vacío.
    """
    if not grupos:
        raise ValueError("La lista de grupos no puede estar vacía.")

    meta = metadatos or {}
    resultado = AuditCalculationResult()

    # ── Parsear metadatos ─────────────────────────────────────────────────────
    fecha_raw = meta.get("FechaAuditoria") or respuestas.get("FechaAuditoria")
    try:
        if fecha_raw and not pd.isna(fecha_raw):
            ts = pd.Timestamp(fecha_raw)
            resultado.fecha     = ts.date()
            resultado.trimestre = f"Q{(ts.month - 1) // 3 + 1}"
            resultado.anio      = ts.year
        else:
            resultado.trimestre = "Sin fecha"
    except Exception:
        resultado.trimestre = "Sin fecha"

    resultado.sucursal    = str(meta.get("Sucursal",    respuestas.get("Sucursal",    "")) or "")
    resultado.auditor     = str(meta.get("Auditor",     respuestas.get("Auditor",     "")) or "")
    resultado.email       = str(meta.get("Email",       respuestas.get("Email",       "")) or "")
    resultado.source_form_id = str(meta.get("Id", respuestas.get("Id", ""))) or None

    hora_inicio_raw = meta.get("HoraInicio") or respuestas.get("HoraInicio")
    hora_fin_raw    = meta.get("HoraFin")    or respuestas.get("HoraFin")
    resultado.hora_inicio = _parsear_time(hora_inicio_raw)
    resultado.hora_fin    = _parsear_time(hora_fin_raw)

    # ── Calcular por cada grupo (S) ───────────────────────────────────────────
    puntaje_total_acum = 0.0
    peso_total_acum    = 0.0

    for grupo in grupos:
        puntaje_s = 0.0
        peso_s    = 0.0
        preguntas_detalle: list[dict] = []

        for orden, col in enumerate(grupo.columnas_preguntas):
            peso  = _extraer_peso(col)
            if peso is None:
                continue

            resp   = _parsear_respuesta(respuestas.get(col, 0))
            puntos = (resp / 100.0) * peso

            puntaje_s         += puntos
            peso_s            += peso
            puntaje_total_acum += puntos
            peso_total_acum    += peso

            texto_pregunta = _limpiar_texto_pregunta(col)
            puntos_perdidos = round(peso - puntos, 4)
            es_critica      = resp < 100

            fila_pregunta = {
                "columna_original":  col,
                "texto":             texto_pregunta,
                "peso":              peso,
                "respuesta_pct":     resp,
                "puntos":            round(puntos, 4),
                "es_critica":        es_critica,
                "puntos_perdidos":   puntos_perdidos,
                "orden":             orden,
                "s_nombre":          grupo.nombre_s,
                "s_index":           grupo.s_index,
            }
            preguntas_detalle.append(fila_pregunta)

            # Acumula en la lista plana de detalle (espeja hoja Detalle_Preguntas)
            resultado.detalle_preguntas.append({
                "S":             grupo.nombre_s,
                "Pregunta":      texto_pregunta,
                "Peso_%":        peso,
                "Respuesta_%":   resp,
                "Puntos":        round(puntos, 4),
            })

            # Acumula preguntas críticas (espeja hoja Preguntas_Criticas)
            if es_critica:
                resultado.preguntas_criticas.append({
                    "S":              grupo.nombre_s,
                    "Pregunta":       texto_pregunta,
                    "Respuesta_%":    resp,
                    "Puntos_perdidos": puntos_perdidos,
                })

        # ── Observación del grupo ─────────────────────────────────────────────
        obs_s = ""
        if grupo.columna_observacion:
            val = respuestas.get(grupo.columna_observacion, "")
            obs_s = str(val).strip() if val and not (isinstance(val, float) and pd.isna(val)) else ""

        # ── Puntaje y estado de la S ──────────────────────────────────────────
        pct_s = round((puntaje_s / peso_s) * 100, 2) if peso_s > 0 else 0.0

        puntaje_s_obj = PuntajeS(
            nombre_s=grupo.nombre_s,
            s_index=grupo.s_index,
            puntos_obtenidos=round(puntaje_s, 2),
            puntos_maximos=round(peso_s, 2),
            porcentaje=pct_s,
            estado=_semaforo(pct_s),
            observacion=obs_s,
            preguntas=preguntas_detalle,
        )
        resultado.puntajes_por_s.append(puntaje_s_obj)

    # ── Totales generales ─────────────────────────────────────────────────────
    pct_general = round((puntaje_total_acum / peso_total_acum) * 100, 2) if peso_total_acum > 0 else 0.0

    resultado.puntaje_total      = round(puntaje_total_acum, 2)
    resultado.puntaje_maximo     = round(peso_total_acum, 2)
    resultado.porcentaje_general = pct_general
    resultado.estado_general     = _semaforo(pct_general)

    logger.debug(
        f"Cálculo completado: {resultado.sucursal} | "
        f"{pct_general:.1f}% ({resultado.estado_general}) | "
        f"{len(resultado.preguntas_criticas)} preguntas críticas"
    )
    return resultado


def _parsear_time(valor: Any) -> Optional[time]:
    """Intenta convertir un valor a time. Retorna None si falla."""
    if valor is None:
        return None
    try:
        if isinstance(valor, time):
            return valor
        if isinstance(valor, datetime):
            return valor.time()
        ts = pd.Timestamp(valor)
        return ts.time()
    except Exception:
        return None


# ─────────────────────────────────────────────────────────────────────────────
# PERSISTENCIA EN BD
# ─────────────────────────────────────────────────────────────────────────────

def crear_audit_desde_calculo(
    resultado: AuditCalculationResult,
    audit_type_id: int,
    db: Session,
    import_source: str = "manual",
    overwrite_if_exists: bool = False,
) -> Audit:
    """
    Persiste un AuditCalculationResult en las tablas Audit y AuditQuestion.

    Args:
        resultado:           Resultado de calcular_puntajes_desde_dict().
        audit_type_id:       ID del tipo de auditoría (1=Almacenes, 2=Centro, 3=RMA).
        db:                  Sesión SQLAlchemy activa.
        import_source:       'manual', 'excel_import', 'api'.
        overwrite_if_exists: Si True, actualiza el registro existente en lugar
                             de lanzar error por la constraint de unicidad.

    Returns:
        Objeto Audit ya persistido (con id asignado).

    Raises:
        ValueError: Si el resultado no es válido o ya existe y overwrite=False.
    """
    if not resultado.es_valido:
        raise ValueError(
            f"Resultado inválido para persistir: {resultado.errores_procesamiento}"
        )

    # ── Verificar si ya existe (deduplicación) ────────────────────────────────
    existing = None
    if resultado.fecha and resultado.sucursal:
        existing = db.query(Audit).filter(
            Audit.audit_type_id == audit_type_id,
            Audit.branch == resultado.sucursal,
            Audit.audit_date == resultado.fecha,
            Audit.auditor_email == (resultado.email or None),
        ).first()

    if existing and not overwrite_if_exists:
        raise ValueError(
            f"Ya existe una auditoría para {resultado.sucursal} / "
            f"{resultado.fecha} / {resultado.email}. "
            f"Usa overwrite_if_exists=True para actualizarla."
        )

    # ── Construir o actualizar el objeto Audit ────────────────────────────────
    audit = existing or Audit()

    audit.audit_type_id         = audit_type_id
    audit.audit_date            = resultado.fecha or date.today()
    audit.branch                = resultado.sucursal
    audit.auditor_name          = resultado.auditor or None
    audit.auditor_email         = resultado.email or None
    audit.start_time            = resultado.hora_inicio
    audit.end_time              = resultado.hora_fin
    audit.total_score           = Decimal(str(resultado.puntaje_total))
    audit.max_score             = Decimal(str(resultado.puntaje_maximo))
    audit.percentage            = Decimal(str(resultado.porcentaje_general))
    audit.status                = resultado.estado_general
    audit.source_form_id        = resultado.source_form_id
    audit.import_source         = import_source

    # Escribir porcentajes por S en los campos desnormalizados del modelo
    for ps in resultado.puntajes_por_s:
        campo = S_TO_AUDIT_FIELD.get(ps.nombre_s)
        if campo:
            setattr(audit, campo, Decimal(str(ps.porcentaje)))

    if not existing:
        db.add(audit)

    # Flush para obtener el audit.id antes de crear las preguntas
    db.flush()

    # ── Si es update, borrar preguntas anteriores para reinsertarlas ──────────
    if existing:
        db.query(AuditQuestion).filter(
            AuditQuestion.audit_id == audit.id
        ).delete(synchronize_session="fetch")
        db.flush()

    # ── Insertar AuditQuestion por cada pregunta ──────────────────────────────
    preguntas_bulk: list[AuditQuestion] = []

    for ps in resultado.puntajes_por_s:
        for preg in ps.preguntas:
            aq = AuditQuestion(
                audit_id        = audit.id,
                s_name          = ps.nombre_s,
                s_index         = ps.s_index,
                question_text   = preg["texto"],
                question_order  = preg["orden"],
                weight          = Decimal(str(preg["peso"])),
                response_percent= Decimal(str(preg["respuesta_pct"])),
                points_earned   = Decimal(str(preg["puntos"])),
                observation     = ps.observacion,   # Una obs por bloque de S
                is_critical     = preg["es_critica"],
                points_lost     = Decimal(str(preg["puntos_perdidos"])),
            )
            preguntas_bulk.append(aq)

    db.bulk_save_objects(preguntas_bulk)
    db.flush()

    action = "actualizada" if existing else "creada"
    logger.info(
        f"Auditoría {action} → id={audit.id} | "
        f"{audit.branch} | {audit.audit_date} | "
        f"{float(audit.percentage):.1f}% ({audit.status}) | "
        f"{len(preguntas_bulk)} preguntas guardadas"
    )
    return audit


# ─────────────────────────────────────────────────────────────────────────────
# IMPORTACIÓN MASIVA DESDE EXCEL
# ─────────────────────────────────────────────────────────────────────────────

@dataclass
class ImportResult:
    """Resultado de una importación masiva desde Excel."""
    total_filas:    int = 0
    nuevas:         int = 0
    actualizadas:   int = 0
    omitidas:       int = 0
    errores:        list[dict] = field(default_factory=list)
    audits_creados: list[int]  = field(default_factory=list)  # IDs de Audit creados

    @property
    def exitosas(self) -> int:
        return self.nuevas + self.actualizadas


def importar_desde_excel(
    file_bytes: bytes,
    audit_type_id: int,
    db: Session,
    overwrite_if_exists: bool = False,
) -> ImportResult:
    """
    Importa auditorías masivamente desde un archivo Excel.

    Espeja el pipeline completo de la función procesar() del notebook:
        leer Excel → normalizar columnas → detectar grupos →
        procesar fila por fila → deduplicar → guardar en BD

    Args:
        file_bytes:         Contenido del archivo Excel como bytes
                            (lo que FastAPI entrega en UploadFile.read()).
        audit_type_id:      ID del tipo de auditoría.
        db:                 Sesión SQLAlchemy activa.
        overwrite_if_exists: Si True, actualiza registros existentes.

    Returns:
        ImportResult con el resumen de la operación.
    """
    import_result = ImportResult()

    # ── 1. Leer Excel ─────────────────────────────────────────────────────────
    try:
        df_raw = pd.read_excel(io.BytesIO(file_bytes), sheet_name=0)
    except Exception as e:
        import_result.errores.append({
            "fila": "N/A",
            "error": f"No se pudo leer el archivo Excel: {e}"
        })
        return import_result

    logger.info(f"Excel leído: {len(df_raw)} filas, {len(df_raw.columns)} columnas")

    # ── 2. Normalizar columnas de metadatos ───────────────────────────────────
    df_raw = _normalizar_columnas_excel(df_raw)

    # ── 3. Detectar grupos automáticamente ───────────────────────────────────
    try:
        grupos = detectar_grupos_desde_df(df_raw)
    except ValueError as e:
        import_result.errores.append({"fila": "N/A", "error": str(e)})
        return import_result

    # ── 4. Obtener IDs ya guardados para deduplicación ────────────────────────
    ids_existentes: set[str] = set()
    existing_ids_query = db.query(Audit.source_form_id).filter(
        Audit.audit_type_id == audit_type_id,
        Audit.source_form_id.isnot(None),
    ).all()
    ids_existentes = {row[0] for row in existing_ids_query}

    # ── 5. Procesar fila por fila ─────────────────────────────────────────────
    import_result.total_filas = len(df_raw)

    for idx, row in df_raw.iterrows():
        row_dict = row.to_dict()

        # Deduplicación por source_form_id (espeja ids_existentes del notebook)
        form_id = str(row_dict.get("Id", idx))
        if form_id in ids_existentes and not overwrite_if_exists:
            import_result.omitidas += 1
            logger.debug(f"Fila {idx}: omitida (Id={form_id} ya existe)")
            continue

        try:
            resultado = calcular_puntajes_desde_dict(
                respuestas=row_dict,
                grupos=grupos,
                metadatos={"Id": form_id},
            )

            if not resultado.es_valido:
                import_result.errores.append({
                    "fila": int(idx),
                    "form_id": form_id,
                    "error": "; ".join(resultado.errores_procesamiento),
                })
                continue

            audit = crear_audit_desde_calculo(
                resultado=resultado,
                audit_type_id=audit_type_id,
                db=db,
                import_source="excel_import",
                overwrite_if_exists=overwrite_if_exists,
            )
            import_result.audits_creados.append(audit.id)

            if form_id in ids_existentes:
                import_result.actualizadas += 1
            else:
                import_result.nuevas += 1
                ids_existentes.add(form_id)

        except ValueError as e:
            # Error esperado (ej: duplicado sin overwrite)
            import_result.omitidas += 1
            logger.debug(f"Fila {idx}: omitida — {e}")
        except Exception as e:
            import_result.errores.append({
                "fila": int(idx),
                "form_id": form_id,
                "error": str(e),
            })
            logger.error(f"Error procesando fila {idx}: {e}", exc_info=True)

    # ── 6. Commit final ───────────────────────────────────────────────────────
    try:
        db.commit()
    except Exception as e:
        db.rollback()
        import_result.errores.append({"fila": "commit", "error": str(e)})
        logger.error(f"Error en commit: {e}", exc_info=True)
        return import_result

    logger.info(
        f"Importación completada: "
        f"{import_result.nuevas} nuevas | "
        f"{import_result.actualizadas} actualizadas | "
        f"{import_result.omitidas} omitidas | "
        f"{len(import_result.errores)} errores"
    )
    return import_result


# ─────────────────────────────────────────────────────────────────────────────
# HELPERS DE CONSULTA (para dashboards — sin cálculo, solo lectura de BD)
# ─────────────────────────────────────────────────────────────────────────────

def get_audit_resumen(audit_id: int, db: Session) -> Optional[dict]:
    """
    Retorna el resumen completo de una auditoría desde la BD.
    Útil para el endpoint GET /audits/{id}.
    """
    audit = db.query(Audit).filter(Audit.id == audit_id).first()
    if not audit:
        return None

    questions = db.query(AuditQuestion).filter(
        AuditQuestion.audit_id == audit_id
    ).order_by(AuditQuestion.s_index, AuditQuestion.question_order).all()

    # Agrupar preguntas por S
    grupos_resultado: dict[str, list] = {}
    for q in questions:
        grupos_resultado.setdefault(q.s_name, []).append({
            "id":             q.id,
            "texto":          q.question_text,
            "peso":           float(q.weight),
            "respuesta_pct":  float(q.response_percent),
            "puntos":         float(q.points_earned),
            "puntos_perdidos": float(q.points_lost),
            "es_critica":     q.is_critical,
            "observacion":    q.observation,
        })

    return {
        "id":               audit.id,
        "audit_type":       audit.audit_type.name if audit.audit_type else None,
        "fecha":            str(audit.audit_date),
        "trimestre":        audit.quarter,
        "año":              audit.year,
        "sucursal":         audit.branch,
        "auditor":          audit.auditor_name,
        "email":            audit.auditor_email,
        "porcentaje":       float(audit.percentage or 0),
        "estado":           audit.status,
        "puntaje_total":    float(audit.total_score or 0),
        "puntaje_maximo":   float(audit.max_score or 0),
        "puntajes_por_s": {
            "Seiri (Clasificar)":      float(audit.seiri_percentage or 0),
            "Seiton (Ordenar)":        float(audit.seiton_percentage or 0),
            "Seiso (Limpiar)":         float(audit.seiso_percentage or 0),
            "Seiketsu (Estandarizar)": float(audit.seiketsu_percentage or 0),
            "Shitsuke (Disciplina)":   float(audit.shitsuke_percentage or 0),
        },
        "preguntas_por_s":   grupos_resultado,
        "preguntas_criticas": [
            {
                "s":              q.s_name,
                "texto":          q.question_text,
                "respuesta_pct":  float(q.response_percent),
                "puntos_perdidos": float(q.points_lost),
            }
            for q in questions if q.is_critical
        ],
    }