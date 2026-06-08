# Auditoria5S — Context Notes

> Última actualización: 2026-06-08

---

## Descripción del proyecto

Sistema fullstack de **gestión de auditorías 5S, encuestas de satisfacción y gestión de proyectos** para uso empresarial interno. Permite registrar auditorías periódicas, analizar resultados, programar actividades y gestionar proyectos con tableros Kanban, sprints y seguimiento de tiempo.

---

## Stack tecnológico

| Capa | Tecnología |
|------|------------|
| Frontend | React 18.3 + Vite 5.4 + TailwindCSS 3.4 |
| Backend | FastAPI + SQLAlchemy 2.0 |
| Base de datos | SQLite (dev) / PostgreSQL (prod) |
| Auth | JWT (HS256) + bcrypt |
| Estado global | React Context + TanStack React Query |
| Formularios | react-hook-form + zod |
| Gráficas | Recharts |
| Exportación | jspdf + html2canvas (PDF), openpyxl (Excel) |
| Íconos | lucide-react |
| HTTP | axios |

---

## Estructura de carpetas

```
Auditoria5S/
├── backend/
│   ├── app/
│   │   ├── api/            # Routers FastAPI
│   │   ├── core/           # Config, DB, seguridad, dependencias
│   │   ├── models/         # Modelos SQLAlchemy
│   │   ├── schemas/        # Schemas Pydantic
│   │   └── services/       # Lógica de negocio
│   ├── data/               # Archivos .db SQLite
│   ├── uploads/            # Archivos subidos
│   ├── main.py
│   └── requirements.txt
├── frontend/
│   └── src/
│       ├── components/     # Componentes reutilizables
│       ├── pages/          # Páginas/vistas
│       ├── services/       # Llamadas a API
│       ├── hooks/          # Custom hooks
│       ├── store/          # AuthContext
│       ├── utils/          # cn.js, format.js
│       ├── App.jsx
│       └── main.jsx
├── IMPLEMENTATION_NOTES.md
├── CONTEXT_NOTES.md        # este archivo
└── README.md
```

---

## Configuración y variables de entorno

**Backend `.env`**
```
NOTIFICATIONS_ENABLED=false
SMTP_HOST=smtp.office365.com
SMTP_USER=emely_gomez@cecomsa.com
APP_URL=http://localhost:5173
# SECRET_KEY, DATABASE_URL, etc. (ver config.py)
```

**Core config** (`backend/app/core/config.py`):
- `DATABASE_URL`: SQLite por defecto, PostgreSQL en prod
- `SECRET_KEY`, `ALGORITHM=HS256`, token expiry 8h
- CORS: `localhost:5173`, `localhost:3000`

**Frontend** (`frontend/tailwind.config.js`):
- Colores: `primary #0A4F79`, `secondary #B4427F`, `success #98C062`, `warning #EA9947`, `danger #DF4585`
- Fuentes: DM Sans, DM Mono

---

## Comandos para levantar el proyecto

```bash
# Backend
cd backend
.\venv\Scripts\Activate   # Windows
uvicorn main:app --reload

# Frontend
cd frontend
npm run dev
```

- API base: `http://localhost:8000/api/v1`
- App: `http://localhost:5173`

---

## Módulos del sistema

### 1. Autenticación
- Login JWT con refresh token
- Roles: admin / usuario regular
- Hook `useAuth.js` + `AuthContext.jsx` para estado global
- Archivos: `backend/app/api/auth.py`, `frontend/src/services/auth.js`, `frontend/src/store/AuthContext.jsx`

### 2. Auditorías 5S
Registro, edición y análisis de auditorías 5S con imágenes adjuntas.

**Tipos de auditoría disponibles:** incluye Mobiliario y tipos configurables desde la BD.

**Páginas:**
- `AuditsPage.jsx` — listado y filtros
- `AuditFormPage.jsx` — crear/editar, con selector de usuario asignado y manejo normalizado de fechas
- `AuditDetailPage.jsx` — detalle con galería de imágenes
- `AuditAnalysisPage.jsx` — análisis e insights

**Campos de auditoría importantes:**
- `period_month` y `period_year` — periodo de la auditoría
- `audit_date` — fecha de realización
- Asignado a un usuario específico

**Backend:** `backend/app/api/audits.py`, `backend/app/models/audit_models.py`

### 3. Encuestas de Satisfacción
- Gestión de encuestas con importación de datos
- Dashboard dedicado `DashboardSurveys.jsx`
- Visualizaciones: gauge, heatmap, cuadrante, gap chart
- Backend: `backend/app/api/surveys.py`, service `backend/app/services/survey_service.py`

