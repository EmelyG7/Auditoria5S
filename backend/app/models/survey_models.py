"""
survey_models.py — Modelo para encuestas de satisfacción.

Espeja la estructura de Satisfaccion_Estructura_Mejorada.xlsx.

Las dimensiones de satisfacción son:
    - Eficiencia
    - Comunicación
    - CalidadTecnica (CalidadTécnica en el Excel)
    - ValorAgregado
    - ExperienciaGlobal
    - Sat_Interna (satisfacción interna)
    - Sat_Externa (satisfacción externa)

Todos los scores son decimales en escala 0-1 (o 0-5, depende del Excel).
El campo 'score_scale' registra la escala usada para normalizar en dashboards.

NOTA DE MIGRACIÓN A POSTGRESQL:
    - Numeric() es NUMERIC en PG. Misma precisión garantizada.
    - Los índices en (year, quarter, department) acelerarán los filtros del dashboard.
"""

from datetime import datetime
from decimal import Decimal
from typing import Optional

from sqlalchemy import Numeric, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from .base import Base, TimestampMixin


class Survey(TimestampMixin, Base):
    """
    Registro de una respuesta de encuesta de satisfacción.

    Una fila = una encuesta respondida por un área/departamento en un período.

    La granularidad es a nivel de departamento+sede+período, no por persona
    individual (los datos del Excel ya vienen agregados o anonimizados).
    """
    __tablename__ = "surveys"

    # ── Clave primaria ────────────────────────────────────────────────────────
    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)

    # ── Clasificación ─────────────────────────────────────────────────────────
    survey_type: Mapped[str] = mapped_column(
        String(),
        nullable=False,
        index=True,
        comment="Tipo: 'Cliente interno' o 'Cliente externo'",
    )
    department: Mapped[Optional[str]] = mapped_column(
        String(),
        nullable=True,
        index=True,
        comment="Departamento que respondió la encuesta",
    )
    area: Mapped[Optional[str]] = mapped_column(
        String(),
        nullable=True,
        comment="Área específica dentro del departamento",
    )
    site: Mapped[Optional[str]] = mapped_column(
        String(),
        nullable=True,
        index=True,
        comment="Sede o sucursal",
    )

    # ── Período ───────────────────────────────────────────────────────────────
    period: Mapped[Optional[str]] = mapped_column(
        String(),
        nullable=True,
        comment="Código del período (ej: '2024-Q1', '2024-01')",
    )
    period_name: Mapped[Optional[str]] = mapped_column(
        String(),
        nullable=True,
        comment="Nombre legible del período (ej: 'Enero 2024', 'Q1 2024')",
    )
    year: Mapped[Optional[int]] = mapped_column(
        nullable=True,
        index=True,
        comment="Año de la encuesta",
    )
    quarter: Mapped[Optional[int]] = mapped_column(
        nullable=True,
        index=True,
        comment="Trimestre (1, 2, 3, 4)",
    )
    month: Mapped[Optional[int]] = mapped_column(
        nullable=True,
        comment="Mes (1-12), si aplica",
    )

    # ── Dimensiones de satisfacción (escala configurable) ────────────────────
    # Todos los valores se guardan como Decimal para precisión.
    # La escala original (0-1, 0-5, 0-10) se registra en score_scale.
    efficiency: Mapped[Optional[Decimal]] = mapped_column(
        Numeric(precision=5, scale=4),
        nullable=True,
        comment="Dimensión Eficiencia",
    )
    communication: Mapped[Optional[Decimal]] = mapped_column(
        Numeric(precision=5, scale=4),
        nullable=True,
        comment="Dimensión Comunicación",
    )
    technical_quality: Mapped[Optional[Decimal]] = mapped_column(
        Numeric(precision=5, scale=4),
        nullable=True,
        comment="Dimensión Calidad Técnica",
    )
    added_value: Mapped[Optional[Decimal]] = mapped_column(
        Numeric(precision=5, scale=4),
        nullable=True,
        comment="Dimensión Valor Agregado",
    )
    global_experience: Mapped[Optional[Decimal]] = mapped_column(
        Numeric(precision=5, scale=4),
        nullable=True,
        comment="Dimensión Experiencia Global",
    )

    # ── Índices de satisfacción compuestos ────────────────────────────────────
    internal_satisfaction: Mapped[Optional[Decimal]] = mapped_column(
        Numeric(precision=5, scale=4),
        nullable=True,
        comment="Índice de satisfacción interna (Sat_Interna del Excel)",
    )
    external_satisfaction: Mapped[Optional[Decimal]] = mapped_column(
        Numeric(precision=5, scale=4),
        nullable=True,
        comment="Índice de satisfacción externa (Sat_Externa del Excel)",
    )

    # ── Metadatos de escala ───────────────────────────────────────────────────
    score_scale: Mapped[Optional[str]] = mapped_column(
        String(),
        nullable=True,
        default="0-1",
        comment="Escala de los scores: '0-1', '0-5', '0-10'. Úsala para normalizar en dashboards.",
    )

    # ── Observaciones y trazabilidad ─────────────────────────────────────────
    comments: Mapped[Optional[str]] = mapped_column(
        Text(),
        nullable=True,
        comment="Comentarios cualitativos asociados a la encuesta",
    )
    source_row_id: Mapped[Optional[str]] = mapped_column(
        String(),
        nullable=True,
        comment="ID original de la fila en el Excel fuente (para deduplicación)",
    )
    import_source: Mapped[Optional[str]] = mapped_column(
        String(),
        nullable=True,
        comment="'manual', 'excel_import', 'api'",
    )

    # ── Restricción de unicidad ───────────────────────────────────────────────
    __table_args__ = (
        UniqueConstraint(
            "survey_type", "department", "site", "period",
            name="uq_survey_type_dept_site_period",
        ),
        {
            "comment": "Registros de encuestas de satisfacción de clientes internos y externos"
        },
    )

    def __repr__(self) -> str:
        return (
            f"<Survey id={self.id} type='{self.survey_type}' "
            f"dept='{self.department}' period='{self.period}'>"
        )

    @property
    def overall_satisfaction(self) -> Optional[float]:
        """
        Promedio simple de satisfacción interna y externa.
        Útil para el KPI principal del dashboard.
        """
        values = [
            v for v in [self.internal_satisfaction, self.external_satisfaction]
            if v is not None
        ]
        if not values:
            return None
        return float(sum(values)) / len(values)

    @property
    def dimensions_dict(self) -> dict:
        """
        Retorna las 5 dimensiones como diccionario para el radar chart.
        Los valores None se convierten a 0.0 para no romper las gráficas.
        """
        return {
            "Eficiencia":        float(self.efficiency or 0),
            "Comunicación":      float(self.communication or 0),
            "Calidad Técnica":   float(self.technical_quality or 0),
            "Valor Agregado":    float(self.added_value or 0),
            "Exp. Global":       float(self.global_experience or 0),
        }