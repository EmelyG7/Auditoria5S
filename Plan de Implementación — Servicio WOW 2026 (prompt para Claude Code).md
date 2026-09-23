# Plan de Implementación — Servicio WOW 2026

## Contexto y alcance

**Sistema base:** Auditoria5S (repo `EmelyG7/Auditoria5S`) — FastAPI + SQLAlchemy 2.0 (estilo `Mapped`/`mapped_column`) + Alembic en el backend; React 18 + Vite + TailwindCSS + react-router-dom 7 en el frontend. SQLite en local, PostgreSQL (Supabase) en producción.

**Qué se está agregando:** un módulo nuevo, **Servicio WOW 2026** — programa de encuestas de satisfacción interna/externa por departamento con nominación de "Embajador del Servicio WOW", más el subsistema de programación y asignación de evaluadores que hoy corre como script Python standalone (`asignar_evaluadores_wow.py`).

**Decisiones de alcance ya confirmadas con Emely — no renegociar:**

- Va dentro del mismo repo, como sección nueva. NO es un proyecto separado.
- No se toca el módulo de Encuestas existente (`api/surveys.py`, `services/survey_service.py`, `SurveysPage.jsx`, `DashboardSurveys.jsx`, tabla `surveys`). Ese sistema sigue existiendo tal cual, en paralelo, con su propio semáforo (≥90% Excelente, ≥80% Aceptable, <80% Crítico).
- Las respuestas de encuesta son anónimas por diseño: no se persiste nombre ni correo del respondiente en ninguna tabla. Ver la sección de Servicios de Importación para cómo se concilia esto con el seguimiento de qué evaluador ya respondió.
- La configuración de muestreo de evaluadores (topes, exclusiones, semilla, etc.) se modela en una tabla editable a futuro, pero por ahora se llena fija desde los valores hardcodeados del script — no se construye UI de edición todavía.
- `Matriz_Participacion` y `Resumen_Muestra` (hojas del Excel de Evaluadores) no son tablas — se calculan on-demand (GROUP BY/COUNT sobre `evaluation_assignments`), igual que ya se hace con `Pivot_Sucursal` en el módulo de auditorías 5S.
- Portar el algoritmo de asignación de evaluadores a un servicio invocable desde el backend es el objetivo final, pero es Fase 2 — no se implementa en este primer prompt.

**Fuentes ya analizadas por Emely (no están en el repo — pedírselas si se necesita el detalle exacto):**

- 77 exports de texto de los formularios de Microsoft Forms (interno y externo, uno por depto/sucursal): interno usa una rúbrica fija de 6 criterios Likert 1-5 + comentario + nominación; externo usa 2-3 afirmaciones Likert específicas de cada proceso (no comparables entre departamentos), sin nominación, y Almacén (Despacho/Ruta) agrega 3 campos identificadores extra (Colaborador que asistió, Cliente, Teléfono).
- Un Excel de respuestas real (Gestión Humana, interno): `ID, Hora de inicio, Hora de finalización, Correo electrónico, Nombre, Hora de última modificación, [6 columnas Likert], Comentario, Nominado, Justificación`.
- `Servicio_WOW_2026_Evaluadores.xlsx` (10 hojas: Cronograma, Evaluadores, Matriz\_Participacion, Resumen\_Muestra, Criterios\_Seleccion + hojas de detalle por depto).
- `asignar_evaluadores_wow.py` (912 líneas): motor de muestreo estratificado con exclusión por conflicto de interés, antigüedad mínima, tope de titularidades, no-repetición semanal, semilla fija.

## Modelos SQLAlchemy — `backend/app/models/survey_wow_models.py`

Heredar de `TimestampMixin, Base` (ver `app/models/base.py`), NO redefinir `created_at`/`updated_at`. Registrar cada clase en `app/models/__init__.py` igual que los modelos existentes.

Diseño deliberado: en vez de una columna fija por pregunta (como el parser de 5S que leía `%` del header), cada `SurveyForm` declara sus propias `SurveyQuestion`, y las respuestas son pares pregunta/valor (`SurveyAnswer`). Así Almacén puede tener sus 3 campos identificadores extra sin tocar el schema, y si cambia el texto de una pregunta el año que viene, no hay migración que hacer.

