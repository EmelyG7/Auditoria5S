"""
survey_wow_models.py — Modelos del programa "Servicio WOW 2026".

Encuestas de satisfacción interna/externa por departamento (Microsoft Forms)
con nominación a "Embajador del Servicio WOW". Módulo autocontenido: NO
comparte tablas con el módulo de Encuestas existente (tabla `surveys`).

Estructura:

    SurveyCycle (Servicio WOW 2026)
        └── SurveyForm (un formulario de Forms: depto + tipo + sucursal + subproceso)
                ├── SurveyQuestion (preguntas en el orden del export de Forms)
                └── SurveyResponse (ANÓNIMA: sin nombre ni correo del respondiente)
                        ├── SurveyAnswer (par pregunta/valor)
                        └── SurveyNomination (solo formularios internos)

    SurveyDepartment  — catálogo de departamentos (con group_name para consolidar)
    SurveyCriteria    — los 6 criterios de la rúbrica INTERNA

Diseño: en vez de una columna fija por pregunta, cada SurveyForm declara sus
propias SurveyQuestion y las respuestas son pares pregunta/valor. Así Almacén
puede tener sus campos identificadores extra sin tocar el esquema.

Los tipos (interno/externo, likert/texto/identificador) se guardan como
String con los valores de los Enum de Python de abajo — mismo criterio que
`AuditActionPlan.status` — en vez de sa.Enum, para no crear tipos ENUM
nativos en PostgreSQL que luego exigen migraciones propias para cambiar.

Todas las tablas llevan prefijo `survey_wow_` para no confundirse con `surveys`.
"""

from datetime import datetime
from enum import Enum as PyEnum
from typing import List, Optional

from sqlalchemy import JSON, Boolean, DateTime, ForeignKey, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .base import Base, TimestampMixin


class SurveyType(str, PyEnum):
    INTERNO = "interno"
    EXTERNO = "externo"


class QuestionType(str, PyEnum):
    LIKERT_5 = "likert_5"        # escala 1-5
    TEXT = "text"                # comentario libre
    IDENTIFIER = "identifier"    # Colaborador que asistió, Cliente, Teléfono...


# ─────────────────────────────────────────────────────────────────────────────
# CATÁLOGOS
# ─────────────────────────────────────────────────────────────────────────────

class SurveyDepartment(TimestampMixin, Base):
    __tablename__ = "survey_wow_departments"

    id:   Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    name: Mapped[str] = mapped_column(
        String(120),
        unique=True,
        nullable=False,
        comment="Nombre del departamento evaluado (ej: 'Gestión Humana', 'RMA', 'Almacén')",
    )
    group_name: Mapped[Optional[str]] = mapped_column(
        String(120),
        nullable=True,
        comment="Nivel de consolidación de 'Resultados Generales' (ej: 'Gestión Administrativa / Soporte')",
    )
    color:     Mapped[Optional[str]] = mapped_column(String(7), nullable=True)
    is_active: Mapped[bool]          = mapped_column(Boolean(), default=True, nullable=False)

    forms: Mapped[List["SurveyForm"]] = relationship("SurveyForm", back_populates="department")

    def __repr__(self) -> str:
        return f"<SurveyDepartment id={self.id} name='{self.name}'>"


class SurveyCriteria(TimestampMixin, Base):
    """
    Los 6 criterios genéricos de la rúbrica INTERNA (Oportunidad, Claridad,
    Confiabilidad, Empatía, Valor agregado, Satisfacción general).
    Las preguntas externas NO referencian este catálogo: no son comparables
    entre departamentos.
    """
    __tablename__ = "survey_wow_criteria"

    id:    Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    code:  Mapped[str] = mapped_column(String(40), unique=True, nullable=False)
    order: Mapped[int] = mapped_column(nullable=False)
    label: Mapped[str] = mapped_column(String(80), nullable=False)

    def __repr__(self) -> str:
        return f"<SurveyCriteria code='{self.code}' order={self.order}>"


class SurveyCycle(TimestampMixin, Base):
    __tablename__ = "survey_wow_cycles"

    id:        Mapped[int]  = mapped_column(primary_key=True, autoincrement=True)
    name:      Mapped[str]  = mapped_column(String(60), unique=True, nullable=False)   # "Servicio WOW 2026"
    year:      Mapped[int]  = mapped_column(nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean(), default=True, nullable=False)

    def __repr__(self) -> str:
        return f"<SurveyCycle id={self.id} name='{self.name}'>"


