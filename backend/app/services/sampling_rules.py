"""
sampling_rules.py — Reglas de negocio del sorteo de evaluadores (Servicio WOW 2026).

Traducción declarativa de las secciones 2 y 4 de asignar_evaluadores_wow.py
(versión del 23/09/2026). Aquí NO hay nombres propios: las personas excluidas y
las excepciones viven en SamplingConfig (se editan desde la app).

Todo es data (dicts/listas serializables a JSON) para poder moverlo a la BD más
adelante sin tocar el motor (sampling_service.py).

⚠️ El ORDEN de EVALUACIONES importa: define el orden de procesamiento y, con la
semilla fija, qué persona sale sorteada. Es el mismo orden del script.

Filtro de un estrato (todas las condiciones se combinan con AND):
    area          str | list[str]   Área clasificada (ver SUBDEPTO_A_AREA)
    puesto        regex             el puesto contiene (sin distinguir mayúsculas)
    no_puesto     regex             el puesto NO contiene
    subdepto      list[str]         último tramo de la ruta de departamento
    subdepto_contiene  str          el sub-departamento contiene el texto
    region        str               Santiago / Santo Domingo (según ubicación)
    ubicacion     str               ubicación exacta del listado
    gobierno      bool              pertenece (o no) al equipo de Gobierno
"""

# ─────────────────────────────────────────────────────────────────────────────
# CLASIFICACIÓN DEL PERSONAL
# ─────────────────────────────────────────────────────────────────────────────

UBIC_REGION = {
    "Oficina Principal": "Santiago", "Portal": "Santiago", "Gurabo": "Santiago",
    "Finca": "Santiago", "Rómulo": "Santo Domingo", "Tiradentes": "Santo Domingo",
}

SUBDEPTO_A_AREA = {
    "Departamento Almacen": "Almacenes", "Departamento de Almacen OP": "Almacenes",
    "Departamento de Almacen Tiradentes": "Almacenes", "Departamento de Almacén Finca": "Almacenes",
    "Departamento de Almacén Rómulo": "Almacenes",
    "Departamento Corporativo": "Corporativo", "Dirección Corporativa": "Corporativo",
    "Departamento de Marcas": "Corporativo", "Departamento Consultoría": "Corporativo",
    "Departamento de Software & Services": "Corporativo", "Departamento Dell Tech Direct": "Corporativo",
    "Departamento Implementación": "Corporativo",
    "Departamento de Ventas OP": "Fuerza de Ventas", "Departamento de Ventas (Tienda Portal)": "Fuerza de Ventas",
    "Departamento de Ventas (Tienda Gurabo)": "Fuerza de Ventas",
    "Departamento de Ventas (Tienda Rómulo)": "Fuerza de Ventas",
    "Departamento de Ventas (Tienda Tiradentes)": "Fuerza de Ventas",
    "Departamento de Centro de Servicios ST": "Servicio Técnico",
    "Departamento de Centro de Servicios Rómulo": "Servicio Técnico",
    "Departamento de Centro de Servicios Tiradentes": "Servicio Técnico",
    "Departamento de RMA ST": "Servicio Técnico", "Departamento de RMA Romulo": "Servicio Técnico",
    "Departamento de RMA Tiradente": "Servicio Técnico",
    "Departamento de Diseño e Instalación ST": "Proyectos", "Departamento de Diseño e Instalación SD": "Proyectos",
    "Departamento de Proyectos nacionales": "Proyectos",
    "Finanzas": "Finanzas", "Departamento de Créditos y Cobros": "CXC", "Departamento de Archivos": "CXC",
    "Departamento de Compras": "Compras", "Departamento de Call Center": "Call Center",
    "Departamento de Gestión Humana": "Gestión Humana", "Departamento de Inventario": "Inventario",
    "Departamento de Mercadeo": "Mercadeo",
    "Departamento de Tecnologia de la Informacion (TI)": "TI", "Desarrollo": "TI",
    "Infraestructura de TI": "TI", "Proyectos e innovación": "TI",
    "Dirección Administrativa": "Administración", "Gerencia Operativa ST": "Administración",
    "Gerencia Operativa SD": "Administración",
    "Presidencia": "Dirección General", "Vice Presidencia": "Dirección General",
    "Mejoras Continuas & Auditorias": "Mejora Continua",
}

