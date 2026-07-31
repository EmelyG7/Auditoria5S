"""baseline: esquema existente pre-alembic

Revision ID: ab473d0bb07e
Revises:
Create Date: 2026-07-31 14:45:42.053982

Revisión vacía a propósito: tanto la BD local (SQLite) como producción
(Supabase) YA tienen todas las tablas creadas por Base.metadata.create_all().
Esta revisión solo marca el punto de partida — se aplica con
`alembic stamp head`, nunca con `alembic upgrade head`, para no intentar
recrear tablas que ya existen. Todo cambio de esquema futuro se modela
como una revisión nueva a partir de aquí.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'ab473d0bb07e'
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    pass


def downgrade() -> None:
    pass
