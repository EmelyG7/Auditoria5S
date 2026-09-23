"""Servicio WOW fase 2: listado de personal, nominados y excepciones de repeticion

Revision ID: 7d6b178c39bb
Revises: a02167765d41
Create Date: 2026-09-23 11:15:33.536982

Puramente aditiva: tres columnas nullable para el motor de sorteo de evaluadores.
    employees.roster_order          — fila en el listado de personal vigente (orden del sorteo)
    survey_wow_forms.nominees       — nominados del formulario (.txt de Forms)
    sampling_configs.permitir_repetir — excepciones a evitar_repeticion

Como en a02167765d41, el autogenerate también propuso cambios sobre
`audit_attachments` (desviación preexistente de la SQLite local); se quitaron.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '7d6b178c39bb'
down_revision: Union[str, None] = 'a02167765d41'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    with op.batch_alter_table('employees') as batch:
        batch.add_column(sa.Column(
            'roster_order', sa.Integer(), nullable=True,
            comment='Fila en el último listado de personal importado (orden del sorteo). '
                    'NULL = no aparece en el listado vigente → no participa en el sorteo',
        ))
    with op.batch_alter_table('sampling_configs') as batch:
        batch.add_column(sa.Column(
            'permitir_repetir', sa.JSON(), nullable=True,
            comment='Personas exentas de evitar_repeticion (sin alternativa real en su área)',
        ))
    with op.batch_alter_table('survey_wow_forms') as batch:
        batch.add_column(sa.Column(
            'nominees', sa.JSON(), nullable=True,
            comment="Solo internos: opciones de 'Seleccione a su nominado' del .txt de Forms. "
                    'El sorteo excluye a estas personas (conflicto de interés)',
        ))


def downgrade() -> None:
    with op.batch_alter_table('survey_wow_forms') as batch:
        batch.drop_column('nominees')
    with op.batch_alter_table('sampling_configs') as batch:
        batch.drop_column('permitir_repetir')
    with op.batch_alter_table('employees') as batch:
        batch.drop_column('roster_order')