```python
from enum import Enum as PyEnum

from sqlalchemy import (
    Boolean, Column, DateTime, Enum, ForeignKey, Integer, String, Text,
    UniqueConstraint, func,
)
from sqlalchemy.orm import relationship

from .base import Base, TimestampMixin


class SurveyType(str, PyEnum):
    INTERNO = "interno"
    EXTERNO = "externo"


class QuestionType(str, PyEnum):
    LIKERT_5 = "likert_5"        # escala 1-5
    TEXT = "text"                 # comentario libre
    IDENTIFIER = "identifier"     # campo identificador (Colaborador que asistió, Cliente, Teléfono...)


class SurveyDepartment(TimestampMixin, Base):
    __tablename__ = "survey_wow_departments"

    id = Column(Integer, primary_key=True)
    name = Column(String(120), unique=True, nullable=False)      # "Gestión Humana", "RMA", "Almacén"
    group_name = Column(String(120), nullable=True)              # ej. "Corporativo" agrupa 5 sub-áreas
    color = Column(String(7), nullable=True)
    is_active = Column(Boolean, default=True)

    forms = relationship("SurveyForm", back_populates="department")


class SurveyCriteria(TimestampMixin, Base):
    """
    Catálogo de los 6 criterios genéricos de la rúbrica INTERNA (Oportunidad,
    Claridad, Confiabilidad, Empatía, Valor agregado, Satisfacción general).
    Las preguntas externas NO referencian este catálogo -- no son comparables
    entre departamentos (RMA evalúa "diagnóstico", Centro de Servicios evalúa
    "tiempo de reparación").
    """
    __tablename__ = "survey_wow_criteria"

    id = Column(Integer, primary_key=True)
    code = Column(String(40), unique=True, nullable=False)
    order = Column(Integer, nullable=False)
    label = Column(String(80), nullable=False)


class SurveyCycle(TimestampMixin, Base):
    __tablename__ = "survey_wow_cycles"

    id = Column(Integer, primary_key=True)
    name = Column(String(60), unique=True, nullable=False)       # "Servicio WOW 2026"
    year = Column(Integer, nullable=False)
    is_active = Column(Boolean, default=True)


class SurveyForm(TimestampMixin, Base):
    """
    Un formulario desplegable = una fila de txt_output.
    Interno: uno por departamento. Externo: uno por departamento + sucursal
    (+ subprocess para Almacén: Despacho/Ruta).
    """
    __tablename__ = "survey_wow_forms"
    __table_args__ = (
        UniqueConstraint("cycle_id", "department_id", "survey_type", "branch", "subprocess",
                          name="uq_survey_wow_form_identity"),
    )

    id = Column(Integer, primary_key=True)
    cycle_id = Column(Integer, ForeignKey("survey_wow_cycles.id"), nullable=False)
    department_id = Column(Integer, ForeignKey("survey_wow_departments.id"), nullable=False)
    survey_type = Column(Enum(SurveyType), nullable=False)
    branch = Column(String(60), nullable=True)
    subprocess = Column(String(60), nullable=True)
    title = Column(String(200), nullable=False)
    source_filename = Column(String(255), nullable=True)

    department = relationship("SurveyDepartment", back_populates="forms")
    questions = relationship("SurveyQuestion", back_populates="form", order_by="SurveyQuestion.order")
    responses = relationship("SurveyResponse", back_populates="form")


class SurveyQuestion(TimestampMixin, Base):
    __tablename__ = "survey_wow_questions"
    __table_args__ = (
        UniqueConstraint("form_id", "order", name="uq_survey_wow_question_order"),
    )

    id = Column(Integer, primary_key=True)
    form_id = Column(Integer, ForeignKey("survey_wow_forms.id"), nullable=False)
    order = Column(Integer, nullable=False)
    text = Column(Text, nullable=False)
    question_type = Column(Enum(QuestionType), nullable=False)
    criteria_id = Column(Integer, ForeignKey("survey_wow_criteria.id"), nullable=True)   # solo interno
    is_required = Column(Boolean, default=True)

    form = relationship("SurveyForm", back_populates="questions")
    criteria = relationship("SurveyCriteria")


class SurveyResponse(TimestampMixin, Base):
    """ANÓNIMA por diseño: sin nombre ni correo del respondiente. Ver Servicios de Importación."""
    __tablename__ = "survey_wow_responses"
    __table_args__ = (
        UniqueConstraint("form_id", "external_response_id", name="uq_survey_wow_response_dedupe"),
    )

    id = Column(Integer, primary_key=True)
    form_id = Column(Integer, ForeignKey("survey_wow_forms.id"), nullable=False)
    external_response_id = Column(Integer, nullable=False)   # columna "ID" del export de Forms
    started_at = Column(DateTime(timezone=True), nullable=True)
    completed_at = Column(DateTime(timezone=True), nullable=True)

    form = relationship("SurveyForm", back_populates="responses")
    answers = relationship("SurveyAnswer", back_populates="response", cascade="all, delete-orphan")
    nomination = relationship("SurveyNomination", back_populates="response", uselist=False,
                               cascade="all, delete-orphan")


class SurveyAnswer(TimestampMixin, Base):
    __tablename__ = "survey_wow_answers"
    __table_args__ = (
        UniqueConstraint("response_id", "question_id", name="uq_survey_wow_answer_unique"),
    )

    id = Column(Integer, primary_key=True)
    response_id = Column(Integer, ForeignKey("survey_wow_responses.id"), nullable=False)
    question_id = Column(Integer, ForeignKey("survey_wow_questions.id"), nullable=False)
    value_score = Column(Integer, nullable=True)     # 1-5
    value_text = Column(Text, nullable=True)

    response = relationship("SurveyResponse", back_populates="answers")
    question = relationship("SurveyQuestion")


class SurveyNomination(TimestampMixin, Base):
    """Nominación a 'Embajador del Servicio WOW' -- solo aplica a encuestas internas."""
    __tablename__ = "survey_wow_nominations"

    id = Column(Integer, primary_key=True)
    response_id = Column(Integer, ForeignKey("survey_wow_responses.id"), unique=True, nullable=False)
    nominee_name = Column(String(150), nullable=False)
    reason = Column(Text, nullable=True)

    response = relationship("SurveyResponse", back_populates="nomination")
```

