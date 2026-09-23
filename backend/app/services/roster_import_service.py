"""
roster_import_service.py — Importación del listado de personal (LISTADO_DE_PERSONAL_2026.xlsx)
y de los nominados de los formularios (.txt de Microsoft Forms) para el sorteo.

Listado de personal
    Columnas por posición, igual que el script: Nombre | Primera fecha del contrato |
    Puesto de trabajo | Departamento (ruta "A / B / C") | Ubicación de trabajo.
    Upsert de Employee por nombre normalizado. `roster_order` = fila del listado
    (el sorteo recorre al personal en este orden). Quien ya no aparece en el
    listado queda con roster_order = NULL y deja de participar en el sorteo
    (sus asignaciones existentes no se tocan).

Nominados
    Los .txt de txt_output/…/Formularios Cliente Interno. Se asocian al
    formulario interno cuyo título coincide con el nombre del archivo.
"""

import io
import logging
import re
import unicodedata
from dataclasses import dataclass, field

import pandas as pd
from sqlalchemy.orm import Session

from app.models.evaluator_models import Employee, EvaluatorArea
from app.models.survey_wow_models import SurveyForm, SurveyType
from app.services.sampling_service import clasificar_personal, leer_nominados_txt

logger = logging.getLogger(__name__)

COLUMNAS_LISTADO = ["Nombre", "Ingreso", "Puesto", "RutaDepto", "Ubicacion"]


@dataclass
class RosterImportResult:
    total:                  int = 0
    creados:                int = 0
    actualizados:           int = 0
    fuera_del_listado:      int = 0
    advertencias:           list[str] = field(default_factory=list)


def importar_listado_personal(file_bytes: bytes, db: Session, puestos_sin_interaccion: str = "") -> RosterImportResult:
    result = RosterImportResult()
    try:
        df = pd.read_excel(io.BytesIO(file_bytes))
    except Exception as e:
        raise ValueError(f"No se pudo leer el Excel: {e}")
    if df.shape[1] < 5:
        raise ValueError(
            "El listado debe tener 5 columnas: Nombre, Primera fecha del contrato, "
            f"Puesto de trabajo, Departamento y Ubicación de trabajo. Tiene {df.shape[1]}."
        )
    df = df.iloc[:, :5]
    df.columns = COLUMNAS_LISTADO
    df = df[df["Nombre"].notna() & df["Nombre"].astype(str).str.strip().ne("")].reset_index(drop=True)
    df["Nombre"] = df["Nombre"].astype(str)
    df["Ingreso"] = pd.to_datetime(df["Ingreso"], errors="coerce")
    clasif = clasificar_personal(df, puestos_sin_interaccion)
    result.total = len(clasif)

    dup = clasif["Key"][clasif["Key"].duplicated()].tolist()
    if dup:
        raise ValueError(f"El listado tiene nombres repetidos (tras normalizar): {sorted(set(dup))}")

    empleados = {e.name_key: e for e in db.query(Employee).all()}
    areas = {a.name: a for a in db.query(EvaluatorArea).all()}
    en_listado = set()

    for orden, r in clasif.iterrows():
        key = r["Key"]
        emp = empleados.get(key)
        if emp is None:
            emp = Employee(name_key=key, full_name=r["Nombre"].title())
            db.add(emp)
            empleados[key] = emp
            result.creados += 1
        else:
            result.actualizados += 1
        area = areas.get(r["Area"])
        if area is None:
            area = areas[r["Area"]] = EvaluatorArea(name=r["Area"])
            db.add(area)
        emp.full_name = r["Nombre"].title()
        emp.roster_order = int(orden)
        emp.hire_date = r["Ingreso"].date() if pd.notna(r["Ingreso"]) else None
        emp.position = r["Puesto"] or None
        emp.dept_path = r["RutaDepto"] if isinstance(r["RutaDepto"], str) else None
        emp.sub_department = r["SubDepto"] or None
        emp.location = r["Ubicacion"] if isinstance(r["Ubicacion"], str) and r["Ubicacion"] != "Sin ubicación" else None
        emp.area = area
        emp.is_active = True
        en_listado.add(key)
        if pd.isna(r["Ingreso"]):
            result.advertencias.append(f"Fila {orden + 2}: sin fecha de ingreso → no es elegible para el sorteo")

    for key, emp in empleados.items():
        if key not in en_listado and emp.roster_order is not None:
            emp.roster_order = None
            emp.is_active = False
            result.fuera_del_listado += 1

    db.commit()
    logger.info(f"Listado de personal: {result.total} filas, {result.creados} nuevos, "
                f"{result.fuera_del_listado} fuera del listado")
    return result


# ─────────────────────────────────────────────────────────────────────────────
# NOMINADOS (.txt)
# ─────────────────────────────────────────────────────────────────────────────

def _titulo_normalizado(txt: str) -> str:
    txt = unicodedata.normalize("NFC", txt).replace("\xa0", " ")
    txt = re.sub(r"\.txt$", "", txt, flags=re.I)
    return re.sub(r"\s+", " ", txt).strip().lower()


@dataclass
class NomineesImportResult:
    formularios_actualizados: int = 0
    sin_formulario:           list[str] = field(default_factory=list)
    sin_nominados:            list[str] = field(default_factory=list)
    detalle:                  list[dict] = field(default_factory=list)


def importar_nominados(archivos: list[tuple[str, bytes]], db: Session, cycle_id: int) -> NomineesImportResult:
    """archivos = [(nombre_de_archivo, contenido)]. Solo aplica a formularios internos."""
    result = NomineesImportResult()
    forms = {
        _titulo_normalizado(f.title): f
        for f in db.query(SurveyForm).filter(
            SurveyForm.cycle_id == cycle_id, SurveyForm.survey_type == SurveyType.INTERNO.value,
        )
    }
    for nombre, contenido in archivos:
        base = nombre.replace("\\", "/").split("/")[-1]
        form = forms.get(_titulo_normalizado(base))
        if form is None:
            result.sin_formulario.append(base)
            continue
        texto = contenido.decode("utf-8", errors="ignore")
        nominados = leer_nominados_txt(texto)
        if not nominados:
            result.sin_nominados.append(base)
        form.nominees = nominados
        result.formularios_actualizados += 1
        result.detalle.append({"formulario": form.title, "lista": form.list_name, "nominados": len(nominados)})
    db.commit()
    return result

