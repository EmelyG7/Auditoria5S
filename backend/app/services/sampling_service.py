"""
sampling_service.py — Motor de sorteo de evaluadores del Servicio WOW 2026.

Port de asignar_evaluadores_wow.py (versión del 23/09/2026). La lógica es la
misma, línea por línea, para que con las mismas entradas y la misma semilla
produzca exactamente las mismas listas. Solo cambian las fuentes:

    Script                                   → App
    LISTADO_DE_PERSONAL_2026.xlsx            → Employee con roster_order (listado vigente)
    Cronograma (fecha, No., muestra)         → ScheduleEntry
    txt_output (nominados)                   → SurveyForm.nominees
    Servicio_WOW_2026_Evaluadores_previo     → EvaluationAssignment actuales
    ENCUESTAS_CERRADAS / ENVIADAS            → listas con is_closed (nunca se re-sortean)
    Constantes (semilla, topes, excluidos…)  → SamplingConfig del ciclo
    Definición de cada evaluación            → sampling_rules.py

Flujo: `preview()` calcula el sorteo sin escribir nada y devuelve un `token`;
`apply()` lo recalcula, verifica que el token coincida (nada cambió entre la
vista previa y la confirmación) y guarda. Nunca se tocan asignaciones
completadas ni listas cerradas.

Ampliar una lista ya enviada (`candidatos_adicionales` / `agregar_evaluadores`):
no re-sortea nada; sugiere personas elegibles con las mismas reglas (nominados,
excluidos, no repetición, antigüedad, puestos sin interacción), solo de las áreas
que evalúan ese departamento (los estratos de sampling_rules, `estratos_evaluadores`),
y agrega como titulares a quienes el administrador confirme, con su área evaluadora.
Sirve también para listas cerradas.
"""

import hashlib
import json
import logging
import math
import random
import re
import unicodedata
from collections import Counter, defaultdict
from dataclasses import dataclass, field
from datetime import date, timedelta
from difflib import SequenceMatcher
from typing import Optional

import pandas as pd
from sqlalchemy.orm import Session, joinedload

from app.models.evaluator_models import (
    AssignmentRole, AssignmentStatus, Employee, EvaluationAssignment,
    EvaluatorArea, SamplingConfig, ScheduleEntry,
)
from app.models.survey_wow_models import SurveyForm, SurveyType
from app.services import sampling_rules as R
from app.services.evaluator_import_service import name_matches

logger = logging.getLogger(__name__)


class SamplingError(ValueError):
    """Error de datos o de parámetros: el sorteo no se puede calcular."""


# ─────────────────────────────────────────────────────────────────────────────
# UTILIDADES (idénticas al script)
# ─────────────────────────────────────────────────────────────────────────────

def norm(txt) -> str:
    txt = unicodedata.normalize("NFKD", str(txt)).encode("ascii", "ignore").decode()
    return re.sub(r"\s+", " ", re.sub(r"[^A-Za-z ]", " ", txt)).strip().upper()


def emparejar(nominado: str, personal: pd.DataFrame) -> list[int]:
    """Índices del listado cuyo nombre contiene los tokens del nominado."""
    tok = [t for t in norm(nominado).split() if len(t) > 2]
    if not tok:
        return []
    hits = []
    for idx, key in personal["Key"].items():
        k = key.split()
        # tolera errores de tipeo del formulario (ej. 'Alenxandra', 'Gonzales', 'HanR')
        ok = [any(SequenceMatcher(None, t, x).ratio() >= 0.8 for x in k) for t in tok]
        if ok[0] and sum(ok) >= min(2, len(tok)):
            hits.append(idx)
    return hits


def leer_nominados_txt(texto: str) -> list[str]:
    """Opciones de 'Seleccione a su nominado' de un .txt exportado de Microsoft Forms."""
    m = re.search(r"Seleccione (?:a )?su nominado \*\n(.*?)\n9\n", texto.replace("\r\n", "\n"), re.S)
    return [x.strip() for x in m.group(1).splitlines() if x.strip()] if m else []


def clasificar_personal(df: pd.DataFrame, puestos_sin_interaccion: str) -> pd.DataFrame:
    """cargar_personal() del script, sobre columnas Nombre/Ingreso/Puesto/RutaDepto/Ubicacion."""
    df = df.copy()
    df["Nombre"] = df["Nombre"].str.strip().str.replace(r"\s+", " ", regex=True)
    df["Puesto"] = df["Puesto"].fillna("").astype(str).str.strip()
    df["SubDepto"] = df["RutaDepto"].fillna("").astype(str).str.split(" / ").str[-1].str.strip()
    df["Area"] = df["SubDepto"].map(R.SUBDEPTO_A_AREA).fillna("Otro")
    p = df["Puesto"].str.lower()
    tienda = df["Area"].eq("Fuerza de Ventas")
    df.loc[tienda & p.str.contains(R.RE_ALMACEN), "Area"] = "Almacenes"
    df.loc[tienda & p.str.contains(R.RE_CAJA), "Area"] = "Caja"
    df.loc[df["Area"].eq("Finanzas") & p.str.contains(R.RE_CAJA), "Area"] = "Caja"
    # Puestos cuya ruta de departamento no refleja su área real
    df.loc[p.str.contains("mejora continua"), "Area"] = "Mejora Continua"
    df.loc[p.str.contains("gerente de inventario"), "Area"] = "Inventario"
    df["Ubicacion"] = df["Ubicacion"].fillna("Sin ubicación")
    df["Region"] = df["Ubicacion"].map(R.UBIC_REGION).fillna("Sin ubicación")
    df["SinInteraccion"] = p.str.contains(puestos_sin_interaccion) if puestos_sin_interaccion else False
    df["Key"] = df["Nombre"].map(norm)
    return df


def mascara(personal: pd.DataFrame, filtro: dict) -> pd.Series:
    """Evalúa un filtro declarativo de sampling_rules sobre el listado (AND de condiciones)."""
    m = pd.Series(True, index=personal.index)
    for k, v in filtro.items():
        if k == "area":
            m &= personal["Area"].isin(v) if isinstance(v, list) else personal["Area"].eq(v)
        elif k == "puesto":
            m &= personal["Puesto"].str.contains(v, case=False, regex=True)
        elif k == "no_puesto":
            m &= ~personal["Puesto"].str.contains(v, case=False, regex=True)
        elif k == "subdepto":
            m &= personal["SubDepto"].isin(v)
        elif k == "subdepto_contiene":
            m &= personal["SubDepto"].str.contains(v)
        elif k == "region":
            m &= personal["Region"].eq(v)
        elif k == "ubicacion":
            m &= personal["Ubicacion"].eq(v)
        elif k == "gobierno":
            m &= personal["Gobierno"] if v else ~personal["Gobierno"]
        else:
            raise SamplingError(f"Condición de filtro desconocida: {k}")
    return m


