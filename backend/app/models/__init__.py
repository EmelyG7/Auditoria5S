# Este archivo hace que 'models' sea un paquete Python importable.
# Importa todos los modelos aquí para que Alembic los detecte automáticamente
# al generar migraciones.

from .user_models import User
from .audit_models import AuditType, Audit, AuditQuestion, AuditAttachment
from .survey_models import Survey
from .schedule_models import AuditSchedule
from .project_models import (
    Project, ProjectMember, Sprint, Board, BoardColumn,
    Task, TaskAssignee, TaskComment, TimeLog, ProjectAuditLink,
)
from .task_attachment_models import (
    TaskAttachment, TaskActivity, TaskRelation,
    TaskCustomField, TaskCustomValue,
)

__all__ = [
    "User",
    "AuditType",
    "Audit",
    "AuditQuestion",
    "AuditAttachment",
    "Survey",
    "AuditSchedule",
    "Project",
    "ProjectMember",
    "Sprint",
    "Board",
    "BoardColumn",
    "Task",
    "TaskAssignee",
    "TaskComment",
    "TimeLog",
    "ProjectAuditLink",
    "TaskAttachment",
    "TaskActivity",
    "TaskRelation",
    "TaskCustomField",
    "TaskCustomValue",
]