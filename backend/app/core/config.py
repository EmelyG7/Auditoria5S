"""
config.py — Configuración centralizada de la aplicación.

Lee variables de entorno con fallbacks para desarrollo.
En producción (fly.io), estas variables se configuran en fly.toml o como secrets.

VARIABLES DE ENTORNO IMPORTANTES:
    SECRET_KEY          — Clave para firmar JWT (CAMBIAR en producción)
    DATABASE_URL        — URL de conexión (SQLite dev, PostgreSQL prod)
    ACCESS_TOKEN_EXPIRE_HOURS — Duración del token (default 8h)

Uso:
    from app.core.config import settings
    settings.SECRET_KEY
"""

import os
import secrets
from functools import lru_cache


class Settings:
    # ── Aplicación ────────────────────────────────────────────────────────────
    APP_NAME:    str = "API Dashboards 5S & Satisfacción"
    APP_VERSION: str = "1.0.0"
    DEBUG:       bool = os.getenv("DEBUG", "true").lower() == "true"

    # ── Base de datos ─────────────────────────────────────────────────────────
    # NOTA MIGRACIÓN: Cambia solo esta variable para pasar a PostgreSQL.
    # SQLAlchemy se encarga del resto.
    DATABASE_URL: str = os.getenv(
        "DATABASE_URL",
        "sqlite:///./data/auditoria5s.db"
    )

    # ── JWT ───────────────────────────────────────────────────────────────────
    # ⚠️ CRÍTICO: En producción, define SECRET_KEY como variable de entorno.
    # Nunca commitear una clave real en el código.
    # En fly.io: fly secrets set SECRET_KEY="tu-clave-super-secreta"
    SECRET_KEY: str = os.getenv(
        "SECRET_KEY",
        # Fallback para desarrollo: genera una clave temporal al arrancar.
        # Esto significa que los tokens se invalidan al reiniciar el servidor,
        # lo cual es ACEPTABLE en desarrollo pero NO en producción.
        secrets.token_hex(32),
    )
    ALGORITHM:                str = "HS256"
    ACCESS_TOKEN_EXPIRE_HOURS: int = int(os.getenv("ACCESS_TOKEN_EXPIRE_HOURS", "8"))

    # ── CORS ──────────────────────────────────────────────────────────────────
    ALLOWED_ORIGINS: list[str] = [
        "http://localhost:5173",  # Vite dev
        "http://localhost:3000",  # React alternativo
    ]

    # ── Usuario admin por defecto ─────────────────────────────────────────────
    ADMIN_EMAIL:    str = os.getenv("ADMIN_EMAIL",    "admin@example.com")
    ADMIN_PASSWORD: str = os.getenv("ADMIN_PASSWORD", "admin123")
    ADMIN_NAME:     str = os.getenv("ADMIN_NAME",     "Administrador del Sistema")


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    """
    Singleton de configuración.
    @lru_cache garantiza que se crea una sola instancia en toda la app.
    """
    return Settings()


# Instancia global para imports directos
settings = get_settings()