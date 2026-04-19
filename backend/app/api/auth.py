"""
auth.py — Router de autenticación y gestión de usuarios.

Endpoints:
    POST /auth/login                — Login, retorna JWT
    GET  /auth/me                   — Info del usuario autenticado
    POST /auth/me/change-password   — Cambiar propia contraseña
    POST /auth/register             — Registrar nuevo usuario (solo admin)
    GET  /auth/users                — Listar usuarios (solo admin)
    PUT  /auth/users/{id}           — Editar usuario (solo admin)
    DELETE /auth/users/{id}         — Desactivar usuario (solo admin, soft delete)
"""

import logging
from datetime import timedelta
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.database import get_db
from app.core.dependencies import get_current_user, require_admin
from app.core.security import create_access_token, hash_password, verify_password
from app.models.user_models import User
from app.schemas.auth_schemas import (
    ChangePasswordRequest,
    LoginRequest,
    TokenResponse,
    UserRegisterRequest,
    UserResponse,
    UserUpdateRequest,
)

logger = logging.getLogger(__name__)

router = APIRouter(
    prefix="/auth",
    tags=["Autenticación"],
)


# ─────────────────────────────────────────────────────────────────────────────
# LOGIN
# ─────────────────────────────────────────────────────────────────────────────

@router.post(
    "/login",
    response_model=TokenResponse,
    summary="Iniciar sesión",
    description=(
        "Autentica al usuario y retorna un JWT Bearer token.\n\n"
        "El token debe enviarse en el header de todas las requests protegidas:\n"
        "`Authorization: Bearer <token>`\n\n"
        "Credenciales por defecto: `admin@example.com` / `admin123`"
    ),
)
def login(
    login_data: LoginRequest,
    db: Session = Depends(get_db),
) -> TokenResponse:
    # Buscar usuario por email (case-insensitive)
    user = db.query(User).filter(
        User.email == login_data.email.lower().strip()
    ).first()

    # Verificar usuario y contraseña
    # IMPORTANTE: siempre llamamos verify_password aunque el usuario no exista
    # para evitar timing attacks (el tiempo de respuesta no revela si el email existe)
    dummy_hash = "$2b$12$dummy.hash.to.prevent.timing.attacks.xxxxxxxxxxxxxx"
    password_ok = verify_password(
        login_data.password,
        user.password_hash if user else dummy_hash,
    )

    if not user or not password_ok:
        logger.warning(f"Login fallido para email: '{login_data.email}'")
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Email o contraseña incorrectos.",
            headers={"WWW-Authenticate": "Bearer"},
        )

    if not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Tu cuenta está desactivada. Contacta al administrador.",
        )

    # Crear token JWT
    expires_delta = timedelta(hours=settings.ACCESS_TOKEN_EXPIRE_HOURS)
    token = create_access_token(
        subject=user.email,
        role=user.role,
        expires_delta=expires_delta,
    )

    logger.info(f"Login exitoso: '{user.email}' (rol='{user.role}')")

    return TokenResponse(
        access_token=token,
        token_type="bearer",
        expires_in=int(expires_delta.total_seconds()),
        user_id=user.id,
        email=user.email,
        full_name=user.full_name,
        role=user.role,
    )


# ─────────────────────────────────────────────────────────────────────────────
# PERFIL PROPIO
# ─────────────────────────────────────────────────────────────────────────────

@router.get(
    "/me",
    response_model=UserResponse,
    summary="Perfil del usuario autenticado",
)
def get_me(current_user: User = Depends(get_current_user)) -> UserResponse:
    return UserResponse.model_validate(current_user)


@router.post(
    "/me/change-password",
    status_code=status.HTTP_200_OK,
    summary="Cambiar contraseña propia",
)
def change_password(
    body: ChangePasswordRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict:
    # Verificar contraseña actual
    if not verify_password(body.current_password, current_user.password_hash):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="La contraseña actual es incorrecta.",
        )

    if body.current_password == body.new_password:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="La nueva contraseña debe ser diferente a la actual.",
        )

    current_user.password_hash = hash_password(body.new_password)
    db.commit()
    logger.info(f"Contraseña cambiada para: '{current_user.email}'")
    return {"message": "Contraseña actualizada correctamente."}


