# Auditoria5S — Context Notes

> Última actualización: 2026-09-25 (rama `feature/servicio-wow-reportes`, sobre `90f652d`)

---

## Descripción del proyecto

Sistema fullstack interno de Cecomsa ("Mejora Continua") para **auditorías 5S**, **encuestas de satisfacción** y el programa **Servicio WOW 2026**: registro y análisis de auditorías periódicas, planes de acción, análisis con IA, calendario de auditorías, reportes de presentación departamental, dashboards, y encuestas WOW (Microsoft Forms) con asignación de evaluadores y nominación a "Embajador del Servicio WOW".

> El antiguo módulo de **Proyectos / Kanban / Sprints / Productividad / Reporte de Horas fue eliminado** (commit `1841f8e`) y sus tablas se dropearon con la migración Alembic `a87b19768895`. `IMPLEMENTATION_NOTES.md` todavía lo describe: es histórico.

---

## Stack tecnológico

| Capa | Tecnología |
|------|------------|
| Frontend | React 18.3 + Vite 5.4 + TailwindCSS 3.4 + react-router-dom 7 |
| Backend | FastAPI 0.115 + SQLAlchemy 2.0 (estilo `Mapped`/`mapped_column`) + Pydantic 2 |
| Base de datos | SQLite local (`backend/data/auditoria5s.db`) / PostgreSQL en Supabase (prod) |
| Migraciones | Alembic 1.13 (desde commit `315c656`) |
| Archivos | Supabase Storage (bucket `audit-attachments`) con fallback a disco `backend/uploads/` |
| IA | Anthropic API vía proxy backend (`ANTHROPIC_API_KEY`, nunca expuesta al frontend) |
| Auth | JWT (HS256, python-jose) + bcrypt (passlib), bloqueo por intentos fallidos |
| Estado frontend | React Context (Auth, Theme) + TanStack React Query 5 |
| Formularios | react-hook-form + zod |
| Gráficas | Recharts 3 |
| Exportación | jspdf + html2canvas (PDF), openpyxl (Excel, backend) |
| Íconos / HTTP | lucide-react / axios |

---

## Estructura de carpetas

```
Auditoria5S/
├── .github/workflows/supabase-heartbeat.yml   # ping cada 2 días para que Supabase no se pause
├── backend/
│   ├── alembic/                # env.py + versions/ (migraciones)
│   ├── alembic.ini
│   ├── app/
│   │   ├── api/                # Routers FastAPI (cada uno declara su prefix)
│   │   ├── core/               # config, database, security, dependencies, seed
│   │   ├── models/             # base.py (Base + TimestampMixin) + modelos
│   │   ├── schemas/            # Pydantic
│   │   └── services/           # Lógica de negocio (import Excel, análisis, email, storage)
│   ├── data/                   # SQLite local (fuera de Git)
│   ├── scripts/                # utilidades sueltas (migrate_to_postgres, clear_schedule, ...)
│   ├── uploads/                # fallback local de adjuntos
│   └── main.py
├── frontend/src/
│   ├── components/             # Layout/, Common/, Dashboard/, Audits/, Surveys/, ReportEditor/, Reports/, Schedule/, Users/
│   ├── pages/
│   ├── services/               # api.js (axios) + un archivo por dominio
│   ├── hooks/                  # useAuth, useFilters, useChartColors
│   ├── store/                  # AuthContext, ThemeContext
│   └── utils/                  # cn.js, format.js
├── scripts/                    # start_backend.ps1, start_frontend.ps1, backup_data.ps1
├── CONTEXT_NOTES.md            # este archivo
└── IMPLEMENTATION_NOTES.md     # histórico (módulo de Proyectos, ya eliminado)
```

---

## Configuración y variables de entorno

**Backend `.env`** (cargado por `python-dotenv` en `app/core/config.py`):
```
DATABASE_URL=              # vacío → sqlite:///./data/auditoria5s.db ; prod → postgresql://... (Supabase)
SECRET_KEY=                # si falta, se genera una al arrancar (tokens mueren al reiniciar)
ACCESS_TOKEN_EXPIRE_HOURS=8
LOGIN_MAX_ATTEMPTS=5
LOGIN_LOCKOUT_MINUTES=15
CORS_ORIGINS=http://localhost:5173        # leído en main.py, separado por comas
NOTIFICATIONS_ENABLED=false
SMTP_HOST / SMTP_PORT / SMTP_USER / SMTP_PASSWORD / SMTP_FROM / APP_URL
ADMIN_EMAIL / ADMIN_PASSWORD / ADMIN_NAME # admin del seed
ANTHROPIC_API_KEY=
SUPABASE_URL= / SUPABASE_SERVICE_KEY= / SUPABASE_STORAGE_BUCKET=audit-attachments
```