def repartir(n: int, tamanos: dict, maximos: dict | None = None) -> dict[str, int]:
    """Asignación ∝ √tamaño, mínimo 1 por estrato, sin exceder el nº de personas del estrato."""
    maximos = maximos or tamanos
    act = {k: v for k, v in tamanos.items() if v > 0 and maximos.get(k, 0) > 0}
    cuota = {k: 0 for k in tamanos}
    if not act:
        return cuota
    for k in act:                                  # piso de 1
        if sum(cuota.values()) < n:
            cuota[k] = 1
    resto = n - sum(cuota.values())
    while resto > 0:
        pesos = {k: math.sqrt(v) for k, v in act.items() if cuota[k] < maximos[k]}
        if not pesos:
            break
        tot = sum(pesos.values())
        # a quien más lejos esté de su cuota ideal
        k = max(pesos, key=lambda k: (pesos[k] / tot) * n - cuota[k])
        cuota[k] += 1
        resto -= 1
    return cuota


class Selector:
    def __init__(self, personal, semilla, tope):
        self.p = personal
        self.tope = tope
        self.rng = random.Random(semilla)
        self.carga = Counter()         # titular
        self.carga_sup = Counter()     # suplente
        # El script genera un número por persona al iniciar; se conserva para que la
        # secuencia aleatoria (y por tanto el resultado) sea idéntica.
        self.ruido = {i: self.rng.random() for i in personal.index}

    def elegir(self, candidatos, k, usados_depto, suplente=False):
        elegidos = []
        cand = [i for i in candidatos if i not in usados_depto]
        for _ in range(k):
            libres = [i for i in cand if i not in elegidos]
            if not libres:
                break
            ubic_usadas = Counter(self.p.at[i, "Ubicacion"] for i in list(usados_depto) + elegidos)
            sub_usadas = Counter(self.p.at[i, "SubDepto"] for i in list(usados_depto) + elegidos)

            def score(i):
                carga = self.carga[i] + 0.5 * self.carga_sup[i]
                excede = 1 if self.carga[i] >= self.tope else 0
                no_lider = 0 if self.p.at[i, "Lider"] else 1
                return (excede, no_lider, carga, ubic_usadas[self.p.at[i, "Ubicacion"]],
                        sub_usadas[self.p.at[i, "SubDepto"]], self.rng.random())

            mejor = min(libres, key=score)
            elegidos.append(mejor)
        for i in elegidos:
            (self.carga_sup if suplente else self.carga)[i] += 1
        return elegidos


# ─────────────────────────────────────────────────────────────────────────────
# ENTRADAS DESDE LA BD
# ─────────────────────────────────────────────────────────────────────────────

@dataclass
class Entradas:
    cycle_id: int
    config: SamplingConfig
    personal: pd.DataFrame
    entries: list[ScheduleEntry]
    previo: pd.DataFrame
    nominados_por_clave: dict[str, dict[str, list[str]]]
    gob_nominados: list[str]
    claves_cerradas: set[str]
    claves_con_respuestas: set[str]


def cargar_entradas(db: Session, cycle_id: int) -> Entradas:
    config = db.query(SamplingConfig).filter(SamplingConfig.cycle_id == cycle_id).first()
    if not config:
        raise SamplingError("El ciclo no tiene configuración de muestreo.")

    emps = (
        db.query(Employee)
        .filter(Employee.roster_order.isnot(None))
        .order_by(Employee.roster_order)
        .all()
    )
    if not emps:
        raise SamplingError("No hay listado de personal importado. Impórtalo desde Evaluadores.")
    personal = pd.DataFrame({
        "employee_id": [e.id for e in emps],
        "Nombre":      [e.full_name for e in emps],
        "Ingreso":     pd.to_datetime([e.hire_date for e in emps]),
        "Puesto":      [e.position for e in emps],
        "RutaDepto":   [e.dept_path for e in emps],
        "Ubicacion":   [e.location for e in emps],
    })
    personal = clasificar_personal(personal, config.puestos_sin_interaccion_regex or "")

    entries = (
        db.query(ScheduleEntry)
        .options(joinedload(ScheduleEntry.assignments).joinedload(EvaluationAssignment.employee),
                 joinedload(ScheduleEntry.assignments).joinedload(EvaluationAssignment.evaluator_area))
        .filter(ScheduleEntry.cycle_id == cycle_id)
        .all()
    )
    if not entries:
        raise SamplingError("No hay cronograma cargado para este ciclo.")

    # "Versión previa" = asignaciones actuales, con las columnas y el orden del Excel del script
    filas = []
    for e in entries:
        for a in e.assignments:
            filas.append({
                "No.": e.schedule_number, "Departamento evaluado": e.list_name,
                "Envío": pd.Timestamp(e.send_date) if e.send_date else pd.NaT,
                "Área evaluadora (cronograma)": a.evaluator_area.name if a.evaluator_area else "",
                "Tipo": "Suplente" if a.role == AssignmentRole.SUPLENTE.value else "Titular",
                "Colaborador": a.employee.full_name,
                "Respondió": "Sí" if a.status == AssignmentStatus.COMPLETO.value else "Pendiente",
                "_employee_id": a.employee_id,
            })
    cols = ["No.", "Departamento evaluado", "Envío", "Área evaluadora (cronograma)", "Tipo",
            "Colaborador", "Respondió", "_employee_id"]
    previo = pd.DataFrame(filas, columns=cols)
    if len(previo):
        previo["_t"] = previo["Tipo"].eq("Suplente")
        previo = (previo.sort_values(["No.", "Departamento evaluado", "_t", "Área evaluadora (cronograma)", "Colaborador"])
                  .drop(columns=["_t"]).reset_index(drop=True))
    previo["_key"] = previo["Colaborador"].map(norm)

    list_names = [e.list_name for e in entries]
    forms = db.query(SurveyForm).filter(
        SurveyForm.cycle_id == cycle_id,
        SurveyForm.survey_type == SurveyType.INTERNO.value,
        SurveyForm.list_name.isnot(None),
    ).all()
    nominados_por_clave: dict[str, dict[str, list[str]]] = defaultdict(dict)
    gob_nominados: list[str] = []
    for f in forms:
        clave = R.clave_of(f.list_name)
        if clave:
            nombre_form = f.title.split("— ")[-1].strip()
            nominados_por_clave[clave][nombre_form] = list(f.nominees or [])
        if f.list_name == R.LISTA_GOBIERNO:
            gob_nominados = list(f.nominees or [])

    cerradas, con_resp = set(), set()
    for clave in R.EVALUACION_POR_CLAVE:
        mias = [e for e in entries if e.list_name in R.lists_of(clave, list_names)]
        if mias and all(e.is_closed for e in mias):
            cerradas.add(clave)
        if any(a.status == AssignmentStatus.COMPLETO.value for e in mias for a in e.assignments):
            con_resp.add(clave)

    return Entradas(cycle_id, config, personal, entries, previo, nominados_por_clave,
                    gob_nominados, cerradas, con_resp)


