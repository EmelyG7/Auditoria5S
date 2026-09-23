"""
seed_servicio_wow.py — Catálogo inicial del módulo Servicio WOW 2026.

Idempotente (crea solo lo que falta), igual que seed.py. Siembra:
    - El ciclo "Servicio WOW 2026"
    - Los 6 criterios de la rúbrica interna
    - La SamplingConfig del ciclo con los valores fijos de asignar_evaluadores_wow.py
    - Los departamentos y los 77 formularios de Microsoft Forms (41 internos + 36 externos),
      derivados de los .txt de txt_output/ENCUESTAS DE SATISFACCION

Los formularios se crean SIN preguntas: las preguntas salen de los encabezados
del primer Excel de respuestas que se importe (texto exacto de Forms).

`list_name` de cada formulario interno es el nombre de su lista en la hoja
'Evaluadores' (misma regla que lista_de_formulario() del script).
"""

import logging

from sqlalchemy.orm import Session

from app.models.evaluator_models import SamplingConfig
from app.models.survey_wow_models import (
    SurveyCriteria, SurveyCycle, SurveyDepartment, SurveyForm, SurveyType,
)

logger = logging.getLogger(__name__)

CYCLE_NAME = "Servicio WOW 2026"
CYCLE_YEAR = 2026

CRITERIA_SEED = [
    # (code, order, label) — mismo orden que las 6 afirmaciones Likert de cada formulario interno
    ("oportunidad",          1, "Oportunidad"),
    ("claridad",             2, "Claridad"),
    ("confiabilidad",        3, "Confiabilidad"),
    ("empatia",              4, "Empatía"),
    ("valor_agregado",       5, "Valor agregado"),
    ("satisfaccion_general", 6, "Satisfacción general"),
]

# Constantes de asignar_evaluadores_wow.py. Las listas con NOMBRES PROPIOS
# (personas_excluidas, permitir_repetir) no van en el código: se cargan como datos
# desde Evaluadores → Configuración. evitar_repeticion solo contiene nombres de listas.
SAMPLING_SEED = {
    "seed": 2026,
    "titular_cap": 2,
    "suplentes_por_departamento": 2,
    "antiguedad_minima_dias": 60,
    "carga_alerta": 4,
    "areas_excluidas": ["Dirección General", "Mejora Continua"],
    "personas_excluidas": [],
    # lista evaluada → listas cuyos integrantes no pueden repetir en ella
    "evitar_repeticion": {
        "FINANZAS": ["GESTIÓN HUMANA", "COMPRAS"],
        "COMPRAS": ["GESTIÓN HUMANA", "FINANZAS"],
    },
    "permitir_repetir": [],
    "puestos_sin_interaccion_regex": r"conserje|chofer|ayudante de chofer|mantenimiento|jardiner|mensajero",
}

# (nombre, sección de consolidación de la hoja 'Resultados Generales').
# Todos los departamentos cuentan además en el Total Empresa. GRUPO_SOLO_TOTAL =
# sin sección propia (solo cuentan en el total). Caja y Proyectos tienen sección
# propia desglosada por sucursal / región (confirmado por Mejora Continua, 23/09/2026).
GRUPO_SOLO_TOTAL = "Total Empresa"

DEPARTMENTS_SEED = [
    ("Gestión Humana",                  "Gestión Administrativa / Soporte"),
    ("Compras",                         "Gestión Administrativa / Soporte"),
    ("Finanzas",                        "Gestión Administrativa / Soporte"),
    ("TI",                              "Gestión Administrativa / Soporte"),
    ("Mercadeo",                        "Gestión Administrativa / Soporte"),
    ("Cuentas por Cobrar",              "Gestión Administrativa / Soporte"),
    ("Caja",                            "Caja"),
    ("Inventario",                      GRUPO_SOLO_TOTAL),
    ("Call Center",                     GRUPO_SOLO_TOTAL),
    ("Proyectos",                       "Proyectos"),
    ("Almacén",                         "Almacenes"),
    ("Fuerza de Ventas Tienda",         "Fuerza de Ventas"),
    ("Fuerza de Ventas SMB",            "Fuerza de Ventas"),
    ("Centro de Servicio",              "Centro de Servicio"),
    ("RMA",                             "RMA"),
    ("Corporativo Marcas (DELL)",       "Corporativo"),
    ("Corporativo Software & Services", "Corporativo"),
    ("Corporativo Privado",             "Corporativo"),
    ("Corporativo Gobierno",            "Corporativo"),
]

