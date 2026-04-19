"""
dependencies.py — Dependencias reutilizables de FastAPI.

Centraliza la lógica de autenticación y autorización para inyectarla
en los endpoints con Depends().

Uso en endpoints:
    # Cualquier usuario autenticado:
    @router.get("/items")
    def get_items(current_user: User = Depends(get_current_user)):
        ...

    # Solo administradores:
    @router.delete("/items/{id}")
    def delete_item(id: int, _: User = Depends(require_admin)):
        ...

NOTA PARA ODOO (futuro):
    Reemplaza get_current_user() con una función que valide la sesión
    de Odoo en lugar del JWT. require_admin() se reemplaza por
    verificación de grupos de Odoo (res.groups).
"""

import logging
from typing import Optional

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.security import decode_access_token
from app.models.user_models import User

logger = logging.getLogger(__name__)

# Esquema Bearer para extraer el token del header Authorization
# auto_error=False para que podamos dar mensajes de error personalizados
bearer_scheme = HTTPBearer(auto_error=False)


def get_current_user(
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(bearer_scheme),
    db: Session = Depends(get_db),
) -> User:
    """
    Dependencia que extrae y valida el JWT del header Authorization.

    Flujo:
        1. Extrae el token del header 'Authorization: Bearer <token>'
        2. Decodifica y valida el JWT
        3. Busca el usuario en la BD por el email del claim 'sub'
        4. Verifica que el usuario está activo

    Returns:
        El objeto User autenticado.

    Raises:
        HTTP 401: Si no hay token, el token es inválido/expirado,
                  o el usuario no existe/está inactivo.
    """
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="No autenticado o token inválido. Por favor inicia sesión.",
        headers={"WWW-Authenticate": "Bearer"},
    )

    # ── Verificar que viene el token ──────────────────────────────────────────
    if not credentials or not credentials.credentials:
        logger.debug("Request sin token de autenticación")
        raise credentials_exception

    token = credentials.credentials

    # ── Decodificar JWT ───────────────────────────────────────────────────────
    payload = decode_access_token(token)
    if payload is None:
        logger.debug("Token inválido o expirado")
        raise credentials_exception

    email: Optional[str] = payload.get("sub")
    if not email:
        logger.debug("Token sin claim 'sub'")
        raise credentials_exception

    # ── Buscar usuario en BD ──────────────────────────────────────────────────
    user = db.query(User).filter(
        User.email == email,
        User.is_active == True,  # noqa: E712
    ).first()

    if not user:
        logger.debug(f"Usuario '{email}' no encontrado o inactivo")
        raise credentials_exception

    return user


def get_current_active_user(
    current_user: User = Depends(get_current_user),
) -> User:
    """
    Alias de get_current_user que enfatiza que el usuario debe estar activo.
    El filtro is_active ya está en get_current_user, pero este alias
    hace el código más legible en los endpoints.
    """
    return current_user


def require_admin(
    current_user: User = Depends(get_current_user),
) -> User:
    """
    Dependencia que exige que el usuario tenga rol 'admin'.

    Raises:
        HTTP 403: Si el usuario está autenticado pero no es admin.
    """
    if not current_user.is_admin:
        logger.warning(
            f"Acceso denegado: '{current_user.email}' (rol='{current_user.role}') "
            f"intentó acceder a un recurso de admin."
        )
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="No tienes permisos para realizar esta acción. Se requiere rol 'admin'.",
        )
    return current_user