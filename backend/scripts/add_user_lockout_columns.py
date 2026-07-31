#!/usr/bin/env python3
"""
Agrega a la tabla users las columnas necesarias para el bloqueo de cuenta
por intentos fallidos de login (Fase 2 de seguridad):
    - failed_login_attempts (INTEGER, default 0)
    - locked_until          (DATETIME, nullable)

`Base.metadata.create_all()` (usado en el arranque normal de la app) NO
altera tablas existentes, así que estas columnas no aparecerán solas en
una base de datos que ya tenía la tabla `users` creada.

⚠️  HAZ UN RESPALDO DE LA BASE DE DATOS ANTES DE CORRER ESTE SCRIPT.
    - SQLite: copia el archivo backend/data/auditoria5s.db
    - Postgres: pg_dump

Uso: python backend/scripts/add_user_lockout_columns.py
"""

import sys
import os

sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))

from sqlalchemy import text
from app.core.database import engine

COLUMNS = [
    ("failed_login_attempts", "INTEGER NOT NULL DEFAULT 0"),
    ("locked_until", "DATETIME"),
]


def _existing_columns(conn) -> set[str]:
    if engine.dialect.name == "sqlite":
        rows = conn.execute(text("PRAGMA table_info(users)")).fetchall()
        return {row[1] for row in rows}
    rows = conn.execute(
        text(
            "SELECT column_name FROM information_schema.columns "
            "WHERE table_name = 'users'"
        )
    ).fetchall()
    return {row[0] for row in rows}


def add_user_lockout_columns():
    with engine.connect() as conn:
        existing = _existing_columns(conn)

    missing = [(name, ddl) for name, ddl in COLUMNS if name not in existing]
    if not missing:
        print("✅ La tabla users ya tiene las columnas de bloqueo. Nada que hacer.")
        return

    print("Se agregarán las siguientes columnas a la tabla users:")
    for name, ddl in missing:
        print(f"  - {name} ({ddl})")
    confirm = input("\n⚠️  ¿Ya respaldaste la base de datos y quieres continuar? (s/N): ")
    if confirm.lower() != "s":
        print("Operación cancelada.")
        return

    with engine.begin() as conn:
        for name, ddl in missing:
            conn.execute(text(f"ALTER TABLE users ADD COLUMN {name} {ddl}"))
            print(f"  ✓ {name} agregada")

    print(f"\n✅ Se agregaron {len(missing)} columna(s) a la tabla users.")


if __name__ == "__main__":
    add_user_lockout_columns()