def marcar_gobierno(ent: "Entradas") -> None:
    """Columna `Gobierno` del listado: nominados del formulario de Gobierno + puestos de Gobierno."""
    gob_idx = set()
    for nom in ent.gob_nominados:
        gob_idx.update(emparejar(nom, ent.personal))
    ent.personal["Gobierno"] = (ent.personal.index.isin(gob_idx)
                                | ent.personal["Puesto"].str.contains(R.RX_GOB, case=False))


# ─────────────────────────────────────────────────────────────────────────────
# MOTOR (main() del script)
# ─────────────────────────────────────────────────────────────────────────────

@dataclass
class ResultadoSorteo:
    filas: list[dict]                       # listas completas resultantes (todas las evaluaciones)
    resumen: list[dict]
    alertas: list[str]
    recalculadas: list[str]                 # claves re-sorteadas
    ajustadas: list[str]                    # claves con reemplazo puntual (excluidos / no repetición)
    carga: dict[int, int] = field(default_factory=dict)   # nº de personas por nº de encuestas titulares


def sortear(ent: Entradas, recalcular: list[str]) -> ResultadoSorteo:
    cfg = ent.config
    personal = ent.personal
    desconocidas = [c for c in recalcular if c not in R.EVALUACION_POR_CLAVE]
    if desconocidas:
        raise SamplingError(f"Evaluaciones desconocidas: {desconocidas}")
    bloqueadas = [c for c in recalcular if c in ent.claves_cerradas or c in ent.claves_con_respuestas]
    if bloqueadas:
        raise SamplingError(
            f"No se pueden re-sortear listas cerradas o con respuestas completadas: {bloqueadas}"
        )
    RECALCULAR = [c for c in R.ORDEN if c in recalcular]

    areas_excluidas = set(cfg.areas_excluidas or [])
    excl_keys = {norm(n) for n in (cfg.personas_excluidas or [])}
    permitir = {norm(n) for n in (cfg.permitir_repetir or [])}
    evitar_cfg = cfg.evitar_repeticion or {}
    suplentes_por_depto = cfg.suplentes_por_departamento
    antiguedad = cfg.antiguedad_minima_dias

    alertas: list[str] = []
    marcar_gobierno(ent)
    personal["Lider"] = personal["Puesto"].str.contains(R.RX_LIDER_SORTEO, case=False, regex=True)
    evitar: dict[str, set] = {}
    excl_de = lambda c: excl_keys | evitar.get(c, set())
    for n in cfg.personas_excluidas or []:
        if norm(n) not in set(personal["Key"]):
            alertas.append(f"Persona excluida '{n}' no está en el listado de personal")

    list_names = [e.list_name for e in ent.entries]
    entry_by_list = {e.list_name: e for e in ent.entries}

    def entradas_de(clave):
        return [entry_by_list[n] for n in R.lists_of(clave, list_names)]

    def fecha_de(clave):
        es = [e for e in entradas_de(clave) if e.send_date]
        if not es:
            raise SamplingError(f"'{clave}' no tiene fecha de envío en el cronograma.")
        return pd.Timestamp(min(e.send_date for e in es))

    def numero_de(clave):
        nums = [e.schedule_number for e in entradas_de(clave) if e.schedule_number is not None]
        return int(min(nums)) if nums else 0

    def muestra_de(ev):
        es = entradas_de(ev["clave"])
        if len(es) == 1 and es[0].internal_sample_size:
            return int(es[0].internal_sample_size)
        return ev["n"]

    sel = Selector(personal, cfg.seed, cfg.titular_cap)
    filas, resumen = [], []

    def elegibles_base(ev, fecha_envio, excluidos_idx):
        d = personal
        m = ~d["Area"].isin(areas_excluidas | set(ev["excluir"]))
        m &= ~d.index.isin(excluidos_idx)
        m &= ~d["Key"].isin(excl_de(ev["clave"]))
        lim = fecha_envio - timedelta(days=antiguedad)
        m &= d["Ingreso"].notna() & (d["Ingreso"] <= lim)   # sin fecha = no verificable
        m &= ~d["SinInteraccion"]
        return m

    previo = ent.previo
    de_lista = lambda c: previo[(previo["Departamento evaluado"] == c)
                                | previo["Departamento evaluado"].str.startswith(c + " – ")]
    for c, otras in evitar_cfg.items():
        evitar[c] = set().union(*[set(de_lista(o)["_key"]) for o in otras]) - permitir if otras else set()
    AJUSTAR = [c for c in R.ORDEN if c not in RECALCULAR and c not in ent.claves_cerradas and c != "CAJA"
               and de_lista(c)["_key"].isin(excl_de(c)).any()]
    orden = ([c for c in R.ORDEN if c not in RECALCULAR + AJUSTAR] + AJUSTAR
             + [c for c in R.ORDEN_RECALCULO if c in RECALCULAR])

    for clave in orden:
        ev = R.EVALUACION_POR_CLAVE[clave]
        ajuste = None
        if clave in AJUSTAR:
            ajuste = previo[previo["Departamento evaluado"] == clave]
        if clave not in RECALCULAR + AJUSTAR:
            # Lista conservada: se copia tal cual y su carga cuenta para el resto
            prev = de_lista(clave)
            for _, r in prev.iterrows():
                hit = personal.index[personal["Key"].eq(norm(r["Colaborador"]))].tolist()
                if hit:
                    (sel.carga if r["Tipo"] == "Titular" else sel.carga_sup)[hit[0]] += 1
                fila = r.to_dict()
                fila["employee_id"] = fila.pop("_employee_id")
                fila.pop("_key", None)
                filas.append(fila)
            if prev["Colaborador"].map(norm).isin(excl_keys).any() and clave in ent.claves_cerradas:
                alertas.append(f"{clave}: lista cerrada que contiene personas excluidas (no se ajusta)")
            for d in prev["Departamento evaluado"].unique():
                e_ = entry_by_list.get(d)
                resumen.append(dict(lista=d, numero=numero_de(clave),
                                    requerida=(e_.internal_sample_size if e_ else None),
                                    titulares=int(((prev["Departamento evaluado"] == d) & (prev["Tipo"] == "Titular")).sum()),
                                    pool=None, estado="conservada"))
            continue

        if not entradas_de(clave):
            alertas.append(f"{clave}: no hay lista en el cronograma; se omite")
            continue
        fecha = fecha_de(clave)
        numero = numero_de(clave)
        nominados = ent.nominados_por_clave.get(clave, {})
        excl_idx = set()
        for lista in nominados.values():
            for nom in lista:
                hit = emparejar(nom, personal)
                excl_idx.update(hit)
                if not hit:
                    alertas.append(f"{clave}: nominado '{nom}' no encontrado en el listado (verificar)")
        if not nominados:
            alertas.append(f"{clave}: no se encontró el formulario de la lista")
        elif not any(nominados.values()):
            alertas.append(f"{clave}: el formulario no tiene nominados cargados")
        base = elegibles_base(ev, fecha, excl_idx)
        if ev.get("excluir_filtro"):
            base &= ~mascara(personal, ev["excluir_filtro"])
        usados = []

        def registrar(idxs, area_eval, tipo, sub="", estados=None):
            for n_i, i in enumerate(idxs):
                r = personal.loc[i]
                filas.append({"No.": numero, "Departamento evaluado": clave + (f" – {sub}" if sub else ""),
                              "Envío": fecha, "Área evaluadora (cronograma)": area_eval, "Tipo": tipo,
                              "Colaborador": r["Nombre"].title(), "Respondió": estados[n_i] if estados else "Pendiente",
                              "employee_id": int(r["employee_id"])})

        if ev["pools"] == "CAJA":
            for form, ub in R.CAJA_SUCURSALES.items():
                en_suc = base & personal["Ubicacion"].eq(ub)
                grupos, vistos_caja = {}, set()
                for lbl, rx, _ in R.CAJA_GRUPOS:   # cada persona cuenta en un solo estrato
                    idx = personal.index[en_suc & personal["Puesto"].str.contains(rx, case=False, regex=True)]
                    grupos[lbl] = [i for i in idx if i not in vistos_caja]
                    vistos_caja.update(grupos[lbl])
                cupos = {lbl: n for lbl, _, n in R.CAJA_GRUPOS}
                for lbl in list(cupos):
                    if lbl != R.CAJA_RESPALDO and not grupos[lbl] and cupos[lbl]:
                        alertas.append(f"CAJA {ub}: la entidad no tiene '{lbl}' → sus {cupos[lbl]} cupo(s) pasan a {R.CAJA_RESPALDO}")
                        cupos[R.CAJA_RESPALDO] += cupos[lbl]
                        cupos[lbl] = 0
                n_obj = sum(cupos.values())
                usados_suc = []
                for lbl, _, _ in R.CAJA_GRUPOS:
                    tit = sel.elegir(grupos[lbl], cupos[lbl], usados_suc)
                    usados_suc += tit
                    registrar(tit, f"{lbl} {ub}", "Titular", ub)
                    if len(tit) < cupos[lbl]:
                        alertas.append(f"CAJA {ub}: '{lbl}' tiene {len(grupos[lbl])} elegible(s) para {cupos[lbl]} cupo(s)")
                sobrantes = [i for lbl, _, _ in R.CAJA_GRUPOS for i in grupos[lbl]]
                sup = sel.elegir(sobrantes, 1, usados_suc, suplente=True)
                for i in sup:
                    lbl_i = next(lbl for lbl, v in grupos.items() if i in v)
                    registrar([i], f"{lbl_i} {ub}", "Suplente", ub)
                resumen.append(dict(lista=f"CAJA – {ub}", numero=numero, requerida=n_obj,
                                    titulares=len(usados_suc), pool=len(sobrantes), estado="recalculada"))
            continue

        if ev["pools"] == "TODOS":
            areas = sorted(personal.loc[base, "Area"].unique())
            pools = [(a, {"area": a}) for a in areas]
        else:
            pools = ev["pools"]

        indices = {lbl: personal.index[base & mascara(personal, f)].tolist() for lbl, f in pools}
        # un colaborador cuenta en un solo estrato (el primero en que aparece)
        vistos = set()
        for lbl in indices:
            indices[lbl] = [i for i in indices[lbl] if i not in vistos]
            vistos.update(indices[lbl])
        n_ev = muestra_de(ev)
        # Tamaño "efectivo" del área: cada persona pesa menos cuantas más encuestas ya tiene.
        # Los líderes pesan PESO_LIDER (script 25/09/2026): áreas con más líderes reciben más cupos.
        tam_ef = {k: sum((R.PESO_LIDER if personal.at[i, "Lider"] else 1.0) / (1 + sel.carga[i]) ** 2 for i in v)
                  for k, v in indices.items()}
        cuotas = ev.get("cuotas") or repartir(n_ev, tam_ef, maximos={k: len(v) for k, v in indices.items()})

        if ajuste is not None:   # reemplazo puntual: se conserva la lista y solo se cubren las bajas
            idx_de = lambda nombre: personal.index[personal["Key"].eq(norm(nombre))].tolist()
            total_tit = 0
            for tipo in ("Titular", "Suplente"):
                deficit = 0
                for lbl, grupo in ajuste[ajuste["Tipo"] == tipo].groupby("Área evaluadora (cronograma)", sort=False):
                    quedan = grupo[~grupo["_key"].isin(excl_de(clave))]
                    keep = [idx_de(n)[0] for n in quedan["Colaborador"] if idx_de(n) and idx_de(n)[0] not in usados]
                    ya_usado = [n for n in quedan["Colaborador"] if idx_de(n) and idx_de(n)[0] in usados]
                    for i in keep:
                        (sel.carga if tipo == "Titular" else sel.carga_sup)[i] += 1
                    usados += keep
                    est_keep = [e for n, e in zip(quedan["Colaborador"], quedan["Respondió"])
                                if idx_de(n) and n not in ya_usado]
                    registrar(keep, lbl, tipo, estados=est_keep)
                    faltan = len(grupo) - len(keep)
                    nuevos = sel.elegir(indices.get(lbl, []), faltan, usados, suplente=(tipo == "Suplente")) if faltan else []
                    usados += nuevos
                    registrar(nuevos, lbl, tipo)
                    if tipo == "Titular":
                        total_tit += len(keep) + len(nuevos)
                    bajas = grupo.loc[grupo["_key"].isin(excl_de(clave)), "Colaborador"].tolist() + ya_usado
                    for k_, n_ in enumerate(bajas):
                        cambio = (personal.at[nuevos[k_], "Nombre"].title() if k_ < len(nuevos)
                                  else "se cubre desde otra área evaluadora")
                        alertas.append(f"{clave} ({tipo}, {lbl}): {n_} → {cambio}")
                    deficit += faltan - len(nuevos)
                if deficit > 0:   # el estrato se agotó: se completa con la menor carga de las demás áreas
                    todos = [i for v in indices.values() for i in v]
                    extra = sel.elegir(todos, deficit, usados, suplente=(tipo == "Suplente"))
                    usados += extra
                    for i in extra:
                        lbl_i = next(l for l, v in indices.items() if i in v)
                        registrar([i], lbl_i, tipo)
                        alertas.append(f"{clave} ({tipo}): cupo sin reemplazo en su área → {personal.at[i, 'Nombre'].title()} ({lbl_i})")
                    if tipo == "Titular":
                        total_tit += len(extra)
            resumen.append(dict(lista=clave, numero=numero, requerida=n_ev, titulares=total_tit,
                                pool=sum(len(v) for v in indices.values()), estado="ajustada"))
            continue

        total_tit = 0
        for lbl, idxs in indices.items():
            tit = sel.elegir(idxs, cuotas[lbl], usados)
            usados += tit
            total_tit += len(tit)
            registrar(tit, lbl, "Titular")
            if not idxs:
                alertas.append(f"{clave}: área '{lbl}' sin personal elegible en el listado")
        # suplentes: de las áreas con más pool restante
        restantes = sorted(indices, key=lambda k: -len(set(indices[k]) - set(usados)))
        for lbl in restantes[:suplentes_por_depto]:
            sup = sel.elegir(indices[lbl], 1, usados, suplente=True)
            usados += sup
            registrar(sup, lbl, "Suplente")
        if total_tit < n_ev:
            alertas.append(f"{clave}: {total_tit} titulares para una muestra requerida de {n_ev}")
        resumen.append(dict(lista=clave, numero=numero, requerida=n_ev, titulares=total_tit,
                            pool=sum(len(v) for v in indices.values()), estado="recalculada"))

    tit = Counter(f["employee_id"] for f in filas if f["Tipo"] == "Titular")
    carga = dict(sorted(Counter(tit.values()).items()))
    resumen.sort(key=lambda x: (x["numero"], x["lista"]))
    return ResultadoSorteo(filas, resumen, alertas, RECALCULAR, AJUSTAR, carga)