# Dentro de las tiendas conviven ventas, almacén y caja: se reclasifica por puesto
RE_ALMACEN = r"almac|verificador|chofer|recepci[oó]n de equipos|recepción de equipos"
RE_CAJA = r"cajer|caja"

# Formulario de Corporativo Gobierno: sus nominados forman el "equipo de Gobierno"
LISTA_GOBIERNO = "CORPORATIVO GOBIERNO SANTO DOMINGO"
RX_GOB = r"gubernamental|licitaciones"

# ─────────────────────────────────────────────────────────────────────────────
# PUESTOS
# ─────────────────────────────────────────────────────────────────────────────

RX_GERENTE_NEG = r"gerente de negocios"
RX_SMB = r"consultor de negocios smb|smb account"
RX_CORP_GOB = (r"consultor de negocios$|consultora senior de negocios|cuentas corporativas|cuentas gubernamentales"
               r"|procesos gubernamentales|gestora comercial|licitaciones|coordinadora corporativa|gerente corporativo")
RX_CORP_PRIV = (r"consultor de negocios$|consultora senior de negocios|cuentas corporativas|coordinadora corporativa"
                r"|gerente corporativo|asistente corporativo")

# Líderes (gerentes, encargados, coordinadores…): se sugieren al ampliar una muestra ya enviada
RX_LIDER = r"gerente|director|encargad|coordinador|supervisor|l[ií]der|jefe"

# Prioridad de líderes en el SORTEO (script 25/09/2026, `RX_LIDER` del script): el reparto
# de cupos pesa PESO_LIDER por cada líder del área y, dentro del área, un líder va antes
# que la carga. Es otro regex que el de arriba (incluye analistas y ejecutivos de ventas):
# se mantiene idéntico al del script para que el sorteo dé las mismas listas.
RX_LIDER_SORTEO = r"gerente|encargad|supervisor|coordinador|jefe|director|analista|ejecutivo de ventas"
PESO_LIDER = 3.0

SUC_REGION = {"Oficina Principal": "Santiago", "El Portal": "Santiago", "Gurabo": "Santiago",
              "Finca": "Santiago", "Rómulo": "Santo Domingo", "Tiradentes": "Santo Domingo"}
SUC_UBIC = {"El Portal": "Portal"}  # nombre en formulario → nombre en listado

ADMIN = ["Administración", "Compras", "Finanzas", "CXC", "Inventario", "Mercadeo"]

POOLS_SOPORTE_VENTAS = [  # Ventas Tienda / Ejecutivos SMB
    ("Call Center", {"area": "Call Center"}), ("Cuentas por Cobrar", {"area": "CXC"}),
    ("Compras", {"area": "Compras"}), ("Inventario", {"area": "Inventario"}),
]
POOLS_MARCAS = [  # Marca DELL / Software & Services
    ("Venta Corporativo Privado", {"area": "Corporativo", "puesto": RX_CORP_PRIV}),
    ("Venta Pyme (SMB)", {"puesto": RX_SMB + "|" + RX_GERENTE_NEG}),
    ("Gobierno", {"area": "Corporativo", "puesto": RX_GOB}),
    ("Compras", {"area": "Compras"}),
]


def _pools_corp_cliente(region):  # Corporativos Privado/Gobierno
    return [("Compras", {"area": "Compras"}),
            (f"Almacén {region}", {"area": "Almacenes", "region": region}),
            (f"RMA {region}", {"subdepto_contiene": "RMA", "region": region}),
            ("Marcas", {"subdepto": ["Departamento de Marcas", "Departamento Consultoría"]}),
            ("Software & Services", {"subdepto": ["Departamento de Software & Services"]})]


