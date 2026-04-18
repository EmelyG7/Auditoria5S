"""
base.py — Base declarativa compartida y mixins reutilizables.

NOTA DE MIGRACIÓN A POSTGRESQL:
- No hay nada SQLite-específico aquí.
- Al cambiar la URL de conexión en core/config.py, todo funciona igual.
- Si en el futuro necesitas UUIDs como PK en vez de Integer,
  solo cambia el mixin TimestampMixin y regenera las migraciones.
"""

from datetime import datetime
from sqlalchemy import DateTime, func
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column


class Base(DeclarativeBase):
    """
    Base declarativa única para toda la aplicación.
    Todos los modelos heredan de esta clase.
    """
    pass


class TimestampMixin:
    """
    Mixin que agrega created_at y updated_at automáticos a cualquier modelo.
    
    Uso:
        class MiModelo(TimestampMixin, Base):
            __tablename__ = "mi_tabla"
            ...
    
    NOTA PostgreSQL: server_default con func.now() funciona igual en ambos motores.
    """
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )