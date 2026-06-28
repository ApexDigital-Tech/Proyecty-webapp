import React, { useState, useEffect } from 'react';
import { DragDropContext, Droppable, Draggable, DropResult } from '@hello-pangea/dnd';
import { LayoutGrid, List, Plus, Clock, AlertCircle, MessageSquare, Flag, ArrowRight } from 'lucide-react';

import TaskDetailModal from './TaskDetailModal';

interface Task {
  id: number;
  title: string;
  description: string | null;
  status: 'TODO' | 'IN_PROGRESS' | 'REVIEW' | 'DONE';
  priority: 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT';
  assigneeId: number | null;
  startDate: string | null;
  dueDate: string | null;
  position: number;
  createdAt: string;
}

interface TabTareasProps {
  project: any;
  isEditable: boolean;
  token: string;
}

const COLUMNS: { id: Task['status']; title: string; color: string }[] = [
  { id: 'TODO', title: 'Por Hacer', color: 'border-slate-300' },
  { id: 'IN_PROGRESS', title: 'En Progreso', color: 'border-blue-400' },
  { id: 'REVIEW', title: 'En Revisión', color: 'border-amber-400' },
  { id: 'DONE', title: 'Completado', color: 'border-green-400' },
];

export default function TabTareas({ project, isEditable, token }: TabTareasProps) {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<'KANBAN' | 'LIST'>('KANBAN');

  // Form for new task
  const [showNewTaskForm, setShowNewTaskForm] = useState(false);
  const [newTaskTitle, setNewTaskTitle] = useState('');
  const [newTaskCol, setNewTaskCol] = useState<Task['status']>('TODO');

  // Selected task for editing
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);

  useEffect(() => {
    fetchTasks();
  }, [project.id]);

  const fetchTasks = async () => {
    try {
      const res = await fetch(`/api/tasks?projectId=${project.id}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (!res.ok) throw new Error('Error al cargar las tareas');
      const data = await res.json();
      setTasks(data);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleDragEnd = async (result: DropResult) => {
    const { source, destination, draggableId } = result;

    if (!destination) return;
    if (source.droppableId === destination.droppableId && source.index === destination.index) return;

    const sourceCol = source.droppableId as Task['status'];
    const destCol = destination.droppableId as Task['status'];
    const taskId = parseInt(draggableId);

    // Optimistic UI Update
    const previousTasks = [...tasks];
    
    // Find task and create a deep copy of tasks array to mutate
    const updatedTasks = Array.from(tasks);
    const taskIndex = updatedTasks.findIndex(t => t.id === taskId);
    if (taskIndex === -1) return;
    
    const taskToMove = { ...updatedTasks[taskIndex], status: destCol };
    
    // Remove from old position
    updatedTasks.splice(taskIndex, 1);
    
    // Insert into new position
    // First, find all tasks in destination column
    const destTasks = updatedTasks.filter(t => t.status === destCol).sort((a, b) => a.position - b.position);
    
    // Insert in the array at the visual position
    destTasks.splice(destination.index, 0, taskToMove);
    
    // Re-assign positions for the destination column
    const finalTasks = updatedTasks.map(t => {
      if (t.status === destCol) {
        const newPos = destTasks.findIndex(dt => dt.id === t.id);
        if (newPos !== -1) return { ...t, position: newPos * 1000 };
      }
      return t;
    });
    
    // We also need to add the moved task back into the array since we removed it
    if (!finalTasks.find(t => t.id === taskId)) {
       const newPos = destTasks.findIndex(dt => dt.id === taskId);
       taskToMove.position = newPos * 1000;
       finalTasks.push(taskToMove);
    }

    setTasks(finalTasks);

    try {
      const res = await fetch(`/api/tasks/${taskId}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ 
          status: destCol,
          position: taskToMove.position 
        })
      });
      if (!res.ok) throw new Error('Failed to update task position');
    } catch (err) {
      console.error(err);
      setTasks(previousTasks); // Rollback
      setError('Error al mover la tarea. Los cambios se han revertido.');
    }
  };

  const handleCreateTask = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTaskTitle.trim()) return;

    try {
      const res = await fetch('/api/tasks', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          projectId: project.id,
          title: newTaskTitle,
          status: newTaskCol,
        })
      });

      if (!res.ok) throw new Error('Error al crear tarea');
      const newTask = await res.json();
      setTasks([...tasks, newTask]);
      setNewTaskTitle('');
      setShowNewTaskForm(false);
    } catch (err: any) {
      setError(err.message);
    }
  };

  const handleUpdateTask = async (taskId: number, updates: Partial<Task>) => {
    try {
      const res = await fetch(`/api/tasks/${taskId}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify(updates)
      });
      if (!res.ok) throw new Error('Error al actualizar la tarea');
      const updatedTask = await res.json();
      setTasks(tasks.map(t => t.id === taskId ? updatedTask : t));
    } catch (err: any) {
      setError(err.message);
      throw err;
    }
  };

  const handleDeleteTask = async (taskId: number) => {
    try {
      const res = await fetch(`/api/tasks/${taskId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` }
      });
      if (!res.ok) throw new Error('Error al eliminar la tarea');
      setTasks(tasks.filter(t => t.id !== taskId));
    } catch (err: any) {
      setError(err.message);
      throw err;
    }
  };

  const getPriorityColor = (priority: string) => {
    switch(priority) {
      case 'URGENT': return 'bg-red-100 text-red-700 border-red-200';
      case 'HIGH': return 'bg-orange-100 text-orange-700 border-orange-200';
      case 'MEDIUM': return 'bg-blue-100 text-blue-700 border-blue-200';
      case 'LOW': return 'bg-slate-100 text-slate-700 border-slate-200';
      default: return 'bg-slate-100 text-slate-700 border-slate-200';
    }
  };

  return (
    <div className="space-y-4">
      {/* HEADER COMTROLS */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h3 className="text-lg font-bold text-slate-800">Tareas y Ejecución Operativa</h3>
          <p className="text-xs text-slate-500">Gestiona las actividades específicas, estado y responsables.</p>
        </div>
        
        <div className="flex items-center gap-2">
          {/* View Toggle */}
          <div className="flex bg-slate-100 p-1 rounded-lg border border-slate-200">
            <button
              onClick={() => setViewMode('KANBAN')}
              className={`p-1.5 rounded-md flex items-center justify-center transition-colors ${viewMode === 'KANBAN' ? 'bg-white shadow-sm text-[#008fa0]' : 'text-slate-400 hover:text-slate-600'}`}
              title="Vista Kanban"
            >
              <LayoutGrid className="w-4 h-4" />
            </button>
            <button
              onClick={() => setViewMode('LIST')}
              className={`p-1.5 rounded-md flex items-center justify-center transition-colors ${viewMode === 'LIST' ? 'bg-white shadow-sm text-[#008fa0]' : 'text-slate-400 hover:text-slate-600'}`}
              title="Vista Lista"
            >
              <List className="w-4 h-4" />
            </button>
          </div>

          {isEditable && (
            <button
              onClick={() => {
                setNewTaskCol('TODO');
                setShowNewTaskForm(true);
              }}
              className="bg-[#008fa0] hover:bg-[#007b8a] text-white px-3 py-1.5 rounded-md text-sm font-bold flex items-center gap-2 transition-colors cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              <span>Nueva Tarea</span>
            </button>
          )}
        </div>
      </div>

      {error && (
        <div className="bg-red-50 text-red-700 p-3 rounded-md text-sm">
          {error}
        </div>
      )}

      {loading ? (
        <div className="text-sm text-slate-500 py-4">Cargando tareas...</div>
      ) : (
        <>
          {viewMode === 'KANBAN' ? (
            /* KANBAN VIEW */
            <DragDropContext onDragEnd={handleDragEnd}>
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4 overflow-x-auto pb-4">
                {COLUMNS.map(col => {
                  const colTasks = tasks.filter(t => t.status === col.id).sort((a, b) => a.position - b.position);
                  
                  return (
                    <div key={col.id} className="flex flex-col bg-slate-50 rounded-lg border border-slate-200 min-w-[280px]">
                      <div className={`p-3 border-t-4 rounded-t-lg ${col.color} border-b border-b-slate-200 bg-white flex justify-between items-center`}>
                        <h4 className="font-bold text-sm text-slate-700">{col.title}</h4>
                        <span className="bg-slate-100 text-slate-500 text-xs px-2 py-0.5 rounded-full font-medium">
                          {colTasks.length}
                        </span>
                      </div>
                      
                      <Droppable droppableId={col.id}>
                        {(provided, snapshot) => (
                          <div
                            {...provided.droppableProps}
                            ref={provided.innerRef}
                            className={`flex-1 p-2 min-h-[150px] transition-colors ${snapshot.isDraggingOver ? 'bg-slate-100' : ''}`}
                          >
                            <div className="space-y-2">
                              {colTasks.map((task, index) => (
                                <Draggable key={task.id} draggableId={task.id.toString()} index={index} isDragDisabled={!isEditable}>
                                  {(provided, snapshot) => (
                                    <div
                                      ref={provided.innerRef}
                                      {...provided.draggableProps}
                                      {...provided.dragHandleProps}
                                      onClick={() => setSelectedTask(task)}
                                      className={`bg-white p-3 rounded-md border border-slate-200 shadow-sm cursor-grab active:cursor-grabbing hover:border-slate-300 transition-colors ${snapshot.isDragging ? 'shadow-lg ring-1 ring-[#008fa0]' : ''}`}
                                    >
                                      <div className="flex gap-2 items-start justify-between mb-2">
                                        <h5 className="text-sm font-semibold text-slate-800 leading-tight">{task.title}</h5>
                                      </div>
                                      
                                      <div className="flex flex-wrap items-center gap-2 mt-3">
                                        <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded border ${getPriorityColor(task.priority)}`}>
                                          {task.priority}
                                        </span>
                                        {task.dueDate && (
                                          <div className="flex items-center gap-1 text-[10px] font-medium text-slate-500 bg-slate-50 px-1.5 py-0.5 rounded border border-slate-100">
                                            <Clock className="w-3 h-3" />
                                            <span>{new Date(task.dueDate).toLocaleDateString()}</span>
                                          </div>
                                        )}
                                      </div>
                                    </div>
                                  )}
                                </Draggable>
                              ))}
                              {provided.placeholder}
                            </div>
                            
                            {isEditable && (
                              <button
                                onClick={() => {
                                  setNewTaskCol(col.id);
                                  setShowNewTaskForm(true);
                                }}
                                className="w-full mt-2 py-2 flex items-center justify-center gap-1 text-xs font-semibold text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-md transition-colors"
                              >
                                <Plus className="w-3 h-3" /> Añadir tarea
                              </button>
                            )}
                          </div>
                        )}
                      </Droppable>
                    </div>
                  );
                })}
              </div>
            </DragDropContext>
          ) : (
            /* LIST VIEW */
            <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
              <table className="w-full text-left text-sm">
                <thead className="bg-slate-50 border-b border-slate-200 text-xs text-slate-500">
                  <tr>
                    <th className="p-3 font-semibold">Tarea</th>
                    <th className="p-3 font-semibold">Estado</th>
                    <th className="p-3 font-semibold">Prioridad</th>
                    <th className="p-3 font-semibold">Vencimiento</th>
                    <th className="p-3 font-semibold">Asignado</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {tasks.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="p-8 text-center text-slate-500">
                        No hay tareas en este proyecto.
                      </td>
                    </tr>
                  ) : (
                    tasks.map(task => (
                      <tr 
                        key={task.id} 
                        onClick={() => setSelectedTask(task)}
                        className="hover:bg-slate-50 transition-colors cursor-pointer"
                      >
                        <td className="p-3">
                          <p className="font-semibold text-slate-800">{task.title}</p>
                          {task.description && <p className="text-xs text-slate-500 truncate max-w-xs mt-0.5">{task.description}</p>}
                        </td>
                        <td className="p-3">
                          <span className={`text-xs font-bold px-2 py-1 rounded-full ${
                            task.status === 'DONE' ? 'bg-green-100 text-green-700' :
                            task.status === 'REVIEW' ? 'bg-amber-100 text-amber-700' :
                            task.status === 'IN_PROGRESS' ? 'bg-blue-100 text-blue-700' :
                            'bg-slate-100 text-slate-700'
                          }`}>
                            {COLUMNS.find(c => c.id === task.status)?.title}
                          </span>
                        </td>
                        <td className="p-3">
                           <span className={`text-xs font-bold px-2 py-1 rounded border ${getPriorityColor(task.priority)}`}>
                             {task.priority}
                           </span>
                        </td>
                        <td className="p-3 text-slate-600">
                          {task.dueDate ? new Date(task.dueDate).toLocaleDateString() : '-'}
                        </td>
                        <td className="p-3 text-slate-600">
                          {task.assigneeId ? `User #${task.assigneeId}` : 'Sin asignar'}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      {/* NEW TASK MODAL */}
      {showNewTaskForm && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-md overflow-hidden">
            <div className="p-4 border-b border-slate-100 flex justify-between items-center bg-slate-50">
              <h4 className="font-bold text-slate-800">Nueva Tarea</h4>
              <button onClick={() => setShowNewTaskForm(false)} className="text-slate-400 hover:text-slate-600 font-bold">&times;</button>
            </div>
            <form onSubmit={handleCreateTask} className="p-4 space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Título de la Tarea</label>
                <input
                  type="text"
                  value={newTaskTitle}
                  onChange={(e) => setNewTaskTitle(e.target.value)}
                  className="w-full border border-slate-300 rounded-md p-2 text-sm focus:ring-1 focus:ring-[#008fa0] outline-none"
                  placeholder="Ej: Levantar requerimientos..."
                  autoFocus
                  required
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Columna (Estado Inicial)</label>
                <select
                  value={newTaskCol}
                  onChange={(e) => setNewTaskCol(e.target.value as Task['status'])}
                  className="w-full border border-slate-300 rounded-md p-2 text-sm focus:ring-1 focus:ring-[#008fa0] outline-none bg-white"
                >
                  {COLUMNS.map(c => <option key={c.id} value={c.id}>{c.title}</option>)}
                </select>
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowNewTaskForm(false)}
                  className="px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-100 rounded-md transition-colors"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={!newTaskTitle.trim()}
                  className="bg-[#008fa0] hover:bg-[#007b8a] text-white px-4 py-2 text-sm font-bold rounded-md transition-colors disabled:opacity-50"
                >
                  Crear Tarea
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
      {/* TASK DETAIL MODAL */}
      {selectedTask && (
        <TaskDetailModal
          task={selectedTask}
          isOpen={!!selectedTask}
          onClose={() => setSelectedTask(null)}
          onSave={handleUpdateTask}
          onDelete={handleDeleteTask}
          isEditable={isEditable}
          projectMembers={[]} // In future phase, we load real users from API
        />
      )}
    </div>
  );
}
