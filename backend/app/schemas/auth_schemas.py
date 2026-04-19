"""
auth_schemas.py — Schemas Pydantic para autenticación.
"""

from typing import Optional
from pydantic import BaseModel, EmailStr, Field, field_validator


class LoginRequest(BaseModel):
    """Body de POST /auth/login."""
    email:    str = Field(..., description="Email del usuario")
    password: str = Field(..., min_length=1, description="Contraseña")


class TokenResponse(BaseModel):
    """Respuesta de POST /auth/login con el JWT."""
    access_token: str
    token_type:   str = "bearer"
    expires_in:   int          # Segundos hasta expiración
    user_id:      int
    email:        str
    full_name:    str
    role:         str


class UserRegisterRequest(BaseModel):
    """Body de POST /auth/register (solo admin)."""
    email:     str = Field(..., description="Email único del nuevo usuario")
    password:  str = Field(..., min_length=8, description="Mínimo 8 caracteres")
    full_name: str = Field(..., min_length=2, description="Nombre completo")
    role:      str = Field(default="auditor", description="'admin' o 'auditor'")

    @field_validator("role")
    @classmethod
    def validar_rol(cls, v: str) -> str:
        if v not in ("admin", "auditor"):
            raise ValueError("El rol debe ser 'admin' o 'auditor'.")
        return v

    @field_validator("password")
    @classmethod
    def validar_password(cls, v: str) -> str:
        if len(v) < 8:
            raise ValueError("La contraseña debe tener al menos 8 caracteres.")
        return v


class UserResponse(BaseModel):
    """Respuesta con datos del usuario (sin password_hash)."""
    id:        int
    email:     str
    full_name: str
    role:      str
    is_active: bool

    model_config = {"from_attributes": True}


class UserUpdateRequest(BaseModel):
    """Body de PUT /auth/users/{id} — campos opcionales."""
    full_name:    Optional[str] = Field(None, min_length=2)
    role:         Optional[str] = None
    is_active:    Optional[bool] = None
    new_password: Optional[str] = Field(None, min_length=8)

    @field_validator("role")
    @classmethod
    def validar_rol(cls, v: Optional[str]) -> Optional[str]:
        if v is not None and v not in ("admin", "auditor"):
            raise ValueError("El rol debe ser 'admin' o 'auditor'.")
        return v


class ChangePasswordRequest(BaseModel):
    """Body de POST /auth/me/change-password."""
    current_password: str = Field(..., min_length=1)
    new_password:     str = Field(..., min_length=8)