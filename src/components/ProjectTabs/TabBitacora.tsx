import React, { useState, useEffect } from 'react';
import { Plus, MessageSquare, AlertCircle, MapPin, Flag, Calendar } from 'lucide-react';
import { ProjectFull } from '../ProjectDetail'; // Reutilizando la interfaz que exista

interface Log {
  id: number;
  type: 'DECISION' | 'ISSUE' | 'MILESTONE' | 'NOTE';
  content: string;
  date: string;
  authorId: number;
  authorName: string;
}

interface TabBitacoraProps {
  project: ProjectFull;
  isEditable: boolean;
  refreshProject: () => void;
}

export default function TabBitacora({ project, isEditable, refreshProject }: TabBitacoraProps) {
  const [logs, setLogs] = useState<Log[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [newLogType, setNewLogType] = useState<'DECISION' | 'ISSUE' | 'MILESTONE' | 'NOTE'>('NOTE');
  const [newLogContent, setNewLogContent] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    fetchLogs();
  }, [project.id]);

  const fetchLogs = async () => {
    try {
      const token = localStorage.getItem('token');
      const res = await fetch(`/api/projects/${project.id}/logs`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (!res.ok) throw new Error('Error al cargar la bitácora');
      const data = await res.json();
      setLogs(data);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleAddLog = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newLogContent.trim()) return;

    setIsSubmitting(true);
    try {
      const token = localStorage.getItem('token');
      const res = await fetch(`/api/projects/${project.id}/logs`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ type: newLogType, content: newLogContent })
      });
      if (!res.ok) throw new Error('Error al registrar novedad');
      
      const addedLog = await res.json();
      setLogs([addedLog, ...logs]);
      setNewLogContent('');
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const getTypeIcon = (type: string) => {
    switch (type) {
      case 'DECISION': return <MapPin className="w-4 h-4 text-blue-500" />;
      case 'ISSUE': return <AlertCircle className="w-4 h-4 text-red-500" />;
      case 'MILESTONE': return <Flag className="w-4 h-4 text-green-500" />;
      default: return <MessageSquare className="w-4 h-4 text-slate-500" />;
    }
  };

  const getTypeLabel = (type: string) => {
    switch (type) {
      case 'DECISION': return 'Decisión';
      case 'ISSUE': return 'Problema / Riesgo';
      case 'MILESTONE': return 'Hito';
      default: return 'Nota Operativa';
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-bold text-slate-800">Bitácora Operativa</h3>
        <p className="text-xs text-slate-500">Registro cronológico de novedades y decisiones.</p>
      </div>

      {error && (
        <div className="bg-red-50 text-red-700 p-3 rounded-md text-sm">
          {error}
        </div>
      )}

      {isEditable && (
        <form onSubmit={handleAddLog} className="bg-slate-50 border border-slate-200 rounded-lg p-4 space-y-3">
          <div className="flex gap-3">
            <div className="w-48">
              <label className="block text-xs font-bold text-slate-700 mb-1">Tipo de Registro</label>
              <select
                value={newLogType}
                onChange={(e) => setNewLogType(e.target.value as any)}
                className="w-full border border-slate-300 rounded-md text-sm p-2 bg-white focus:ring-1 focus:ring-[#008fa0] outline-none"
              >
                <option value="NOTE">Nota Operativa</option>
                <option value="DECISION">Decisión</option>
                <option value="ISSUE">Problema / Riesgo</option>
                <option value="MILESTONE">Hito Cumplido</option>
              </select>
            </div>
            <div className="flex-1">
              <label className="block text-xs font-bold text-slate-700 mb-1">Detalle</label>
              <textarea
                value={newLogContent}
                onChange={(e) => setNewLogContent(e.target.value)}
                rows={2}
                placeholder="Describe la novedad, decisión o problema..."
                className="w-full border border-slate-300 rounded-md text-sm p-2 bg-white focus:ring-1 focus:ring-[#008fa0] outline-none resize-none"
                required
              />
            </div>
          </div>
          <div className="flex justify-end">
            <button
              type="submit"
              disabled={isSubmitting || !newLogContent.trim()}
              className="bg-[#008fa0] hover:bg-[#007b8a] text-white px-4 py-2 rounded-md text-sm font-bold flex items-center gap-2 transition-colors disabled:opacity-50 cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              <span>{isSubmitting ? 'Guardando...' : 'Registrar Novedad'}</span>
            </button>
          </div>
        </form>
      )}

      {loading ? (
        <div className="text-sm text-slate-500 py-4">Cargando bitácora...</div>
      ) : logs.length === 0 ? (
        <div className="bg-slate-50 border border-slate-200 border-dashed rounded-lg p-8 text-center text-slate-500 text-sm">
          No hay registros en la bitácora aún. {isEditable && '¡Sé el primero en añadir uno!'}
        </div>
      ) : (
        <div className="relative border-l border-slate-200 ml-3 space-y-6">
          {logs.map((log) => (
            <div key={log.id} className="relative pl-6">
              <div className="absolute -left-2.5 top-1 bg-white p-0.5 rounded-full border border-slate-200 shadow-sm">
                {getTypeIcon(log.type)}
              </div>
              <div className="bg-white border border-slate-200 rounded-lg p-3 shadow-sm hover:shadow-md transition-shadow">
                <div className="flex justify-between items-start mb-2">
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-slate-800 text-sm">{log.authorName || 'Usuario Desconocido'}</span>
                    <span className="text-xs bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full font-medium">
                      {getTypeLabel(log.type)}
                    </span>
                  </div>
                  <div className="flex items-center gap-1 text-xs text-slate-400 font-medium">
                    <Calendar className="w-3 h-3" />
                    <span>{new Date(log.date).toLocaleString()}</span>
                  </div>
                </div>
                <p className="text-sm text-slate-600 whitespace-pre-wrap">{log.content}</p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
