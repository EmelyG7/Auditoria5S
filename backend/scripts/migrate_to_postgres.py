#!/usr/bin/env python3
"""
Script para migrar datos de SQLite a PostgreSQL en Render
Ejecutar UNA SOLA VEZ después de configurar DATABASE_URL
"""

import os
import sys
import sqlite3
import psycopg2
from psycopg2.extras import execute_values
from datetime import datetime

# Rutas
SQLITE_PATH = os.path.join(os.path.dirname(__file__), '..', '..', 'data', 'auditorias.db')
SQLITE_PATH = os.path.abspath(SQLITE_PATH)

def get_sqlite_connection():
    """Conectar a SQLite local"""
    if not os.path.exists(SQLITE_PATH):
        print(f" No se encontró SQLite en: {SQLITE_PATH}")
        sys.exit(1)
    conn = sqlite3.connect(SQLITE_PATH)
    conn.row_factory = sqlite3.Row
    return conn

def get_postgres_connection():
    """Conectar a PostgreSQL en Render"""
    database_url = os.environ.get('DATABASE_URL')
    if not database_url:
        print(" DATABASE_URL no está configurada")
        print("   Agrega esta variable de entorno en Render")
        sys.exit(1)
    return psycopg2.connect(database_url)

def table_exists(pg_conn, table_name):
    """Verificar si una tabla existe en PostgreSQL"""
    with pg_conn.cursor() as cur:
        cur.execute("""
            SELECT EXISTS (
                SELECT FROM information_schema.tables 
                WHERE table_name = %s
            )
        """, (table_name,))
        return cur.fetchone()[0]

def migrate_table(sqlite_conn, pg_conn, table_name, columns, conflict_column='id'):
    """Migrar una tabla completa"""
    # Obtener datos de SQLite
    sqlite_cursor = sqlite_conn.cursor()
    columns_str = ', '.join(columns)
    placeholders = ', '.join(['%s'] * len(columns))
    
    sqlite_cursor.execute(f"SELECT {columns_str} FROM {table_name}")
    rows = sqlite_cursor.fetchall()
    
    if not rows:
        print(f"     No hay datos en {table_name}")
        return 0
    
    # Insertar en PostgreSQL
    with pg_conn.cursor() as cur:
        # Limpiar datos existentes si queremos (opcional)
        # cur.execute(f"DELETE FROM {table_name}")
        
        # Insertar nuevos datos
        insert_sql = f"""
            INSERT INTO {table_name} ({columns_str}) 
            VALUES %s
            ON CONFLICT ({conflict_column}) DO NOTHING
        """
        execute_values(cur, insert_sql, rows)
        pg_conn.commit()
        
    print(f"    {len(rows)} registros en {table_name}")
    return len(rows)

def main():
    print("=" * 60)
    print(" MIGRANDO DATOS: SQLite → PostgreSQL")
    print("=" * 60)
    
    # Conectar a bases de datos
    print("\n Conectando a SQLite...")
    sqlite_conn = get_sqlite_connection()
    
    print(" Conectando a PostgreSQL...")
    pg_conn = get_postgres_connection()
    
    # Tablas en orden (respetando dependencias)
    tables = [
        ('audit_types', ['id', 'name', 'description'], 'id'),
        ('users', ['id', 'email', 'password_hash', 'full_name', 'role', 'created_at'], 'id'),
        ('audits', ['id', 'audit_type_id', 'date', 'branch', 'auditor_name', 
                    'auditor_email', 'start_time', 'end_time', 'total_score', 
                    'max_score', 'percentage', 'status', 'created_at', 'updated_at'], 'id'),
        ('audit_questions', ['id', 'audit_id', 's_name', 'question_text', 'weight',
                              'response_percent', 'points_earned', 'observation'], 'id'),
        ('surveys', ['id', 'department', 'area', 'site', 'type', 'period', 'period_name',
                      'year', 'quarter', 'efficiency', 'communication', 'technical_quality',
                      'added_value', 'global_experience', 'internal_satisfaction',
                      'external_satisfaction', 'created_at'], 'id'),
        ('audit_schedule', ['id', 'title', 'audit_type_id', 'branch', 'scheduled_date',
                             'scheduled_time', 'priority', 'status', 'assigned_auditor_id',
                             'created_by', 'created_at', 'updated_at'], 'id'),
    ]
    
    print("\n Migrando tablas...")
    total = 0
    
    for table_name, columns, conflict_col in tables:
        if table_exists(pg_conn, table_name):
            print(f"\n Tabla: {table_name}")
            count = migrate_table(sqlite_conn, pg_conn, table_name, columns, conflict_col)
            total += count
        else:
            print(f"\n  Tabla {table_name} no existe en PostgreSQL")
            print("   Asegúrate de haber creado las tablas primero")
    
    # Cerrar conexiones
    sqlite_conn.close()
    pg_conn.close()
    
    print("\n" + "=" * 60)
    print(f" MIGRACIÓN COMPLETADA")
    print(f"   Total registros migrados: {total}")
    print("=" * 60)
    
    print("\n Verifica en Render:")
    print("   1. Ve a tu base de datos en el dashboard")
    print("   2. Haz clic en 'Connect' → 'External Connection'")
    print("   3. Ejecuta: SELECT COUNT(*) FROM audits;")
    print("   4. SELECT COUNT(*) FROM users;")

if __name__ == "__main__":
    main()