**Nota sobre nombres de tabla:** todas con prefijo `survey_wow_` para que no colisionen ni se confundan con la tabla `surveys` del módulo viejo.

## Modelos SQLAlchemy — `backend/app/models/evaluator_models.py`

```python
from enum import Enum as PyEnum

from sqlalchemy import (
    Boolean, Column, Date, DateTime, Enum, ForeignKey, Integer,
    JSON, String, Text, UniqueConstraint, func,
)
from sqlalchemy.orm import relationship

from .base import Base, TimestampMixin


class AssignmentRole(str, PyEnum):
    TITULAR = "titular"
    SUPLENTE = "suplente"


class AssignmentStatus(str, PyEnum):
    PENDIENTE = "pendiente"
    COMPLETO = "completo"


class EvaluatorArea(TimestampMixin, Base):
    """
    Área organizativa GRUESA usada solo para estratificar el muestreo
    (Almacenes, Corporativo, Fuerza de Ventas, Servicio Técnico...).
    Distinta de SurveyDepartment: aquí Almacén es UN área; en encuestas,
    Almacén tiene 6 formularios externos por sucursal. Corresponde al
    diccionario SUBDEPTO_A_AREA del script.
    """
    __tablename__ = "evaluator_areas"

    id = Column(Integer, primary_key=True)
    name = Column(String(80), unique=True, nullable=False)


class Employee(TimestampMixin, Base):
    """Roster de personal (fuente: LISTADO_DE_PERSONAL_2026.xlsx). No es un User del sistema."""
    __tablename__ = "employees"

    id = Column(Integer, primary_key=True)
    full_name = Column(String(150), nullable=False, index=True)
    hire_date = Column(Date, nullable=True)
    position = Column(String(150), nullable=True)
    dept_path = Column(String(255), nullable=True)          # "RutaDepto" tal cual del listado
    sub_department = Column(String(150), nullable=True)     # último tramo de RutaDepto
    area_id = Column(Integer, ForeignKey("evaluator_areas.id"), nullable=True)
    location = Column(String(60), nullable=True)
    is_active = Column(Boolean, default=True)
    is_eligible_override = Column(Boolean, nullable=True)   # null = reglas automáticas; True/False = forzar

    area = relationship("EvaluatorArea")


class SamplingConfig(TimestampMixin, Base):
    """
    Parámetros del muestreo, hoy hardcodeados en el script (TOPE_TITULAR,
    SUPLENTES_POR_DEPTO, ANTIGUEDAD_MIN_DIAS, semilla, exclusiones).
    Un registro por ciclo. Por ahora se llena fija (sin UI de edición);
    el modelo ya queda listo para exponer un editor más adelante.
    """
    __tablename__ = "sampling_configs"

    id = Column(Integer, primary_key=True)
    cycle_id = Column(Integer, ForeignKey("survey_wow_cycles.id"), unique=True, nullable=False)
    seed = Column(Integer, default=2026)
    titular_cap = Column(Integer, default=2)
    suplentes_por_departamento = Column(Integer, default=2)
    antiguedad_minima_dias = Column(Integer, default=60)
    carga_alerta = Column(Integer, default=4)
    areas_excluidas = Column(JSON, default=list)
    personas_excluidas = Column(JSON, default=list)
    evitar_repeticion = Column(JSON, default=dict)
    puestos_sin_interaccion_regex = Column(String(255), nullable=True)


class ScheduleEntry(TimestampMixin, Base):
    """Una fila del Cronograma: cuándo se evalúa cada departamento y con qué muestra."""
    __tablename__ = "schedule_entries"
    __table_args__ = (
        UniqueConstraint("cycle_id", "department_id", name="uq_schedule_entry_dept"),
    )

    id = Column(Integer, primary_key=True)
    cycle_id = Column(Integer, ForeignKey("survey_wow_cycles.id"), nullable=False)
    department_id = Column(Integer, ForeignKey("survey_wow_departments.id"), nullable=False)
    send_date = Column(Date, nullable=True)
    tabulation_date = Column(Date, nullable=True)
    disclosure_date = Column(Date, nullable=True)
    report_delivery_date = Column(Date, nullable=True)
    evaluator_areas_raw = Column(Text, nullable=True)       # texto libre tal cual venía en la hoja
    internal_sample_size = Column(Integer, nullable=True)
    external_sample_size = Column(Integer, nullable=True)
    is_closed = Column(Boolean, default=False)               # ENCUESTAS_CERRADAS: ya no se vuelve a sortear

    department = relationship("SurveyDepartment")
    assignments = relationship("EvaluationAssignment", back_populates="schedule_entry")


class EvaluationAssignment(TimestampMixin, Base):
    """Una fila de la hoja Evaluadores: una persona asignada a evaluar un departamento."""
    __tablename__ = "evaluation_assignments"
    __table_args__ = (
        UniqueConstraint("schedule_entry_id", "employee_id", name="uq_assignment_unique"),
    )

    id = Column(Integer, primary_key=True)
    schedule_entry_id = Column(Integer, ForeignKey("schedule_entries.id"), nullable=False)
    employee_id = Column(Integer, ForeignKey("employees.id"), nullable=False)
    evaluator_area_id = Column(Integer, ForeignKey("evaluator_areas.id"), nullable=True)
    role = Column(Enum(AssignmentRole), nullable=False)
    status = Column(Enum(AssignmentStatus), default=AssignmentStatus.PENDIENTE)
    response_id = Column(Integer, ForeignKey("survey_wow_responses.id"), nullable=True)

    schedule_entry = relationship("ScheduleEntry", back_populates="assignments")
    employee = relationship("Employee")
    evaluator_area = relationship("EvaluatorArea")
```

