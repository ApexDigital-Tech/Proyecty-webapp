import React, { useState, useEffect, useCallback } from 'react';
import { Gantt, Task as GanttTask, ViewMode } from 'gantt-task-react';
import 'gantt-task-react/dist/index.css';

import { BarChart } from 'lucide-react';
import moment from 'moment';

interface TabCronogramaProps {
  project: any;
  onRefreshProject: () => void;
  isEditable: boolean;
  token: string;
}

export default function TabCronograma({ project, onRefreshProject, isEditable, token }: TabCronogramaProps) {
  const [view, setView] = useState<ViewMode>(ViewMode.Month);
  const [tasks, setTasks] = useState<GanttTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchAgenda = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/agenda?projectId=${project.id}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (!res.ok) throw new Error('Failed to fetch agenda');
      const data = await res.json();
      
      const formattedTasks: GanttTask[] = [];

      data.forEach((item: any) => {
        let isMilestone = false;
        let start = new Date(item.start);
        let end = new Date(item.end);

        // Si la tarea o evento ocurre en el mismo milisegundo (o mismo día si no hay horas)
        if (start.getTime() === end.getTime()) {
          isMilestone = true;
        }

        let progress = 0;
        let backgroundColor = '#64748b'; // slate

        if (item.sourceType === 'task') {
          const status = item.resource?.status || item.status; 
          if (status === 'DONE') progress = 100;
          else if (status === 'IN_PROGRESS') progress = 50;
          else if (status === 'REVIEW') progress = 75;
          
          backgroundColor = '#3b82f6'; // blue
        } else if (item.sourceType === 'event') {
          backgroundColor = '#8b5cf6'; // violet
          isMilestone = true; // Por requerimiento: eventos como hitos para evitar drag
          if (start.getTime() !== end.getTime()) {
             isMilestone = false; // A menos que tenga duracion, pero lo tratamos con readOnly
          }
        }

        formattedTasks.push({
          start,
          end,
          name: item.title,
          id: `${item.sourceType}-${item.id}`,
          type: isMilestone ? 'milestone' : 'task',
          progress,
          // Solo tareas con duración se pueden arrastrar
          isDisabled: !isEditable || item.sourceType === 'event' || isMilestone,
          styles: { backgroundColor, progressColor: '#10b981', progressSelectedColor: '#059669' }
        });
      });

      // Asegurar al menos una tarea para que Gantt no crashee
      if (formattedTasks.length === 0) {
        formattedTasks.push({
          start: new Date(),
          end: new Date(),
          name: 'Inicio de Proyecto',
          id: 'project-start',
          type: 'milestone',
          progress: 100,
          isDisabled: true,
          styles: { backgroundColor: '#10b981' }
        });
      }

      setTasks(formattedTasks);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [project.id, isEditable, token]);

  useEffect(() => {
    fetchAgenda();
  }, [fetchAgenda]);

  const handleTaskChange = async (task: GanttTask) => {
    if (!isEditable || task.isDisabled) return;
    
    const [sourceType, idStr] = task.id.split('-');
    const id = parseInt(idStr);

    if (sourceType === 'task') {
      try {
        const updates = {
          startDate: moment(task.start).format('YYYY-MM-DD'),
          dueDate: moment(task.end).format('YYYY-MM-DD'),
        };

        const res = await fetch(`/api/tasks/${id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify(updates)
        });
        
        if (!res.ok) throw new Error('Failed to update task dates');
        // Notificamos al componente padre por si quiere recargar
        onRefreshProject();
      } catch (err) {
        console.error('Error updating dates:', err);
        alert('Error al reprogramar la tarea');
        fetchAgenda(); // rollback visual
      }
    }
  };

  const handleTaskProgressChange = async (task: GanttTask) => {
    // Requerimiento: "No usar progress automático real todavía."
    // Hacemos rollback visual
    fetchAgenda(); 
  };

  return (
    <div className="bg-white rounded-lg shadow-sm border border-slate-200">
      {/* Header y Controles */}
      <div className="p-4 border-b border-slate-200 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h2 className="text-lg font-bold text-slate-800 flex items-center">
            <BarChart className="w-5 h-5 mr-2 text-indigo-600" />
            Cronograma (Gantt)
          </h2>
          <p className="text-sm text-slate-500">Vista temporal interactiva de hitos y tareas</p>
        </div>
        
        <div className="flex items-center space-x-4">
          <div className="flex items-center space-x-3 text-xs font-medium text-slate-600 mr-2">
            <span className="flex items-center"><div className="w-3 h-3 bg-blue-500 rounded-sm mr-1.5"></div>Tareas</span>
            <span className="flex items-center"><div className="w-3 h-3 bg-violet-500 rounded-sm mr-1.5"></div>Eventos / Hitos</span>
          </div>
          <div className="flex bg-slate-100 p-1 rounded-lg border border-slate-200">
            <button
              onClick={() => setView(ViewMode.Day)}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-all ${
                view === ViewMode.Day ? 'bg-white text-indigo-700 shadow-sm border border-slate-200' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Día
            </button>
            <button
              onClick={() => setView(ViewMode.Week)}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-all ${
                view === ViewMode.Week ? 'bg-white text-indigo-700 shadow-sm border border-slate-200' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Semana
            </button>
            <button
              onClick={() => setView(ViewMode.Month)}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-all ${
                view === ViewMode.Month ? 'bg-white text-indigo-700 shadow-sm border border-slate-200' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Mes
            </button>
          </div>
        </div>
      </div>

      <div className="bg-blue-50 text-blue-700 p-3 m-4 rounded-lg text-xs flex items-center border border-blue-100">
        <span className="mr-2 text-lg leading-none">ℹ️</span>
        <p>
          <strong>Nota de diseño:</strong> En este cronograma solo se visualizan los eventos y tareas <strong>pertenecientes a este proyecto</strong>. Los <em>Eventos Globales</em> creados en la Agenda Ejecutiva no aparecen aquí para mantener el aislamiento de datos.
        </p>
      </div>

      <div className="p-4 overflow-x-auto">
        {loading ? (
          <div className="flex justify-center items-center h-64 text-slate-500">Cargando cronograma...</div>
        ) : error ? (
          <div className="flex justify-center items-center h-64 text-red-500">{error}</div>
        ) : (
          <div className="min-w-[800px] gantt-wrapper-custom">
            <Gantt
              tasks={tasks}
              viewMode={view}
              onDateChange={handleTaskChange}
              onProgressChange={handleTaskProgressChange}
              listCellWidth="155px"
              columnWidth={view === ViewMode.Month ? 60 : view === ViewMode.Week ? 150 : 60}
              locale="es"
              projectBackgroundColor="#3174ad"
              todayColor="rgba(252, 211, 77, 0.2)"
            />
          </div>
        )}
      </div>
    </div>
  );
}
