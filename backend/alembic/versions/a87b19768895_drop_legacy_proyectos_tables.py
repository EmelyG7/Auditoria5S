"""drop legacy proyectos tables

Revision ID: a87b19768895
Revises: ab473d0bb07e
Create Date: 2026-09-04 10:17:25.511576

El módulo de Proyectos/Kanban/Productividad/Reporte de Horas se eliminó
del código de la app (modelos, routers, frontend) hace varias fases, pero
sus tablas nunca se dropearon en Supabase — create_all()/init_db() es
aditivo y nunca las tocó, así que quedaron como "tablas fantasma": no
tienen modelo SQLAlchemy, así que cada `alembic revision --autogenerate`
las reporta como "removed table", ensuciando el diff de cualquier cambio
real que se quiera revisar.

Orden de drop: hijos antes que padres, respetando las FKs documentadas
en `backend/app/models/project_models.py` / `task_attachment_models.py`
(ya eliminados del código, pero así estaban relacionados):
  task_custom_values   -> task_custom_fields, tasks
  task_relations       -> tasks (self-referencial)
  task_activities      -> tasks
  task_attachments     -> tasks
  time_logs            -> tasks
  task_comments        -> tasks
  task_assignees       -> tasks
  tasks                -> projects, sprints, board_columns
  task_labels          -> projects
  project_audit_links  -> projects, audits
  board_columns        -> boards
  boards               -> projects
  sprints              -> projects
  project_members      -> projects
  projects             (raíz)

⚠️ Irreversible: downgrade() no recrea las tablas ni los datos. Si algo
sale mal, se restaura desde el respaldo de Supabase tomado antes de
aplicar esta revisión — no lo apliques sin ese respaldo.
"""
from typing import Sequence, Union

from alembic import op


# revision identifiers, used by Alembic.
revision: str = 'a87b19768895'
down_revision: Union[str, None] = 'ab473d0bb07e'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


_TABLES_IN_DROP_ORDER = [
    "task_custom_values",
    "task_custom_fields",
    "task_relations",
    "task_activities",
    "task_attachments",
    "time_logs",
    "task_comments",
    "task_assignees",
    "tasks",
    "task_labels",
    "project_audit_links",
    "board_columns",
    "boards",
    "sprints",
    "project_members",
    "projects",
]


def upgrade() -> None:
    # DROP TABLE IF EXISTS (sin CASCADE) es válido tanto en SQLite como en
    # Postgres, y es idempotente: no falla si una BD local ya no tiene
    # alguna de estas tablas. El orden ya respeta todas las FKs, así que
    # no hace falta forzar cascada.
    for table in _TABLES_IN_DROP_ORDER:
        op.execute(f"DROP TABLE IF EXISTS {table}")


def downgrade() -> None:
    # Irreversible a propósito — ver nota en el docstring de arriba.
    raise NotImplementedError(
        "Esta revisión no es reversible. Restaura desde el respaldo de "
        "Supabase tomado antes de aplicar 'drop legacy proyectos tables'."
    )