**`Matriz_Participacion` y `Resumen_Muestra` NO se modelan como tablas** — son vistas derivadas (`COUNT`/`GROUP BY` sobre `EvaluationAssignment`), calculadas en el service, igual que `Pivot_Sucursal` en auditorías 5S.

## Migración Alembic

1. Antes de nada: `alembic heads` en `backend/`. El HEAD documentado es `a87b19768895` — si el repo local tiene otro por trabajo posterior no registrado en `CONTEXT_NOTES.md`, encadenar a ese, no al de esta nota.
2. Registrar TODAS las clases nuevas (`survey_wow_models.py` y `evaluator_models.py`) en `app/models/__init__.py`, siguiendo el mismo patrón que los modelos existentes — necesario tanto para `init_db()` (arranque) como para que `alembic revision --autogenerate` las detecte.
3. Generar UNA sola migración funcional (creación de tablas) encadenada al head:

   ```bash
   alembic revision --autogenerate -m "Agregar modulo Servicio WOW 2026 (encuestas y evaluadores)"
   ```
4. **Revisar el archivo autogenerado antes de aplicar** — no correr `alembic upgrade head` a ciegas (principio de trabajo de Emely). Confirmar que:
   - Todas las tablas llevan `created_at`/`updated_at` vía `TimestampMixin` (timezone-aware, `server_default=func.now()`).
   - No aparece la tabla `heartbeat` en el diff (Alembic ya la ignora vía `INFRA_TABLES_TO_IGNORE`, pero confirmar).
   - No hay ningún `DROP` — esta migración es puramente aditiva.