# ─────────────────────────────────────────────────────────────────────────────
# FORMULARIOS Y PREGUNTAS
# ─────────────────────────────────────────────────────────────────────────────

class SurveyForm(TimestampMixin, Base):
    """
    Un formulario de Microsoft Forms (un .txt de txt_output).
    Interno: uno por departamento (+ sucursal en Almacén, Caja, RMA, etc.).
    Externo: uno por departamento + sucursal (+ subproceso en Almacén: Despacho/Ruta).

    Las preguntas se crean en la primera importación de respuestas, a partir
    de los encabezados del Excel exportado (ver survey_wow_import_service.py).
    """
    __tablename__ = "survey_wow_forms"

    id:       Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    cycle_id: Mapped[int] = mapped_column(
        ForeignKey("survey_wow_cycles.id", ondelete="RESTRICT"),
        nullable=False,
        index=True,
    )
    department_id: Mapped[int] = mapped_column(
        ForeignKey("survey_wow_departments.id", ondelete="RESTRICT"),
        nullable=False,
        index=True,
    )
    survey_type: Mapped[str] = mapped_column(
        String(20),
        nullable=False,
        index=True,
        comment="'interno' | 'externo' (SurveyType)",
    )
    branch:     Mapped[Optional[str]] = mapped_column(String(60), nullable=True, comment="Sucursal, si aplica")
    subprocess: Mapped[Optional[str]] = mapped_column(String(60), nullable=True, comment="Despacho / Ruta (Almacén externo)")
    title:      Mapped[str]           = mapped_column(String(200), nullable=False)
    list_name: Mapped[Optional[str]] = mapped_column(
        String(120),
        nullable=True,
        comment="Solo internos: nombre de la lista de evaluadores ('CAJA – Gurabo'). "
                "Enlaza el formulario con su ScheduleEntry.",
    )
    source_filename: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    nominees: Mapped[Optional[list]] = mapped_column(
        JSON,
        nullable=True,
        comment="Solo internos: opciones de 'Seleccione a su nominado' del .txt de Forms. "
                "El sorteo excluye a estas personas (conflicto de interés)",
    )

    __table_args__ = (
        UniqueConstraint(
            "cycle_id", "department_id", "survey_type", "branch", "subprocess",
            name="uq_survey_wow_form_identity",
        ),
    )

    department: Mapped["SurveyDepartment"] = relationship(
        "SurveyDepartment", back_populates="forms", lazy="joined",
    )
    questions: Mapped[List["SurveyQuestion"]] = relationship(
        "SurveyQuestion",
        back_populates="form",
        cascade="all, delete-orphan",
        order_by="SurveyQuestion.order",
    )
    responses: Mapped[List["SurveyResponse"]] = relationship(
        "SurveyResponse",
        back_populates="form",
        cascade="all, delete-orphan",
    )

    def __repr__(self) -> str:
        return f"<SurveyForm id={self.id} type='{self.survey_type}' title='{self.title}'>"


