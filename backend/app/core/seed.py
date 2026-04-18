"""
seed.py — Datos iniciales (seed) de la base de datos.

Se ejecuta automáticamente al arrancar si las tablas están vacías.
Crea:
    - 3 tipos de auditoría (Almacenes, Centro de Servicios, RMA)
    - 1 usuario administrador por defecto

Credenciales por defecto:
    admin@example.com / admin123
    ⚠️ CAMBIAR en producción.
"""

import logging
from sqlalchemy.orm import Session
from app.models.audit_models import AuditType
from app.models.user_models import User

logger = logging.getLogger(__name__)

AUDIT_TYPES_SEED = [
    {
        "name": "Almacenes",
        "description": "Auditoría 5S para áreas de almacenamiento y bodega",
        "checklist_filename": "Checklist de Auditoría Interna 5S  Almacenes.xlsx",
    },
    {
        "name": "Centro de Servicios",
        "description": "Auditoría 5S para centros de servicio técnico",
        "checklist_filename": "Checklist de Auditoría Interna 5S  Centro de Servicios.xlsx",
    },
    {
        "name": "RMA",
        "description": "Auditoría 5S para el área de devoluciones (Return Merchandise Authorization)",
        "checklist_filename": "Checklist de Auditoría Interna 5S  RMA.xlsx",
    },
]


def seed_audit_types(db: Session) -> None:
    existing = db.query(AuditType).count()
    if existing > 0:
        logger.info(f"Tipos de auditoría ya existen ({existing}). Saltando seed.")
        return

    for data in AUDIT_TYPES_SEED:
        audit_type = AuditType(**data)
        db.add(audit_type)

    db.commit()
    logger.info(f"✅ {len(AUDIT_TYPES_SEED)} tipos de auditoría creados.")


def seed_admin_user(db: Session) -> None:
    from passlib.context import CryptContext

    existing = db.query(User).filter(User.email == "admin@example.com").first()
    if existing:
        logger.info("Usuario admin ya existe. Saltando seed.")
        return

    try:
        pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
        hashed = pwd_context.hash("admin123")
    except Exception as e:
        # Fallback: bcrypt directo si passlib tiene problemas de versión
        logger.warning(f"passlib falló ({e}), usando bcrypt directo.")
        import bcrypt
        hashed = bcrypt.hashpw("admin123".encode("utf-8"), bcrypt.gensalt()).decode("utf-8")

    admin = User(
        email="admin@example.com",
        full_name="Administrador del Sistema",
        password_hash=hashed,
        role="admin",
        is_active=True,
    )
    db.add(admin)
    db.commit()
    logger.info("✅ Usuario admin creado: admin@example.com / admin123")


def run_all_seeds(db: Session) -> None:
    """Ejecuta todos los seeds en orden."""
    logger.info("Ejecutando seeds iniciales...")
    seed_audit_types(db)
    seed_admin_user(db)
    logger.info("Seeds completados.")