5. Como es solo creación de tablas nuevas (nada destructivo, nada toca tablas existentes), puede ir en una sola migración — la regla de Emely de separar pasos destructivos en migraciones propias no aplica aquí, pero si Claude Code decide separar Fase 2 (el motor de muestreo) en otra migración más adelante, sí debe ir aparte.
6. Aplicar en local (`alembic upgrade head`) y confirmar `alembic current`. NO aplicar contra Supabase (prod) sin que Emely lo revise y lo pida explícitamente — la convención del repo es no compartir instancia de BD por scripts destructivos, y aunque esta migración no es destructiva, el criterio de "revisar antes de aplicar" sigue aplicando.

## Servicios de importación

### `backend/app/services/survey_wow_import_service.py` — respuestas de encuestas

Input: un Excel exportado de Microsoft Forms (una hoja, headers en fila 1, igual que el patrón ya usado en `audit_service.py`/`survey_service.py` con `openpyxl`/`pandas`). Se importa **un archivo por `SurveyForm`** (Emely sube el de Gestión Humana, luego el de TI, etc. — no hay un import masivo unificado todavía).

Pasos:

1. Recibir `form_id` (o resolverlo por `department_id` + `survey_type` + `branch` + `subprocess` si no se pasa directo).
2. Leer headers de la fila 1. Las primeras 6 columnas son siempre `ID, Hora de inicio, Hora de finalización, Correo electrónico, Nombre, Hora de última modificación` — descartar `Correo electrónico` y `Nombre` de inmediato al leer la fila (no pasan de esta función hacia ningún otro lugar del código, ni siquiera a logs).
3. Las columnas restantes se resuelven contra `SurveyForm.questions` por **orden posicional** (columna 7 → `SurveyQuestion.order == 1`, etc. — igual que el export de Forms es siempre estable en el mismo orden en que se armó el formulario). Si el número de columnas de preguntas no coincide con `len(form.questions)`, abortar el import de ese archivo con un error claro (no intentar adivinar).
4. Para cada fila:
   - Dedupe: `external_response_id` (columna `ID`) + `form_id` ya existe en `survey_wow_responses` → skip (igual que `Id_Form` en el script de 5S).
   - Crear `SurveyResponse` (sin nombre/correo) con `started_at`/`completed_at` de las columnas de hora.
   - Para cada `SurveyQuestion` del form: crear `SurveyAnswer` con `value_score` (si `question_type == likert_5`, parseando `'1'`-`'5'` a int) o `value_text` (si `TEXT` o `IDENTIFIER`).
   - Si el form es interno: la penúltima columna es el nominado, la última la justificación → crear `SurveyNomination`.
5. **Cruce anónimo con evaluadores (solo para forms internos, y solo si existe un `ScheduleEntry` para ese departamento+ciclo):** ANTES de descartar nombre/correo del paso 2, buscar en memoria (sin persistir) un `EvaluationAssignment` con `status == PENDIENTE` de ese `schedule_entry` cuyo `Employee.full_name` calce (usar comparación tolerante: normalizar espacios/tildes/mayúsculas, y si no hay match exacto, `difflib.SequenceMatcher` con umbral alto — el propio script `asignar_evaluadores_wow.py` ya tiene una función de matching de nombres reutilizable, revisarla antes de escribir una nueva). Si hay match: `assignment.status = COMPLETO`, `assignment.response_id = <la respuesta recién creada>`. El nombre/correo leído de la fila se descarta inmediatamente después de este cruce — no debe sobrevivir más allá del scope de esta función, ni loguearse.
6. Devolver resumen: `{importadas, duplicadas, sin_match_evaluador}`.

### `backend/app/services/evaluator_import_service.py` — Excel de Evaluadores

Input: `Servicio_WOW_2026_Evaluadores.xlsx`. Importar por hoja:

