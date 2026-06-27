import React, { useState, useEffect, useCallback } from 'react';
import { Calendar, momentLocalizer, Event as CalendarEvent } from 'react-big-calendar';
import moment from 'moment';
import 'moment/locale/es';
import 'react-big-calendar/lib/css/react-big-calendar.css';
import { ProjectFull } from '../ProjectDetail';
import { Plus, Calendar as CalendarIcon } from 'lucide-react';
import TaskDetailModal from './TaskDetailModal';
import EventDetailModal, { CalendarEventData } from './EventDetailModal';

moment.locale('es');
const localizer = momentLocalizer(moment);

interface TabCalendarioProps {
  project: ProjectFull;
  onRefreshProject: () => void;
  isEditable: boolean;
  token: string;
}

interface AgendaItem extends CalendarEvent {
  id: number;
  sourceType: 'task' | 'event';
  title: string;
  start: Date;
  end: Date;
  allDay?: boolean;
  resource?: any;
}

export default function TabCalendario({ project, onRefreshProject, isEditable, token }: TabCalendarioProps) {
  const [events, setEvents] = useState<AgendaItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Modals state
  const [selectedTask, setSelectedTask] = useState<any | null>(null);
  const [isTaskModalOpen, setIsTaskModalOpen] = useState(false);
  const [selectedEvent, setSelectedEvent] = useState<CalendarEventData | null>(null);
  const [isEventModalOpen, setIsEventModalOpen] = useState(false);

  const fetchAgenda = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/agenda?projectId=${project.id}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (!res.ok) throw new Error('Failed to fetch agenda');
      const data = await res.json();
      
      const formattedEvents: AgendaItem[] = data.map((item: any) => ({
        id: item.id,
        sourceType: item.sourceType,
        title: item.title,
        start: new Date(item.start),
        end: new Date(item.end),
        allDay: item.sourceType === 'task' && !item.startTime, // tasks usually are all-day unless we add time
        resource: item
      }));
      
      setEvents(formattedEvents);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [project.id]);

  useEffect(() => {
    fetchAgenda();
  }, [fetchAgenda]);

  const eventStyleGetter = (event: AgendaItem) => {
    let backgroundColor = '#3174ad'; // Default blue
    let border = 'none';

    if (event.sourceType === 'task') {
      const status = event.resource.status;
      if (status === 'DONE') backgroundColor = '#10b981'; // emerald-500
      else if (status === 'IN_PROGRESS') backgroundColor = '#3b82f6'; // blue-500
      else if (status === 'REVIEW') backgroundColor = '#eab308'; // yellow-500
      else backgroundColor = '#64748b'; // slate-500

      // Task outline
      border = '1px solid rgba(0,0,0,0.1)';
    } else if (event.sourceType === 'event') {
      backgroundColor = '#8b5cf6'; // violet-500
    }

    return {
      style: {
        backgroundColor,
        borderRadius: '4px',
        opacity: 0.9,
        color: 'white',
        border,
        display: 'block',
        fontSize: '12px'
      }
    };
  };

  const handleSelectEvent = (event: AgendaItem) => {
    if (event.sourceType === 'task') {
      setSelectedTask(event.resource);
      setIsTaskModalOpen(true);
    } else {
      setSelectedEvent(event.resource);
      setIsEventModalOpen(true);
    }
  };

  const handleNewEvent = () => {
    setSelectedEvent(null);
    setIsEventModalOpen(true);
  };

  const handleEventSave = async (eventData: CalendarEventData) => {
    try {
      const url = eventData.id ? `/api/events/${eventData.id}` : `/api/events`;
      const method = eventData.id ? 'PATCH' : 'POST';
      
      const payload = { ...eventData, projectId: project.id };

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(payload)
      });
      if (!res.ok) throw new Error('Failed to save event');
      fetchAgenda();
    } catch (err) {
      console.error(err);
      alert('Error saving event');
    }
  };

  const handleEventDelete = async (eventId: number) => {
    try {
      const res = await fetch(`/api/events/${eventId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` }
      });
      if (!res.ok) throw new Error('Failed to delete event');
      setIsEventModalOpen(false);
      fetchAgenda();
    } catch (err) {
      console.error(err);
      alert('Error deleting event');
    }
  };

  const handleTaskSave = async (taskId: number, updates: any) => {
    try {
      const res = await fetch(`/api/tasks/${taskId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(updates)
      });
      if (!res.ok) throw new Error('Failed to update task');
      onRefreshProject();
      fetchAgenda();
    } catch (err) {
      console.error(err);
      alert('Error saving task');
    }
  };

  const handleTaskDelete = async (taskId: number) => {
    try {
      const res = await fetch(`/api/tasks/${taskId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` }
      });
      if (!res.ok) throw new Error('Failed to delete task');
      setIsTaskModalOpen(false);
      onRefreshProject();
      fetchAgenda();
    } catch (err) {
      console.error(err);
      alert('Error deleting task');
    }
  };

  return (
    <div className="bg-white rounded-lg shadow-sm border border-slate-200">
      <div className="p-4 border-b border-slate-200 flex justify-between items-center">
        <div>
          <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2">
            <CalendarIcon className="w-5 h-5 text-indigo-600" />
            Calendario Operativo
          </h2>
          <p className="text-sm text-slate-500">Vista consolidada de tareas, vencimientos y eventos</p>
        </div>
        <div className="flex gap-2">
          {/* Legend */}
          <div className="flex items-center gap-3 text-xs mr-4">
            <span className="flex items-center gap-1"><div className="w-3 h-3 rounded bg-slate-500"></div> Tareas</span>
            <span className="flex items-center gap-1"><div className="w-3 h-3 rounded bg-violet-500"></div> Eventos</span>
          </div>
          <button className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white px-3 py-1.5 rounded-md text-sm font-medium transition-colors cursor-pointer" onClick={handleNewEvent}>
            <Plus className="w-4 h-4" /> Nuevo Evento
          </button>
        </div>
      </div>

      <div className="bg-blue-50 text-blue-700 p-3 m-4 rounded-lg text-xs flex items-center border border-blue-100">
        <span className="mr-2 text-lg leading-none">ℹ️</span>
        <p>
          <strong>Nota de diseño:</strong> En este calendario solo se visualizan los eventos y tareas <strong>pertenecientes a este proyecto</strong>. Los <em>Eventos Globales</em> creados en la Agenda Ejecutiva no aparecen aquí para mantener el aislamiento de datos.
        </p>
      </div>

      <div className="p-4" style={{ height: '70vh', minHeight: '500px' }}>
        {loading ? (
          <div className="h-full flex justify-center items-center">Cargando calendario...</div>
        ) : error ? (
          <div className="text-red-500 text-center">{error}</div>
        ) : (
          <Calendar
            localizer={localizer}
            events={events}
            startAccessor="start"
            endAccessor="end"
            eventPropGetter={eventStyleGetter}
            onSelectEvent={handleSelectEvent}
            messages={{
              next: "Sig",
              previous: "Ant",
              today: "Hoy",
              month: "Mes",
              week: "Semana",
              day: "Día",
              agenda: "Agenda",
              date: "Fecha",
              time: "Hora",
              event: "Evento",
              noEventsInRange: "No hay eventos en este rango."
            }}
          />
        )}
      </div>

      {selectedTask && (
        <TaskDetailModal
          task={selectedTask}
          isOpen={isTaskModalOpen}
          onClose={() => setIsTaskModalOpen(false)}
          onSave={handleTaskSave}
          onDelete={handleTaskDelete}
          isEditable={isEditable}
          projectMembers={project.users?.map(pu => pu.user) || []}
        />
      )}

      <EventDetailModal
        event={selectedEvent}
        isOpen={isEventModalOpen}
        onClose={() => setIsEventModalOpen(false)}
        onSave={handleEventSave}
        onDelete={handleEventDelete}
        isEditable={isEditable}
      />
    </div>
  );
}