# ─────────────────────────────────────────────────────────────────────────────
# EVALUACIONES (mismo orden que el script)
#   clave     lista(s) en ScheduleEntry: igual a la clave o "<clave> – <sucursal>"
#   n         muestra por defecto (se usa la "Muestra requerida" de la lista si está cargada)
#   excluir   áreas que no evalúan (el equipo evaluado)
#   excluir_filtro  personas del equipo evaluado definidas por filtro
#   pools     [(estrato, filtro)] | "TODOS" | "CAJA"
#   cuotas    cupos fijos por estrato (si no, reparto ∝ √tamaño)
# ─────────────────────────────────────────────────────────────────────────────

EVALUACIONES = [
    dict(clave="COMPRAS", n=12, excluir=["Compras"],
         cuotas={"Fuerza de Ventas": 3, "Corporativo Comercial": 3, "Corporativo Marcas": 2, "Finanzas": 2, "CXC": 2},
         pools=[
             ("Fuerza de Ventas", {"area": "Fuerza de Ventas"}),
             # Comercial = ventas corporativas privadas (Santiago y SD). Gobierno NO evalúa Compras.
             ("Corporativo Comercial", {"subdepto": ["Departamento Corporativo", "Dirección Corporativa"],
                                        "puesto": RX_CORP_GOB + "|asistente corporativo", "gobierno": False}),
             ("Corporativo Marcas", {"subdepto": ["Departamento de Marcas", "Departamento Consultoría"]}),
             ("Finanzas", {"area": "Finanzas", "no_puesto": r"mensajero"}),
             ("CXC", {"area": "CXC"}),
         ]),
    dict(clave="FINANZAS", n=12, excluir=["Finanzas", "Caja"], pools=[
        ("CXC", {"area": "CXC"}),
        ("Compras", {"area": "Compras"}),
        ("Gestión Humana", {"area": "Gestión Humana", "no_puesto": r"conserje"}),
        ("Mercadeo", {"area": "Mercadeo"}),
        ("Administración", {"area": "Administración"}),
    ]),
    dict(clave="CAJA", n=None, excluir=["Caja", "Finanzas"], pools="CAJA"),
    dict(clave="TI", n=35, excluir=["TI"], pools="TODOS"),
    dict(clave="MERCADEO", n=16, excluir=["Mercadeo"], pools=[
        ("Fuerza de Ventas Santiago", {"area": "Fuerza de Ventas", "region": "Santiago"}),
        ("Fuerza de Ventas Santo Domingo", {"area": "Fuerza de Ventas", "region": "Santo Domingo"}),
        ("Corporativo Santiago", {"area": "Corporativo", "region": "Santiago"}),
        ("Corporativo Santo Domingo", {"area": "Corporativo", "region": "Santo Domingo"}),
    ]),
    dict(clave="INVENTARIO", n=10, excluir=["Inventario"], pools=[
        ("Gerentes de Negocios SMB", {"puesto": RX_GERENTE_NEG}),
        ("Ejecutivos Corporativo y Gobierno", {"area": "Corporativo", "puesto": RX_CORP_GOB}),
        ("Ejecutivos de Negocios SMB", {"puesto": RX_SMB}),
    ]),
    dict(clave="CUENTAS POR COBRAR", n=10, excluir=["CXC"], pools=[
        ("Gerentes de Negocios SMB", {"puesto": RX_GERENTE_NEG}),
        ("Ejecutivos SMB", {"puesto": RX_SMB}),
        ("Corporativo y Gobierno", {"area": "Corporativo", "puesto": RX_CORP_GOB}),
    ]),
    dict(clave="GESTIÓN HUMANA", n=35, excluir=["Gestión Humana"], pools="TODOS"),
    dict(clave="CALL CENTER", n=16, excluir=["Call Center"], pools=[
        ("Recepción", {"puesto": r"recepcionista"}),
        ("Gestión Humana", {"area": "Gestión Humana"}),
        ("Fuerza de Ventas", {"area": "Fuerza de Ventas"}),
        ("Corporativo", {"area": "Corporativo"}),
        ("Departamentos Administrativos", {"area": ADMIN}),
    ]),
]
for _suc in ["Santiago", "Santo Domingo"]:
    EVALUACIONES.append(dict(
        clave=f"PROYECTOS – {_suc}", n=12, excluir=[],
        excluir_filtro={"area": "Proyectos", "region": _suc}, pools=[
            ("Gerentes de Negocios SMB", {"puesto": RX_GERENTE_NEG, "region": _suc}),
            ("Ejecutivos SMB", {"puesto": RX_SMB, "region": _suc}),
            ("Corporativo y Gobierno", {"area": "Corporativo", "puesto": RX_CORP_GOB, "region": _suc}),
        ]))