- **Cronograma** → upsert de `ScheduleEntry` por `(cycle_id, department_id)`. Resolver `department_id` por nombre contra `SurveyDepartment` (crear si no existe — normalizar nombre igual que columna "Departamento / Área").
- **Evaluadores** → upsert de `Employee` (por `full_name`, crear si no existe) + `EvaluationAssignment` por `(schedule_entry_id, employee_id)`, con `role` desde la columna `Tipo` ("Titular"/"Suplente") y `status` desde `Respondió` ("Pendiente" → `PENDIENTE`, cualquier otro valor → `COMPLETO`). `evaluator_area_id` se resuelve/crea contra `EvaluatorArea` por la columna "Área evaluadora (cronograma)".
- Las hojas `Matriz_Participacion`, `Resumen_Muestra` y `Criterios_Seleccion` **no se importan** — son derivadas o documentación, ver sección de Modelos.
- Este import es de una sola vez / reemplazo manual por ahora (Emely lo corre después de cada ejecución del script offline). No hace falta dedupe incremental sofisticado todavía — un upsert por las claves naturales arriba es suficiente.

## Endpoints API

Dos routers nuevos, registrados en `main.py` junto a los existentes, mismo patrón (`prefix="/api/v1"` + prefix propio + tag):

| Router | Prefix propio | Tag |
| --- | --- | --- |
| `survey_wow.router` | `/servicio-wow` | Servicio WOW — Encuestas |
| `evaluators.router` | `/servicio-wow/evaluadores` | Servicio WOW — Evaluadores |

### `backend/app/api/survey_wow.py`

- `GET /departments`, `GET /forms` (filtros: `department_id`, `survey_type`, `cycle_id`), `GET /forms/{id}` (con sus `questions`)
- `POST /forms/{id}/import` — sube el Excel de respuestas (`UploadFile`), llama a `survey_wow_import_service`, devuelve el resumen `{importadas, duplicadas, sin_match_evaluador}`
- `GET /responses` (filtros: `form_id`, `department_id`) — SIN nombre/correo en el schema de salida (ver `schemas/survey_wow_schemas.py`)
- `GET /dashboard/interno` — agregados por `SurveyCriteria` (promedio 1-5 por criterio, por departamento, para gauge/heatmap) — reusar el semáforo del módulo Encuestas viejo (≥90 Excelente, ≥80 Aceptable, <80 Crítico) convertido a escala 1-5 si aplica, o confirmar con Emely si prefiere otro corte para esta escala Likert directa
- `GET /dashboard/externo` — agregados por pregunta individual (no por criterio, ya que no son comparables entre departamentos)
- `GET /nominations` (filtros: `department_id`, `cycle_id`) — conteo de nominaciones por nominado, para el informe de "Embajador del Servicio WOW"

Orden de rutas: las estáticas (`/departments`, `/forms`, `/dashboard/...`, `/nominations`) antes de cualquier `/{id}`, igual que la convención ya establecida en `audits.py`/`surveys.py`.

### `backend/app/api/evaluators.py`

- `GET /schedule` (filtro `cycle_id`) — `ScheduleEntry` con su departamento
- `PUT /schedule/{id}` — editar fechas manualmente (para cuando Emely ajuste el cronograma sin re-correr el script)
- `GET /assignments` (filtros: `schedule_entry_id`, `department_id`, `status`)
- `POST /import` — sube `Servicio_WOW_2026_Evaluadores.xlsx`, llama a `evaluator_import_service`
- `GET /participation-matrix` (filtro `cycle_id`) — calculada on-demand, replica `Matriz_Participacion`
- `GET /sample-summary` (filtro `cycle_id`) — calculada on-demand, replica `Resumen_Muestra`
- `GET /sampling-config` / `PUT /sampling-config` — el PUT existe en el schema desde ya (para cuando se construya la UI de edición), pero el frontend de este primer alcance NO lo consume todavía

## Frontend

```
frontend/src/
├── pages/ServicioWow/
│   ├── SurveyWowFormsPage.jsx      # listado de SurveyForm por depto/tipo, botón importar Excel de respuestas
│   ├── SurveyWowResponsesPage.jsx  # listado de respuestas importadas (sin nombre/correo)
│   ├── DashboardServicioWow.jsx    # nuevo dashboard: gauge/heatmap por los 6 criterios (interno) + vista aparte por pregunta (externo) + tabla de nominaciones
│   └── EvaluatorsSchedulePage.jsx  # cronograma + asignaciones + estado pendiente/completo + import del Excel de Evaluadores
└── services/
    ├── surveyWow.js                # departments, forms, import, responses, dashboard, nominations
    └── evaluators.js                # schedule, assignments, import, participation-matrix, sample-summary
```

