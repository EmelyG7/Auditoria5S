"""Servicio WOW: borrador de reportes de resultados

Revision ID: b3f1c9d2e4a7
Revises: 7d6b178c39bb
Create Date: 2026-09-25 11:30:00.000000

Puramente aditiva: una tabla nueva para el editor de reportes del Servicio WOW
(informe detallado y resumen ejecutivo).
    survey_wow_report_drafts — borrador JSON editable, único por (cycle_id, department_id)

No guarda resultados: el reporte los lee de los endpoints del dashboard.
Escrita a mano (no autogenerate) para no arrastrar la desviación preexistente de
`audit_attachments` en la SQLite local.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'b3f1c9d2e4a7'
down_revision: Union[str, None] = '7d6b178c39bb'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table('survey_wow_report_drafts',
    sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
    sa.Column('cycle_id', sa.Integer(), nullable=False),
    sa.Column('department_id', sa.Integer(), nullable=False),
    sa.Column('draft_data', sa.JSON(), nullable=True,
              comment='Estado editable del reporte (textos, embajador, fotos, plan de acción, sucursal)'),
    sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('(CURRENT_TIMESTAMP)'), nullable=False),
    sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('(CURRENT_TIMESTAMP)'), nullable=False),
    sa.ForeignKeyConstraint(['cycle_id'], ['survey_wow_cycles.id'], ondelete='CASCADE'),
    sa.ForeignKeyConstraint(['department_id'], ['survey_wow_departments.id'], ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('id'),
    sa.UniqueConstraint('cycle_id', 'department_id', name='uq_survey_wow_report_draft')
    )
    op.create_index(op.f('ix_survey_wow_report_drafts_cycle_id'), 'survey_wow_report_drafts', ['cycle_id'], unique=False)
    op.create_index(op.f('ix_survey_wow_report_drafts_department_id'), 'survey_wow_report_drafts', ['department_id'], unique=False)


def downgrade() -> None:
    op.drop_index(op.f('ix_survey_wow_report_drafts_department_id'), table_name='survey_wow_report_drafts')
    op.drop_index(op.f('ix_survey_wow_report_drafts_cycle_id'), table_name='survey_wow_report_drafts')
    op.drop_table('survey_wow_report_drafts')