# ─────────────────────────────────────────────────────────────────────────────
# VISTA PREVIA Y APLICACIÓN
# ─────────────────────────────────────────────────────────────────────────────

def _listas_cambiadas(res: ResultadoSorteo) -> set[str]:
    claves = set(res.recalculadas) | set(res.ajustadas)
    return {f["Departamento evaluado"] for f in res.filas if R.clave_of(f["Departamento evaluado"]) in claves}


def _token(ent: Entradas, res: ResultadoSorteo) -> str:
    """Huella del resultado + del estado actual: si algo cambia entre vista previa y confirmación, no coincide."""
    listas = sorted(_listas_cambiadas(res))
    propuesta = sorted((f["Departamento evaluado"], f["Tipo"], f["employee_id"], f["Área evaluadora (cronograma)"])
                       for f in res.filas if f["Departamento evaluado"] in listas)
    actual = sorted((r["Departamento evaluado"], r["Tipo"], int(r["_employee_id"]), r["Respondió"])
                    for _, r in ent.previo.iterrows())
    raw = json.dumps([propuesta, actual, ent.config.seed], default=str, ensure_ascii=False)
    return hashlib.sha256(raw.encode()).hexdigest()[:16]


def _diff(ent: Entradas, res: ResultadoSorteo) -> list[dict]:
    """Por lista cambiada: quién entra, quién sale y quién se mantiene."""
    emp_info = {int(r["employee_id"]): (r["Puesto"], r["Ubicacion"]) for _, r in ent.personal.iterrows()}
    out = []
    for lista in sorted(_listas_cambiadas(res), key=lambda l: (ent.previo.loc[ent.previo["Departamento evaluado"] == l, "No."].min()
                                                              if (ent.previo["Departamento evaluado"] == l).any() else 999, l)):
        antes = {int(r["_employee_id"]): r for _, r in ent.previo[ent.previo["Departamento evaluado"] == lista].iterrows()}
        despues = {f["employee_id"]: f for f in res.filas if f["Departamento evaluado"] == lista}
        filas = []
        for emp_id, f in despues.items():
            puesto, ubic = emp_info.get(emp_id, (None, None))
            if emp_id not in antes:
                cambio = "entra"
            elif antes[emp_id]["Tipo"] != f["Tipo"]:
                cambio = f"pasa a {f['Tipo'].lower()}"
            else:
                cambio = "se mantiene"
            filas.append(dict(employee_id=emp_id, colaborador=f["Colaborador"], puesto=puesto, ubicacion=ubic,
                              area_evaluadora=f["Área evaluadora (cronograma)"], rol=f["Tipo"].lower(),
                              cambio=cambio))
        for emp_id, r in antes.items():
            if emp_id not in despues:
                puesto, ubic = emp_info.get(emp_id, (None, None))
                filas.append(dict(employee_id=emp_id, colaborador=r["Colaborador"], puesto=puesto, ubicacion=ubic,
                                  area_evaluadora=r["Área evaluadora (cronograma)"], rol=r["Tipo"].lower(),
                                  cambio="sale"))
        orden_cambio = lambda c: 0 if c == "entra" else 1 if c.startswith("pasa") else 2 if c == "se mantiene" else 3
        filas.sort(key=lambda x: (orden_cambio(x["cambio"]), x["rol"] != "titular", x["colaborador"]))
        out.append(dict(lista=lista,
                        entran=sum(1 for x in filas if x["cambio"] == "entra"),
                        salen=sum(1 for x in filas if x["cambio"] == "sale"),
                        cambian_rol=sum(1 for x in filas if x["cambio"].startswith("pasa")),
                        se_mantienen=sum(1 for x in filas if x["cambio"] == "se mantiene"),
                        filas=filas))
    return out


