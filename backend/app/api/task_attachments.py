"""
backend/app/api/task_attachments.py

Router para adjuntos de tareas, actividad, relaciones y campos personalizados.
"""

import logging
import os
import uuid
from pathlib import Path
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, status, UploadFile, File
from sqlalchemy.orm import Session, joinedload
from sqlalchemy import and_

from app.core.database import get_db
from app.core.dependencies import get_current_user
from app.models.user_models import User
from app.models.project_models import Project, Task
from app.models.task_attachment_models import (
    TaskAttachment, TaskActivity, TaskRelation, TaskCustomField, TaskCustomValue,
    ActivityAction,
)
from app.schemas.task_attachment_schemas import (
    TaskAttachmentCreate, TaskAttachmentResponse, TaskAttachmentWithTaskResponse,
    TaskActivityResponse,
    TaskRelationCreate, TaskRelationDetailResponse,
    TaskCustomFieldCreate, TaskCustomFieldUpdate, TaskCustomFieldResponse,
    TaskCustomValueCreate, TaskCustomValueResponse,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/projects", tags=["Adjuntos y Actividad de Tareas"])

UPLOAD_DIR = Path("uploads")


# ─── Helpers ──────────────────────────────────────────────────────────────────

def _get_project_or_404(project_id: int, db: Session) -> Project:
    p = db.query(Project).filter(Project.id == project_id).first()
    if not p:
        raise HTTPException(status.HTTP_404_NOT_FOUND, f"Proyecto id={project_id} no encontrado.")
    return p


def _get_task_or_404(project_id: int, task_id: int, db: Session) -> Task:
    t = db.query(Task).filter(and_(Task.id == task_id, Task.project_id == project_id)).first()
    if not t:
        raise HTTPException(status.HTTP_404_NOT_FOUND, f"Tarea id={task_id} no encontrada.")
    return t


# ══════════════════════════════════════════════════════════════════════════════
# ADJUNTOS DE TAREAS
# ══════════════════════════════════════════════════════════════════════════════

@router.post(
    "/{project_id}/tasks/{task_id}/attachments",
    response_model=TaskAttachmentResponse,
    status_code=status.HTTP_201_CREATED,
)
async def upload_task_attachment(
    project_id: int,
    task_id: int,
    file: UploadFile = File(...),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Subir archivo adjunto a una tarea."""
    project = _get_project_or_404(project_id, db)
    _get_task_or_404(project_id, task_id, db)

    if project.visibility == "privado":
        member = next((m for m in project.members if m.user_id == current_user.id), None)
        if not member and current_user.role != "admin":
            raise HTTPException(status.HTTP_403_FORBIDDEN, "No tienes acceso a este proyecto.")

    file_path_obj: Optional[Path] = None
    try:
        file_content = await file.read()
        file_size    = len(file_content)
        file_type    = file.content_type or "application/octet-stream"

        unique_name  = f"{uuid.uuid4().hex}_{file.filename}"
        file_dir     = UPLOAD_DIR / f"projects/{project_id}/tasks/{task_id}"
        file_dir.mkdir(parents=True, exist_ok=True)
        file_path_obj = file_dir / unique_name

        file_path_obj.write_bytes(file_content)

        file_url = f"/uploads/projects/{project_id}/tasks/{task_id}/{unique_name}"

        attachment = TaskAttachment(
            task_id=task_id,
            user_id=current_user.id,
            file_name=file.filename,
            file_path=str(file_path_obj),
            file_size=file_size,
            file_type=file_type,
            file_url=file_url,
        )
        db.add(attachment)

        activity = TaskActivity(
            task_id=task_id,
            user_id=current_user.id,
            action=ActivityAction.ATTACHED,
            description=f"Adjuntó archivo: {file.filename}",
        )
        db.add(activity)
        db.commit()
        db.refresh(attachment)
        return attachment

    except Exception as e:
        db.rollback()
        if file_path_obj and file_path_obj.exists():
            file_path_obj.unlink(missing_ok=True)
        logger.error(f"Error subiendo archivo: {e}")
        raise HTTPException(status.HTTP_500_INTERNAL_SERVER_ERROR, "Error al subir archivo.")


@router.get("/{project_id}/tasks/{task_id}/attachments", response_model=list[TaskAttachmentResponse])
def list_task_attachments(
    project_id: int,
    task_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Listar archivos adjuntos de una tarea."""
    _get_project_or_404(project_id, db)
    _get_task_or_404(project_id, task_id, db)
    return (
        db.query(TaskAttachment)
        .filter(TaskAttachment.task_id == task_id)
        .order_by(TaskAttachment.created_at.desc())
        .all()
    )


@router.get("/{project_id}/attachments", response_model=list[TaskAttachmentWithTaskResponse])
def list_project_attachments(
    project_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Todos los adjuntos de todas las tareas del proyecto (para la galería)."""
    _get_project_or_404(project_id, db)

    attachments = (
        db.query(TaskAttachment)
        .join(Task, TaskAttachment.task_id == Task.id)
        .filter(Task.project_id == project_id)
        .options(joinedload(TaskAttachment.task))
        .order_by(TaskAttachment.created_at.desc())
        .all()
    )

    return [
        TaskAttachmentWithTaskResponse(
            id=att.id,
            task_id=att.task_id,
            user_id=att.user_id,
            file_name=att.file_name,
            file_path=att.file_path,
            file_size=att.file_size,
            file_type=att.file_type,
            file_url=att.file_url,
            created_at=att.created_at,
            task_title=att.task.title if att.task else "",
            task_key=att.task.task_key if att.task else "",
        )
        for att in attachments
    ]


@router.delete(
    "/{project_id}/tasks/{task_id}/attachments/{attachment_id}",
    status_code=status.HTTP_204_NO_CONTENT,
)
def delete_task_attachment(
    project_id: int,
    task_id: int,
    attachment_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Eliminar archivo adjunto de una tarea."""
    _get_project_or_404(project_id, db)
    _get_task_or_404(project_id, task_id, db)

    attachment = db.query(TaskAttachment).filter(TaskAttachment.id == attachment_id).first()
    if not attachment:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Archivo no encontrado.")

    if attachment.user_id != current_user.id and current_user.role != "admin":
        raise HTTPException(status.HTTP_403_FORBIDDEN, "No puedes eliminar este archivo.")

    if attachment.file_path and os.path.exists(attachment.file_path):
        try:
            os.remove(attachment.file_path)
        except OSError as e:
            logger.warning(f"No se pudo eliminar el archivo físico: {e}")

    db.delete(attachment)
    db.commit()


# ══════════════════════════════════════════════════════════════════════════════
# ACTIVIDAD DE TAREAS
# ══════════════════════════════════════════════════════════════════════════════

@router.get("/{project_id}/tasks/{task_id}/activity", response_model=list[TaskActivityResponse])
def get_task_activity(
    project_id: int,
    task_id: int,
    limit: int = 50,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Obtener historial de cambios de una tarea."""
    _get_project_or_404(project_id, db)
    _get_task_or_404(project_id, task_id, db)

    return (
        db.query(TaskActivity)
        .filter(TaskActivity.task_id == task_id)
        .order_by(TaskActivity.created_at.desc())
        .limit(limit)
        .all()
    )


# ══════════════════════════════════════════════════════════════════════════════
# RELACIONES ENTRE TAREAS
# ══════════════════════════════════════════════════════════════════════════════

@router.post(
    "/{project_id}/tasks/{task_id}/relations",
    response_model=TaskRelationDetailResponse,
    status_code=status.HTTP_201_CREATED,
)
def create_task_relation(
    project_id: int,
    task_id: int,
    data: TaskRelationCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Crear relación entre tareas."""
    _get_project_or_404(project_id, db)
    source_task = _get_task_or_404(project_id, task_id, db)

    target_task = db.query(Task).filter(Task.id == data.target_task_id).first()
    if not target_task or target_task.project_id != project_id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Tarea destino no encontrada.")

    if source_task.id == target_task.id:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "No puedes crear relaciones consigo misma.")

    relation = TaskRelation(
        source_task_id=source_task.id,
        target_task_id=target_task.id,
        relation_type=data.relation_type,
        description=data.description,
    )
    db.add(relation)
    db.commit()
    db.refresh(relation)

    return TaskRelationDetailResponse(
        id=relation.id,
        source_task_id=relation.source_task_id,
        target_task_id=relation.target_task_id,
        relation_type=relation.relation_type,
        description=relation.description,
        created_at=relation.created_at,
        source_task_key=source_task.task_key,
        source_task_title=source_task.title,
        target_task_key=target_task.task_key,
        target_task_title=target_task.title,
    )


@router.get("/{project_id}/tasks/{task_id}/relations", response_model=list[TaskRelationDetailResponse])
def get_task_relations(
    project_id: int,
    task_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Obtener relaciones de una tarea (salientes y entrantes) con detalle de tareas."""
    _get_project_or_404(project_id, db)
    _get_task_or_404(project_id, task_id, db)

    relations = (
        db.query(TaskRelation)
        .filter(
            (TaskRelation.source_task_id == task_id) | (TaskRelation.target_task_id == task_id)
        )
        .options(
            joinedload(TaskRelation.source_task),
            joinedload(TaskRelation.target_task),
        )
        .all()
    )

    return [
        TaskRelationDetailResponse(
            id=rel.id,
            source_task_id=rel.source_task_id,
            target_task_id=rel.target_task_id,
            relation_type=rel.relation_type,
            description=rel.description,
            created_at=rel.created_at,
            source_task_key=rel.source_task.task_key if rel.source_task else "",
            source_task_title=rel.source_task.title if rel.source_task else "",
            target_task_key=rel.target_task.task_key if rel.target_task else "",
            target_task_title=rel.target_task.title if rel.target_task else "",
        )
        for rel in relations
    ]


@router.delete(
    "/{project_id}/tasks/{task_id}/relations/{relation_id}",
    status_code=status.HTTP_204_NO_CONTENT,
)
def delete_task_relation(
    project_id: int,
    task_id: int,
    relation_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Eliminar relación entre tareas."""
    _get_project_or_404(project_id, db)
    _get_task_or_404(project_id, task_id, db)

    relation = db.query(TaskRelation).filter(TaskRelation.id == relation_id).first()
    if not relation:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Relación no encontrada.")

    if relation.source_task_id != task_id and relation.target_task_id != task_id:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Relación no pertenece a esta tarea.")

    db.delete(relation)
    db.commit()


# ══════════════════════════════════════════════════════════════════════════════
# CAMPOS PERSONALIZADOS DE PROYECTO
# ══════════════════════════════════════════════════════════════════════════════

@router.post(
    "/{project_id}/custom-fields",
    response_model=TaskCustomFieldResponse,
    status_code=status.HTTP_201_CREATED,
)
def create_custom_field(
    project_id: int,
    data: TaskCustomFieldCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Crear campo personalizado en un proyecto."""
    _get_project_or_404(project_id, db)

    field = TaskCustomField(
        project_id=project_id,
        name=data.name,
        description=data.description,
        field_type=data.field_type,
        options=data.options,
        is_required=data.is_required,
        order=data.order,
    )
    db.add(field)
    db.commit()
    db.refresh(field)
    return field


@router.get("/{project_id}/custom-fields", response_model=list[TaskCustomFieldResponse])
def list_custom_fields(
    project_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Listar campos personalizados activos de un proyecto."""
    _get_project_or_404(project_id, db)

    return (
        db.query(TaskCustomField)
        .filter(and_(TaskCustomField.project_id == project_id, TaskCustomField.is_active == True))
        .order_by(TaskCustomField.order)
        .all()
    )


@router.put("/{project_id}/custom-fields/{field_id}", response_model=TaskCustomFieldResponse)
def update_custom_field(
    project_id: int,
    field_id: int,
    data: TaskCustomFieldUpdate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Actualizar campo personalizado."""
    _get_project_or_404(project_id, db)

    field = db.query(TaskCustomField).filter(TaskCustomField.id == field_id).first()
    if not field or field.project_id != project_id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Campo no encontrado.")

    for key, value in data.model_dump(exclude_unset=True).items():
        setattr(field, key, value)

    db.commit()
    db.refresh(field)
    return field


@router.delete("/{project_id}/custom-fields/{field_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_custom_field(
    project_id: int,
    field_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Desactivar campo personalizado (soft delete)."""
    _get_project_or_404(project_id, db)

    field = db.query(TaskCustomField).filter(TaskCustomField.id == field_id).first()
    if not field or field.project_id != project_id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Campo no encontrado.")

    field.is_active = False
    db.commit()


# ══════════════════════════════════════════════════════════════════════════════
# VALORES DE CAMPOS PERSONALIZADOS POR TAREA
# ══════════════════════════════════════════════════════════════════════════════

@router.post(
    "/{project_id}/tasks/{task_id}/custom-values",
    response_model=TaskCustomValueResponse,
    status_code=status.HTTP_201_CREATED,
)
def set_custom_value(
    project_id: int,
    task_id: int,
    data: TaskCustomValueCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Setear valor de campo personalizado para una tarea (upsert)."""
    _get_project_or_404(project_id, db)
    _get_task_or_404(project_id, task_id, db)

    field = db.query(TaskCustomField).filter(TaskCustomField.id == data.field_id).first()
    if not field or field.project_id != project_id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Campo no encontrado.")

    custom_value = db.query(TaskCustomValue).filter(
        and_(TaskCustomValue.task_id == task_id, TaskCustomValue.field_id == data.field_id)
    ).first()

    if custom_value:
        custom_value.value = data.value
    else:
        custom_value = TaskCustomValue(task_id=task_id, field_id=data.field_id, value=data.value)
        db.add(custom_value)

    db.commit()
    db.refresh(custom_value)
    return custom_value


@router.get("/{project_id}/tasks/{task_id}/custom-values", response_model=list[TaskCustomValueResponse])
def get_custom_values(
    project_id: int,
    task_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Obtener valores de campos personalizados de una tarea."""
    _get_project_or_404(project_id, db)
    _get_task_or_404(project_id, task_id, db)

    return db.query(TaskCustomValue).filter(TaskCustomValue.task_id == task_id).all()
