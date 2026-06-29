# Implementación Completa de Tareas Avanzadas

## Resumen de Características Agregadas

### 1. **Adjuntos de Tareas**
- **Upload de archivos**: Los usuarios pueden adjuntar archivos a cada tarea
- **Gestión**: Descargar, eliminar, visualizar archivos
- **Galería de Proyecto**: Nueva pestaña "Archivos" que muestra TODOS los adjuntos del proyecto organizados por tipo
- **API Endpoints**:
  - `POST /projects/{id}/tasks/{tid}/attachments` - Subir archivo
  - `GET /projects/{id}/tasks/{tid}/attachments` - Listar adjuntos
  - `DELETE /projects/{id}/tasks/{tid}/attachments/{aid}` - Eliminar adjunto

### 2. **Información Completa de Tareas**
Las tareas ahora incluyen:
- **Asignados**: Múltiples usuarios pueden asignarse a una tarea
- **Duración Estimada**: Horas estimadas vs. registradas (con barra de progreso)
- **Etiquetas**: Categorización flexible de tareas
- **Relaciones**: Dependencias, bloqueos, duplicados entre tareas
- **Estado**: Cambio rápido entre Por Hacer → En Progreso → En Revisión → Completada
- **Registro de Tiempo**: Logging manual de horas trabajadas
- **Actividad/Historial**: Registro automático de todos los cambios
- **Campos Personalizados**: Campos adicionales por proyecto

### 3. **Modal Expandido de Tarea**
Nuevo componente `TaskDetailModal.jsx` con pestañas:

#### Pestaña "Detalles"
- Estado (dropdown rápido)
- Prioridad
- Asignados (agregar/remover)
- Horas estimadas vs. registradas
- Etiquetas
- Fecha de vencimiento
- Campos personalizados
- Descripción

#### Pestaña "Actividad"
- Historial completo de cambios
- Quién hizo qué y cuándo
- Cambios de campo con valores anteriores/nuevos

#### Pestaña "Adjuntos"
- Drag & drop para subir archivos
- Vista previa de adjuntos
- Descargar/eliminar

#### Pestaña "Relaciones"
- Ver tareas relacionadas
- Crear nuevas relaciones
- Tipos: depends_on, blocks, relates_to, duplicates, is_subtask_of

#### Pestaña "Tiempo"
- Registrar horas con descripción
- Historial de registros
- Cálculo automático vs. estimado

### 4. **Campos Personalizados**
Sistema completo de campos personalizados por proyecto:
- **Tipos**: texto, número, select, fecha, checkbox, textarea
- **API Endpoints**:
  - `POST /projects/{id}/custom-fields` - Crear campo
  - `GET /projects/{id}/custom-fields` - Listar campos
  - `PUT /projects/{id}/custom-fields/{fid}` - Editar
  - `DELETE /projects/{id}/custom-fields/{fid}` - Eliminar
  - `POST /projects/{id}/tasks/{tid}/custom-values` - Setear valor
  - `GET /projects/{id}/tasks/{tid}/custom-values` - Obtener valores

### 5. **Actividad/Auditoría**
Registro automático de:
- Creación de tarea
- Cambios de estado, prioridad, etc.
- Asignaciones
- Comentarios
- Adjuntos
- Tiempo registrado
- Cambios de campos personalizados

### 6. **Galería de Archivos del Proyecto**
Nueva pestaña en el detalle del proyecto que muestra:
- Todos los adjuntos de todas las tareas
- Búsqueda por nombre de archivo o tarea
- Filtrado por tipo (imágenes, PDF, etc.)
- Información: tamaño, tarea asociada, archivo key
- Botones para descargar/eliminar

## Archivos Creados/Modificados

### Backend
```
/app/models/task_attachment_models.py - Nuevos modelos
/app/schemas/task_attachment_schemas.py - Schemas Pydantic
/app/api/task_attachments.py - Endpoints API
/app/models/__init__.py - Registrar modelos
main.py - Incluir router
```

### Frontend
```
/src/components/Projects/TaskDetailModal.jsx - Modal expandido
/src/components/Projects/ProjectAttachmentsGallery.jsx - Galería
/src/pages/projects/ProjectDetailPage.jsx - Integrar pestañas
/src/pages/projects/ProjectsListPage.jsx - Sin cambios pero compatible
/src/services/projects.js - Nuevos métodos del servicio
```