for _suc in ["Finca", "El Portal", "Gurabo", "Rómulo", "Tiradentes", "Oficina Principal"]:
    _r = SUC_REGION[_suc]
    EVALUACIONES.append(dict(
        clave=f"ALMACENES – {_suc}", n=10, excluir=[],
        excluir_filtro={"area": "Almacenes", "ubicacion": SUC_UBIC.get(_suc, _suc)}, pools=[
            (f"Corporativo {_r}", {"area": "Corporativo", "region": _r}),
            (f"Fuerza de Ventas {_r}", {"area": "Fuerza de Ventas", "region": _r}),
            ("Inventario", {"area": "Inventario"}),
        ]))
# Ventas Tienda – Oficina Principal no existe (no tiene formulario)
for _suc in ["El Portal", "Rómulo", "Gurabo", "Tiradentes"]:
    EVALUACIONES.append(dict(
        clave=f"VENTAS TIENDA – {_suc}", n=10, excluir=[],
        excluir_filtro={"area": "Fuerza de Ventas", "ubicacion": SUC_UBIC.get(_suc, _suc)},
        pools=POOLS_SOPORTE_VENTAS))
for _suc in ["El Portal", "Oficina Principal", "Rómulo", "Gurabo", "Tiradentes"]:
    EVALUACIONES.append(dict(
        clave=f"EJECUTIVOS SMB – {_suc}", n=10, excluir=[],
        excluir_filtro={"area": "Fuerza de Ventas", "ubicacion": SUC_UBIC.get(_suc, _suc)},
        pools=POOLS_SOPORTE_VENTAS))
for _suc in ["Rómulo", "Oficina Principal", "Tiradentes"]:
    _r = SUC_REGION[_suc]
    EVALUACIONES.append(dict(
        clave=f"CENTRO DE SERVICIO – {_suc}", n=10, excluir=[],
        excluir_filtro={"area": "Servicio Técnico", "ubicacion": _suc}, pools=[
            (f"Fuerza de Ventas {_r}", {"area": "Fuerza de Ventas", "region": _r}),
            (f"Proyectos {_r}", {"area": "Proyectos", "region": _r}),
            (f"Corporativo y Gobierno {_r}", {"area": "Corporativo", "puesto": RX_CORP_GOB, "region": _r}),
            ("Finanzas", {"area": "Finanzas"}),
        ]))
for _suc in ["Rómulo", "Oficina Principal", "Tiradentes"]:
    _r = SUC_REGION[_suc]
    EVALUACIONES.append(dict(
        clave=f"RMA – {_suc}", n=10, excluir=[],
        excluir_filtro={"area": "Servicio Técnico", "ubicacion": _suc}, pools=[
            (f"Fuerza de Ventas {_r}", {"area": "Fuerza de Ventas", "region": _r}),
            (f"Corporativo y Gobierno {_r}", {"area": "Corporativo", "puesto": RX_CORP_GOB, "region": _r}),
            ("Inventario", {"area": "Inventario"}),
        ]))
EVALUACIONES += [
    dict(clave="MARCA DELL", n=10, excluir=[],
         excluir_filtro={"subdepto": ["Departamento de Marcas", "Departamento Consultoría"]}, pools=POOLS_MARCAS),
    dict(clave="SOFTWARE AND SERVICES", n=10, excluir=[],
         excluir_filtro={"subdepto": ["Departamento de Software & Services"]}, pools=POOLS_MARCAS),
    dict(clave="CORPORATIVO PRIVADO SANTIAGO", n=10, excluir=[], pools=_pools_corp_cliente("Santiago")),
    dict(clave="CORPORATIVO GOBIERNO SANTO DOMINGO", n=10, excluir=[], pools=_pools_corp_cliente("Santo Domingo")),
    dict(clave="CORPORATIVO PRIVADO SANTO DOMINGO", n=10, excluir=[], pools=_pools_corp_cliente("Santo Domingo")),
]