_INT = "Encuesta de satisfacción — "
_EXT = "Encuesta de Satisfacción — "

# ── Internos: (departamento, sucursal, list_name, título del formulario) ──────
INTERNAL_FORMS_SEED = [
    ("Gestión Humana",     None, "GESTIÓN HUMANA",     _INT + "Gestión Humana"),
    ("Compras",            None, "COMPRAS",            _INT + "Compras"),
    ("Finanzas",           None, "FINANZAS",           _INT + "Finanzas"),
    ("TI",                 None, "TI",                 _INT + "TI"),
    ("Mercadeo",           None, "MERCADEO",           _INT + "Mercadeo"),
    ("Inventario",         None, "INVENTARIO",         _INT + "Inventario"),
    ("Call Center",        None, "CALL CENTER",        _INT + "Call Center"),
    ("Cuentas por Cobrar", None, "CUENTAS POR COBRAR", _INT + "Cuentas por Cobrar (CXC)"),
    ("Corporativo Marcas (DELL)",       None,            "MARCA DELL",                         _INT + "Corporativo Marcas"),
    ("Corporativo Software & Services", None,            "SOFTWARE AND SERVICES",              _INT + "Corporativo Software & Services"),
    ("Corporativo Privado",             "Santiago",      "CORPORATIVO PRIVADO SANTIAGO",       _INT + "Corporativo Privado (Santiago)"),
    ("Corporativo Privado",             "Santo Domingo", "CORPORATIVO PRIVADO SANTO DOMINGO",  _INT + "Corporativo Privado (Santo Domingo)"),
    ("Corporativo Gobierno",            "Santo Domingo", "CORPORATIVO GOBIERNO SANTO DOMINGO", _INT + "Corporativo Gobierno"),
]
for _b in ["El Portal", "Finca", "Gurabo", "Oficina Principal", "Rómulo", "Tiradentes"]:
    INTERNAL_FORMS_SEED.append(("Almacén", _b, f"ALMACENES – {_b}", f"{_INT}Almacén ({_b})"))
for _b in ["El Portal", "Gurabo", "Oficina Principal", "Rómulo", "Tiradentes"]:
    # En el listado de personal la sucursal se llama "Portal", no "El Portal"
    _lista = "CAJA – Portal" if _b == "El Portal" else f"CAJA – {_b}"
    INTERNAL_FORMS_SEED.append(("Caja", _b, _lista, f"{_INT}Caja ({_b})"))
    INTERNAL_FORMS_SEED.append(("Fuerza de Ventas SMB", _b, f"EJECUTIVOS SMB – {_b}", f"{_INT}Fuerza de Ventas SMB ({_b})"))
for _b in ["El Portal", "Gurabo", "Rómulo", "Tiradentes"]:
    INTERNAL_FORMS_SEED.append(("Fuerza de Ventas Tienda", _b, f"VENTAS TIENDA – {_b}", f"{_INT}Fuerza de Ventas Tienda ({_b})"))
for _b in ["Oficina Principal", "Rómulo", "Tiradentes"]:
    INTERNAL_FORMS_SEED.append(("Centro de Servicio", _b, f"CENTRO DE SERVICIO – {_b}", f"{_INT}Centro de Servicio ({_b})"))
    INTERNAL_FORMS_SEED.append(("RMA", _b, f"RMA – {_b}", f"{_INT}RMA ({_b})"))
for _b in ["Santiago", "Santo Domingo"]:
    INTERNAL_FORMS_SEED.append(("Proyectos", _b, f"PROYECTOS – {_b}", f"{_INT}Proyectos ({_b})"))

# ── Externos: (departamento, sucursal, subproceso, título) ────────────────────
EXTERNAL_FORMS_SEED = [
    ("Call Center",                     None,            None, _EXT + "Call Center (Cliente Externo)"),
    ("Cuentas por Cobrar",              None,            None, _EXT + "Cuentas por Cobrar (CXC) (Cliente Externo)"),
    ("Corporativo Marcas (DELL)",       None,            None, _EXT + "Marcas DELL (Cliente Externo)"),
    ("Corporativo Software & Services", None,            None, _EXT + "Software & Services (Cliente Externo)"),
    ("Corporativo Privado",             "Santiago",      None, _EXT + "Corporativo Privado Santiago (Cliente Externo)"),
    ("Corporativo Privado",             "Santo Domingo", None, _EXT + "Corporativo Privado Santo Domingo (Cliente Externo)"),
    ("Corporativo Gobierno",            "Santo Domingo", None, _EXT + "Corporativo Gobierno Santo Domingo (Cliente Externo)"),
]
for _sub in ["Despacho", "Ruta"]:
    for _b in ["El Portal", "Finca", "Gurabo", "Oficina Principal", "Rómulo", "Tiradentes"]:
        EXTERNAL_FORMS_SEED.append(("Almacén", _b, _sub, f"{_EXT}Almacén {_sub} {_b} (Cliente Externo)"))
