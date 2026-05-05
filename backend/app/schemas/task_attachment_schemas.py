"""
backend/app/schemas/task_attachment_schemas.py

Schemas Pydantic para tareas adjuntos, actividad y campos personalizados.
"""

from datetime import datetime
from typing import Optional
from pydantic import BaseModel, ConfigDict, Field


# ─── ADJUNTOS ─────────────────────────────────────────────────────────────────

class TaskAttachmentCreate(BaseModel):
    file_name: str
    file_path: str
    file_size: int
    file_type: str
    file_url: Optional[str] = None


class TaskAttachmentResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    
    id:         int
    task_id:    int
    user_id:    Optional[int]
    file_name:  str
    file_path:  str
    file_size:  int
    file_type:  str
    file_url:   Optional[str]
    created_at: datetime


# ─── ACTIVIDAD ────────────────────────────────────────────────────────────────

class TaskActivityResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    
    id:          int
    task_id:     int
    user_id:     Optional[int]
    action:      str
    field_name:  Optional[str]
    old_value:   Optional[str]
    new_value:   Optional[str]
    related_id:  Optional[int]
    description: Optional[str]
    created_at:  datetime


# ─── RELACIONES DE TAREAS ─────────────────────────────────────────────────────

class TaskAttachmentWithTaskResponse(TaskAttachmentResponse):
    """Adjunto enriquecido con datos de la tarea para la galería del proyecto."""
    task_title: str = ""
    task_key:   str = ""


class TaskRelationCreate(BaseModel):
    target_task_id: int
    relation_type: str = Field(..., pattern="^(depends_on|blocks|relates_to|duplicates|is_subtask_of)$")
    description: Optional[str] = None


class TaskRelationResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id:             int
    source_task_id: int
    target_task_id: int
    relation_type:  str
    description:    Optional[str]
    created_at:     datetime


class TaskRelationDetailResponse(TaskRelationResponse):
    """Relación con títulos y claves de las tareas embebidos."""
    source_task_key:   str = ""
    source_task_title: str = ""
    target_task_key:   str = ""
    target_task_title: str = ""


# ─── CAMPOS PERSONALIZADOS ────────────────────────────────────────────────────

class TaskCustomFieldCreate(BaseModel):
    name:        str = Field(..., min_length=1, max_length=100)
    description: Optional[str] = None
    field_type:  str = Field(..., pattern="^(text|number|select|date|checkbox|textarea)$")
    options:     Optional[str] = None  # "opción1|opción2|opción3"
    is_required: bool = False
    order:       int = 0


class TaskCustomFieldUpdate(BaseModel):
    name:        Optional[str] = None
    description: Optional[str] = None
    is_required: Optional[bool] = None
    order:       Optional[int] = None
    is_active:   Optional[bool] = None


class TaskCustomFieldResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    
    id:          int
    project_id:  int
    name:        str
    description: Optional[str]
    field_type:  str
    options:     Optional[str]
    is_required: bool
    order:       int
    is_active:   bool
    created_at:  datetime


class TaskCustomValueCreate(BaseModel):
    field_id: int
    value:    Optional[str] = None


class TaskCustomValueUpdate(BaseModel):
    value: Optional[str] = None


class TaskCustomValueResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    
    id:         int
    task_id:    int
    field_id:   int
    value:      Optional[str]
    updated_at: datetime
    field:      Optional[TaskCustomFieldResponse] = None
