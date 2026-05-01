/**
 * KanbanBoard.jsx
 * Tablero Kanban con drag & drop usando @dnd-kit.
 *
 * Instalar:
 *   npm install @dnd-kit/core @dnd-kit/sortable @dnd-kit/utilities
 */

import { useState, useCallback }                 from "react";
import {
  DndContext, DragOverlay, PointerSensor,
  useSensor, useSensors, closestCorners,
} from "@dnd-kit/core";
import {
  SortableContext, useSortable,
  verticalListSortingStrategy, arrayMove,
} from "@dnd-kit/sortable";
import { CSS }                                   from "@dnd-kit/utilities";
import { useQueryClient }                        from "@tanstack/react-query";
import {
  Plus, MoreHorizontal, User, Calendar,
  Clock, AlertTriangle, ChevronDown,
  MessageSquare, Paperclip,
} from "lucide-react";
import { projectsService } from "../../services/projects";
import { fmt }             from "../../utils/format";

// ─── Paleta de prioridades ────────────────────────────────────────────────────
const PRIO = {
  critica: { dot: "#DF4585", badge: "bg-danger/15  text-danger  border-danger/25"  },
  alta:    { dot: "#EA9947", badge: "bg-warning/15 text-warning border-warning/25" },
  media:   { dot: "#0A4F79", badge: "bg-primary/10 text-primary border-primary/20" },
  baja:    { dot: "#94a3b8", badge: "bg-ink/8      text-ink/50  border-ink/15"     },
};

const TYPE_ICON = {
  historia: "📖", tarea: "✅", bug: "🐛", epic: "⚡", mejora: "💡",
};