def preview(db: Session, cycle_id: int, recalcular: list[str]) -> dict:
    ent = cargar_entradas(db, cycle_id)
    res = sortear(ent, recalcular)
    return dict(
        token=_token(ent, res),
        recalculadas=res.recalculadas,
        ajustadas=res.ajustadas,
        resumen=[r for r in res.resumen if r["estado"] != "conservada"],
        alertas=res.alertas,
        carga=res.carga,
        cambios=_diff(ent, res),
    )


def apply(db: Session, cycle_id: int, recalcular: list[str], token: str) -> dict:
    ent = cargar_entradas(db, cycle_id)
    res = sortear(ent, recalcular)
    if _token(ent, res) != token:
        raise SamplingError(
            "Los datos cambiaron desde la vista previa (asignaciones, respuestas o configuración). "
            "Genera la vista previa de nuevo antes de confirmar."
        )
    entry_by_list = {e.list_name: e for e in ent.entries}
    areas = {a.name: a for a in db.query(EvaluatorArea).all()}

    def area(nombre):
        if nombre and nombre not in areas:
            areas[nombre] = EvaluatorArea(name=nombre)
            db.add(areas[nombre])
        return areas.get(nombre)

    creadas = eliminadas = actualizadas = 0
    for lista in _listas_cambiadas(res):
        entry = entry_by_list.get(lista)
        if entry is None:
            continue
        nuevas = {f["employee_id"]: f for f in res.filas if f["Departamento evaluado"] == lista}
        for a in list(entry.assignments):
            if a.employee_id in nuevas:
                f = nuevas.pop(a.employee_id)
                rol = AssignmentRole.SUPLENTE.value if f["Tipo"] == "Suplente" else AssignmentRole.TITULAR.value
                if a.role != rol or (a.evaluator_area.name if a.evaluator_area else "") != f["Área evaluadora (cronograma)"]:
                    a.role, a.evaluator_area = rol, area(f["Área evaluadora (cronograma)"])
                    actualizadas += 1
            elif a.status != AssignmentStatus.COMPLETO.value:   # las completadas nunca se borran
                db.delete(a)
                eliminadas += 1
        for emp_id, f in nuevas.items():
            db.add(EvaluationAssignment(
                schedule_entry_id=entry.id, employee_id=emp_id,
                role=AssignmentRole.SUPLENTE.value if f["Tipo"] == "Suplente" else AssignmentRole.TITULAR.value,
                status=AssignmentStatus.PENDIENTE.value,
                evaluator_area=area(f["Área evaluadora (cronograma)"]),
            ))
            creadas += 1
        # La muestra requerida de Caja la define la regla (5 por entidad)
        r_ = next((r for r in res.resumen if r["lista"] == lista), None)
        if r_ and R.clave_of(lista) == "CAJA":
            entry.internal_sample_size = r_["requerida"]
    db.commit()
    logger.info(f"Sorteo aplicado ciclo={cycle_id} recalculadas={res.recalculadas} ajustadas={res.ajustadas}: "
                f"+{creadas} −{eliminadas} ~{actualizadas}")
    return dict(recalculadas=res.recalculadas, ajustadas=res.ajustadas,
                asignaciones_creadas=creadas, asignaciones_eliminadas=eliminadas,
                asignaciones_actualizadas=actualizadas, alertas=res.alertas)