**Frontend**: `VITE_API_URL` (default `http://localhost:8000/api/v1`).

**Tailwind** (`frontend/tailwind.config.js`):
- Semánticos fijos: `success #98C062`, `warning #EA9947`, `danger #DF4585`, `secondary #B4427F`
- `ink` y `primary` dinámicos vía variables CSS (`--color-ink-rgb`, `--accent-rgb-tw`)
- Dark mode: `darkMode: ["selector", "[data-theme='dark']"]`
- Fuentes: DM Sans, DM Mono
- Clases utilitarias globales en `index.css`: `glass`, `glass-dark`, `btn-primary`, `btn-secondary`, `btn-ghost`, `input-glass`, `animate-fade-up`, `blobs`

---

## Comandos

```bash
# Backend
cd backend
.\venv\Scripts\Activate
uvicorn main:app --reload          # http://localhost:8000/docs

# Frontend
cd frontend
npm run dev                        # http://localhost:5173

# Alembic (siempre desde backend/, usa el DATABASE_URL del entorno)
alembic heads
alembic current
alembic revision --autogenerate -m "mensaje"
alembic upgrade head
```

API base: `http://localhost:8000/api/v1`

---

## Base de datos y migraciones

- **Estrategia**: SQLite local para desarrollo, Supabase (Postgres) solo para producción. No compartir instancia (riesgo de scripts destructivos).
- `app/models/base.py`: `Base(DeclarativeBase)` + `TimestampMixin` (`created_at`/`updated_at`, `DateTime(timezone=True)`, `server_default=func.now()`).
- `app/core/database.py`: `engine` (pool distinto para SQLite/Postgres, `PRAGMA foreign_keys=ON` + WAL en SQLite), `SessionLocal`, `get_db()` (hace `commit()` al terminar la request y `rollback()` si hay excepción), `init_db()` y `verify_connection()`.
- **`init_db()` corre en el arranque** (`main.py` → lifespan) y hace `Base.metadata.create_all()`: cualquier modelo nuevo registrado en `app/models/__init__.py` se crea automáticamente al levantar la app, aunque la migración no se haya aplicado.
- **Alembic**:
  - `alembic/env.py` toma `DATABASE_URL` de `app.core.database`, importa `app.models` para autogenerate, `compare_type=True`, e ignora la tabla de infraestructura `heartbeat` (`INFRA_TABLES_TO_IGNORE`).
  - Cadena: `ab473d0bb07e` (baseline vacío, se aplica con `alembic stamp`) → `a87b19768895` (drop de tablas fantasma de Proyectos, irreversible) → `a02167765d41` (crea las 13 tablas del Servicio WOW) → `7d6b178c39bb` (Fase 2: `employees.roster_order`, `survey_wow_forms.nominees`, `sampling_configs.permitir_repetir`) → `b3f1c9d2e4a7` (tabla `survey_wow_report_drafts`). Todas aditivas. **Head actual: `b3f1c9d2e4a7`**, aplicada en la SQLite local el 2026-09-25 (respaldos en `backend/data/auditoria5s.backup-*.db`); **NO aplicada en Supabase** hasta el próximo deploy a Render (que corre `alembic upgrade head` al arrancar).
  - La SQLite local ya está versionada (`alembic current` = head) y sin las tablas de Proyectos.
  - `autogenerate` contra la SQLite local propone además cambios sobre `audit_attachments` (tipo de `is_external`, FKs sin ondelete): desviación preexistente de la BD local, no de los modelos. Quitarlos a mano de cualquier migración nueva.