# ─────────────────────────────────────────────────────────────────────────────
# GESTIÓN DE USUARIOS (solo admin)
# ─────────────────────────────────────────────────────────────────────────────

@router.post(
    "/register",
    response_model=UserResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Registrar nuevo usuario",
    description="Solo los administradores pueden crear nuevos usuarios.",
)
def register_user(
    body: UserRegisterRequest,
    _admin: User = Depends(require_admin),   # Valida que el solicitante es admin
    db: Session = Depends(get_db),
) -> UserResponse:
    # Verificar que el email no esté en uso
    existing = db.query(User).filter(
        User.email == body.email.lower().strip()
    ).first()
    if existing:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Ya existe un usuario con el email '{body.email}'.",
        )

    new_user = User(
        email=body.email.lower().strip(),
        full_name=body.full_name.strip(),
        password_hash=hash_password(body.password),
        role=body.role,
        is_active=True,
    )
    db.add(new_user)
    db.commit()
    db.refresh(new_user)

    logger.info(
        f"Usuario creado: '{new_user.email}' (rol='{new_user.role}') "
        f"por admin '{_admin.email}'"
    )
    return UserResponse.model_validate(new_user)


@router.get(
    "/users",
    response_model=list[UserResponse],
    summary="Listar usuarios",
    description="Solo administradores.",
)
def list_users(
    include_inactive: bool = Query(False, description="Incluir usuarios desactivados"),
    _admin: User = Depends(require_admin),
    db: Session = Depends(get_db),
) -> list[UserResponse]:
    q = db.query(User)
    if not include_inactive:
        q = q.filter(User.is_active == True)  # noqa: E712
    users = q.order_by(User.full_name).all()
    return [UserResponse.model_validate(u) for u in users]


@router.put(
    "/users/{user_id}",
    response_model=UserResponse,
    summary="Editar usuario",
    description="Solo administradores. Permite cambiar nombre, rol, estado y contraseña.",
)
def update_user(
    user_id: int,
    body: UserUpdateRequest,
    admin: User = Depends(require_admin),
    db: Session = Depends(get_db),
) -> UserResponse:
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Usuario id={user_id} no encontrado.",
        )

    # Protección: un admin no puede degradarse a sí mismo
    if user.id == admin.id and body.role == "auditor":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No puedes cambiar tu propio rol de admin a auditor.",
        )

    if body.full_name is not None:
        user.full_name = body.full_name.strip()
    if body.role is not None:
        user.role = body.role
    if body.is_active is not None:
        user.is_active = body.is_active
    if body.new_password is not None:
        user.password_hash = hash_password(body.new_password)

    db.commit()
    db.refresh(user)
    logger.info(f"Usuario id={user_id} actualizado por admin '{admin.email}'")
    return UserResponse.model_validate(user)


@router.delete(
    "/users/{user_id}",
    status_code=status.HTTP_200_OK,
    summary="Desactivar usuario (soft delete)",
    description=(
        "Desactiva el usuario (is_active=False). No borra el registro "
        "para preservar la trazabilidad de auditorías creadas por ese usuario."
    ),
)
def deactivate_user(
    user_id: int,
    admin: User = Depends(require_admin),
    db: Session = Depends(get_db),
) -> dict:
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Usuario id={user_id} no encontrado.",
        )

    # Protección: no puede desactivarse a sí mismo
    if user.id == admin.id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No puedes desactivar tu propia cuenta.",
        )

    user.is_active = False
    db.commit()
    logger.info(f"Usuario '{user.email}' desactivado por admin '{admin.email}'")
    return {"message": f"Usuario '{user.email}' desactivado correctamente."}