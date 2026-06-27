import React, { useState, useEffect } from 'react';
import { X, Save, Trash2, Calendar, User, AlignLeft, AlertTriangle } from 'lucide-react';

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

interface TaskDetailModalProps {
  task: Task;
  isOpen: boolean;
  onClose: () => void;
  onSave: (taskId: number, updates: Partial<Task>) => Promise<void>;
  onDelete: (taskId: number) => Promise<void>;
  isEditable: boolean;
  projectMembers: { id: number; name: string }[]; // We might need to pass this or fetch it
}

export default function TaskDetailModal({ task, isOpen, onClose, onSave, onDelete, isEditable, projectMembers }: TaskDetailModalProps) {
  const [editedTask, setEditedTask] = useState<Task>(task);
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setEditedTask(task);
    setError(null);
  }, [task, isOpen]);

  if (!isOpen) return null;

  const handleChange = (field: keyof Task, value: any) => {
    setEditedTask({ ...editedTask, [field]: value });
  };

  const handleSave = async () => {
    setIsSaving(true);
    setError(null);
    try {
      const updates: Partial<Task> = {
        title: editedTask.title,
        description: editedTask.description,
        status: editedTask.status,
        priority: editedTask.priority,
        startDate: editedTask.startDate,
        dueDate: editedTask.dueDate,
        assigneeId: editedTask.assigneeId
      };
      await onSave(task.id, updates);
      onClose();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!window.confirm('¿Estás seguro de eliminar esta tarea?')) return;
    setIsDeleting(true);
    setError(null);
    try {
      await onDelete(task.id);
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
            <h3 className="font-bold text-slate-800 text-lg">Detalle de Tarea</h3>
            <span className="text-xs text-slate-500 font-medium">#{task.id}</span>
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
              value={editedTask.title}
              onChange={e => handleChange('title', e.target.value)}
              disabled={!isEditable}
              className="w-full border border-slate-300 rounded-md p-2 text-sm focus:ring-1 focus:ring-[#008fa0] outline-none disabled:bg-slate-50 disabled:text-slate-500 font-semibold"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            {/* Status */}
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">Estado</label>
              <select
                value={editedTask.status}
                onChange={e => handleChange('status', e.target.value)}
                disabled={!isEditable}
                className="w-full border border-slate-300 rounded-md p-2 text-sm focus:ring-1 focus:ring-[#008fa0] outline-none disabled:bg-slate-50 bg-white"
              >
                <option value="TODO">Por Hacer</option>
                <option value="IN_PROGRESS">En Progreso</option>
                <option value="REVIEW">En Revisión</option>
                <option value="DONE">Completado</option>
              </select>
            </div>

            {/* Priority */}
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">Prioridad</label>
              <select
                value={editedTask.priority}
                onChange={e => handleChange('priority', e.target.value)}
                disabled={!isEditable}
                className="w-full border border-slate-300 rounded-md p-2 text-sm focus:ring-1 focus:ring-[#008fa0] outline-none disabled:bg-slate-50 bg-white"
              >
                <option value="LOW">Baja</option>
                <option value="MEDIUM">Media</option>
                <option value="HIGH">Alta</option>
                <option value="URGENT">Urgente</option>
              </select>
            </div>

            <div className="grid grid-cols-2 gap-4">
                {/* Start Date */}
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1 flex items-center gap-1">
                    <Calendar className="w-3 h-3" /> Inicio
                  </label>
                  <input
                    type="date"
                    value={editedTask.startDate ? editedTask.startDate.substring(0, 10) : ''}
                    onChange={e => handleChange('startDate', e.target.value || null)}
                    disabled={!isEditable}
                    className="w-full border border-slate-300 rounded-md p-2 text-sm focus:ring-1 focus:ring-[#008fa0] outline-none disabled:bg-slate-50"
                  />
                </div>

                {/* Due Date */}
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1 flex items-center gap-1">
                    <Calendar className="w-3 h-3" /> Vencimiento
                  </label>
                  <input
                    type="date"
                    value={editedTask.dueDate ? editedTask.dueDate.substring(0, 10) : ''}
                    onChange={e => handleChange('dueDate', e.target.value || null)}
                    disabled={!isEditable}
                    className="w-full border border-slate-300 rounded-md p-2 text-sm focus:ring-1 focus:ring-[#008fa0] outline-none disabled:bg-slate-50"
                  />
                </div>
              </div>

            {/* Assignee */}
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1 flex items-center gap-1">
                <User className="w-3 h-3" /> Asignado a
              </label>
              <select
                value={editedTask.assigneeId || ''}
                onChange={e => handleChange('assigneeId', e.target.value ? parseInt(e.target.value) : null)}
                disabled={!isEditable}
                className="w-full border border-slate-300 rounded-md p-2 text-sm focus:ring-1 focus:ring-[#008fa0] outline-none disabled:bg-slate-50 bg-white"
              >
                <option value="">Sin Asignar</option>
                {projectMembers.map(member => (
                  <option key={member.id} value={member.id}>{member.name}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Description */}
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1 flex items-center gap-1">
              <AlignLeft className="w-3 h-3" /> Descripción
            </label>
            <textarea
              value={editedTask.description || ''}
              onChange={e => handleChange('description', e.target.value)}
              disabled={!isEditable}
              rows={4}
              placeholder="Añadir una descripción más detallada..."
              className="w-full border border-slate-300 rounded-md p-2 text-sm focus:ring-1 focus:ring-[#008fa0] outline-none disabled:bg-slate-50 resize-none"
            />
          </div>

        </div>

        {/* Footer */}
        {isEditable && (
          <div className="p-4 border-t border-slate-200 bg-slate-50 flex justify-between items-center">
            <button
              onClick={handleDelete}
              disabled={isDeleting || isSaving}
              className="text-red-600 hover:bg-red-50 px-3 py-2 rounded-md text-sm font-semibold transition-colors flex items-center gap-1 disabled:opacity-50"
            >
              <Trash2 className="w-4 h-4" /> Eliminar
            </button>
            <div className="flex gap-2">
              <button
                onClick={onClose}
                className="text-slate-600 hover:bg-slate-200 px-4 py-2 rounded-md text-sm font-semibold transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={handleSave}
                disabled={isSaving || isDeleting || !editedTask.title.trim()}
                className="bg-[#008fa0] hover:bg-[#007b8a] text-white px-4 py-2 rounded-md text-sm font-bold flex items-center gap-2 transition-colors disabled:opacity-50 shadow-sm cursor-pointer"
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