### Modelos vigentes
```
User             users              id, email, full_name, password_hash, role (admin|auditor), is_active,
                                    failed_login_attempts, locked_until, created_at, updated_at
AuditType        audit_types        catálogo (Almacenes, Centro de Servicios, RMA, Mobiliario, ...)
Audit            audits             audit_type_id, branch, audit_date, period_month, period_year, auditor,
                                    percentage, status, puntajes por S, ...  (UQ tipo+sucursal+fecha+auditor)
AuditQuestion    audit_questions    una fila por pregunta del checklist (CASCADE)
AuditAttachment  audit_attachments  imágenes (Supabase Storage o disco), user_id SET NULL
AuditActionPlan  audit_action_plans pasos del plan de acción (pendiente|en_progreso|completado)
ReportDraft      report_drafts      borrador JSON del reporte de presentación (UQ tipo+mes+año)
Survey           surveys            encuestas agregadas por tipo+depto+sede+período, dimensiones Numeric(5,4) escala 0-1
AuditSchedule    audit_schedule     calendario de auditorías con period_month/period_year y auditor asignado
```

### Modelos Servicio WOW 2026 (`survey_wow_models.py`, `evaluator_models.py`)
```
SurveyCycle          survey_wow_cycles       "Servicio WOW 2026"
SurveyDepartment     survey_wow_departments  19 deptos, group_name = sección de 'Resultados Generales' ("Total Empresa" = sin sección propia)
SurveyCriteria       survey_wow_criteria     6 criterios de la rúbrica interna
SurveyForm           survey_wow_forms        77 formularios (41 internos con list_name + 36 externos)
SurveyQuestion       survey_wow_questions    se crean desde los encabezados del 1er Excel importado
SurveyResponse       survey_wow_responses    ANÓNIMA (sin nombre/correo), dedupe por ID de Forms
SurveyAnswer         survey_wow_answers      value_score 1-5 / value_text
SurveyNomination     survey_wow_nominations  solo internos
WowReportDraft       survey_wow_report_drafts borrador JSON del reporte de resultados (UQ ciclo+depto); NO guarda resultados
EvaluatorArea        evaluator_areas         estratos del muestreo
Employee             employees               roster; name_key normalizado = clave de upsert
SamplingConfig       sampling_configs        constantes del script (sin nombres propios)
ScheduleEntry        schedule_entries        una LISTA de evaluación (ej 'CAJA – Gurabo'), fechas por 'No.' del Cronograma
EvaluationAssignment evaluation_assignments  titular/suplente, pendiente/completo; SIN enlace a la respuesta
```
Campos de la Fase 2: `Employee.roster_order` (fila del listado vigente; NULL = no participa en el sorteo), `SurveyForm.nominees` (JSON), `SamplingConfig.permitir_repetir` (JSON).
Tipos enumerados guardados como `String` (valores de Enum de Python), no `sa.Enum`, para no crear ENUMs nativos en Postgres.

---

## Módulos del sistema

### 1. Autenticación y usuarios
- Login JWT, `/auth/me`, cambio de contraseña, registro/edición/desactivación (soft delete) de usuarios, actividad por usuario.
- Bloqueo de cuenta tras `LOGIN_MAX_ATTEMPTS` fallos durante `LOGIN_LOCKOUT_MINUTES`; el admin puede resetear contraseñas.
- Roles: `admin` / `auditor`. Dependencias `get_current_user` y `require_admin` en `core/dependencies.py`.
- Frontend: `AuthContext.jsx`, `useAuth.js`, `Login.jsx`, `UsersPage.jsx`, `UserActivityModal.jsx`.

### 2. Auditorías 5S
- `AuditsPage.jsx` (listado paginado, filtros multiselección tipo/sucursal/año + trimestre/mes, exportar Excel resumen/detalle, importar Excel, "Copiar para Claude.ai"), `AuditFormPage.jsx`, `AuditDetailPage.jsx` (galería), `AuditAnalysisPage.jsx`.
- Backend: `api/audits.py` (CRUD, KPIs, catálogos `/types` `/branches` `/period-years`, import/export, adjuntos, análisis, tendencia por sucursal), `services/audit_service.py`.
- Adjuntos: `services/storage_service.py` → Supabase Storage si hay credenciales, si no disco local.

### 3. Planes de acción e IA
- `api/audit_analysis.py` (prefix `/audits`): CRUD de `AuditActionPlan` y endpoints proxy hacia Claude para generar hallazgos/conclusiones.
- `services/audit_analysis_service.py`; frontend `services/auditAnalysis.js`.

