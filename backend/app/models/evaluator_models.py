"""
evaluator_models.py — Programación y asignación de evaluadores del Servicio WOW.

La asignación la hace el motor de sorteo de la app (services/sampling_service.py,
port de asignar_evaluadores_wow.py). El Excel que genera el script se puede
seguir importando (evaluator_import_service.py).

Unidad de programación = una LISTA de evaluadores (hoja 'Evaluadores',
columna 'Departamento evaluado'), p. ej. 'CAJA – Gurabo' o 'ALMACENES – Finca'.
El Cronograma trae una fila por encuesta (Caja es UNA fila para 5 sucursales),
así que las fechas se toman del Cronograma por su 'No.' y se copian a cada lista.

`Matriz_Participacion` y `Resumen_Muestra` NO son tablas: se calculan
on-demand sobre EvaluationAssignment (ver services/evaluator_service.py).

ANONIMATO: EvaluationAssignment NO guarda enlace a la SurveyResponse.
Solo se marca status='completo' cuando el nombre del export calza con un
evaluador pendiente; guardar el response_id permitiría unir cada respuesta
"anónima" con la persona que la dio.
"""

from datetime import date
from enum import Enum as PyEnum
from typing import List, Optional

from sqlalchemy import JSON, Boolean, Date, ForeignKey, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .base import Base, TimestampMixin
from .survey_wow_models import SurveyDepartment


class AssignmentRole(str, PyEnum):
    TITULAR = "titular"
    SUPLENTE = "suplente"


class AssignmentStatus(str, PyEnum):
    PENDIENTE = "pendiente"
    COMPLETO = "completo"


class EvaluatorArea(TimestampMixin, Base):
    """
    Área organizativa GRUESA usada para estratificar el muestreo (Almacenes,
    Corporativo, Fuerza de Ventas Santiago, Servicio Técnico...). Distinta de
    SurveyDepartment. Corresponde a SUBDEPTO_A_AREA / estratos del script.
    """
    __tablename__ = "evaluator_areas"

    id:   Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    name: Mapped[str] = mapped_column(String(80), unique=True, nullable=False)

    def __repr__(self) -> str:
        return f"<EvaluatorArea id={self.id} name='{self.name}'>"


