"""
audit_models.py — Modelos para el sistema de Auditorías 5S.

Estructura de datos (espeja la lógica del notebook Tabular_Auditorias.ipynb):

    AuditType (catálogo)
        └── Audit (cabecera de cada auditoría realizada)
                └── AuditQuestion (una fila por cada pregunta del checklist)

La lógica de cálculo de puntajes NO vive en los modelos sino en
services/audit_service.py. Los modelos solo persisten los resultados
ya calculados para que los dashboards sean rápidos (no recalculan
en cada consulta).

ESTADO del semáforo (espeja semaforo() del notebook):
    - 'Cumple'       : porcentaje_general >= 80%
    - 'Por mejorar'  : 60% <= porcentaje_general < 80%
    - 'Crítico'      : porcentaje_general < 60%

NOTA DE MIGRACIÓN A POSTGRESQL:
    - Decimal() → usa NUMERIC en PG y REAL en SQLite. Compatible con ambos.
    - TEXT → String() sin límite. Compatible.
    - ForeignKey con ON DELETE CASCADE funciona igual en ambos motores.
    - Para PG puedes añadir índices parciales (ej: WHERE status='Pendiente')
      en una migración futura sin cambiar el modelo.
"""

from datetime import date, time
from decimal import Decimal
from typing import TYPE_CHECKING, List, Optional