### 4. Encuestas de Satisfacción
- `SurveysPage.jsx` + `DashboardSurveys.jsx` (gauge, heatmap, cuadrante, gap chart).
- Backend: `api/surveys.py` (`/export`, `/years`, `/kpis`, `/import`, CRUD), `services/survey_service.py` (import desde `Satisfaccion_Estructura_Mejorada.xlsx`, hoja `Hechos_Satisfaccion`), `schemas/survey_schemas.py`.
- Semáforo de satisfacción: ≥90% Excelente, ≥80% Aceptable, <80% Crítico (distinto al de 5S: ≥80 Cumple, ≥60 Por mejorar).

### 5. Calendario
- `SchedulePage.jsx` + `CreateEventModal.jsx`; backend `api/schedule.py` (CRUD + PATCH de estado).
- `api/schedule_new_endpoints_2.py` (`/schedule/upcoming`, `/schedule/send-reminders`) **no está registrado en `main.py`** — código huérfano.

### 6. Reportes
- `ReportsPage.jsx` — exportación PDF/Excel (`services/reportService.js`, componentes en `components/Reports/`).
- Reporte de presentación departamental: `ReportPreparation.jsx` → `ReportEditor.jsx` (ruta full-bleed fuera de `AppLayout`, con `components/ReportEditor/`). Backend `api/reports_presentation.py` (prefix `/reports`: datos, borrador `ReportDraft`, IA).

