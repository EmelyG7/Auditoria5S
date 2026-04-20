"""
database.py — Configuración de la conexión a la base de datos.

DESARROLLO (SQLite):
    DATABASE_URL = "sqlite:///./data/auditoria5s.db"

PRODUCCIÓN (PostgreSQL en Render):
    DATABASE_URL = "postgresql+asyncpg://user:pass@host/dbname"
    o con psycopg2:
    DATABASE_URL = "postgresql://user:pass@host/dbname"

NOTA DE MIGRACIÓN A POSTGRESQL:
    1. Cambia DATABASE_URL en .env
    2. Instala: pip install psycopg2-binary (o asyncpg para async)
    3. Elimina el argumento connect_args (es solo para SQLite)
    4. Las migraciones de Alembic se ejecutan igual: alembic upgrade head

NOTA PARA ODOO (futuro):
    Si se integra como módulo Odoo, este archivo se reemplaza por
    el ORM de Odoo (env['model'].search(...)). Los servicios en
    app/services/ son los que cambian; los modelos SQLAlchemy
    se convierten a modelos Odoo (models.Model).
"""

import logging
from pathlib import Path

from sqlalchemy import create_engine, event, text
from sqlalchemy.orm import sessionmaker, Session
from typing import Generator

import os

logger = logging.getLogger(__name__)

# ── URL de conexión ───────────────────────────────────────────────────────────
# En producción, esto viene de una variable de entorno (ver core/config.py)
# Por ahora está hardcoded para desarrollo.
DATABASE_URL = os.environ.get("DATABASE_URL", "sqlite:///./data/auditoria5s.db")

# Render a veces entrega la URL con el prefijo antiguo "postgres://"
# SQLAlchemy 1.4+ requiere "postgresql://". Corregimos silenciosamente.
if DATABASE_URL.startswith("postgres://"):
    DATABASE_URL = DATABASE_URL.replace("postgres://", "postgresql://", 1)
    logger.info("DATABASE_URL corregida: 'postgres://' → 'postgresql://'")

# ── Detección del driver ──────────────────────────────────────────────────────
IS_SQLITE     = DATABASE_URL.startswith("sqlite")
IS_POSTGRESQL = DATABASE_URL.startswith("postgresql")

# ── Crear el directorio data/ solo para SQLite ────────────────────────────────
if IS_SQLITE:
    Path("./data").mkdir(parents=True, exist_ok=True)

# ── Engine ────────────────────────────────────────────────────────────────────
# La configuración difiere entre SQLite y PostgreSQL.
if IS_SQLITE:
    engine = create_engine(
        DATABASE_URL,
        connect_args={
            # Necesario para FastAPI (multithreading) con SQLite.
            # PostgreSQL NO necesita esto — su pool maneja la concurrencia.
            "check_same_thread": False,
        },
        pool_pre_ping=True,
        echo=False,
    )
else:
    # PostgreSQL (y cualquier otro motor que no sea SQLite)
    engine = create_engine(
        DATABASE_URL,
        # Sin connect_args — PostgreSQL gestiona la concurrencia nativamente.
        pool_pre_ping=True,     # Reconecta si la conexión está caída (vital en Render)
        pool_size=5,            # Conexiones simultáneas en el pool
        max_overflow=10,        # Conexiones extra bajo carga puntual
        pool_recycle=1800,      # Recicla conexiones cada 30 min (evita timeouts de Render)
        echo=False,
    )

# ── Pragma de SQLite: SOLO para SQLite ───────────────────────────────────────
# PostgreSQL activa las foreign keys por defecto — este bloque no aplica.
if IS_SQLITE:
    @event.listens_for(engine, "connect")
    def set_sqlite_pragma(dbapi_connection, connection_record):
        cursor = dbapi_connection.cursor()
        cursor.execute("PRAGMA foreign_keys=ON")
        cursor.execute("PRAGMA journal_mode=WAL")
        cursor.close()


# ── Session factory ───────────────────────────────────────────────────────────
SessionLocal = sessionmaker(
    autocommit=False,
    autoflush=False,
    bind=engine,
)


# ── Dependency para FastAPI ───────────────────────────────────────────────────
def get_db() -> Generator[Session, None, None]:
    """
    Dependency de FastAPI para inyección de sesión de BD.

    Uso en endpoints:
        @router.get("/items")
        def get_items(db: Session = Depends(get_db)):
            return db.query(Item).all()

    La sesión se cierra automáticamente al terminar la request,
    incluso si hay una excepción.
    """
    db = SessionLocal()
    try:
        yield db
        db.commit()
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()


# ── Inicialización de tablas ──────────────────────────────────────────────────
def init_db():
    """
    Crea todas las tablas si no existen.

    En desarrollo, llamar desde main.py al arrancar.
    En producción, usar Alembic: alembic upgrade head

    NOTA: Esta función es idempotente (no borra datos existentes).
    """
    from app.models.base import Base
    # Importar todos los modelos para que Base los conozca
    import app.models  # noqa: F401

    logger.info("Inicializando base de datos...")
    Base.metadata.create_all(bind=engine)
    logger.info("Tablas creadas/verificadas correctamente.")


def verify_connection():
    """Verifica que la conexión a la BD funcione. Útil en health checks."""
    try:
        with engine.connect() as conn:
            conn.execute(text("SELECT 1"))
        logger.info(f"Conexión a BD exitosa: {DATABASE_URL}")
        return True
    except Exception as e:
        logger.error(f"Error de conexión a BD: {e}")
        return False