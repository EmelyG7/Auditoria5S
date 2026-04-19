"""
security.py — Utilidades de seguridad: hashing de contraseñas y JWT.

Separado de config.py para que sea importable de forma aislada
y fácilmente testeable.

NOTA PARA ODOO (futuro):
    Este módulo no toca la BD ni FastAPI.
    Si se integra con Odoo, solo se reemplaza la verificación de token
    por el sistema de sesiones de Odoo. Las funciones de hash bcrypt
    se pueden reutilizar tal cual.
"""

import logging
from datetime import datetime, timedelta, timezone
from typing import Any, Optional

from jose import JWTError, jwt
from passlib.context import CryptContext

from app.core.config import settings

logger = logging.getLogger(__name__)

# ── Contexto de hashing ───────────────────────────────────────────────────────
# bcrypt es el estándar para contraseñas.
# deprecated="auto" migra automáticamente hashes viejos al verificar.
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")


# ─────────────────────────────────────────────────────────────────────────────
# CONTRASEÑAS
# ─────────────────────────────────────────────────────────────────────────────

def hash_password(plain_password: str) -> str:
    """
    Genera el hash bcrypt de una contraseña.

    Args:
        plain_password: Contraseña en texto plano.

    Returns:
        Hash bcrypt (siempre ~60 caracteres).

    NUNCA guardar plain_password en la BD. Solo el hash.
    """
    return pwd_context.hash(plain_password)


def verify_password(plain_password: str, hashed_password: str) -> bool:
    """
    Verifica que plain_password coincide con el hash almacenado.

    Returns:
        True si coinciden, False en caso contrario.

    Timing-safe: bcrypt resiste ataques de timing.
    """
    try:
        return pwd_context.verify(plain_password, hashed_password)
    except Exception as e:
        logger.warning(f"Error verificando contraseña: {e}")
        return False


# ─────────────────────────────────────────────────────────────────────────────
# JWT TOKENS
# ─────────────────────────────────────────────────────────────────────────────

def create_access_token(
    subject: Any,
    role: str = "auditor",
    extra_claims: Optional[dict] = None,
    expires_delta: Optional[timedelta] = None,
) -> str:
    """
    Crea un JWT access token.

    Args:
        subject:      Identificador del usuario (usamos el email).
        role:         Rol del usuario ('admin' o 'auditor').
        extra_claims: Claims adicionales opcionales.
        expires_delta: Duración personalizada. Si None, usa settings.

    Returns:
        JWT firmado como string.

    Estructura del payload:
        {
            "sub":  "admin@example.com",   # Subject (email)
            "role": "admin",               # Rol para autorización
            "iat":  1234567890,            # Issued at
            "exp":  1234567890,            # Expiration
        }
    """
    if expires_delta is None:
        expires_delta = timedelta(hours=settings.ACCESS_TOKEN_EXPIRE_HOURS)

    now    = datetime.now(timezone.utc)
    expire = now + expires_delta

    payload = {
        "sub":  str(subject),
        "role": role,
        "iat":  now,
        "exp":  expire,
    }
    if extra_claims:
        payload.update(extra_claims)

    token = jwt.encode(
        payload,
        settings.SECRET_KEY,
        algorithm=settings.ALGORITHM,
    )
    logger.debug(f"Token creado para '{subject}' | expira: {expire.isoformat()}")
    return token


def decode_access_token(token: str) -> Optional[dict]:
    """
    Decodifica y valida un JWT.

    Returns:
        El payload como dict si el token es válido.
        None si el token es inválido o expirado.

    Valida automáticamente:
        - Firma (SECRET_KEY)
        - Expiración (exp)
        - Algoritmo (ALGORITHM)
    """
    try:
        payload = jwt.decode(
            token,
            settings.SECRET_KEY,
            algorithms=[settings.ALGORITHM],
        )
        return payload
    except JWTError as e:
        logger.debug(f"Token inválido: {e}")
        return None