### 7. Servicio WOW 2026
- Plan original: `Plan de Implementación — Servicio WOW 2026 (prompt para Claude Code).md` (raíz). Fase 1 y **Fase 2 implementadas** (el sorteo de evaluadores corre dentro de la app). Las reglas de muestreo confirmadas (p. ej. Caja = 5 evaluadores por entidad: Gerente de Negocios + 2 Ejecutivos de ventas Tienda + 2 Consultores SMB; OP = Gerente + 4 SMB) están en la sección Fase 2 de ese plan.
- Fuentes reales (fuera del repo): `Downloads/txt_output/` (77 .txt de Forms, `Servicio_WOW_2026_Evaluadores.xlsx`, `asignar_evaluadores_wow.py`) y los exports de respuestas de Forms.
- Catálogo sembrado al arrancar por `core/seed_servicio_wow.py` (ciclo, criterios, SamplingConfig, deptos, 77 formularios).
- Consolidación (Resultados Generales): todos los deptos cuentan en el Total Empresa; Inventario y Call Center solo ahí (`group_name = "Total Empresa"`); Caja y Proyectos tienen sección propia desglosada por sucursal / región (Santiago y Santo Domingo).
- **PostgreSQL ≠ SQLite**: no agrupar por una entidad completa (`db.query(SurveyForm, func.count(...)).group_by(SurveyForm.id)`): la relación cargada con JOIN mete columnas fuera del GROUP BY y Postgres da 500 (SQLite lo tolera). Contar por id y cargar los objetos aparte (`_responses_by_form`). Para probar contra Postgres real en local: `pgserver` (PostgreSQL embebido, pip) instalado en una carpeta aparte.
- **Supabase / Render**: el Start Command de Render es `alembic upgrade head && uvicorn main:app --host 0.0.0.0 --port $PORT`, así que las migraciones se aplican solas en cada deploy, ANTES de que arranque la app (y de su `create_all`). No hay que ejecutar SQL a mano en Supabase; hacerlo chocaría con Alembic. Los datos del módulo (Excel de evaluadores, listado, nominados, configuración, cierres) se cargan en prod desde la UI.
- Importadores: `services/survey_wow_import_service.py` (Excel de Forms por formulario; descarta nombre/correo tras marcar al evaluador como completo; traduce etiquetas Likert de la matriz externa; la 1ª importación crea las preguntas y exige que el nombre del archivo corresponda al formulario, si no 409 → `forzar=true`) y `services/evaluator_import_service.py` (hojas Cronograma + Evaluadores + columna 'Muestra requerida' de Resumen_Muestra; reemplaza pendientes, conserva completos).
- Lectura: `services/survey_wow_service.py` (dashboard interno por criterio, externo por pregunta, nominaciones) y `services/evaluator_service.py` (Matriz_Participacion y Resumen_Muestra calculadas).
- **Resultados en %**: puntos obtenidos / (respuestas × 5) × 100 (5 en todo = 100 %, 1 en todo = 20 %). Semáforo ≥90 % Excelente, ≥80 % Aceptable, <80 % Crítico (mismos cortes que Encuestas). Constantes en `survey_wow_service.py`; los endpoints devuelven `porcentaje` y también `promedio` 1-5 como referencia.
- **Sorteo (Fase 2)**: `services/sampling_service.py` (motor, port línea por línea del script) + `services/sampling_rules.py` (definición declarativa de las 37 evaluaciones, clasificación de personal y regla de Caja; sin nombres propios). Entradas: listado de personal (`Employee.roster_order`, se importa con `roster_import_service.py`), nominados por formulario (`SurveyForm.nominees`, desde los .txt), asignaciones actuales como "versión previa", `SamplingConfig` (semilla, topes, `personas_excluidas`, `evitar_repeticion`, `permitir_repetir`). Flujo vista previa → token → confirmar; nunca toca asignaciones completadas ni listas `is_closed` (GH, Compras y Finanzas están cerradas). Verificado: con las mismas entradas produce exactamente las mismas 540 filas que el script (re-sorteo de Caja y de todas las pendientes).
- **Prioridad de líderes en el sorteo** (25/09/2026, mismo parche en `asignar_evaluadores_wow.py`): `RX_LIDER_SORTEO` + `PESO_LIDER` en `sampling_rules.py` (distinto de `RX_LIDER`, que solo usan las sugerencias de "Solo líderes"). En el reparto de cupos cada líder pesa 3; dentro del área se elige primero un líder y luego a quien tenga menos carga (va *antes* que la carga: puede repetir líderes aunque haya gente sin encuestas). TI se re-sorteó con esta regla (22 cambios) en la SQLite local y en `Downloads/txt_output/Servicio_WOW_2026_Evaluadores.xlsx`. Paridad con el script: idéntica salvo que el script re-ajusta FINANZAS (no la tiene en `ENCUESTAS_CERRADAS`) y la app no (está `is_closed`).
- **Ampliar una lista ya enviada / seguimiento**: `candidatos_adicionales` y `agregar_evaluadores` en `sampling_service.py` (endpoints `GET /schedule/{id}/candidatos`, `POST /schedule/{id}/assignments`; `PATCH`/`DELETE /assignments/{id}` para marcar respondió a mano o quitar pendientes). No re-sortea: sugiere N elegibles con las mismas reglas (líderes = `RX_LIDER`), **solo de las áreas que evalúan ese departamento** (`estratos_evaluadores`: los `pools` de la evaluación en `sampling_rules`; "TODOS" = cualquier área salvo la propia; Caja = los puestos comerciales de la propia entidad), una por área evaluadora primero; la asignación agregada queda con su estrato como `evaluator_area` y agregar a alguien de fuera de esas áreas solo avisa, y agrega titulares pendientes aunque la lista esté cerrada. El import del Excel del script ya no borra pendientes de listas cerradas (para no perder a los agregados a mano). En Asignaciones, al elegir una lista: respondieron/faltan, “Ver solo faltantes”, “Copiar faltantes”, “Agregar evaluadores”. Los modales dentro de la GlassCard se montan con `createPortal` (el backdrop-filter ancla los `fixed` a la tarjeta).
- Frontend: `pages/ServicioWow/` (Formularios, Respuestas, Dashboard, Evaluadores con pestañas Sorteo y Configuración), `components/ServicioWow/` (WowImportModal, NomineesUploadModal, SorteoPanel, SamplingConfigPanel, EstadoBadge, wowUtils), `services/surveyWow.js`, `services/evaluators.js`. Grupo colapsable en `Sidebar.jsx` (`NAV_GROUPS`, estado en localStorage `nexus-sidebar-groups`).

