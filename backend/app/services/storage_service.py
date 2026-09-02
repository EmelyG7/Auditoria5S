"""
backend/app/services/storage_service.py

Almacenamiento de adjuntos de auditoría (imágenes).

Si SUPABASE_URL y SUPABASE_SERVICE_KEY están configuradas (ver config.py),
sube/borra objetos en el bucket de Supabase Storage (SUPABASE_STORAGE_BUCKET).
Si no, cae de vuelta a disco local en backend/uploads/ — el comportamiento
que tenía el endpoint antes de esta integración, para que el desarrollo
local no necesite credenciales reales de Supabase.

⚠️ En Render el filesystem es efímero: cualquier archivo escrito en disco
se pierde en el próximo redeploy. Por eso en producción SUPABASE_URL/
SUPABASE_SERVICE_KEY deben estar siempre configuradas.

SUPABASE_SERVICE_KEY es la service role key, no la anon key: el backend
sube/borra objetos directo, sin pasar por las políticas RLS del bucket.
"""

import logging
import os
from pathlib import Path
from typing import NamedTuple

from app.core.config import settings

logger = logging.getLogger(__name__)

_UPLOAD_DIR = Path("uploads")

_client = None  # cliente de Supabase, creado perezosamente (evita el import si no se usa)


class UploadResult(NamedTuple):
    file_path:  str  # clave del objeto en Storage, o ruta local — se guarda en AuditAttachment.file_path
    public_url: str  # URL para servir el archivo — se guarda en AuditAttachment.file_url


def _using_supabase() -> bool:
    return bool(settings.SUPABASE_URL and settings.SUPABASE_SERVICE_KEY)


def _get_client():
    global _client
    if _client is None:
        from supabase import create_client
        _client = create_client(settings.SUPABASE_URL, settings.SUPABASE_SERVICE_KEY)
    return _client


def upload(content: bytes, object_path: str, mime_type: str) -> UploadResult:
    """
    Sube un archivo y retorna dónde quedó guardado.

    object_path: ruta relativa dentro del bucket/carpeta de uploads,
                 ej. "audits/5/ab12cd34.jpg" (sin slash inicial).
    """
    if _using_supabase():
        client = _get_client()
        bucket = settings.SUPABASE_STORAGE_BUCKET
        client.storage.from_(bucket).upload(
            object_path,
            content,
            {"content-type": mime_type, "upsert": "true"},
        )
        public_url = client.storage.from_(bucket).get_public_url(object_path)
        return UploadResult(file_path=object_path, public_url=public_url)

    # Fallback: disco local (mismo layout que usaba el endpoint antes)
    dest_path = _UPLOAD_DIR / object_path
    dest_path.parent.mkdir(parents=True, exist_ok=True)
    dest_path.write_bytes(content)
    return UploadResult(file_path=str(dest_path), public_url=f"/uploads/{object_path}")


def delete(file_path: str) -> None:
    """
    Borra un archivo previamente subido con upload(). No lanza si ya no
    existe — un intento de borrado fallido no debe tumbar el request.
    """
    if not file_path:
        return

    if _using_supabase():
        client = _get_client()
        bucket = settings.SUPABASE_STORAGE_BUCKET
        try:
            client.storage.from_(bucket).remove([file_path])
        except Exception as exc:
            logger.warning(f"No se pudo borrar '{file_path}' de Supabase Storage: {exc}")
        return

    # Fallback: disco local
    if os.path.exists(file_path):
        try:
            os.remove(file_path)
        except OSError as exc:
            logger.warning(f"No se pudo borrar el archivo físico '{file_path}': {exc}")