class SurveyQuestion(TimestampMixin, Base):
    __tablename__ = "survey_wow_questions"

    id:      Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    form_id: Mapped[int] = mapped_column(
        ForeignKey("survey_wow_forms.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    order:         Mapped[int] = mapped_column(nullable=False, comment="1 = primera columna de pregunta del export")
    text:          Mapped[str] = mapped_column(Text(), nullable=False)
    question_type: Mapped[str] = mapped_column(
        String(20),
        nullable=False,
        comment="'likert_5' | 'text' | 'identifier' (QuestionType)",
    )
    criteria_id: Mapped[Optional[int]] = mapped_column(
        ForeignKey("survey_wow_criteria.id", ondelete="SET NULL"),
        nullable=True,
        comment="Solo internos: criterio de la rúbrica al que corresponde",
    )
    is_required: Mapped[bool] = mapped_column(Boolean(), default=True, nullable=False)

    __table_args__ = (
        UniqueConstraint("form_id", "order", name="uq_survey_wow_question_order"),
    )

    form:     Mapped["SurveyForm"]               = relationship("SurveyForm", back_populates="questions")
    criteria: Mapped[Optional["SurveyCriteria"]] = relationship("SurveyCriteria")

    def __repr__(self) -> str:
        return f"<SurveyQuestion id={self.id} form_id={self.form_id} order={self.order}>"


# ─────────────────────────────────────────────────────────────────────────────
# RESPUESTAS (ANÓNIMAS)
# ─────────────────────────────────────────────────────────────────────────────

class SurveyResponse(TimestampMixin, Base):
    """
    ANÓNIMA por diseño: sin nombre ni correo del respondiente, y sin ningún
    enlace hacia EvaluationAssignment/Employee (ver evaluator_models.py).
    """
    __tablename__ = "survey_wow_responses"

    id:      Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    form_id: Mapped[int] = mapped_column(
        ForeignKey("survey_wow_forms.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    external_response_id: Mapped[int] = mapped_column(
        nullable=False,
        comment="Columna 'ID' del export de Forms (deduplicación por formulario)",
    )
    started_at:   Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    completed_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)

    __table_args__ = (
        UniqueConstraint("form_id", "external_response_id", name="uq_survey_wow_response_dedupe"),
    )

    form: Mapped["SurveyForm"] = relationship("SurveyForm", back_populates="responses")
    answers: Mapped[List["SurveyAnswer"]] = relationship(
        "SurveyAnswer", back_populates="response", cascade="all, delete-orphan",
    )
    nomination: Mapped[Optional["SurveyNomination"]] = relationship(
        "SurveyNomination", back_populates="response", uselist=False, cascade="all, delete-orphan",
    )

    def __repr__(self) -> str:
        return f"<SurveyResponse id={self.id} form_id={self.form_id} ext_id={self.external_response_id}>"


class SurveyAnswer(TimestampMixin, Base):
    __tablename__ = "survey_wow_answers"

    id:          Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    response_id: Mapped[int] = mapped_column(
        ForeignKey("survey_wow_responses.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    question_id: Mapped[int] = mapped_column(
        ForeignKey("survey_wow_questions.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    value_score: Mapped[Optional[int]] = mapped_column(nullable=True, comment="1-5 (likert_5)")
    value_text:  Mapped[Optional[str]] = mapped_column(Text(), nullable=True)

    __table_args__ = (
        UniqueConstraint("response_id", "question_id", name="uq_survey_wow_answer_unique"),
    )

    response: Mapped["SurveyResponse"] = relationship("SurveyResponse", back_populates="answers")
    question: Mapped["SurveyQuestion"] = relationship("SurveyQuestion")


class SurveyNomination(TimestampMixin, Base):
    """Nominación a 'Embajador del Servicio WOW' — solo encuestas internas."""
    __tablename__ = "survey_wow_nominations"

    id:          Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    response_id: Mapped[int] = mapped_column(
        ForeignKey("survey_wow_responses.id", ondelete="CASCADE"),
        unique=True,
        nullable=False,
    )
    nominee_name: Mapped[str]           = mapped_column(String(150), nullable=False, index=True)
    reason:       Mapped[Optional[str]] = mapped_column(Text(), nullable=True)

    response: Mapped["SurveyResponse"] = relationship("SurveyResponse", back_populates="nomination")


# ─────────────────────────────────────────────────────────────────────────────
# REPORTES DE RESULTADOS
# ─────────────────────────────────────────────────────────────────────────────

class WowReportDraft(TimestampMixin, Base):
    """
    Borrador del editor de reportes de resultados del Servicio WOW
    (app/api/reports_wow.py): textos editados, embajador elegido, foto y cita,
    plan de acción, fotos del resumen ejecutivo, sucursal filtrada, etc.
    Mismo espíritu que ReportDraft (5S), pero de otro dominio: NO guarda
    resultados — el reporte los lee siempre de los endpoints del dashboard.

    Único por (cycle_id, department_id): un reporte en preparación por
    departamento y ciclo; las dos variantes (informe detallado y resumen
    ejecutivo) comparten el mismo borrador.
    """
    __tablename__ = "survey_wow_report_drafts"

    id:       Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    cycle_id: Mapped[int] = mapped_column(
        ForeignKey("survey_wow_cycles.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    department_id: Mapped[int] = mapped_column(
        ForeignKey("survey_wow_departments.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    draft_data: Mapped[Optional[dict]] = mapped_column(
        JSON,
        nullable=True,
        comment="Estado editable del reporte (textos, embajador, fotos, plan de acción, sucursal)",
    )

    __table_args__ = (
        UniqueConstraint("cycle_id", "department_id", name="uq_survey_wow_report_draft"),
    )

    def __repr__(self) -> str:
        return f"<WowReportDraft id={self.id} cycle_id={self.cycle_id} department_id={self.department_id}>"