def evaluaciones_disponibles(db: Session, cycle_id: int) -> list[dict]:
    """Evaluaciones con sus listas y si se pueden re-sortear (para la pantalla de Sorteo)."""
    entries = (db.query(ScheduleEntry).options(joinedload(ScheduleEntry.assignments))
               .filter(ScheduleEntry.cycle_id == cycle_id).all())
    names = [e.list_name for e in entries]
    out = []
    for clave in R.ORDEN:
        mias = [e for e in entries if e.list_name in R.lists_of(clave, names)]
        if not mias:
            continue
        completados = sum(1 for e in mias for a in e.assignments if a.status == AssignmentStatus.COMPLETO.value)
        cerrada = all(e.is_closed for e in mias)
        motivo = "Encuesta cerrada" if cerrada else (f"{completados} respuesta(s) completada(s)" if completados else None)
        out.append(dict(
            clave=clave,
            listas=[e.list_name for e in sorted(mias, key=lambda e: e.list_name)],
            numero=min((e.schedule_number for e in mias if e.schedule_number is not None), default=None),
            envio=min((e.send_date for e in mias if e.send_date), default=None),
            titulares=sum(1 for e in mias for a in e.assignments if a.role == AssignmentRole.TITULAR.value),
            completados=completados,
            recalculable=motivo is None,
            motivo_bloqueo=motivo,
        ))
    out.sort(key=lambda x: (x["numero"] or 999, x["clave"]))
    return out


# ─────────────────────────────────────────────────────────────────────────────
# AMPLIAR UNA LISTA YA ENVIADA
# ─────────────────────────────────────────────────────────────────────────────

def _nominados_de(db: Session, entry: ScheduleEntry) -> list[str]:
    forms = db.query(SurveyForm).filter(
        SurveyForm.cycle_id == entry.cycle_id, SurveyForm.list_name == entry.list_name,
    ).all()
    return [n for f in forms for n in (f.nominees or [])]


def _areas_propias(cfg: SamplingConfig, entry: ScheduleEntry) -> set[str]:
    """Áreas que no pueden evaluar esta lista (las excluidas del ciclo + el propio departamento)."""
    clave = R.clave_of(entry.list_name)
    ev = R.EVALUACION_POR_CLAVE.get(clave) if clave else None
    return set(cfg.areas_excluidas or []) | set(ev["excluir"] if ev else [])


