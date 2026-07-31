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
import math
from datetime import datetime, timedelta, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.database import get_db
from app.core.dependencies import get_current_user, require_admin
from app.core.security import create_access_token, hash_password, verify_password
from app.models.user_models import User
from app.models.audit_models import Audit
from app.models.schedule_models import AuditSchedule
from app.schemas.auth_schemas import (
    AuditSummaryItem,
    ChangePasswordRequest,
    LoginRequest,
    ScheduleSummaryItem,
    TokenResponse,
    UserActivityResponse,
    UserActivityStats,
    UserRegisterRequest,
    UserResponse,
    UserUpdateRequest,
)

logger = logging.getLogger(__name__)

router = APIRouter(
    prefix="/auth",
    tags=["Autenticación"],
)


def _ensure_aware_utc(dt: Optional[datetime]) -> Optional[datetime]:
    """
    Normaliza a datetime aware en UTC.

    locked_until es timezone=True (TIMESTAMPTZ en Postgres), pero SQLite
    ignora el timezone y siempre devuelve naive sin importar el tipo
    declarado. Sin esto, comparar contra datetime.now(timezone.utc) sale
    bien en un motor y explota en el otro (naive vs aware).
    """
    if dt is None:
        return None
    if dt.tzinfo is None:
        return dt.replace(tzinfo=timezone.utc)
    return dt


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

    # Bloqueo por intentos fallidos: se revisa antes de tocar la contraseña.
    now = datetime.now(timezone.utc)
    locked_until = _ensure_aware_utc(user.locked_until) if user else None
    if locked_until and locked_until > now:
        remaining_minutes = max(1, math.ceil((locked_until - now).total_seconds() / 60))
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=(
                f"Cuenta bloqueada por múltiples intentos fallidos. "
                f"Intenta de nuevo en {remaining_minutes} minuto(s)."
            ),
        )

    # Verificar usuario y contraseña
    # IMPORTANTE: siempre llamamos verify_password aunque el usuario no exista
    # para evitar timing attacks (el tiempo de respuesta no revela si el email existe)
    dummy_hash = "$2b$12$dummy.hash.to.prevent.timing.attacks.xxxxxxxxxxxxxx"
    password_ok = verify_password(
        login_data.password,
        user.password_hash if user else dummy_hash,
    )

    if not user or not password_ok:
        if user:
            user.failed_login_attempts += 1
            if user.failed_login_attempts >= settings.LOGIN_MAX_ATTEMPTS:
                user.locked_until = now + timedelta(minutes=settings.LOGIN_LOCKOUT_MINUTES)
            db.commit()
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

    if user.failed_login_attempts or user.locked_until:
        user.failed_login_attempts = 0
        user.locked_until = None
        db.commit()

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

    # Protección: un admin solo puede resetear su propia contraseña, no la de otro admin.
    if body.new_password is not None and user.role == "admin" and user.id != admin.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="No puedes cambiar la contraseña de otro administrador.",
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


@router.get(
    "/users/{user_id}/activity",
    response_model=UserActivityResponse,
    summary="Actividad de un usuario",
    description="Retorna auditorías realizadas y calendario asignado/creado por un usuario.",
)
def get_user_activity(
    user_id: int,
    _admin: User = Depends(require_admin),
    db: Session = Depends(get_db),
) -> UserActivityResponse:
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Usuario id={user_id} no encontrado.",
        )

    # ── Auditorías realizadas (matched by email string) ───────────────────────
    raw_audits = (
        db.query(Audit)
        .filter(Audit.auditor_email == user.email)
        .order_by(Audit.audit_date.desc())
        .limit(50)
        .all()
    )
    audits = [
        AuditSummaryItem(
            id=a.id,
            audit_date=a.audit_date,
            branch=a.branch,
            audit_type=a.audit_type.name if a.audit_type else "—",
            status=a.status,
            percentage=float(a.percentage) if a.percentage is not None else None,
        )
        for a in raw_audits
    ]

    # ── Calendario: asignado + creado ─────────────────────────────────────────
    raw_assigned = (
        db.query(AuditSchedule)
        .filter(AuditSchedule.assigned_auditor_id == user_id)
        .order_by(AuditSchedule.scheduled_date.desc())
        .limit(50)
        .all()
    )
    raw_created = (
        db.query(AuditSchedule)
        .filter(
            AuditSchedule.created_by_id == user_id,
            AuditSchedule.assigned_auditor_id != user_id,
        )
        .order_by(AuditSchedule.scheduled_date.desc())
        .limit(50)
        .all()
    )

    def _sched(s: AuditSchedule, role: str) -> ScheduleSummaryItem:
        return ScheduleSummaryItem(
            id=s.id,
            title=s.title,
            branch=s.branch,
            audit_type=s.audit_type.name if s.audit_type else "—",
            scheduled_date=s.scheduled_date,
            status=s.status,
            priority=s.priority,
            role=role,
        )

    schedules = [_sched(s, "assigned") for s in raw_assigned] + [
        _sched(s, "created") for s in raw_created
    ]
    schedules.sort(key=lambda s: s.scheduled_date, reverse=True)

    stats = UserActivityStats(
        audits_performed=len(audits),
        schedules_assigned=len(raw_assigned),
        schedules_created=len(raw_created),
    )

    return UserActivityResponse(
        user=UserResponse.model_validate(user),
        stats=stats,
        audits=audits,
        schedules=schedules,
    )