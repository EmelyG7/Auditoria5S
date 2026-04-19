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
    from app.core.security import hash_password
    from app.core.config import settings

    existing = db.query(User).filter(User.email == settings.ADMIN_EMAIL).first()
    if existing:
        logger.info("Usuario admin ya existe. Saltando seed.")
        return

    admin = User(
        email=settings.ADMIN_EMAIL,
        full_name=settings.ADMIN_NAME,
        password_hash=hash_password(settings.ADMIN_PASSWORD),
        role="admin",
        is_active=True,
    )
    db.add(admin)
    db.commit()
    logger.info(f"✅ Usuario admin creado: {settings.ADMIN_EMAIL} / {settings.ADMIN_PASSWORD}")


def run_all_seeds(db: Session) -> None:
    """Ejecuta todos los seeds en orden."""
    logger.info("Ejecutando seeds iniciales...")
    seed_audit_types(db)
    seed_admin_user(db)
    logger.info("Seeds completados.")