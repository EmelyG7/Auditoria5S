# Este archivo hace que 'models' sea un paquete Python importable.
# Importa todos los modelos aquí para que Alembic los detecte automáticamente
# al generar migraciones.

from .user_models import User
from .audit_models import AuditType, Audit, AuditQuestion, AuditAttachment, AuditActionPlan
from .survey_models import Survey
from .schedule_models import AuditSchedule
from .survey_wow_models import (
    SurveyDepartment, SurveyCriteria, SurveyCycle, SurveyForm,
    SurveyQuestion, SurveyResponse, SurveyAnswer, SurveyNomination, WowReportDraft,
)
from .evaluator_models import (
    EvaluatorArea, Employee, SamplingConfig, ScheduleEntry, EvaluationAssignment,
)

__all__ = [
    "User",
    "AuditType",
    "Audit",
    "AuditQuestion",
    "AuditAttachment",
    "AuditActionPlan",
    "Survey",
    "AuditSchedule",
    # Servicio WOW 2026
    "SurveyDepartment",
    "SurveyCriteria",
    "SurveyCycle",
    "SurveyForm",
    "SurveyQuestion",
    "SurveyResponse",
    "SurveyAnswer",
    "SurveyNomination",
    "WowReportDraft",
    "EvaluatorArea",
    "Employee",
    "SamplingConfig",
    "ScheduleEntry",
    "EvaluationAssignment",
]