def estratos_evaluadores(ent: Entradas, entry: ScheduleEntry) -> Optional[tuple[pd.Series, list[str]]]:
    """
    Área evaluadora (estrato de sampling_rules) de cada persona del listado que puede
    evaluar la lista: índice del listado → etiqueta ("Fuerza de Ventas Santiago", "Inventario"…).
    Cada persona cuenta en el primer estrato en que aparece, igual que en el sorteo.
    Devuelve (etiquetas, estratos en el orden de la regla; vacío si evalúan "todos").
    None si la lista no corresponde a ninguna evaluación conocida (no se restringe).
    """
    clave = R.clave_of(entry.list_name)
    ev = R.EVALUACION_POR_CLAVE.get(clave) if clave else None
    if ev is None:
        return None
    personal = ent.personal
    if "Gobierno" not in personal:
        marcar_gobierno(ent)
    if ev["pools"] == "TODOS":
        return personal["Area"].copy(), []
    if ev["pools"] == "CAJA":
        # 'CAJA – Portal' → ubicación del listado; los estratos son los puestos de la entidad
        ubic = entry.list_name.split(" – ", 1)[-1]
        pools = [(lbl, {"ubicacion": ubic, "puesto": rx}) for lbl, rx, _ in R.CAJA_GRUPOS]
    else:
        pools = ev["pools"]
    etiqueta = pd.Series(pd.NA, index=personal.index, dtype="object")
    for lbl, filtro in pools:
        etiqueta[mascara(personal, filtro) & etiqueta.isna()] = lbl
    return etiqueta.dropna(), [lbl for lbl, _ in pools]


def candidatos_adicionales(db: Session, cycle_id: int, entry_id: int, n: int, solo_lideres: bool) -> dict:
    """
    Personas elegibles para sumarse a una lista, con `n` sugeridas.
    Solo se proponen personas de las áreas que evalúan ese departamento (los estratos
    de sampling_rules: p. ej. Almacén Finca lo evalúan Corporativo Santiago, Fuerza de
    Ventas Santiago e Inventario; Caja, los puestos comerciales de la propia entidad).
    Sugerencia: una por área evaluadora antes de repetir área; dentro de eso, menos carga
    titular y luego las áreas y ubicaciones menos representadas en la lista. Nadie por
    encima del tope si hay alternativa. El desempate es aleatorio pero fijo (semilla del ciclo).
    """
    ent = cargar_entradas(db, cycle_id)
    entry = next((e for e in ent.entries if e.id == entry_id), None)
    if entry is None:
        raise SamplingError(f"Lista id={entry_id} no encontrada en el ciclo.")
    cfg, personal = ent.config, ent.personal
    clave = R.clave_of(entry.list_name)
    ev = R.EVALUACION_POR_CLAVE.get(clave) if clave else None
    alertas: list[str] = []

    estratos = estratos_evaluadores(ent, entry)
    if estratos is None:
        alertas.append(f"'{entry.list_name}' no tiene áreas evaluadoras definidas: se sugiere de todas las áreas.")
        estratos = (personal["Area"].copy(), [])
    estrato, areas_evaluadoras = estratos
    area_de = lambda i: estrato.get(i, personal.at[i, "Area"])

    m = personal.index.isin(estrato.index)
    m &= ~personal["Area"].isin(_areas_propias(cfg, entry))
    m &= ~personal["Key"].isin({norm(x) for x in cfg.personas_excluidas or []})
    # No repetición: quien ya evalúa las listas "hermanas" no entra
    permitir = {norm(x) for x in cfg.permitir_repetir or []}
    names = [e.list_name for e in ent.entries]
    hermanas = {l for o in (cfg.evitar_repeticion or {}).get(clave, []) for l in R.lists_of(o, names)}
    m &= ~personal["Key"].isin(set(ent.previo.loc[ent.previo["Departamento evaluado"].isin(hermanas), "_key"]) - permitir)
    corte = pd.Timestamp(entry.send_date or date.today()) - timedelta(days=cfg.antiguedad_minima_dias)
    m &= personal["Ingreso"].notna() & (personal["Ingreso"] <= corte)
    m &= ~personal["SinInteraccion"]
    if ev and ev.get("excluir_filtro"):
        m &= ~mascara(personal, ev["excluir_filtro"])
    nom_idx = set()
    for nom in _nominados_de(db, entry):
        nom_idx.update(emparejar(nom, personal))
    m &= ~personal.index.isin(nom_idx)
    en_lista = {a.employee_id for a in entry.assignments}
    m &= ~personal["employee_id"].isin(en_lista)
    if solo_lideres:
        m &= personal["Puesto"].str.contains(R.RX_LIDER, case=False, regex=True)

    carga = Counter(int(r["_employee_id"]) for _, r in ent.previo.iterrows() if r["Tipo"] == "Titular")
    idx_de = {int(e): i for i, e in personal["employee_id"].items()}
    en_lista_idx = [idx_de[e] for e in en_lista if e in idx_de]
    area_cnt = Counter(area_de(i) for i in en_lista_idx)
    ubic_cnt = Counter(personal.at[i, "Ubicacion"] for i in en_lista_idx)
    representacion = dict(area_cnt.most_common())
    rng = random.Random(f"{cfg.seed}-adicionales-{entry.id}")
    ruido = {i: rng.random() for i in personal.index}

    def score(i):
        eid = int(personal.at[i, "employee_id"])
        area = area_de(i)
        return (carga[eid] >= cfg.titular_cap, nuevas_por_area[area], carga[eid], area_cnt[area],
                ubic_cnt[personal.at[i, "Ubicacion"]], ruido[i])

    cand = personal.index[m].tolist()
    sugeridos, nuevas_por_area = [], Counter()
    for _ in range(min(n, len(cand))):
        mejor = min((i for i in cand if i not in sugeridos), key=score)
        sugeridos.append(mejor)
        nuevas_por_area[area_de(mejor)] += 1
        area_cnt[area_de(mejor)] += 1
        ubic_cnt[personal.at[mejor, "Ubicacion"]] += 1
    if len(cand) < n:
        alertas.append(f"Solo hay {len(cand)} persona(s) elegible(s) para {n} cupo(s).")
    con_cand = {area_de(i) for i in cand}
    sin_cand = [a for a in areas_evaluadoras if a not in con_cand]
    if sin_cand:
        alertas.append("Áreas evaluadoras sin personas elegibles"
                       + (" (con 'Solo líderes')" if solo_lideres else "") + ": " + ", ".join(sin_cand) + ".")

    resto = sorted((i for i in cand if i not in sugeridos),
                   key=lambda i: (carga[int(personal.at[i, "employee_id"])], area_de(i), personal.at[i, "Nombre"]))
    out = []
    for i in sugeridos + resto:
        r = personal.loc[i]
        out.append(dict(employee_id=int(r["employee_id"]), colaborador=r["Nombre"], puesto=r["Puesto"] or None,
                        area=r["Area"], area_evaluadora=area_de(i), ubicacion=r["Ubicacion"],
                        carga_titular=carga[int(r["employee_id"])], sugerido=i in sugeridos))
    return dict(schedule_entry_id=entry.id, lista=entry.list_name, en_lista=len(en_lista), n=n,
                solo_lideres=solo_lideres, representacion=representacion,
                areas_evaluadoras=areas_evaluadoras,
                candidatos=out, alertas=alertas)


