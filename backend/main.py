"""
main.py — Punto de entrada de la aplicación FastAPI.

Ejecutar en desarrollo:
    uvicorn main:app --reload --host 0.0.0.0 --port 8000

La documentación interactiva queda disponible en:
    http://localhost:8000/docs   (Swagger UI)
    http://localhost:8000/redoc  (ReDoc)
"""

import logging
import os
import sys
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

import os

# ── Logging básico ────────────────────────────────────────────────────────────
# Configura el logging antes de cualquier otro import del proyecto,
# para que los mensajes de init_db() y seeds aparezcan en consola.
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s | %(levelname)-8s | %(name)s | %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
    handlers=[logging.StreamHandler(sys.stdout)],
)
logger = logging.getLogger(__name__)

# ── Imports del proyecto ──────────────────────────────────────────────────────
# NOTA: la ruta cambió de `from database import ...`
# a `from app.core.database import ...`
from app.core.database import init_db, verify_connection, SessionLocal
from app.core.seed import run_all_seeds


# ── Lifespan (reemplaza @app.on_event que está deprecado en FastAPI moderno) ──
@asynccontextmanager
async def lifespan(app: FastAPI):
    """
    Código que corre al ARRANCAR y al APAGAR la aplicación.
    
    El bloque antes del `yield` = startup.
    El bloque después del `yield` = shutdown.
    
    Reemplaza los decoradores @app.on_event("startup") / ("shutdown")
    que están deprecados desde FastAPI 0.93+.
    """
    # ── STARTUP ───────────────────────────────────────────────────────────────
    logger.info("=" * 55)
    logger.info("  Iniciando API Dashboards 5S & Satisfacción")
    logger.info("=" * 55)

    # 1. Verificar conexión a la base de datos
    if not verify_connection():
        logger.critical("No se pudo conectar a la base de datos. Abortando.")
        sys.exit(1)

    # 2. Crear tablas si no existen (equivalente al Base.metadata.create_all
    #    que tenías antes, pero ahora importa todos los modelos correctamente)
    init_db()

    # 3. Insertar datos iniciales si las tablas están vacías
    db = SessionLocal()
    try:
        run_all_seeds(db)
    except Exception as e:
        logger.error(f"Error en seeds: {e}")
    finally:
        db.close()

    logger.info("API lista. Documentación en http://localhost:8000/docs")
    logger.info("=" * 55)

    yield  # La aplicación corre aquí

    # ── SHUTDOWN ──────────────────────────────────────────────────────────────
    logger.info("Apagando API...")


# ── Instancia de FastAPI ──────────────────────────────────────────────────────
app = FastAPI(
    title="API Dashboards 5S & Satisfacción",
    description="""
API para gestión de auditorías 5S (Almacenes, Centro de Servicios, RMA)
y encuestas de satisfacción de clientes internos y externos.

## Módulos disponibles
- **/audits** — CRUD de auditorías 5S
- **/surveys** — CRUD de encuestas de satisfacción  
- **/schedule** — Calendario de planificación
- **/auth** — Autenticación JWT
- **/reports** — Exportación a Excel y dashboards
    """,
    version="1.0.0",
    lifespan=lifespan,
)

# ── CORS ──────────────────────────────────────────────────────────────────────
# Mantenemos exactamente los orígenes que tenías.
# En producción (fly.io) añadir el dominio real aquí o cargarlo desde .env

CORS_ORIGINS = os.environ.get("CORS_ORIGINS", "http://localhost:5173").split(",")

app.add_middleware(
    CORSMiddleware,
    allow_origins=CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ── Routers (se irán añadiendo aquí conforme los generemos) ───────────────────
from app.api import audits, surveys, schedule, auth

app.include_router(auth.router,   prefix="/api/v1",     tags=["Auth"])
app.include_router(audits.router, prefix="/api/v1", tags=["Auditorías 5S"])
app.include_router(surveys.router,  prefix="/api/v1",  tags=["Encuestas"])
app.include_router(schedule.router, prefix="/api/v1", tags=["Calendario"])


# ── Endpoints base (los tuyos, sin cambios) ───────────────────────────────────
@app.get("/", tags=["Root"])
def root():
    return {
        "message": "API de Dashboards 5S & Satisfacción funcionando",
        "status": "ok",
        "docs": "http://localhost:8000/docs",
    }


@app.get("/health", tags=["Root"])
def health():
    """
    Health check para monitoreo y para el deploy en fly.io.
    fly.io usa este endpoint para saber si el contenedor está sano.
    """
    db_ok = verify_connection()
    return {
        "status": "healthy" if db_ok else "degraded",
        "database": "sqlite" if db_ok else "error",
        "version": "1.0.0",
    }