**Patrón de página a seguir** (ver `AuditsPage.jsx`): `Header` (title/subtitle/onRefresh) → barra de acciones (`btn-primary`/`btn-secondary`) → `glass rounded-2xl` para filtros si aplica → `GlassCard padding={false}` con tabla, loader `Loader2`, estado vacío, paginación si aplica → `ConfirmModal` para acciones destructivas. Datos con `useQuery`/`useMutation` de TanStack Query + `invalidateQueries`. Gráficas con Recharts + `useChartColors()` (nunca hex hardcodeado).

**Rutas** (`App.jsx`, dentro de `RequireAuth` → `AppLayout`):

```
/servicio-wow/formularios
/servicio-wow/respuestas
/servicio-wow/dashboard
/servicio-wow/evaluadores
```

**Navegación (`Sidebar.jsx`):** confirmado con Emely — grupo colapsable **"Servicio WOW 2026"** en el sidebar, con las 4 entradas (Formularios, Respuestas, Dashboard, Evaluadores) adentro. El `NAV` actual es un arreglo plano sin jerarquía, así que esto es una extensión real del componente, no solo agregar 4 enlaces: soporte para "secciones" con estado abierto/cerrado, persistido en `localStorage` con el mismo patrón que `sidebarCollapsed` en `ThemeContext.jsx`.

## Fase 2 — portar el motor de muestreo ✅ implementada el 23/09/2026

> Implementación: `backend/app/services/sampling_service.py` (motor) y `sampling_rules.py` (reglas),
> endpoints `/servicio-wow/evaluadores/sorteo/*`, `/roster/import`, `/employees`, `/sampling-config`
> y `/servicio-wow/forms/nominees`; pestañas **Sorteo** y **Configuración** en Evaluadores.
> Decisiones de Emely: las 8 personas excluidas y la excepción de no repetición se cargan tal cual
> como datos (no en código); se mantienen las reglas de no repetición; flujo vista previa → confirmar;
> nominados se suben como .txt desde la app. Verificado contra el script: mismas 540 filas.

Objetivo final confirmado por Emely: convertir `asignar_evaluadores_wow.py` (912 líneas — muestreo estratificado proporcional por área, exclusión por conflicto de interés, antigüedad mínima de 60 días, tope de titularidades, no-repetición semanal, semilla fija) en un servicio del backend invocable desde la app (`POST /servicio-wow/evaluadores/sortear` o similar), leyendo `Employee`/`ScheduleEntry`/`SamplingConfig` de la BD en vez de los 3 Excel que lee hoy.

**No arrancar esta fase todavía.** Cuando Emely la pida: leer el script completo primero (ya lo tiene, pedírselo), mapear cada función a un método del nuevo `sampling_service.py`, y sobre todo revisar con ella la lista `EXCLUIR_PERSONAS` / `EVITAR_REPETICION` / `PERMITIR_REPETIR` hardcodeadas — esas son decisiones de negocio con nombres propios de personas, no deben quedar como constantes en código sin que ella las revise explícitamente (deberían terminar viviendo en `SamplingConfig` o en tablas relacionadas, no en el código fuente).

### Reglas de muestreo confirmadas por Emely (a respetar al portar)

**Caja — confirmado 2026-09-23 (reemplaza la regla anterior "2 evaluadores por cajera"):**

- Se evalúa por **entidad** (sucursal): Oficina Principal, Portal (El Portal), Gurabo, Rómulo, Tiradentes. Una lista por entidad: `CAJA – <entidad>`.
- **5 evaluadores titulares por entidad, todos de esa misma entidad:**
  - 1 **Gerente de Negocios** de la entidad (puesto `Gerente de Negocios (<sucursal>)`; en el listado no existe un puesto "gerente de tienda").
  - 2 **Ejecutivos de ventas Tienda** de la entidad (puesto `Ejecutivo de ventas Tienda (<sucursal>)`).
  - 2 **Consultores SMB** de la entidad (puestos `Consultor de Negocios SMB (<sucursal>)` y `SMB Account Manager`).