class Employee(TimestampMixin, Base):
    """Roster de personal (LISTADO_DE_PERSONAL_2026.xlsx). No es un User del sistema."""
    __tablename__ = "employees"

    id:        Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    full_name: Mapped[str] = mapped_column(String(150), nullable=False, index=True)
    roster_order: Mapped[Optional[int]] = mapped_column(
        nullable=True,
        comment="Fila en el último listado de personal importado (orden del sorteo). "
                "NULL = no aparece en el listado vigente → no participa en el sorteo",
    )
    name_key: Mapped[str] = mapped_column(
        String(150),
        unique=True,
        nullable=False,
        comment="Nombre normalizado (sin tildes, mayúsculas, espacios simples) — clave de upsert",
    )
    hire_date:      Mapped[Optional[date]] = mapped_column(Date(), nullable=True)
    position:       Mapped[Optional[str]]  = mapped_column(String(150), nullable=True)
    dept_path:      Mapped[Optional[str]]  = mapped_column(String(255), nullable=True, comment="'RutaDepto' del listado")
    sub_department: Mapped[Optional[str]]  = mapped_column(String(150), nullable=True)
    area_id: Mapped[Optional[int]] = mapped_column(
        ForeignKey("evaluator_areas.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    location:  Mapped[Optional[str]] = mapped_column(String(60), nullable=True)
    is_active: Mapped[bool]          = mapped_column(Boolean(), default=True, nullable=False)
    is_eligible_override: Mapped[Optional[bool]] = mapped_column(
        Boolean(),
        nullable=True,
        comment="null = reglas automáticas; True/False = forzar elegibilidad",
    )

    area: Mapped[Optional["EvaluatorArea"]] = relationship("EvaluatorArea")

    def __repr__(self) -> str:
        return f"<Employee id={self.id} name='{self.full_name}'>"


class SamplingConfig(TimestampMixin, Base):
    """
    Parámetros del muestreo (antes constantes de asignar_evaluadores_wow.py).
    Un registro por ciclo, editable desde Evaluadores → Configuración.
    `personas_excluidas` y `permitir_repetir` contienen nombres propios: se
    cargan como datos desde la app, nunca en el código ni en el seed.
    `evitar_repeticion` = {lista evaluada: [listas cuyos integrantes no pueden repetir en ella]}.
    """
    __tablename__ = "sampling_configs"

    id:       Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    cycle_id: Mapped[int] = mapped_column(
        ForeignKey("survey_wow_cycles.id", ondelete="CASCADE"),
        unique=True,
        nullable=False,
    )
    seed:                       Mapped[int] = mapped_column(default=2026, nullable=False)
    titular_cap:                Mapped[int] = mapped_column(default=2, nullable=False)
    suplentes_por_departamento: Mapped[int] = mapped_column(default=2, nullable=False)
    antiguedad_minima_dias:     Mapped[int] = mapped_column(default=60, nullable=False)
    carga_alerta:               Mapped[int] = mapped_column(default=4, nullable=False)
    areas_excluidas:    Mapped[Optional[list]] = mapped_column(JSON, default=list, nullable=True)
    personas_excluidas: Mapped[Optional[list]] = mapped_column(JSON, default=list, nullable=True)
    evitar_repeticion:  Mapped[Optional[dict]] = mapped_column(JSON, default=dict, nullable=True)
    permitir_repetir:   Mapped[Optional[list]] = mapped_column(
        JSON, default=list, nullable=True,
        comment="Personas exentas de evitar_repeticion (sin alternativa real en su área)",
    )
    puestos_sin_interaccion_regex: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)


class ScheduleEntry(TimestampMixin, Base):
    """Una lista de evaluación programada: cuándo se evalúa y con qué muestra."""
    __tablename__ = "schedule_entries"

    id:       Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    cycle_id: Mapped[int] = mapped_column(
        ForeignKey("survey_wow_cycles.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    list_name: Mapped[str] = mapped_column(
        String(120),
        nullable=False,
        comment="'Departamento evaluado' de la hoja Evaluadores (ej: 'CAJA – Gurabo')",
    )
    schedule_number: Mapped[Optional[int]] = mapped_column(
        nullable=True,
        comment="'No.' del Cronograma (varias listas pueden compartirlo, ej: Caja)",
    )
    department_id: Mapped[int] = mapped_column(
        ForeignKey("survey_wow_departments.id", ondelete="RESTRICT"),
        nullable=False,
        index=True,
    )
    branch: Mapped[Optional[str]] = mapped_column(String(60), nullable=True)

    send_date:            Mapped[Optional[date]] = mapped_column(Date(), nullable=True)
    tabulation_date:      Mapped[Optional[date]] = mapped_column(Date(), nullable=True)
    disclosure_date:      Mapped[Optional[date]] = mapped_column(Date(), nullable=True)
    report_delivery_date: Mapped[Optional[date]] = mapped_column(Date(), nullable=True)
    evaluator_areas_raw:  Mapped[Optional[str]]  = mapped_column(Text(), nullable=True, comment="'Áreas que evalúan' tal cual")
    internal_sample_raw:  Mapped[Optional[str]]  = mapped_column(String(80), nullable=True, comment="'Muestra interna' tal cual")
    external_sample_raw:  Mapped[Optional[str]]  = mapped_column(String(80), nullable=True, comment="'Muestra Externa' tal cual")
    internal_sample_size: Mapped[Optional[int]]  = mapped_column(nullable=True)
    external_sample_size: Mapped[Optional[int]]  = mapped_column(nullable=True)
    is_closed: Mapped[bool] = mapped_column(
        Boolean(),
        default=False,
        nullable=False,
        comment="ENCUESTAS_CERRADAS del script: la lista ya no se vuelve a sortear",
    )

    __table_args__ = (
        UniqueConstraint("cycle_id", "list_name", name="uq_schedule_entry_list"),
    )

    department: Mapped["SurveyDepartment"] = relationship("SurveyDepartment", lazy="joined")
    assignments: Mapped[List["EvaluationAssignment"]] = relationship(
        "EvaluationAssignment",
        back_populates="schedule_entry",
        cascade="all, delete-orphan",
    )

    def __repr__(self) -> str:
        return f"<ScheduleEntry id={self.id} list='{self.list_name}'>"


class EvaluationAssignment(TimestampMixin, Base):
    """Una fila de la hoja Evaluadores: una persona asignada a evaluar una lista."""
    __tablename__ = "evaluation_assignments"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    schedule_entry_id: Mapped[int] = mapped_column(
        ForeignKey("schedule_entries.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    employee_id: Mapped[int] = mapped_column(
        ForeignKey("employees.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    evaluator_area_id: Mapped[Optional[int]] = mapped_column(
        ForeignKey("evaluator_areas.id", ondelete="SET NULL"),
        nullable=True,
        comment="'Área evaluadora (cronograma)' — estrato del muestreo",
    )
    role: Mapped[str] = mapped_column(
        String(20),
        nullable=False,
        comment="'titular' | 'suplente' (AssignmentRole)",
    )
    status: Mapped[str] = mapped_column(
        String(20),
        default=AssignmentStatus.PENDIENTE.value,
        nullable=False,
        index=True,
        comment="'pendiente' | 'completo' (AssignmentStatus)",
    )

    __table_args__ = (
        UniqueConstraint("schedule_entry_id", "employee_id", name="uq_assignment_unique"),
    )

    schedule_entry: Mapped["ScheduleEntry"]           = relationship("ScheduleEntry", back_populates="assignments")
    employee:       Mapped["Employee"]                = relationship("Employee", lazy="joined")
    evaluator_area: Mapped[Optional["EvaluatorArea"]] = relationship("EvaluatorArea", lazy="joined")

    def __repr__(self) -> str:
        return f"<EvaluationAssignment id={self.id} entry={self.schedule_entry_id} role='{self.role}'>"