from sqlalchemy import (
    Date,
    ForeignKey,
    Numeric,
    String,
    Text,
    Time,
    UniqueConstraint,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .base import Base, TimestampMixin

if TYPE_CHECKING:
    from .schedule_models import AuditSchedule


# ─────────────────────────────────────────────────────────────────────────────
# CATÁLOGO DE TIPOS DE AUDITORÍA
# ─────────────────────────────────────────────────────────────────────────────

class AuditType(Base):
    """
    Catálogo de tipos de auditoría 5S.

    Registros iniciales (seed):
        id=1  name='Almacenes'
        id=2  name='Centro de Servicios'
        id=3  name='RMA'

    Este catálogo también controla qué checklist de preguntas se carga
    en el formulario de nueva auditoría (ver services/checklist_service.py).
    """
    __tablename__ = "audit_types"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    name: Mapped[str] = mapped_column(
        String(),
        unique=True,
        nullable=False,
        comment="Nombre del tipo: 'Almacenes', 'Centro de Servicios', 'RMA'",
    )
    description: Mapped[Optional[str]] = mapped_column(
        Text(),
        nullable=True,
        comment="Descripción extendida del alcance de este tipo de auditoría",
    )
    # Nombre del archivo Excel base (relativo a data/checklists/)
    # Permite saber qué template cargar al importar masivamente.
    checklist_filename: Mapped[Optional[str]] = mapped_column(
        String(),
        nullable=True,
        comment="Nombre del archivo Excel de checklist base, ej: 'almacenes.xlsx'",
    )

    # ── Relaciones ────────────────────────────────────────────────────────────
    audits: Mapped[List["Audit"]] = relationship(
        "Audit",
        back_populates="audit_type",
        lazy="select",
    )
    schedules: Mapped[List["AuditSchedule"]] = relationship(
        "AuditSchedule",
        back_populates="audit_type",
        lazy="select",
    )

    def __repr__(self) -> str:
        return f"<AuditType id={self.id} name='{self.name}'>"


# ─────────────────────────────────────────────────────────────────────────────
# CABECERA DE AUDITORÍA
# ─────────────────────────────────────────────────────────────────────────────

class Audit(TimestampMixin, Base):
    """
    Cabecera de una auditoría 5S realizada.

    Cada registro representa UNA auditoría completa en UNA sucursal
    en UNA fecha específica.

    Los puntajes por cada S (seiri_score, seiton_score, etc.) se guardan
    desnormalizados aquí para que los dashboards puedan hacer agregaciones
    rápidas sin hacer JOINs costosos a AuditQuestion.

    Los detalles pregunta por pregunta viven en AuditQuestion.

    Campos de semáforo (espeja la función semaforo() del notebook):
        status = 'Cumple' | 'Por mejorar' | 'Crítico'
    """
    __tablename__ = "audits"

    # ── Clave primaria ────────────────────────────────────────────────────────
    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)

    # ── Clave foránea al tipo ─────────────────────────────────────────────────
    audit_type_id: Mapped[int] = mapped_column(
        ForeignKey("audit_types.id", ondelete="RESTRICT"),
        nullable=False,
        index=True,
        comment="Tipo de auditoría (Almacenes, Centro de Servicios, RMA)",
    )

    # ── Metadatos de la auditoría ─────────────────────────────────────────────
    audit_date: Mapped[date] = mapped_column(
        Date(),
        nullable=False,
        index=True,
        comment="Fecha en que se realizó la auditoría",
    )
    branch: Mapped[str] = mapped_column(
        String(),
        nullable=False,
        index=True,
        comment="Sucursal o sede auditada",
    )
    auditor_name: Mapped[Optional[str]] = mapped_column(
        String(),
        nullable=True,
        comment="Nombre del auditor que realizó la inspección",
    )
    auditor_email: Mapped[Optional[str]] = mapped_column(
        String(),
        nullable=True,
        comment="Email del auditor (puede no coincidir con un usuario del sistema)",
    )
    start_time: Mapped[Optional[time]] = mapped_column(
        Time(),
        nullable=True,
        comment="Hora de inicio de la auditoría",
    )
    end_time: Mapped[Optional[time]] = mapped_column(
        Time(),
        nullable=True,
        comment="Hora de finalización de la auditoría",
    )

    # ── Puntajes globales (pre-calculados por audit_service.py) ───────────────
    total_score: Mapped[Optional[Decimal]] = mapped_column(
        Numeric(precision=10, scale=4),
        nullable=True,
        comment="Suma de puntos obtenidos en todas las S",
    )
    max_score: Mapped[Optional[Decimal]] = mapped_column(
        Numeric(precision=10, scale=4),
        nullable=True,
        comment="Suma de puntos máximos posibles (suma de todos los pesos)",
    )
    percentage: Mapped[Optional[Decimal]] = mapped_column(
        Numeric(precision=5, scale=2),
        nullable=True,
        comment="Porcentaje general: (total_score / max_score) * 100",
    )
    status: Mapped[Optional[str]] = mapped_column(
        String(),
        nullable=True,
        index=True,
        comment="Semáforo: 'Cumple' (≥80%), 'Por mejorar' (60-79%), 'Crítico' (<60%)",
    )

    # ── Puntajes por cada S (desnormalizados para dashboards rápidos) ─────────
    # Cada campo guarda el porcentaje de cumplimiento de esa S (0-100)
    seiri_percentage: Mapped[Optional[Decimal]] = mapped_column(
        Numeric(precision=5, scale=2), nullable=True,
        comment="% cumplimiento Seiri (Clasificar)",
    )
    seiton_percentage: Mapped[Optional[Decimal]] = mapped_column(
        Numeric(precision=5, scale=2), nullable=True,
        comment="% cumplimiento Seiton (Ordenar)",
    )
    seiso_percentage: Mapped[Optional[Decimal]] = mapped_column(
        Numeric(precision=5, scale=2), nullable=True,
        comment="% cumplimiento Seiso (Limpiar)",
    )
    seiketsu_percentage: Mapped[Optional[Decimal]] = mapped_column(
        Numeric(precision=5, scale=2), nullable=True,
        comment="% cumplimiento Seiketsu (Estandarizar)",
    )
    shitsuke_percentage: Mapped[Optional[Decimal]] = mapped_column(
        Numeric(precision=5, scale=2), nullable=True,
        comment="% cumplimiento Shitsuke (Disciplina)",
    )

    # Observaciones generales de toda la auditoría
    general_observations: Mapped[Optional[str]] = mapped_column(
        Text(),
        nullable=True,
        comment="Observaciones generales del auditor sobre la visita",
    )

    # ── Trazabilidad de importación ───────────────────────────────────────────
    # Si esta auditoría fue importada desde Excel, guardamos el ID original
    # del formulario para deduplicación (espeja Id_Form del notebook).
    source_form_id: Mapped[Optional[str]] = mapped_column(
        String(),
        nullable=True,
        index=True,
        comment="ID original del formulario de origen (para deduplicación en importación masiva)",
    )
    import_source: Mapped[Optional[str]] = mapped_column(
        String(),
        nullable=True,
        comment="Fuente de importación: 'manual', 'excel_import', 'api'",
    )

    # ── Restricciones de unicidad ─────────────────────────────────────────────
    # Evita duplicar auditorías del mismo tipo/sucursal/fecha/auditor
    __table_args__ = (
        UniqueConstraint(
            "audit_type_id", "branch", "audit_date", "auditor_email",
            name="uq_audit_type_branch_date_auditor",
        ),
    )

    # ── Relaciones ────────────────────────────────────────────────────────────
    audit_type: Mapped["AuditType"] = relationship(
        "AuditType",
        back_populates="audits",
        lazy="joined",  # Siempre cargamos el tipo junto con la auditoría
    )
    questions: Mapped[List["AuditQuestion"]] = relationship(
        "AuditQuestion",
        back_populates="audit",
        cascade="all, delete-orphan",  # Si se borra la auditoría, se borran las preguntas
        lazy="select",
    )

    def __repr__(self) -> str:
        return (
            f"<Audit id={self.id} type='{self.audit_type_id}' "
            f"branch='{self.branch}' date='{self.audit_date}' "
            f"pct={self.percentage}%>"
        )

    # ── Helpers de negocio ────────────────────────────────────────────────────
    @property
    def quarter(self) -> Optional[str]:
        """Retorna el trimestre (Q1-Q4) basado en audit_date."""
        if self.audit_date is None:
            return None
        month = self.audit_date.month
        return f"Q{(month - 1) // 3 + 1}"

    @property
    def year(self) -> Optional[int]:
        """Retorna el año de la auditoría."""
        return self.audit_date.year if self.audit_date else None

    @property
    def duration_minutes(self) -> Optional[int]:
        """Calcula la duración en minutos si hay hora de inicio y fin."""
        if self.start_time and self.end_time:
            from datetime import datetime
            today = date.today()
            dt_start = datetime.combine(today, self.start_time)
            dt_end = datetime.combine(today, self.end_time)
            delta = dt_end - dt_start
            return int(delta.total_seconds() / 60)
        return None