- **Oficina Principal no tiene ejecutivos de Tienda** → Gerente de Negocios + **4 Consultores SMB**. Regla general: si un estrato no existe en la entidad, sus cupos pasan a Consultores SMB.
- **Suplente:** 1 por entidad, elegido entre los que sobren de esos mismos tres puestos en la entidad. Si no sobra nadie, la entidad queda **sin reserva** (no se busca en otros puestos).
- Dentro de cada estrato se elige con el mismo criterio del resto del motor: menor carga acumulada → diversidad → azar con semilla fija. Se aplican los filtros generales de elegibilidad (antigüedad ≥ 60 días, exclusiones, conflicto de interés con el equipo evaluado).
- "Muestra requerida" de cada lista de Caja = 5.
- Implementación de referencia: `CAJA_GRUPOS` / `CAJA_RESPALDO` y el bloque `if clave == "CAJA"` de `asignar_evaluadores_wow.py` (versión del 23/09/2026). Al portarlo, los estratos y cupos deberían vivir en configuración (p. ej. un JSON en `SamplingConfig`), no en código.
- Efecto observado en la corrida del 23/09/2026: los Gerentes de Negocios y los 2 SMB de Gurabo quedan con 4 encuestas como titulares (≤ alerta de carga). Es inevitable con esta regla porque los pools por entidad son de 1-5 personas.

**Estado del script al 23/09/2026 (antes de pasar el sorteo a la app):** `RECALCULAR = ["CAJA"]` (solo se re-sorteó Caja; las otras 36 listas se copiaron sin cambios de la versión previa). Antes de la próxima corrida, decidir qué listas recalcular: con `"PENDIENTES"` se re-sortean todas las no enviadas.

## Instrucciones para Claude Code

**Antes de escribir código, leer estos archivos del repo para igualar convenciones exactas** (esta nota describe el patrón, pero el código real manda):

- `backend/app/core/database.py` y `backend/app/models/base.py` — `Base`, `TimestampMixin`, `get_db()`, cómo se maneja SQLite vs. Postgres.
- `backend/main.py` — orden de registro de routers, `lifespan`/`init_db()`, `CORS_ORIGINS`.
- Un modelo existente completo (ej. `audit_models.py`) — para no desviarse un milímetro del estilo real (puede diferir en detalles de lo que esta nota asume).
- Un service + router existentes completos, idealmente `survey_service.py` + `api/surveys.py` (el módulo hermano más parecido) — patrón de manejo de errores, respuestas, transacciones (`db.commit()` explícito aunque `get_db()` ya comitea).
- `frontend/src/App.jsx` y `frontend/src/components/Layout/Sidebar.jsx` — para insertar rutas y nav sin romper lo existente.
- Una página existente completa, ej. `AuditsPage.jsx`, y su `services/audits.js`.

**Orden de trabajo sugerido:**

1. Modelos (`survey_wow_models.py`, `evaluator_models.py`) + registro en `app/models/__init__.py`.
2. Migración Alembic — generar, **mostrarle el diff a Emely antes de aplicar**, aplicar solo en local.
3. Servicios de importación (respuestas + evaluadores) — sin endpoints todavía, probar con un script/test manual usando el Excel real de Gestión Humana que Emely ya tiene.
4. Routers + registro en `main.py`.
5. Frontend: servicios axios → páginas → rutas → nav.
6. Dashboard (`DashboardServicioWow.jsx`) al final, una vez haya datos reales importados para verificar que los agregados se ven bien.

**Qué NO hacer sin preguntarle a Emely primero:**

- No tocar `surveys.py`, `survey_service.py`, `SurveysPage.jsx`, `DashboardSurveys.jsx` ni la tabla `surveys`.
- No aplicar ninguna migración contra la base de datos de Supabase (producción) — solo local.
- No empezar la Fase 2 (motor de muestreo) sin que ella lo pida explícitamente.
- No inventar el corte del semáforo del dashboard interno (≥90/≥80 vs. otro) — confirmar con ella antes de fijarlo en código, dejarlo como constante fácil de cambiar mientras tanto.
- Si el Excel real de otro departamento (no Gestión Humana) tiene una estructura de columnas que no calza con lo descrito aquí, **parar y preguntar** — no asumir que todos los internos son idénticos sin verificar, aunque esta nota diga que sí lo son en los dos casos revisados.
