import React from 'react';
import { ActivityLog } from '../types.ts';
import { History, ShieldAlert, Search, RefreshCw, Calendar, UserCheck, Filter } from 'lucide-react';
import { TableSkeleton } from './common/Skeletons.tsx';

interface AuditTrailProps {
  logs: ActivityLog[];
  onRefresh: () => void;
  isLoading: boolean;
}

export default function AuditTrail({ logs, onRefresh, isLoading }: AuditTrailProps) {
  const [searchTerm, setSearchTerm] = React.useState('');
  const [entityFilter, setEntityFilter] = React.useState('ALL');
  const [dateFilter, setDateFilter] = React.useState('ALL');

  const filteredLogs = logs.filter(log => {
    const matchesSearch = log.userName.toLowerCase().includes(searchTerm.toLowerCase()) ||
                          log.actionDescription.toLowerCase().includes(searchTerm.toLowerCase());
    
    let matchesEntity = true;
    if (entityFilter !== 'ALL') {
      matchesEntity = log.entityType === entityFilter;
    }

    let matchesDate = true;
    if (dateFilter !== 'ALL' && log.createdAt) {
      const logDate = new Date(log.createdAt);
      const now = new Date();
      const diffMs = now.getTime() - logDate.getTime();
      const diffDays = diffMs / (1000 * 60 * 60 * 24);
      
      if (dateFilter === '7D') matchesDate = diffDays <= 7;
      if (dateFilter === '30D') matchesDate = diffDays <= 30;
      if (dateFilter === '90D') matchesDate = diffDays <= 90;
    }

    return matchesSearch && matchesEntity && matchesDate;
  });

  return (
    <div id="audit-trail-tab" className="p-6 space-y-5 max-w-7xl mx-auto select-none">
      
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-base font-sans font-bold text-slate-900">
            Bitácora de Auditoría y Compliance
          </h2>
          <p className="text-[11px] text-slate-400 font-sans">
            Registro inalterable de operaciones administrativas y modificaciones presupuestarias en Cloud SQL.
          </p>
        </div>

        <button
          onClick={onRefresh}
          disabled={isLoading}
          className="bg-white border border-slate-200 hover:bg-slate-50 text-slate-600 text-xs font-semibold px-3 py-1.5 rounded-md flex items-center space-x-1.5 shadow-sm cursor-pointer transition-colors"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
          <span>{isLoading ? 'Sincronizando...' : 'Actualizar Bitácora'}</span>
        </button>
      </div>

      {/* Search Input and Filters */}
      <div className="bg-white p-3 rounded-lg border border-slate-200 shadow-sm flex flex-col md:flex-row items-center gap-3">
        <div className="relative w-full md:flex-1">
          <Search className="absolute left-3 top-2 w-3.5 h-3.5 text-slate-400" />
          <input
            id="audit-search"
            type="text"
            placeholder="Buscar por usuario o descripción..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-8.5 pr-4 py-1.5 bg-slate-50 border border-slate-200 rounded-md font-sans text-xs focus:ring-1 focus:ring-blue-500 outline-none"
          />
        </div>
        
        <div className="flex items-center space-x-2 w-full md:w-auto">
          <select
            value={entityFilter}
            onChange={(e) => setEntityFilter(e.target.value)}
            className="bg-slate-50 border border-slate-200 text-slate-600 text-xs rounded-md px-2 py-1.5 outline-none cursor-pointer flex-1 md:flex-none"
          >
            <option value="ALL">Todas las Entidades</option>
            <option value="System">Sistema General</option>
            <option value="Project">Proyectos</option>
          </select>
          
          <select
            value={dateFilter}
            onChange={(e) => setDateFilter(e.target.value)}
            className="bg-slate-50 border border-slate-200 text-slate-600 text-xs rounded-md px-2 py-1.5 outline-none cursor-pointer flex-1 md:flex-none"
          >
            <option value="ALL">Histórico Completo</option>
            <option value="7D">Últimos 7 días</option>
            <option value="30D">Últimos 30 días</option>
            <option value="90D">Últimos 90 días</option>
          </select>
        </div>

        <div className="hidden lg:flex items-center space-x-1.5 text-[9px] font-mono text-blue-700 uppercase tracking-wider bg-blue-50 border border-blue-100 px-2.5 py-1.5 rounded">
          <UserCheck className="w-3.5 h-3.5" />
          <span>Políticas Activas</span>
        </div>
      </div>

      {/* Logs Table */}
      <div className="bg-white rounded-lg border border-slate-200 overflow-hidden shadow-sm">
        <div className="divide-y divide-slate-100">
          {isLoading ? (
            <TableSkeleton rows={8} columns={3} />
          ) : filteredLogs.length === 0 ? (
            <div className="text-center py-16 text-slate-400 text-xs">
              <History className="w-8 h-8 text-slate-300 mx-auto mb-2" />
              <span>No se encontraron registros de auditoría que coincidan.</span>
            </div>
          ) : (
            filteredLogs.map((log) => (
              <div key={log.id} className="p-3 md:p-3.5 flex flex-col md:flex-row md:items-center justify-between hover:bg-slate-50/50 transition-colors text-xs font-sans gap-3">
                <div className="flex items-start space-x-3">
                  {/* Avatar or status icon */}
                  <div className="w-7 h-7 bg-blue-50 text-blue-600 rounded-full flex items-center justify-center border border-blue-100/40 font-mono font-bold text-[9px] flex-shrink-0">
                    {log.userName.charAt(0).toUpperCase()}
                  </div>
                  <div className="space-y-0.5">
                    <p className="text-slate-800 font-normal">
                      <span className="font-bold text-slate-900">{log.userName}</span>: {log.actionDescription}
                    </p>
                    <div className="flex items-center space-x-2 text-[9px] text-slate-400 font-mono">
                      <span className="flex items-center">
                        <Calendar className="w-3 h-3 mr-1" />
                        {log.createdAt ? new Date(log.createdAt).toLocaleString('es-ES') : log.timeAgo}
                      </span>
                      <span>•</span>
                      <span className="text-blue-500">Región europe-west1</span>
                    </div>
                  </div>
                </div>

                <div className="flex items-center justify-end">
                  <span className="text-[8px] font-mono font-bold uppercase bg-emerald-50 text-emerald-700 px-2 py-0.5 rounded border border-emerald-100/55 tracking-wider">
                    AUDITED
                  </span>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

    </div>
  );
}
