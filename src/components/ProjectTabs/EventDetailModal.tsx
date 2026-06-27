import React, { useState, useEffect } from 'react';
import { X, Save, Trash2, Calendar, MapPin, AlignLeft, Clock } from 'lucide-react';

export interface CalendarEventData {
  id?: number;
  title: string;
  description: string | null;
  startTime: string;
  endTime: string;
  location: string | null;
  type: 'MEETING' | 'FIELD_VISIT' | 'DEADLINE';
}

interface EventDetailModalProps {
  event: CalendarEventData | null;
  isOpen: boolean;
  onClose: () => void;
  onSave: (eventData: CalendarEventData) => Promise<void>;
  onDelete: (eventId: number) => Promise<void>;
  isEditable: boolean;
}

export default function EventDetailModal({ event, isOpen, onClose, onSave, onDelete, isEditable }: EventDetailModalProps) {
  const [editedEvent, setEditedEvent] = useState<CalendarEventData>({
    title: '',
    description: '',
    startTime: new Date().toISOString().slice(0, 16),
    endTime: new Date(Date.now() + 3600000).toISOString().slice(0, 16),
    location: '',
    type: 'MEETING'
  });
  
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (event) {
      setEditedEvent({
        ...event,
        startTime: event.startTime ? new Date(event.startTime).toISOString().slice(0, 16) : '',
        endTime: event.endTime ? new Date(event.endTime).toISOString().slice(0, 16) : ''
      });
    } else {
      setEditedEvent({
        title: '',
        description: '',
        startTime: new Date().toISOString().slice(0, 16),
        endTime: new Date(Date.now() + 3600000).toISOString().slice(0, 16),
        location: '',
        type: 'MEETING'
      });
    }
    setError(null);
  }, [event, isOpen]);

  if (!isOpen) return null;

  const handleChange = (field: keyof CalendarEventData, value: any) => {
    setEditedEvent({ ...editedEvent, [field]: value });
  };

  const handleSave = async () => {
    setIsSaving(true);
    setError(null);
    try {
      if (!editedEvent.title.trim()) throw new Error('El título es requerido');
      if (!editedEvent.startTime || !editedEvent.endTime) throw new Error('Las fechas son requeridas');
      
      const start = new Date(editedEvent.startTime);
      const end = new Date(editedEvent.endTime);
      if (end <= start) throw new Error('La fecha de fin debe ser posterior a la de inicio');

      await onSave({
        ...editedEvent,
        startTime: start.toISOString(),
        endTime: end.toISOString()
      });
      onClose();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!event?.id) return;
    if (!window.confirm('¿Estás seguro de eliminar este evento?')) return;
    setIsDeleting(true);
    setError(null);
    try {
      await onDelete(event.id);
      onClose();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/60 z-[100] flex justify-end">
      {/* Drawer */}
      <div className="bg-white w-full max-w-md h-full shadow-2xl flex flex-col animate-slide-in-right">
        
        {/* Header */}
        <div className="p-4 border-b border-slate-100 flex justify-between items-start bg-slate-50">
          <div>
            <h3 className="font-bold text-slate-800 text-lg">
              {event?.id ? 'Editar Evento' : 'Nuevo Evento'}
            </h3>
            {event?.id && <span className="text-xs text-slate-500 font-medium">#{event.id}</span>}
          </div>
          <button onClick={onClose} className="p-1 text-slate-400 hover:text-slate-600 hover:bg-slate-200 rounded-md transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-5 space-y-6">
          {error && (
            <div className="bg-red-50 text-red-700 p-3 rounded-md text-sm">
              {error}
            </div>
          )}

          {/* Title */}
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">Título</label>
            <input
              type="text"
              value={editedEvent.title}
              onChange={e => handleChange('title', e.target.value)}
              disabled={!isEditable}
              placeholder="Ej. Reunión de seguimiento"
              className="w-full border border-slate-300 rounded-md p-2 text-sm focus:ring-1 focus:ring-violet-500 outline-none disabled:bg-slate-50 disabled:text-slate-500 font-semibold"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            {/* Start Time */}
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1 flex items-center gap-1">
                <Clock className="w-3 h-3" /> Inicio
              </label>
              <input
                type="datetime-local"
                value={editedEvent.startTime}
                onChange={e => handleChange('startTime', e.target.value)}
                disabled={!isEditable}
                className="w-full border border-slate-300 rounded-md p-2 text-sm focus:ring-1 focus:ring-violet-500 outline-none disabled:bg-slate-50"
              />
            </div>

            {/* End Time */}
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1 flex items-center gap-1">
                <Clock className="w-3 h-3" /> Fin
              </label>
              <input
                type="datetime-local"
                value={editedEvent.endTime}
                onChange={e => handleChange('endTime', e.target.value)}
                disabled={!isEditable}
                className="w-full border border-slate-300 rounded-md p-2 text-sm focus:ring-1 focus:ring-violet-500 outline-none disabled:bg-slate-50"
              />
            </div>
          </div>
          
          <div className="grid grid-cols-2 gap-4">
            {/* Type */}
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">Tipo de Evento</label>
              <select
                value={editedEvent.type}
                onChange={e => handleChange('type', e.target.value)}
                disabled={!isEditable}
                className="w-full border border-slate-300 rounded-md p-2 text-sm focus:ring-1 focus:ring-violet-500 outline-none disabled:bg-slate-50 bg-white"
              >
                <option value="MEETING">Reunión</option>
                <option value="FIELD_VISIT">Visita de Campo</option>
                <option value="DEADLINE">Fecha Límite</option>
              </select>
            </div>

            {/* Location */}
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1 flex items-center gap-1">
                <MapPin className="w-3 h-3" /> Ubicación
              </label>
              <input
                type="text"
                value={editedEvent.location || ''}
                onChange={e => handleChange('location', e.target.value)}
                disabled={!isEditable}
                placeholder="Ej. Oficina Central o Meet"
                className="w-full border border-slate-300 rounded-md p-2 text-sm focus:ring-1 focus:ring-violet-500 outline-none disabled:bg-slate-50"
              />
            </div>
          </div>

          {/* Description */}
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1 flex items-center gap-1">
              <AlignLeft className="w-3 h-3" /> Detalles / Agenda
            </label>
            <textarea
              value={editedEvent.description || ''}
              onChange={e => handleChange('description', e.target.value)}
              disabled={!isEditable}
              rows={4}
              placeholder="Detalles sobre el evento..."
              className="w-full border border-slate-300 rounded-md p-2 text-sm focus:ring-1 focus:ring-violet-500 outline-none disabled:bg-slate-50 resize-none"
            />
          </div>

        </div>

        {/* Footer */}
        {isEditable && (
          <div className="p-4 border-t border-slate-200 bg-slate-50 flex justify-between items-center">
            {event?.id ? (
              <button
                onClick={handleDelete}
                disabled={isDeleting || isSaving}
                className="text-red-600 hover:bg-red-50 px-3 py-2 rounded-md text-sm font-semibold transition-colors flex items-center gap-1 disabled:opacity-50"
              >
                <Trash2 className="w-4 h-4" /> Eliminar
              </button>
            ) : <div />}
            <div className="flex gap-2">
              <button
                onClick={onClose}
                className="text-slate-600 hover:bg-slate-200 px-4 py-2 rounded-md text-sm font-semibold transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={handleSave}
                disabled={isSaving || isDeleting || !editedEvent.title.trim()}
                className="bg-violet-600 hover:bg-violet-700 text-white px-4 py-2 rounded-md text-sm font-bold flex items-center gap-2 transition-colors disabled:opacity-50 shadow-sm cursor-pointer"
              >
                <Save className="w-4 h-4" />
                {isSaving ? 'Guardando...' : 'Guardar'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