- **Reportes de resultados** (2026-09-25): `/servicio-wow/reportes` (`WowReportPreparation.jsx`) → `/servicio-wow/reportes/editor` (`WowReportEditor.jsx`, full-bleed, reutiliza `ControlBar`/`ReportSidebar` del editor 5S sin tocarlos). Por (departamento, ciclo) + sucursal opcional. **Sin endpoint de "datos del reporte"**: `services/wowReports.js` consume `/dashboard/interno`, `/dashboard/externo`, `/nominations` y `/responses` (todos aceptan `cycle_id`, `department_id`, `branch`) + `/forms/{id}` para el texto de cada pregunta interna; `wowReportData.js` arma el modelo sin recalcular % (lo único derivado: "General" = promedio simple interno/externo cuando hay ambos) y pagina preguntas / formularios / sucursales / comentarios en hojas. Dos variantes del mismo modelo: `WowReportDetailed.jsx` (portada, metodología, preguntas, por sucursal, cualitativos, resultado general, colaborador destacado, plan de acción, cierre) y `WowReportSummary.jsx` (una página). Dona compartida con el dashboard: `components/ServicioWow/SatisfactionDonut.jsx`. Diseño: tokens de Claude Design en `wowReportTokens.js`. Borrador: `api/reports_wow.py` (`GET/POST /reports/servicio-wow/draft`, modelo `WowReportDraft`; guarda textos, embajador + foto/citas, plan de acción, fotos del resumen como dataURL reducidos, comentarios ocultos y la sucursal). IA: reutiliza `POST /reports/presentation/ai-generate`. PDF: `wowReportPdf.js` (jspdf + html2canvas sobre `.pdf-page`, cada página del tamaño de su hoja para no recortar).

### 8. Dashboards
- `HomePage.jsx`, `DashboardAudits.jsx`, `DashboardSurveys.jsx`; gráficas en `components/Dashboard/`.

### 9. Theming y layout
- `ThemeContext.jsx`: `theme` (light/dark), `palette` (corp, rosa, azul, morada, verde, naranja, spectrum, negro), `sidebarCollapsed`, `mobileSidebarOpen`/`closeMobileSidebar`. Persiste en `localStorage` y aplica `data-theme`/`data-palette` en `<html>`.
- `useChartColors()` para colores de gráficas; usar `bg-primary`/`text-ink` en vez de hex hardcodeados.
- Shell responsive: en móvil el `Sidebar` es un drawer con backdrop; en escritorio `main` usa `lg:ml-[var(--sidebar-width)]` o `--sidebar-collapsed-width`.
- `Sidebar.jsx`: `NAV` plano + `NAV_GROUPS` colapsables (hoy solo "Servicio WOW 2026") + "Usuarios" solo para admin; cada enlace se pinta con `NavItem`. En modo colapsado el grupo se muestra como separador + íconos.
- `sidebarCollapsed` NO se persiste (es `useState(false)`); `theme`, `palette` y los grupos abiertos sí.

---

## API — routers registrados (`main.py`, todos con `prefix="/api/v1"`)

| Router | Prefix propio | Tag |
|---|---|---|
| `auth.router` | `/auth` | Auth |
| `audits.router` | `/audits` | Auditorías 5S |
| `audit_analysis_router` | `/audits` | Auditorías 5S — Planes de acción e IA |
| `surveys.router` | `/surveys` | Encuestas |
| `schedule.router` | `/schedule` | Calendario |
| `reports_presentation_router` | `/reports` | Reportes — Presentación |
| `reports_wow_router` | `/reports` | Reportes — Servicio WOW |
| `survey_wow.router` | `/servicio-wow` | Servicio WOW — Encuestas |
| `evaluators.router` | `/servicio-wow/evaluadores` | Servicio WOW — Evaluadores |

Además: `GET /` y `GET /health`; `/uploads` montado como `StaticFiles`.

---

## Frontend — rutas (`App.jsx`)

`/login` pública. Dentro de `RequireAuth` → `AppLayout` (blobs + Sidebar + `<main>`):
`/`, `/home`, `/dashboard/audits`, `/dashboard/surveys`, `/audits`, `/audits/new`, `/audits/:id`, `/audits/:id/edit`, `/audits/:id/analysis`, `/surveys`, `/schedule`, `/reports`, `/reports/presentation`, `/users`, `/servicio-wow` (→ dashboard), `/servicio-wow/formularios`, `/servicio-wow/respuestas`, `/servicio-wow/dashboard`, `/servicio-wow/evaluadores`, `/servicio-wow/reportes`.
Fuera de `AppLayout` (full-bleed): `/reports/presentation/editor`, `/servicio-wow/reportes/editor`.