### 4. Dashboards y Análisis
- `DashboardAudits.jsx` — KPIs de auditorías, gráfico radar 5S, evolución temporal
- `DashboardSurveys.jsx` — satisfacción por área/categoría
- `HomePage.jsx` — resumen general con auditorías próximas y actividad reciente
- Componentes de gráficas en `frontend/src/components/Dashboard/`

### 5. Programación (Schedule)
- Calendario de auditorías programadas
- `SchedulePage.jsx` con `CreateEventModal.jsx`
- Los programas incluyen `period_month` y `period_year`
- Backend: `backend/app/api/schedule.py`, `backend/app/models/schedule_models.py`

### 6. Gestión de Proyectos
Sistema completo de PM con Kanban y sprints.

**Páginas:**
- `ProjectsListPage.jsx` — listado con filtros
- `ProjectDetailPage.jsx` — detalle con pestañas: Tablero, Sprints, Archivos, etc.
- `ProductivityDashboard.jsx` — métricas de equipo
- `TimeReportPage.jsx` — reporte de tiempo

**Componentes clave:**
- `KanbanBoard.jsx` — tablero drag-and-drop
- `TaskModal.jsx` — crear tarea rápida
- `TaskDetailModal.jsx` — modal expandido con 5 pestañas (ver sección de Tareas Avanzadas)
- `BurndownChart.jsx` — gráfico burndown de sprint
- `ProjectAttachmentsGallery.jsx` — galería de todos los archivos del proyecto

### 7. Tareas Avanzadas
Implementadas en `IMPLEMENTATION_NOTES.md`. Resumen:

| Característica | Descripción |
|---|---|
| Adjuntos | Upload de archivos por tarea, galería centralizada |
| Asignados múltiples | Varios usuarios por tarea |
| Estimación de tiempo | Horas estimadas vs. registradas (barra de progreso) |
| Etiquetas | Categorización flexible |
| Relaciones | depends_on, blocks, relates_to, duplicates, is_subtask_of |
| Actividad | Historial automático de todos los cambios |
| Campos personalizados | Por proyecto: texto, número, select, fecha, checkbox, textarea |
| Registro de tiempo | Manual, con descripción |

**`TaskDetailModal.jsx`** tiene 5 pestañas: Detalles / Actividad / Adjuntos / Relaciones / Tiempo

### 8. Reportes
Exportación a PDF y Excel desde `ReportsPage.jsx`.

**Componentes PDF:**
- `AuditPDFContent.jsx`
- `SurveysPDFContent.jsx`
- `ProjectPDFContent.jsx`
- `ProductivityPDFContent.jsx`
- `ReportPDFContent.jsx`

Lógica centralizada en `frontend/src/services/reportService.js`.

### 9. Usuarios
- `UsersPage.jsx` — gestión de usuarios (crear, editar, roles)
- `UserActivityModal.jsx` — actividad de un usuario
- Backend: `backend/app/models/user_models.py` — campos: id, email, full_name, password_hash, role, is_active

---

## Modelos de base de datos

### Auditorías
```
AuditType         id, name, description
Audit             id, type_id, audit_date, period_month, period_year, assigned_user_id, ...
AuditQuestion     id, audit_id, ...
AuditAttachment   id, audit_id, file_path, ...
AuditSchedule     id, period_month, period_year, ...
```

### Encuestas
```
Survey            id, ...
```

### Proyectos
```
Project           id, name, description, status, ...
ProjectMember     project_id, user_id, role
Sprint            id, project_id, name, start_date, end_date, status
Board             id, project_id
BoardColumn       id, board_id, name, order
Task              id, project_id, column_id, sprint_id, title, description, status, priority, ...
TaskAssignee      task_id, user_id
TaskComment       id, task_id, user_id, content
TimeLog           id, task_id, user_id, hours, description
ProjectAuditLink  project_id, audit_id
```

### Tareas avanzadas
```
TaskAttachment    id, task_id, user_id, filename, file_path, file_size, mime_type
TaskActivity      id, task_id, user_id, action, field_changed, old_value, new_value
TaskRelation      id, task_id, related_task_id, relation_type
TaskCustomField   id, project_id, name, field_type, options, required, active
TaskCustomValue   id, task_id, custom_field_id, value
```

### Usuarios
```
User              id, email, full_name, password_hash, role, is_active, created_at, updated_at
```

---

## API endpoints principales

**Base:** `http://localhost:8000/api/v1`