// ─── Tarjeta de tarea (draggable) ─────────────────────────────────────────────
function TaskCard({ task, projectId, onClick, isDragging = false }) {
  const prio = PRIO[task.priority] || PRIO.media;

  return (
    <div
      onClick={() => onClick?.(task)}
      className={`glass rounded-2xl p-3.5 cursor-pointer group border border-white/50
                  transition-all duration-150 ${
        isDragging
          ? "opacity-50 rotate-1 scale-95"
          : "hover:border-white/80 hover:shadow-md hover:-translate-y-0.5"
      }`}
    >
      {/* Tipo + prioridad */}
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-1.5">
          <span className="text-[11px]">{TYPE_ICON[task.task_type] || "✅"}</span>
          <span className="text-[10px] font-mono text-ink/35">{task.task_key}</span>
        </div>
        <div className="flex items-center gap-1">
          <div className="w-2 h-2 rounded-full" style={{ background: prio.dot }} />
          {task.is_overdue && <AlertTriangle size={11} className="text-danger" />}
        </div>
      </div>

      {/* Título */}
      <p className="text-sm font-medium text-ink leading-snug mb-2.5 line-clamp-2">
        {task.title}
      </p>

      {/* Footer */}
      <div className="flex items-center justify-between gap-2">
        {/* Asignados */}
        <div className="flex -space-x-1.5">
          {task.assignees?.slice(0, 3).map((a) => (
            <div
              key={a.id}
              title={a.full_name}
              className="w-6 h-6 rounded-full bg-primary/20 border border-white flex items-center
                         justify-center text-[9px] font-bold text-primary"
            >
              {a.full_name?.charAt(0)?.toUpperCase()}
            </div>
          ))}
          {task.assignees?.length > 3 && (
            <div className="w-6 h-6 rounded-full bg-ink/10 border border-white flex items-center
                            justify-center text-[9px] font-semibold text-ink/50">
              +{task.assignees.length - 3}
            </div>
          )}
        </div>

        <div className="flex items-center gap-2 text-ink/35">
          {task.due_date && (
            <div className={`flex items-center gap-1 text-[10px] ${task.is_overdue ? "text-danger" : ""}`}>
              <Calendar size={10} />
              {fmt.date(task.due_date)}
            </div>
          )}
          {task.estimated_hours && (
            <div className="flex items-center gap-1 text-[10px]">
              <Clock size={10} />
              {task.estimated_hours}h
            </div>
          )}
          {task.story_points != null && (
            <span className="text-[10px] font-bold bg-ink/8 px-1.5 rounded-md">
              {task.story_points} sp
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Tarjeta sortable (wrapper dnd-kit) ───────────────────────────────────────
function SortableTaskCard({ task, projectId, onClick }) {
  const {
    attributes, listeners, setNodeRef,
    transform, transition, isDragging,
  } = useSortable({ id: String(task.id), data: { task, type: "TASK" } });

  const style = {
    transform:  CSS.Transform.toString(transform),
    transition,
    zIndex:     isDragging ? 999 : undefined,
    opacity:    isDragging ? 0.4 : 1,
  };

  return (
    <div ref={setNodeRef} style={style} {...attributes} {...listeners}>
      <TaskCard task={task} projectId={projectId} onClick={onClick} />
    </div>
  );
}

// ─── Columna del tablero ──────────────────────────────────────────────────────
function KanbanColumn({ column, tasks, projectId, onTaskClick, onAddTask }) {
  const taskIds   = tasks.map((t) => String(t.id));
  const wipOver   = column.wip_limit && tasks.length > column.wip_limit;

  return (
    <div className="flex flex-col w-72 shrink-0">
      {/* Header de columna */}
      <div className="flex items-center justify-between mb-3 px-1">
        <div className="flex items-center gap-2">
          <div className="w-2.5 h-2.5 rounded-full" style={{ background: column.color || "#0A4F79" }} />
          <span className="text-xs font-semibold text-ink uppercase tracking-wide">
            {column.name}
          </span>
          <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${
            wipOver
              ? "bg-danger/15 text-danger"
              : "bg-ink/8 text-ink/50"
          }`}>
            {tasks.length}{column.wip_limit ? `/${column.wip_limit}` : ""}
          </span>
        </div>
        <button
          onClick={() => onAddTask?.(column.id)}
          className="w-6 h-6 rounded-lg glass flex items-center justify-center
                     text-ink/40 hover:text-primary hover:bg-primary/10 transition-colors"
        >
          <Plus size={13} />
        </button>
      </div>

      {/* Drop zone */}
      <SortableContext items={taskIds} strategy={verticalListSortingStrategy}>
        <div
          className={`flex-1 flex flex-col gap-2.5 min-h-[120px] p-2 rounded-2xl
                      transition-colors duration-200 ${
            wipOver ? "bg-danger/4" : "bg-ink/[0.02]"
          }`}
        >
          {tasks.map((task) => (
            <SortableTaskCard
              key={task.id}
              task={task}
              projectId={projectId}
              onClick={onTaskClick}
            />
          ))}

          {tasks.length === 0 && (
            <div className="flex-1 flex items-center justify-center min-h-[80px]">
              <p className="text-xs text-ink/20">Sin tareas</p>
            </div>
          )}
        </div>
      </SortableContext>
    </div>
  );
}

// ─── Tablero Kanban principal ──────────────────────────────────────────────────
export default function KanbanBoard({
  boardData,
  projectId,
  sprintId,
  onTaskClick,
  onAddTask,
  onBoardChange,
}) {
  const qc = useQueryClient();
  const [activeTask, setActiveTask] = useState(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } })
  );

  // Construir mapa columna → tareas desde boardData
  const [columns, setColumns] = useState(() => boardData?.columns || []);

  // Sincronizar cuando cambia boardData externamente
  if (boardData && JSON.stringify(boardData.columns?.map(c=>c.task_count)) !==
      JSON.stringify(columns?.map(c=>c.task_count))) {
    setColumns(boardData.columns || []);
  }

  const findColumnOfTask = (taskId) =>
    columns.find((col) => col.tasks?.some((t) => String(t.id) === taskId));

  const handleDragStart = ({ active }) => {
    const col = findColumnOfTask(active.id);
    const task = col?.tasks?.find((t) => String(t.id) === active.id);
    setActiveTask(task || null);
  };

  const handleDragOver = ({ active, over }) => {
    if (!over) return;
    const activeColIdx = columns.findIndex((c) =>
      c.tasks?.some((t) => String(t.id) === active.id)
    );
    // Over puede ser una columna o una tarea dentro de otra columna
    const overColIdx = columns.findIndex(
      (c) => String(c.id) === String(over.id) ||
             c.tasks?.some((t) => String(t.id) === String(over.id))
    );
    if (activeColIdx === -1 || overColIdx === -1 || activeColIdx === overColIdx) return;

    setColumns((prev) => {
      const next  = prev.map((c) => ({ ...c, tasks: [...(c.tasks || [])] }));
      const task  = next[activeColIdx].tasks.find((t) => String(t.id) === active.id);
      next[activeColIdx].tasks = next[activeColIdx].tasks.filter((t) => String(t.id) !== active.id);
      next[overColIdx].tasks.push(task);
      return next;
    });
  };

  const handleDragEnd = async ({ active, over }) => {
    setActiveTask(null);
    if (!over) return;

    const colIdx = columns.findIndex((c) =>
      c.tasks?.some((t) => String(t.id) === active.id)
    );
    if (colIdx === -1) return;

    const col      = columns[colIdx];
    const taskIdx  = col.tasks.findIndex((t) => String(t.id) === active.id);
    const overIdx  = col.tasks.findIndex((t) => String(t.id) === String(over.id));

    // Reordenar dentro de la misma columna
    if (overIdx !== -1 && overIdx !== taskIdx) {
      setColumns((prev) => {
        const next = [...prev];
        next[colIdx] = {
          ...next[colIdx],
          tasks: arrayMove(next[colIdx].tasks, taskIdx, overIdx),
        };
        return next;
      });
    }

    // Persistir en backend
    try {
      await projectsService.moveTask(projectId, active.id, {
        column_id: col.id,
        position:  overIdx !== -1 ? overIdx : taskIdx,
      });
      qc.invalidateQueries(["board", projectId]);
    } catch (err) {
      console.error("Error al mover tarea:", err);
      // Revertir
      onBoardChange?.();
    }
  };

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCorners}
      onDragStart={handleDragStart}
      onDragOver={handleDragOver}
      onDragEnd={handleDragEnd}
    >
      <div className="flex gap-4 overflow-x-auto pb-6 pt-1">
        {(columns).map((col) => (
          <KanbanColumn
            key={col.id}
            column={col}
            tasks={col.tasks || []}
            projectId={projectId}
            onTaskClick={onTaskClick}
            onAddTask={onAddTask}
          />
        ))}
      </div>

      {/* Tarea flotante durante drag */}
      <DragOverlay>
        {activeTask && (
          <div className="rotate-2 shadow-2xl">
            <TaskCard task={activeTask} projectId={projectId} isDragging />
          </div>
        )}
      </DragOverlay>
    </DndContext>
  );
}