# ─────────────────────────────────────────────────────────────────────────────
# DETALLE DE PREGUNTAS POR AUDITORÍA
# ─────────────────────────────────────────────────────────────────────────────

class AuditQuestion(Base):
    """
    Detalle de cada pregunta dentro de una auditoría.

    Espeja las hojas 'Detalle_Preguntas' y 'Preguntas_Criticas' del notebook.

    Una AuditQuestion = una fila del checklist Excel con:
        - A qué S pertenece (seiri, seiton, etc.)
        - El texto de la pregunta
        - El peso que tiene (%) — extraído del encabezado de la columna en el Excel
        - La respuesta dada (0, 50, o 100)
        - Los puntos calculados = (respuesta/100) * peso
        - La observación registrada para esa S

    NOTA: No tiene TimestampMixin porque sus timestamps son los de la
    auditoría padre (Audit). Agregar timestamps aquí sería redundante.

    NOTA DE MIGRACIÓN A POSTGRESQL:
        - El índice en (audit_id, s_name) acelerará las consultas de radar chart.
        - Considera una vista materializada en PG para el top de preguntas críticas.
    """
    __tablename__ = "audit_questions"

    # ── Clave primaria ────────────────────────────────────────────────────────
    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)

    # ── Clave foránea a la auditoría padre ───────────────────────────────────
    audit_id: Mapped[int] = mapped_column(
        ForeignKey("audits.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
        comment="ID de la auditoría a la que pertenece esta pregunta",
    )

    # ── Clasificación por S ───────────────────────────────────────────────────
    s_name: Mapped[str] = mapped_column(
        String(),
        nullable=False,
        comment="Nombre de la S: 'Seiri (Clasificar)', 'Seiton (Ordenar)', etc.",
    )
    s_index: Mapped[int] = mapped_column(
        nullable=False,
        default=0,
        comment="Índice de la S (0=Seiri, 1=Seiton, 2=Seiso, 3=Seiketsu, 4=Shitsuke)",
    )

    # ── Contenido de la pregunta ──────────────────────────────────────────────
    question_text: Mapped[str] = mapped_column(
        Text(),
        nullable=False,
        comment="Texto de la pregunta (sin el % del peso, ya extraído)",
    )
    question_order: Mapped[int] = mapped_column(
        nullable=False,
        default=0,
        comment="Orden de la pregunta dentro de su S (para mantener el orden del checklist)",
    )

    # ── Peso y respuesta ──────────────────────────────────────────────────────
    weight: Mapped[Decimal] = mapped_column(
        Numeric(precision=5, scale=2),
        nullable=False,
        comment="Peso de la pregunta en puntos (extraído del header del Excel, ej: 4.55)",
    )
    response_percent: Mapped[Decimal] = mapped_column(
        Numeric(precision=5, scale=2),
        nullable=False,
        default=Decimal("0"),
        comment="Respuesta dada: 0 (no cumple), 50 (parcial), 100 (cumple)",
    )
    points_earned: Mapped[Decimal] = mapped_column(
        Numeric(precision=10, scale=4),
        nullable=False,
        default=Decimal("0"),
        comment="Puntos obtenidos = (response_percent / 100) * weight",
    )

    # ── Observación por S ─────────────────────────────────────────────────────
    # En el checklist original, hay una observación por bloque de S, no por pregunta.
    # La guardamos en la primera pregunta de cada S, o en todas (redundante pero más flexible).
    observation: Mapped[Optional[str]] = mapped_column(
        Text(),
        nullable=True,
        comment="Observación del auditor para esta S (se repite para todas las preguntas de la misma S)",
    )

    # ── Flag de pregunta crítica ──────────────────────────────────────────────
    is_critical: Mapped[bool] = mapped_column(
        default=False,
        nullable=False,
        comment="True si response_percent < 100 (tiene puntos perdidos)",
    )
    points_lost: Mapped[Decimal] = mapped_column(
        Numeric(precision=10, scale=4),
        nullable=False,
        default=Decimal("0"),
        comment="Puntos perdidos = weight - points_earned",
    )

    # ── Índice compuesto para consultas de dashboard ──────────────────────────
    __table_args__ = (
        # Índice para radar chart (agrupar por S dentro de una auditoría)
        # y para el top de preguntas críticas globales
        {
            "comment": "Detalle de cada pregunta respondida en una auditoría 5S"
        },
    )

    # ── Relación ──────────────────────────────────────────────────────────────
    audit: Mapped["Audit"] = relationship(
        "Audit",
        back_populates="questions",
        lazy="select",
    )

    def __repr__(self) -> str:
        return (
            f"<AuditQuestion id={self.id} audit_id={self.audit_id} "
            f"s='{self.s_name}' resp={self.response_percent}% "
            f"pts={self.points_earned}/{self.weight}>"
        )

    @property
    def compliance_ratio(self) -> float:
        """Retorna el ratio de cumplimiento (0.0 a 1.0)."""
        if self.weight == 0:
            return 0.0
        return float(self.points_earned) / float(self.weight)