for _b in ["El Portal", "Gurabo", "Oficina Principal", "Rómulo", "Tiradentes"]:
    EXTERNAL_FORMS_SEED.append(("Fuerza de Ventas SMB", _b, None, f"{_EXT}Fuerza de Ventas SMB {_b} (Cliente Externo)"))
for _b in ["El Portal", "Gurabo", "Rómulo", "Tiradentes"]:
    EXTERNAL_FORMS_SEED.append(("Fuerza de Ventas Tienda", _b, None, f"{_EXT}Fuerza de Ventas Tienda {_b} (Cliente Externo)"))
for _b in ["Oficina Principal", "Rómulo", "Tiradentes"]:
    EXTERNAL_FORMS_SEED.append(("Centro de Servicio", _b, None, f"{_EXT}Centro de Servicios {_b} (Cliente Externo)"))
    EXTERNAL_FORMS_SEED.append(("RMA", _b, None, f"{_EXT}RMA {_b} (Cliente Externo)"))
for _b in ["Santiago", "Santo Domingo"]:
    EXTERNAL_FORMS_SEED.append(("Proyectos", _b, None, f"{_EXT}Proyectos {_b} (Cliente Externo)"))


def get_or_create_cycle(db: Session) -> SurveyCycle:
    cycle = db.query(SurveyCycle).filter(SurveyCycle.name == CYCLE_NAME).first()
    if not cycle:
        cycle = SurveyCycle(name=CYCLE_NAME, year=CYCLE_YEAR, is_active=True)
        db.add(cycle)
        db.flush()
    return cycle


def seed_servicio_wow(db: Session) -> None:
    """Crea ciclo, criterios, config de muestreo, departamentos y formularios faltantes."""
    cycle = get_or_create_cycle(db)
    creados = {"criterios": 0, "departamentos": 0, "formularios": 0, "config": 0}

    existing_codes = {c for (c,) in db.query(SurveyCriteria.code).all()}
    for code, order, label in CRITERIA_SEED:
        if code not in existing_codes:
            db.add(SurveyCriteria(code=code, order=order, label=label))
            creados["criterios"] += 1

    if not db.query(SamplingConfig).filter(SamplingConfig.cycle_id == cycle.id).first():
        db.add(SamplingConfig(cycle_id=cycle.id, **SAMPLING_SEED))
        creados["config"] = 1

    depts = {d.name: d for d in db.query(SurveyDepartment).all()}
    for name, group in DEPARTMENTS_SEED:
        if name not in depts:
            d = SurveyDepartment(name=name, group_name=group, is_active=True)
            db.add(d)
            depts[name] = d
            creados["departamentos"] += 1
    db.flush()

    existing_forms = {
        (f.department_id, f.survey_type, f.branch, f.subprocess)
        for f in db.query(SurveyForm).filter(SurveyForm.cycle_id == cycle.id).all()
    }

    def _add_form(dept_name, survey_type, branch, subprocess, title, list_name=None):
        dept = depts[dept_name]
        key = (dept.id, survey_type, branch, subprocess)
        if key in existing_forms:
            return
        db.add(SurveyForm(
            cycle_id=cycle.id,
            department_id=dept.id,
            survey_type=survey_type,
            branch=branch,
            subprocess=subprocess,
            title=title,
            list_name=list_name,
            source_filename=f"{title}.txt",
        ))
        existing_forms.add(key)
        creados["formularios"] += 1

    for dept_name, branch, list_name, title in INTERNAL_FORMS_SEED:
        _add_form(dept_name, SurveyType.INTERNO.value, branch, None, title, list_name)
    for dept_name, branch, subprocess, title in EXTERNAL_FORMS_SEED:
        _add_form(dept_name, SurveyType.EXTERNO.value, branch, subprocess, title)

    db.commit()
    if any(creados.values()):
        logger.info(f"✅ Servicio WOW sembrado: {creados}")
    else:
        logger.info("Catálogo Servicio WOW ya existe. Nada que sembrar.")