| Recurso | Métodos |
|---|---|
| `/auth/login` `/auth/me` | POST, GET |
| `/audits/` `/audits/{id}` | GET, POST, PUT, DELETE |
| `/surveys/` `/surveys/{id}` | GET, POST, PUT |
| `/schedule/` `/schedule/{id}` | GET, POST, PUT |
| `/projects/` `/projects/{id}` | GET, POST, PUT, DELETE |
| `/projects/{id}/members` | GET, POST, PUT, DELETE |
| `/projects/{id}/sprints` | GET, POST, PUT, DELETE + start/complete |
| `/projects/{id}/board` + columns | GET, POST, PUT, DELETE |
| `/projects/{id}/tasks` `/tasks/{tid}` | GET, POST, PUT, DELETE + move |
| `/projects/{id}/tasks/{tid}/attachments` | GET, POST, DELETE |
| `/projects/{id}/tasks/{tid}/activity` | GET |
| `/projects/{id}/tasks/{tid}/relations` | GET, POST, DELETE |
| `/projects/{id}/tasks/{tid}/time` | GET, POST |
| `/projects/{id}/tasks/{tid}/comments` | POST |
| `/projects/{id}/custom-fields` | GET, POST, PUT, DELETE |
| `/projects/{id}/tasks/{tid}/custom-values` | GET, POST |
| `/projects/{id}/attachments` | GET (todas del proyecto) |
| `/projects/{id}/audit-links` | GET, POST, DELETE |
| `/projects/{id}/kpis` | GET |

---

## Servicios frontend

| Archivo | Propósito |
|---|---|
| `services/api.js` | Instancia axios con interceptor JWT |
| `services/auth.js` | login, getMe |
| `services/audits.js` | CRUD auditorías |
| `services/surveys.js` | CRUD encuestas |
| `services/schedule.js` | CRUD programaciones |
| `services/projects.js` | CRUD proyectos, tareas, adjuntos, relaciones, campos personalizados |
| `services/reportService.js` | Generación de reportes PDF/Excel |

---

## Componentes reutilizables destacados

| Componente | Uso |
|---|---|
| `GlassCard.jsx` | Card con estilo glass-morphism (usado en toda la app) |
| `ConfirmModal.jsx` | Diálogo de confirmación genérico |
| `FilterBar.jsx` | Controles de filtro reutilizables |
| `ExportButton.jsx` | Botón de exportación PDF/Excel |
| `StableDateInput.jsx` | Input de fecha aislado para evitar re-renders |
| `DateSelectPicker.jsx` | Selector de fecha tipo dropdown |
| `MonthYearPicker.jsx` | Selector mes/año |
| `KPICard.jsx` | Tarjeta de indicador clave |

---

## Hooks personalizados

| Hook | Propósito |
|---|---|
| `useAuth.js` | Accede al contexto de autenticación |
| `useFilters.js` | Manejo de estado de filtros |

---

## Notas de implementación importantes

1. **Manejo de fechas**: `StableDateInput` está aislado para evitar re-renders no deseados al escribir fechas. `AuditFormPage` normaliza las fechas de auditoría para consistencia.

2. **Archivos subidos**: Se guardan en `backend/uploads/projects/`. En producción se debe integrar con S3 o almacenamiento externo.

3. **Relaciones entre tareas**: El backend previene auto-referencias (una tarea no puede relacionarse consigo misma).

4. **Actividad automática**: Cada cambio en una tarea se registra en `TaskActivity` — útil para auditorías y reportes.

5. **Campos personalizados**: Scoped por proyecto — cada proyecto puede tener sus propios campos adicionales en tareas.

6. **Base de datos**: `auditoria5s.db` es la principal; `auditorias.db` es un archivo legado. Hay un script `scripts/migrate_to_postgres.py` para migración a PostgreSQL.

7. **Seguridad**: El token JWT expira en 8h. La dependencia `require_admin()` protege rutas de administración.

8. **CORS**: Configurado para `localhost:5173` y `localhost:3000`. Ajustar en `config.py` para producción.

---

## Archivos de configuración relevantes

| Archivo | Propósito |
|---|---|
| `backend/app/core/config.py` | Settings centralizados (DB URL, JWT, SMTP, CORS) |
| `backend/app/core/database.py` | Setup SQLAlchemy, `get_db()`, `init_db()` |
| `backend/app/core/security.py` | `hash_password`, `verify_password`, `create_access_token` |
| `backend/app/core/dependencies.py` | `get_current_user`, `require_admin` |
| `backend/app/core/seed.py` | Datos iniciales de la BD |
| `frontend/vite.config.js` | Config Vite + PostCSS |
| `frontend/tailwind.config.js` | Colores, fuentes, sombras personalizadas |
| `.claude/settings.json` | Permisos y configuración de Claude Code |

---

## Estado del repositorio (2026-06-08)

Rama activa: `main`

Commits recientes:
- `bfc2ff1` — Normalización de manejo de fechas en auditorías, restauración del dropdown de usuario asignado en `AuditFormPage`
- `a77327e` — Campos `period_month` y `period_year` en auditorías y schedules
- `e6d8b9f` — Tracking de actividad de usuario y reportes
- `d2f02b6` — Componente `StableDateInput` para manejo aislado de fechas
- `835850a` — Tipo de auditoría Mobiliario con su checklist