# ─────────────────────────────────────────────────────────────────────────────
# CAJA — confirmado por Mejora Continua el 23/09/2026
# 5 evaluadores por entidad, todos de esa entidad: Gerente de Negocios + 2 Ejecutivos
# de ventas Tienda + 2 Consultores SMB. Si un estrato no existe en la entidad (Oficina
# Principal no tiene Tienda) sus cupos pasan a CAJA_RESPALDO. Suplente: 1 entre los que
# sobren de esos mismos puestos; si no sobra nadie, sin reserva.
# ─────────────────────────────────────────────────────────────────────────────

CAJA_SUCURSALES = {  # formulario → ubicación del listado
    "Caja (Oficina Principal)": "Oficina Principal", "Caja (El Portal)": "Portal",
    "Caja (Gurabo)": "Gurabo", "Caja (Rómulo)": "Rómulo", "Caja (Tiradentes)": "Tiradentes",
}
CAJA_GRUPOS = [   # (estrato, regex del puesto, cupos)
    ("Gerente de Negocios", RX_GERENTE_NEG, 1),
    ("Ejecutivos de ventas Tienda", r"ejecutivo de ventas tienda", 2),
    ("Ejecutivos SMB", RX_SMB, 2),
]
CAJA_RESPALDO = "Ejecutivos SMB"

# ─────────────────────────────────────────────────────────────────────────────
# ORDEN DE PROCESAMIENTO
# ─────────────────────────────────────────────────────────────────────────────

# Ronda 1 va primero y en el mismo orden → sus listas no cambian al agregar la ronda 2
ORDEN_RONDA1 = ["CAJA", "INVENTARIO", "CUENTAS POR COBRAR", "COMPRAS", "MERCADEO", "FINANZAS", "TI"]
_PRIO = ["VENTAS TIENDA", "EJECUTIVOS SMB", "SOFTWARE", "MARCA", "CORPORATIVO", "PROYECTOS",
         "RMA", "CENTRO", "ALMACENES", "CALL CENTER", "GESTIÓN HUMANA"]   # GH ("todos") al final
# Al re-sortear: primero las áreas evaluadoras más escasas, al final las de "todos" (TI)
_PRIO_RECALCULO = ["CAJA", "VENTAS TIENDA", "EJECUTIVOS SMB", "INVENTARIO", "CUENTAS POR COBRAR", "SOFTWARE",
                   "MARCA", "CORPORATIVO", "PROYECTOS", "RMA", "CENTRO", "ALMACENES", "MERCADEO",
                   "CALL CENTER", "COMPRAS", "FINANZAS", "TI", "GESTIÓN HUMANA"]

_r2 = [e["clave"] for e in EVALUACIONES if e["clave"] not in ORDEN_RONDA1]
ORDEN = ORDEN_RONDA1 + sorted(_r2, key=lambda c: next(i for i, p in enumerate(_PRIO) if c.startswith(p)))
ORDEN_RECALCULO = sorted(ORDEN, key=lambda c: next(i for i, p in enumerate(_PRIO_RECALCULO) if c.startswith(p)))

EVALUACION_POR_CLAVE = {e["clave"]: e for e in EVALUACIONES}


def lists_of(clave: str, list_names) -> list[str]:
    """Nombres de lista (ScheduleEntry.list_name) que pertenecen a una evaluación."""
    return [n for n in list_names if n == clave or n.startswith(clave + " – ")]


def clave_of(list_name: str) -> str | None:
    """Evaluación a la que pertenece una lista ('CAJA – Gurabo' → 'CAJA')."""
    if list_name in EVALUACION_POR_CLAVE:
        return list_name
    for clave in EVALUACION_POR_CLAVE:
        if list_name.startswith(clave + " – "):
            return clave
    return None
