#!/usr/bin/env python3
"""
Elimina todos los registros de la tabla audit_schedule.
Uso: python backend/scripts/clear_schedule.py
"""

import sys
import os

# Añadir el directorio backend al path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))

from app.core.database import SessionLocal
from app.models.schedule_models import AuditSchedule

def clear_schedule():
    db = SessionLocal()
    try:
        count = db.query(AuditSchedule).count()
        if count == 0:
            print("✅ No hay eventos en el calendario.")
            return
        
        confirm = input(f"⚠️  Se eliminarán {count} evento(s) de forma permanente. ¿Continuar? (s/N): ")
        if confirm.lower() != 's':
            print("Operación cancelada.")
            return
        
        db.query(AuditSchedule).delete()
        db.commit()
        print(f"✅ Se eliminaron {count} evento(s) del calendario.")
    except Exception as e:
        db.rollback()
        print(f"❌ Error: {e}")
    finally:
        db.close()

if __name__ == "__main__":
    clear_schedule()