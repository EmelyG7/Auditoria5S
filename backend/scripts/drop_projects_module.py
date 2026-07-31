#!/usr/bin/env python3
"""
Elimina las tablas del módulo de Proyectos/Kanban/Productividad/Reporte de Horas,
ya retirado del código (Fase 1 de la limpieza de módulos).

⚠️  HAZ UN RESPALDO DE LA BASE DE DATOS ANTES DE CORRER ESTE SCRIPT.
    - SQLite: copia el archivo backend/data/auditoria5s.db
    - Postgres: pg_dump

Uso: python backend/scripts/drop_projects_module.py
"""

import sys
import os

sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))

from sqlalchemy import text
from app.core.database import engine

# Orden hijos -> padres para respetar las foreign keys.
TABLES_IN_DROP_ORDER = [
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


def drop_projects_module():
    with engine.connect() as conn:
        existing = set(
            row[0]
            for row in conn.execute(
                text(
                    "SELECT name FROM sqlite_master WHERE type='table'"
                    if engine.dialect.name == "sqlite"
                    else "SELECT tablename FROM pg_tables WHERE schemaname='public'"
                )
            )
        )

    tables_to_drop = [t for t in TABLES_IN_DROP_ORDER if t in existing]
    if not tables_to_drop:
        print("✅ No hay tablas del módulo de Proyectos que eliminar.")
        return

    print("Se eliminarán las siguientes tablas (y todos sus datos):")
    for t in tables_to_drop:
        print(f"  - {t}")
    confirm = input("\n⚠️  Esta acción es irreversible. ¿Ya respaldaste la base de datos y quieres continuar? (s/N): ")
    if confirm.lower() != "s":
        print("Operación cancelada.")
        return

    with engine.begin() as conn:
        for t in tables_to_drop:
            conn.execute(text(f"DROP TABLE IF EXISTS {t}"))
            print(f"  ✓ {t} eliminada")

    print(f"\n✅ Se eliminaron {len(tables_to_drop)} tabla(s) del módulo de Proyectos.")


if __name__ == "__main__":
    drop_projects_module()
