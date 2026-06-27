import React, { useState, useEffect } from 'react';
import { Calendar, dateFnsLocalizer, Event as CalendarEvent, View } from 'react-big-calendar';
import { format, parse, startOfWeek, getDay, isBefore, isToday, isAfter, addDays, startOfDay } from 'date-fns';
import { es } from 'date-fns/locale';
import 'react-big-calendar/lib/css/react-big-calendar.css';
import { CalendarDays, AlertCircle, Clock, Calendar as CalendarIcon, CheckSquare, Plus } from 'lucide-react';
import EventDetailModal, { CalendarEventData } from './ProjectTabs/EventDetailModal.tsx';
import TaskDetailModal from './ProjectTabs/TaskDetailModal.tsx';

const locales = {
  'es': es,
};

const localizer = dateFnsLocalizer({
  format,
  parse,
  startOfWeek: () => startOfWeek(new Date(), { locale: es }),
  getDay,
  locales,
});

interface GlobalAgendaProps {
  token: string;
}

export default function GlobalAgenda({ token }: GlobalAgendaProps) {
  const [items, setItems] = useState<any[]>([]);
  const [filteredItems, setFilteredItems] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [view, setView] = useState<View>('month');
  const [date, setDate] = useState(new Date());

  // Filters
  const [filterType, setFilterType] = useState<'ALL' | 'TASK' | 'EVENT'>('ALL');
  const [filterProject, setFilterProject] = useState<string>('ALL'); // projectCode

  // Modals
  const [selectedEvent, setSelectedEvent] = useState<CalendarEventData | null>(null);
  const [isEventModalOpen, setIsEventModalOpen] = useState(false);
  const [selectedTask, setSelectedTask] = useState<any | null>(null);
  const [isTaskModalOpen, setIsTaskModalOpen] = useState(false);

  // Users for Task Modal (simplified)
  const [tenantUsers, setTenantUsers] = useState<{id: number, name: string}[]>([]);

  useEffect(() => {
    fetchAgenda();
    fetchUsers();
  }, []);

  useEffect(() => {
    let result = items;
    if (filterType === 'TASK') result = result.filter(i => i.sourceType === 'task');
    if (filterType === 'EVENT') result = result.filter(i => i.sourceType === 'event');
    if (filterProject !== 'ALL') result = result.filter(i => i.projectCode === filterProject);
    setFilteredItems(result);
  }, [items, filterType, filterProject]);

  const fetchAgenda = async () => {
    setIsLoading(true);
    try {
      const res = await fetch('/api/agenda', {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        // Parse dates
        const parsed = data.map((d: any) => ({
          ...d,
          start: new Date(d.start),
          end: new Date(d.end),
        }));
        setItems(parsed);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setIsLoading(false);
    }
  };

  const fetchUsers = async () => {
    try {
      const res = await fetch('/api/users', {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setTenantUsers(data.map((u: any) => ({ id: u.id, name: u.name })));
      }
    } catch(e) {}
  };

  // Convert to react-big-calendar format
  const calendarEvents: CalendarEvent[] = filteredItems.map(item => ({
    title: item.projectCode ? `[${item.projectCode}] ${item.title}` : item.title,
    start: item.start,
    end: item.end,
    allDay: item.sourceType === 'task' ? true : false,
    resource: item, // save original
  }));

  const handleSelectEvent = (event: CalendarEvent) => {
    const item = event.resource;
    if (item.sourceType === 'task') {
      setSelectedTask(item);
      setIsTaskModalOpen(true);
    } else {
      setSelectedEvent(item);
      setIsEventModalOpen(true);
    }
  };

  const handleSelectSlot = (slotInfo: { start: Date; end: Date }) => {
    // Solo permitimos crear Eventos desde Agenda Global
    setSelectedEvent({
      title: '',
      description: '',
      startTime: slotInfo.start.toISOString().slice(0, 16),
      endTime: slotInfo.end.toISOString().slice(0, 16),
      location: '',
      type: 'MEETING'
    });
    setIsEventModalOpen(true);
  };

  const handleSaveEvent = async (eventData: CalendarEventData) => {
    const url = eventData.id ? `/api/events/${eventData.id}` : `/api/events`;
    const method = eventData.id ? 'PATCH' : 'POST';
    
    // Si no tiene id, es un evento nuevo global (sin projectId)
    const payload = { ...eventData };

    const res = await fetch(url, {
      method,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify(payload)
    });
    if (!res.ok) throw new Error('Failed to save event');
    fetchAgenda();
    setIsEventModalOpen(false);
  };

  const handleDeleteEvent = async (eventId: number) => {
    const res = await fetch(`/api/events/${eventId}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` }
    });
    if (!res.ok) throw new Error('Failed to delete event');
    fetchAgenda();
    setIsEventModalOpen(false);
  };

  const handleSaveTask = async (taskId: number, updates: any) => {
    const res = await fetch(`/api/tasks/${taskId}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify(updates)
    });
    if (!res.ok) throw new Error('Failed to update task');
    fetchAgenda();
    setIsTaskModalOpen(false);
  };

  const handleDeleteTask = async (taskId: number) => {
    const res = await fetch(`/api/tasks/${taskId}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` }
    });
    if (!res.ok) throw new Error('Failed to delete task');
    fetchAgenda();
    setIsTaskModalOpen(false);
  };

  // Deadlines Logic
  const today = startOfDay(new Date());
  const next7Days = addDays(today, 7);
  
  const tasksAndEventsWithDeadlines = items.filter(i => {
    // Only tasks with dueDate or events with endTime that are NOT DONE
    if (i.sourceType === 'task' && i.status === 'DONE') return false;
    return true;
  }).sort((a, b) => a.end.getTime() - b.end.getTime());

  const overdue = tasksAndEventsWithDeadlines.filter(i => isBefore(i.end, today));
  const dueToday = tasksAndEventsWithDeadlines.filter(i => isToday(i.end));
  const dueNext7Days = tasksAndEventsWithDeadlines.filter(i => isAfter(i.end, today) && isBefore(i.end, next7Days) && !isToday(i.end));

  const uniqueProjects = Array.from(new Set(items.map(i => i.projectCode).filter(Boolean)));

  return (
    <div className="flex flex-col h-full bg-slate-50 relative animate-in fade-in duration-300">
      
      {/* HEADER */}
      <div className="bg-white border-b border-slate-200 px-6 py-5 flex items-center justify-between shadow-sm sticky top-0 z-10">
        <div className="flex items-center space-x-3">
          <div className="w-10 h-10 bg-indigo-600 rounded-xl flex items-center justify-center shadow-lg shadow-indigo-600/20">
            <CalendarDays className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="text-xl font-sans font-bold text-slate-800 leading-tight">Agenda Ejecutiva Global</h1>
            <p className="text-xs font-medium text-slate-500">Vista consolidada de proyectos</p>
          </div>
        </div>

        {/* FILTERS */}
        <div className="flex items-center space-x-3">
          <select 
            value={filterType} 
            onChange={e => setFilterType(e.target.value as any)}
            className="text-xs border border-slate-200 rounded-md px-3 py-1.5 bg-slate-50 focus:outline-none focus:ring-2 focus:ring-indigo-500"
          >
            <option value="ALL">Todas las Entidades</option>
            <option value="TASK">Solo Tareas</option>
            <option value="EVENT">Solo Eventos</option>
          </select>

          <select 
            value={filterProject} 
            onChange={e => setFilterProject(e.target.value)}
            className="text-xs border border-slate-200 rounded-md px-3 py-1.5 bg-slate-50 focus:outline-none focus:ring-2 focus:ring-indigo-500 max-w-[200px]"
          >
            <option value="ALL">Todos los Proyectos</option>
            {uniqueProjects.map(p => (
              <option key={p as string} value={p as string}>{p as string}</option>
            ))}
          </select>
          
          <button 
            onClick={() => handleSelectSlot({ start: new Date(), end: addDays(new Date(), 1) })}
            className="flex items-center space-x-1.5 bg-indigo-600 text-white px-3 py-1.5 rounded-md text-xs font-semibold hover:bg-indigo-700 shadow-sm transition-colors"
          >
            <Plus className="w-4 h-4" />
            <span className="hidden sm:inline">Evento Global</span>
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-6">
        <div className="flex flex-col lg:flex-row gap-6 max-w-7xl mx-auto h-[800px]">
          
          {/* LEFT: CALENDAR */}
          <div className="flex-1 bg-white border border-slate-200 rounded-xl shadow-sm p-4 h-full flex flex-col min-h-[500px]">
            {isLoading ? (
              <div className="flex items-center justify-center h-full text-slate-400">
                <Clock className="w-8 h-8 animate-spin" />
              </div>
            ) : (
              <Calendar
                localizer={localizer}
                events={calendarEvents}
                startAccessor="start"
                endAccessor="end"
                style={{ height: '100%', fontSize: '13px', fontFamily: 'Inter, sans-serif' }}
                messages={{
                  next: "Sig",
                  previous: "Ant",
                  today: "Hoy",
                  month: "Mes",
                  week: "Semana",
                  day: "Día",
                  agenda: "Agenda",
                }}
                view={view}
                onView={setView}
                date={date}
                onNavigate={setDate}
                selectable
                onSelectEvent={handleSelectEvent}
                onSelectSlot={handleSelectSlot}
                eventPropGetter={(event) => {
                  const item = event.resource;
                  let backgroundColor = '#3b82f6'; // blue for task
                  if (item.sourceType === 'event') backgroundColor = '#8b5cf6'; // violet for events

                  return {
                    style: {
                      backgroundColor,
                      border: 'none',
                      borderRadius: '4px',
                      color: '#fff',
                      fontSize: '11px',
                      fontWeight: 600,
                      padding: '2px 5px',
                    },
                  };
                }}
              />
            )}
          </div>

          {/* RIGHT: DEADLINES PANEL */}
          <div className="w-full lg:w-80 flex flex-col space-y-4 h-full">
            <h2 className="text-sm font-bold text-slate-800 px-1">Próximos Vencimientos</h2>
            
            <div className="flex-1 overflow-y-auto pr-2 space-y-5 custom-scrollbar">
              {/* Overdue */}
              {overdue.length > 0 && (
                <div className="space-y-2">
                  <h3 className="text-xs font-bold text-red-600 flex items-center uppercase tracking-wider">
                    <AlertCircle className="w-3.5 h-3.5 mr-1" /> Vencidos
                  </h3>
                  {overdue.map(item => (
                    <DeadlineCard key={`ov-${item.sourceType}-${item.id}`} item={item} onClick={() => handleSelectEvent({ title: '', start: new Date(), end: new Date(), resource: item })} />
                  ))}
                </div>
              )}

              {/* Due Today */}
              {dueToday.length > 0 && (
                <div className="space-y-2">
                  <h3 className="text-xs font-bold text-amber-600 flex items-center uppercase tracking-wider">
                    <Clock className="w-3.5 h-3.5 mr-1" /> Vence Hoy
                  </h3>
                  {dueToday.map(item => (
                    <DeadlineCard key={`dt-${item.sourceType}-${item.id}`} item={item} onClick={() => handleSelectEvent({ title: '', start: new Date(), end: new Date(), resource: item })} />
                  ))}
                </div>
              )}

              {/* Due Next 7 Days */}
              {dueNext7Days.length > 0 && (
                <div className="space-y-2">
                  <h3 className="text-xs font-bold text-emerald-600 flex items-center uppercase tracking-wider">
                    <CalendarIcon className="w-3.5 h-3.5 mr-1" /> Próximos 7 Días
                  </h3>
                  {dueNext7Days.map(item => (
                    <DeadlineCard key={`d7-${item.sourceType}-${item.id}`} item={item} onClick={() => handleSelectEvent({ title: '', start: new Date(), end: new Date(), resource: item })} />
                  ))}
                </div>
              )}

              {overdue.length === 0 && dueToday.length === 0 && dueNext7Days.length === 0 && (
                <div className="text-center py-10 bg-slate-50 border border-slate-100 rounded-lg">
                  <CheckSquare className="w-8 h-8 text-slate-300 mx-auto mb-2" />
                  <p className="text-xs text-slate-500 font-medium">No hay vencimientos críticos</p>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Modals */}
      {selectedTask && (
        <TaskDetailModal
          task={selectedTask}
          isOpen={isTaskModalOpen}
          onClose={() => setIsTaskModalOpen(false)}
          onSave={handleSaveTask}
          onDelete={handleDeleteTask}
          isEditable={true} // As per global view logic, might restrict by RBAC later
          projectMembers={tenantUsers}
        />
      )}

      <EventDetailModal
        event={selectedEvent}
        isOpen={isEventModalOpen}
        onClose={() => setIsEventModalOpen(false)}
        onSave={handleSaveEvent}
        onDelete={handleDeleteEvent}
        isEditable={true}
      />
    </div>
  );
}

function DeadlineCard({ item, onClick }: { item: any, onClick: () => void }) {
  const isTask = item.sourceType === 'task';
  const colorClass = isTask ? 'bg-blue-50 border-blue-100 text-blue-700' : 'bg-violet-50 border-violet-100 text-violet-700';
  const Icon = isTask ? CheckSquare : CalendarIcon;
  
  return (
    <div 
      onClick={onClick}
      className={`p-3 border rounded-lg cursor-pointer hover:shadow-md transition-shadow ${colorClass}`}
    >
      <div className="flex items-start justify-between">
        <div className="flex-1 pr-2">
          <div className="flex items-center space-x-1.5 mb-1">
            <Icon className="w-3.5 h-3.5 opacity-70" />
            <span className="text-[10px] font-bold uppercase opacity-80">{item.projectCode || 'GLOBAL'}</span>
          </div>
          <h4 className="text-xs font-semibold leading-tight line-clamp-2">{item.title}</h4>
        </div>
      </div>
      <div className="mt-2 text-[10px] font-medium opacity-80">
        Vence: {format(item.end, "d MMM yyyy", { locale: es })}
      </div>
    </div>
  );
}