### Servicios frontend
| Archivo | Propósito |
|---|---|
| `api.js` | axios con `baseURL`, token Bearer desde `localStorage`, 401 → `/login` |
| `auth.js` | login, me, usuarios |
| `audits.js` | `auditsService`: CRUD, catálogos, KPIs, import/export, adjuntos, análisis |
| `auditAnalysis.js` | planes de acción + IA |
| `surveys.js` | `surveysService`: KPIs, años, CRUD, import/export |
| `schedule.js` | calendario |
| `reportService.js`, `reportsPresentation.js`, `reportPresentationAI.js` | reportes |
| `surveyWow.js` | `surveyWowService`: catálogos, formularios, import de respuestas, respuestas, dashboards, nominaciones |
| `evaluators.js` | `evaluatorsService`: cronograma, asignaciones, matriz, resumen, config, import |
| `wowReports.js`, `wowReportAI.js` | reportes del Servicio WOW: datos desde los endpoints del dashboard, borrador, IA |

### Patrón de página (ver `AuditsPage.jsx`)
`Header` (title/subtitle/onRefresh) → barra de acciones (`btn-primary`/`btn-secondary`, acciones de admin con `isAdmin` de `useAuth`) → barra de filtros `glass rounded-2xl` con `useFilters` → `GlassCard padding={false}` con tabla, loader `Loader2`, estado vacío y paginación → `ConfirmModal` para borrar. Datos con `useQuery`/`useMutation` + `invalidateQueries`.

---

## Componentes reutilizables

| Componente | Uso |
|---|---|
| `Layout/GlassCard.jsx` | Card glass (`hover`, `padding`, `className`, `onClick`) |
| `Layout/Header.jsx` | Encabezado de página con refresh y selector de tema/paleta |
| `Layout/Sidebar.jsx` | Navegación lateral (colapsable + drawer móvil) |
| `Common/ConfirmModal.jsx` | Confirmación genérica |
| `Common/MultiSelect.jsx` | Selector múltiple para filtros |
| `Common/FilterBar.jsx`, `ExportButton.jsx` | Filtros y exportación |
| `Common/StableDateInput.jsx`, `DateSelectPicker.jsx`, `MonthYearPicker.jsx` | Fechas |
| `Dashboard/KPICard.jsx` + gráficas | Dashboards |

---

## Notas de implementación importantes

1. **Modelos nuevos**: heredar de `TimestampMixin, Base` (`from .base import ...`), registrarlos en `app/models/__init__.py` (para `init_db()` y autogenerate) y crear migración Alembic encadenada al head.
2. **Orden de rutas**: en cada router las rutas estáticas (`/kpis`, `/import`, `/export`, `/years`) van antes de `/{id}`.
3. **Transacciones**: `get_db()` ya hace commit al final, pero los routers/servicios existentes también llaman `db.commit()` explícito (convención actual).
4. **Fechas**: `StableDateInput` aislado para evitar re-renders; `locked_until` y timestamps son timezone-aware.
5. **Adjuntos**: en producción (Render, filesystem efímero) Supabase Storage es obligatorio.
6. **Heartbeat**: la tabla `heartbeat` en Supabase la usa el workflow de GitHub; Alembic la ignora.
7. **Theming**: nuevos componentes con colores de marca deben usar `useChartColors()` o clases `primary`/`ink`.

---

## Estado del repositorio (2026-09-23)

Rama: `main` (limpia). Commits recientes:
- `d1fa03f` — Merge PR #6
- `537872a` — Eliminar script suelto de drop de Proyectos (superseded por Alembic)
- `d69e2f7` — Migración Alembic: dropear tablas fantasma del módulo de Proyectos
- `bbe4ca0` — Integrar Supabase Storage para adjuntos de auditoría
- `da033d3` — Shell responsive: sidebar como drawer móvil
- `243c886` — `locked_until` timezone-aware y excluir tablas de infra en Alembic
- `315c656` — Instalar y configurar Alembic
- `88e363c` — Theme negro
- `e294bd3` — Bloqueo de cuenta por intentos fallidos y reseteo de contraseña por admin
- `1841f8e` — Eliminar módulo de Proyectos, Kanban, Productividad y Reporte de Horas