## Nuevas API Endpoints

### Adjuntos
```
POST   /api/v1/projects/{id}/tasks/{tid}/attachments       - Subir
GET    /api/v1/projects/{id}/tasks/{tid}/attachments       - Listar
DELETE /api/v1/projects/{id}/tasks/{tid}/attachments/{aid} - Eliminar
```

### Actividad
```
GET /api/v1/projects/{id}/tasks/{tid}/activity - Historial
```

### Relaciones
```
POST   /api/v1/projects/{id}/tasks/{tid}/relations        - Crear
GET    /api/v1/projects/{id}/tasks/{tid}/relations        - Listar
DELETE /api/v1/projects/{id}/tasks/{tid}/relations/{rid} - Eliminar
```

### Campos Personalizados
```
POST   /api/v1/projects/{id}/custom-fields           - Crear campo
GET    /api/v1/projects/{id}/custom-fields           - Listar campos
PUT    /api/v1/projects/{id}/custom-fields/{fid}     - Editar
DELETE /api/v1/projects/{id}/custom-fields/{fid}     - Eliminar

POST   /api/v1/projects/{id}/tasks/{tid}/custom-values    - Setear valor
GET    /api/v1/projects/{id}/tasks/{tid}/custom-values    - Obtener valores
```

## Modelos de Base de Datos

### TaskAttachment
- Archivo adjunto con metadata
- Relacionado a una tarea y un usuario

### TaskActivity
- Registro de cambios/actividad
- Rastreo completo de qué cambió, quién lo hizo y cuándo

### TaskRelation
- Relaciones entre tareas (many-to-many)
- Tipos: depends_on, blocks, relates_to, duplicates, is_subtask_of

### TaskCustomField
- Definición de campo personalizado
- Propiedades: tipo, opciones, requerido, activo

### TaskCustomValue
- Valor de un campo personalizado para una tarea específica

## Flujo de Uso

### Para Crear una Tarea con Todo
1. Crear tarea desde Kanban/Sprint
2. Click en la tarea → abre `TaskDetailModal`
3. En pestaña "Detalles":
   - Asignar usuarios
   - Setear duración estimada
   - Agregar etiquetas
   - Completar campos personalizados
4. En pestaña "Adjuntos":
   - Subir archivos
5. En pestaña "Tiempo":
   - Registrar horas conforme avanza
6. En pestaña "Actividad":
   - Ver historial completo
7. En pestaña "Relaciones":
   - Vincular con otras tareas

### Para Ver Todos los Archivos del Proyecto
1. En el detalle del proyecto, ir a pestaña "Archivos"
2. Ver galería de todos los adjuntos
3. Buscar/filtrar por nombre o tipo
4. Descargar o eliminar desde allí

## Características Destacadas

**Cambio de Estado Rápido**: El select de estado en "Detalles" cambia inmediatamente sin recargar

**Progreso Visual**: Barra de progreso en tiempo registrado vs. estimado

**Historial Completo**: Cada cambio se registra automáticamente

**Campos Flexibles**: Personaliza las tareas con campos adicionales por proyecto

**Adjuntos Centralizados**: Galería de proyecto muestra todos los archivos en un lugar

**Relaciones entre Tareas**: Vincula tareas con dependencias, bloques, etc.

## Notas de Implementación

- Los archivos se guardan en una ruta simulada. En producción, integrar con S3 o similar.
- Las relaciones previenen auto-referencias (una tarea no puede relacionarse consigo misma).
- Los campos personalizados por proyecto permiten mayor flexibilidad.
- La actividad es audit-ready: perfecto para reportes y auditorías.
- El registro de tiempo es manual (se puede extender con timer automático).

---

# Implementación: Sistema de Temas y Paletas de Color

## Resumen de Características Agregadas

### 1. **Modo Claro/Oscuro**
- Toggle global de tema gestionado por `ThemeContext.jsx`
- Se aplica como atributo `data-theme` en `<html>` (no clases Tailwind dinámicas)
- Persistido en `localStorage` (`nexus-theme`)

### 2. **Paletas de Color de Marca**
7 paletas seleccionables en caliente, sin recargar la página:

| id | Nombre | Color principal |
|---|---|---|
| `corp` | Corporativa | `#0A4F79` |
| `rosa` | Rosa | `#dc0964` |
| `azul` | Azul | `#1e4fc7` |
| `morada` | Morada | `#900052` |
| `verde` | Verde | `#7cae00` |
| `naranja` | Naranja | `#fe4e00` |
| `spectrum` | Espectro | gradiente de las anteriores |

- Aplicada como atributo `data-palette` en `<html>`
- Persistida en `localStorage` (`nexus-palette-v2`)
- Selector disponible en `Header.jsx` y `Sidebar.jsx`

### 3. **Colores de Gráficas Dinámicos**
Hook `useChartColors()` que deriva, según paleta + tema activos:
- Serie de colores `c1`-`c5` para series de datos en gráficas (Recharts)
- Colores de infraestructura: ejes, grid, línea de referencia, tooltip
- Colores **semánticos fijos** (`success`/`warning`/`danger`) — no cambian con la paleta, porque representan umbrales de auditoría (verde/naranja/rojo) que deben mantener su significado universal
- Mapa `STATUS` para estados de tareas de proyecto (usa `c1`/`c4`/`c2` de la paleta activa + verde/rojo fijos para completada/cancelada)

### 4. **Sidebar Colapsable**
- Estado `sidebarCollapsed` agregado a `ThemeContext`
- `AppLayout` (`App.jsx`) ajusta el `margin-left` del contenido con transición CSS según el ancho de sidebar colapsado/expandido (`--sidebar-width` / `--sidebar-collapsed-width`)

## Archivos Creados/Modificados

### Frontend
```
/src/store/ThemeContext.jsx              - Nuevo: estado de tema/paleta/sidebar
/src/hooks/useChartColors.js             - Nuevo: colores derivados para gráficas
/src/main.jsx                            - Envuelve <App /> con <ThemeProvider>
/src/App.jsx                             - AppLayout usa sidebarCollapsed; fondo animado (blobs)
/src/index.css                           - Variables CSS por [data-palette][data-theme]
/src/tailwind.config.js                  - darkMode selector, colores `ink`/`primary` dinámicos
/src/components/Layout/Header.jsx        - Selector de tema y paleta
/src/components/Layout/Sidebar.jsx       - Selector de paleta, soporte colapsado
/src/components/Dashboard/*.jsx          - Gauge, heatmap, cuadrante, gap chart, radar, barras y líneas migrados a useChartColors()
/src/components/Schedule/CreateEventModal.jsx - Colores dinámicos
/src/components/Users/UserActivityModal.jsx   - Colores dinámicos
/src/pages/HomePage.jsx                       - Colores dinámicos
/src/pages/DashboardSurveys.jsx               - Colores dinámicos
/src/pages/DashboardAudits.jsx                - Colores dinámicos
/src/pages/projects/ProductivityDashboard.jsx - Colores dinámicos
/src/pages/projects/TimeReportPage.jsx        - Colores dinámicos
```

## Flujo de Uso

### Para Cambiar Tema o Paleta
1. Click en el ícono de tema (sol/luna) en el `Header` → alterna claro/oscuro
2. Click en el selector de paleta → elegir entre las 7 disponibles
3. La preferencia se guarda automáticamente y persiste entre sesiones

### Para Usar Colores Dinámicos en un Componente Nuevo
1. Importar `useChartColors` desde `hooks/useChartColors.js`
2. Desestructurar lo necesario: `const { series, axis, grid, tooltipStyle, sem, STATUS } = useChartColors();`
3. Usar `sem.success/warning/danger` para umbrales de auditoría (fijos)
4. Usar `series` o `c1`-`c5` para series de datos (varían con la paleta)
5. Para clases Tailwind estáticas, usar `bg-primary`/`text-ink` en vez de hex — ya resuelven la variable CSS correcta

## Notas de Implementación

- Los colores semánticos de auditoría (success/warning/danger) son intencionalmente **fijos** en todas las paletas — representan umbrales de calidad (bueno/regular/malo) y cambiarlos por paleta confundiría la lectura de los reportes.
- El cambio de paleta/tema no requiere recargar la página: las variables CSS se recalculan en cuanto cambia el atributo `data-*` en `<html>`.
- Cualquier componente nuevo que pinte gráficas o UI con colores de marca debe consumir `useChartColors()` en lugar de hardcodear hex, para mantenerse consistente al añadir futuras paletas.
