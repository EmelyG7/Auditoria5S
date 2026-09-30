"""Servicio WOW: corregir "Áreas que evalúan" del cronograma

Revision ID: c4e2a8f1b6d3
Revises: b3f1c9d2e4a7
Create Date: 2026-09-30 10:00:00.000000

Solo datos (sin cambios de esquema). El texto "Áreas que evalúan" se importó tal
cual del Excel de evaluadores y el reporte de resultados lo muestra en Metodología
("Muestra/Departamentos que evalúan"): se corrigen nombres incompletos o mal
escritos ("Venta corporativo privad", "Recepcion"), mayúsculas y separadores.
Se actualiza por list_name y solo si el texto sigue siendo el importado, así que
no pisa un valor que alguien ya haya cambiado.

Si se vuelve a importar el Excel de evaluadores sin corregir, vuelve el texto original.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'c4e2a8f1b6d3'
down_revision: Union[str, None] = 'b3f1c9d2e4a7'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


ALMACENES = "Corporativo, Fuerza de Ventas e Inventario"
VENTAS = "Call Center, Cuentas por Cobrar, Compras e Inventario"
CORPORATIVO = "Compras, Almacén, RMA, Marcas y Software & Services"
CAJA = "Fuerza de Ventas (de su entidad)"

# list_name → (texto importado, texto corregido)
CORRECCIONES = {
    "COMPRAS": (
        "Fuerza de Ventas, Corporativo (Negocios y Marcas), Finanzas Y CXC",
        "Fuerza de Ventas, Corporativo (Negocios y Marcas), Finanzas y CXC",
    ),
    "CALL CENTER": (
        "Gestión Humana, Fuerza de Ventas, Corporativo, Recepcion y Departamentos Administrativos",
        "Gestión Humana, Fuerza de Ventas, Corporativo, Recepción y Departamentos Administrativos",
    ),
    "ALMACENES – El Portal": ("Corporativo y Fuerza de ventas, Inventario", ALMACENES),
    "ALMACENES – Finca": ("Corporativo, Fuerza de ventas, Inventario", ALMACENES),
    "ALMACENES – Gurabo": ("Corporativo y Fuerza de ventas, Inventario", ALMACENES),
    "ALMACENES – Oficina Principal": ("Corporativo y Fuerza de ventas,Inventario", ALMACENES),
    "ALMACENES – Rómulo": ("Corporativo y Fuerza de ventas, Inventario", ALMACENES),
    "ALMACENES – Tiradentes": ("Corporativo y Fuerza de ventas, Inventario", ALMACENES),
    **{
        f"{lista} – {suc}": ("Call Center, Cuentas por Cobrar, Compras e Inventario;", VENTAS)
        for lista, sucursales in (
            ("VENTAS TIENDA", ("El Portal", "Gurabo", "Rómulo", "Tiradentes")),
            ("EJECUTIVOS SMB", ("El Portal", "Gurabo", "Oficina Principal", "Rómulo", "Tiradentes")),
        )
        for suc in sucursales
    },
    **{
        f"CAJA – {suc}": ("Fuerza de Ventas (De su entidad)", CAJA)
        for suc in ("Portal", "Gurabo", "Oficina Principal", "Rómulo", "Tiradentes")
    },
    "MARCA DELL": (
        "Venta corporativo, Venta de Pyme, Gobierno, Compras",
        "Venta Corporativo, Venta Pyme, Gobierno y Compras",
    ),
    "SOFTWARE AND SERVICES": (
        "Venta corporativo privad, Venta de Pyme, Gobierno, Compras",
        "Venta Corporativo Privado, Venta Pyme, Gobierno y Compras",
    ),
    **{
        lista: ("compras, almacén, RMA, y los departamentos de marcas y software & Services", CORPORATIVO)
        for lista in ("CORPORATIVO PRIVADO SANTIAGO", "CORPORATIVO PRIVADO SANTO DOMINGO",
                      "CORPORATIVO GOBIERNO SANTO DOMINGO")
    },
}

schedule_entries = sa.table(
    "schedule_entries",
    sa.column("list_name", sa.String),
    sa.column("evaluator_areas_raw", sa.Text),
)


def _aplicar(desde: int, hacia: int) -> None:
    for lista, textos in CORRECCIONES.items():
        op.execute(
            schedule_entries.update()
            .where(schedule_entries.c.list_name == lista)
            .where(schedule_entries.c.evaluator_areas_raw == textos[desde])
            .values(evaluator_areas_raw=textos[hacia])
        )


def upgrade() -> None:
    _aplicar(0, 1)


def downgrade() -> None:
    _aplicar(1, 0)