def agregar_evaluadores(db: Session, cycle_id: int, entry_id: int, employee_ids: list[int]) -> dict:
    """
    Agrega titulares pendientes a una lista (también cerrada). Bloquea a nominados,
    personas excluidas y al propio departamento; lo demás (antigüedad, carga, no ser
    de un área que evalúa la lista…) solo avisa. Cada asignación queda con su área
    evaluadora (estrato), como las del sorteo.
    No es parcial: si alguna persona está bloqueada no se agrega nadie.
    """
    entry = (db.query(ScheduleEntry).options(joinedload(ScheduleEntry.assignments))
             .filter(ScheduleEntry.id == entry_id, ScheduleEntry.cycle_id == cycle_id).first())
    if entry is None:
        raise SamplingError(f"Lista id={entry_id} no encontrada en el ciclo.")
    cfg = db.query(SamplingConfig).filter(SamplingConfig.cycle_id == cycle_id).first()
    if cfg is None:
        raise SamplingError("El ciclo no tiene configuración de muestreo.")
    ids = list(dict.fromkeys(employee_ids))
    emps = {e.id: e for e in db.query(Employee).options(joinedload(Employee.area))
            .filter(Employee.id.in_(ids)).all()}
    faltan = [i for i in ids if i not in emps]
    if faltan:
        raise SamplingError(f"Colaboradores no encontrados: {faltan}")

    excluidas = {norm(x) for x in cfg.personas_excluidas or []}
    areas_propias = _areas_propias(cfg, entry)
    nominados = _nominados_de(db, entry)
    rx_sin = re.compile(cfg.puestos_sin_interaccion_regex) if cfg.puestos_sin_interaccion_regex else None
    corte = (entry.send_date or date.today()) - timedelta(days=cfg.antiguedad_minima_dias)
    carga = Counter(eid for (eid,) in db.query(EvaluationAssignment.employee_id)
                    .join(ScheduleEntry, EvaluationAssignment.schedule_entry_id == ScheduleEntry.id)
                    .filter(ScheduleEntry.cycle_id == cycle_id,
                            EvaluationAssignment.role == AssignmentRole.TITULAR.value))
    ya = {a.employee_id for a in entry.assignments}

    # Área evaluadora de cada persona según las reglas de la lista (None = sin reglas / sin listado)
    estrato_de: Optional[dict[int, str]] = None
    try:
        ent = cargar_entradas(db, cycle_id)
        entry_ent = next((x for x in ent.entries if x.id == entry_id), None)
        estratos = estratos_evaluadores(ent, entry_ent) if entry_ent else None
        if estratos is not None:
            etiquetas, _ = estratos
            estrato_de = {int(ent.personal.at[i, "employee_id"]): lbl for i, lbl in etiquetas.items()}
    except SamplingError:
        pass
    areas_eval = {a.name: a for a in db.query(EvaluatorArea).all()}

    def area_evaluadora(nombre: Optional[str]):
        if nombre and nombre not in areas_eval:
            areas_eval[nombre] = EvaluatorArea(name=nombre)
            db.add(areas_eval[nombre])
        return areas_eval.get(nombre)

    bloqueos, avisos, omitidos, nuevos = [], [], [], []
    for i in ids:
        e = emps[i]
        if i in ya:
            omitidos.append(e.full_name)
            continue
        area = e.area.name if e.area else None
        if norm(e.full_name) in excluidas:
            bloqueos.append(f"{e.full_name}: está en personas excluidas")
        elif area in areas_propias:
            bloqueos.append(f"{e.full_name}: su área ({area}) no puede evaluar esta lista")
        elif any(name_matches(nom, e.name_key) for nom in nominados):
            bloqueos.append(f"{e.full_name}: es nominado/a en este formulario")
        else:
            if e.roster_order is None:
                avisos.append(f"{e.full_name}: no está en el listado de personal vigente")
            if e.hire_date and e.hire_date > corte:
                avisos.append(f"{e.full_name}: tiene menos de {cfg.antiguedad_minima_dias} días en la empresa")
            if rx_sin and e.position and rx_sin.search(e.position.lower()):
                avisos.append(f"{e.full_name}: su puesto está marcado como sin interacción")
            if carga[i] >= cfg.titular_cap:
                avisos.append(f"{e.full_name}: ya evalúa {carga[i]} lista(s) como titular")
            if estrato_de is not None and i not in estrato_de and e.roster_order is not None:
                avisos.append(f"{e.full_name}: no pertenece a las áreas que evalúan esta lista")
            nuevos.append(e)
    if bloqueos:
        raise SamplingError("No se agregó a nadie. " + "; ".join(bloqueos) + ".")

    for e in nuevos:
        db.add(EvaluationAssignment(
            schedule_entry_id=entry.id, employee_id=e.id,
            evaluator_area=area_evaluadora(estrato_de.get(e.id)) if estrato_de and e.id in estrato_de else e.area,
            role=AssignmentRole.TITULAR.value, status=AssignmentStatus.PENDIENTE.value,
        ))
    db.commit()
    logger.info(f"Lista '{entry.list_name}': +{len(nuevos)} titular(es) agregados manualmente")
    return dict(agregados=len(nuevos), omitidos=omitidos, advertencias=avisos)
