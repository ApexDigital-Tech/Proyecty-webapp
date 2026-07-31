import React, { useState, useEffect } from 'react';
import { History, Search, Filter, AlertCircle, RefreshCw, CheckCircle, XCircle, Info, Activity } from 'lucide-react';
import { UserRole } from '../../types.ts';

interface AuditLogsDashboardProps {
  token: string;
  userRole: UserRole;
}

export default function AuditLogsDashboard({ token, userRole }: AuditLogsDashboardProps) {
  const [logs, setLogs] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filterAction, setFilterAction] = useState<string>('ALL');
  const [searchTerm, setSearchTerm] = useState('');

  const canView = userRole === 'DIRECTOR' || userRole === 'ADMIN';

  const fetchLogs = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/audit-logs`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (!res.ok) {
        if (res.status === 403) throw new Error('Acceso denegado a bitácora de auditoría');
        throw new Error('Error al obtener la bitácora');
      }
      const data = await res.json();
      setLogs(data);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (canView) fetchLogs();
  }, [canView]);

  if (!canView) {
    return (
      <div className="p-8 max-w-7xl mx-auto">
        <div className="bg-red-50 text-red-700 p-4 rounded-xl flex items-center space-x-2">
          <AlertCircle className="w-5 h-5" />
          <span className="font-bold text-sm">Acceso Denegado</span>
        </div>
        <p className="mt-2 text-xs text-slate-500">No tienes permisos para visualizar la bitácora de auditoría.</p>
      </div>
    );
  }

  const getActionIcon = (action: string) => {
    if (action.includes('APPROVED')) return <CheckCircle className="w-5 h-5 text-green-500" />;
    if (action.includes('REJECTED')) return <XCircle className="w-5 h-5 text-red-500" />;
    if (action.includes('UPGRADE')) return <Activity className="w-5 h-5 text-blue-500" />;
    return <Info className="w-5 h-5 text-slate-500" />;
  };

  const getActionBadge = (action: string) => {
    if (action.includes('APPROVED')) return 'bg-green-100 text-green-800';
    if (action.includes('REJECTED')) return 'bg-red-100 text-red-800';
    if (action.includes('UPGRADE')) return 'bg-blue-100 text-blue-800';
    return 'bg-slate-100 text-slate-800';
  };

  const filteredLogs = logs.filter(log => {
    const matchAction = filterAction === 'ALL' || log.action === filterAction;
    const matchSearch = searchTerm === '' || JSON.stringify(log).toLowerCase().includes(searchTerm.toLowerCase());
    return matchAction && matchSearch;
  });

  return (
    <div className="p-8 max-w-7xl mx-auto space-y-6">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-[#00313b] flex items-center space-x-2">
            <History className="w-6 h-6 text-[#008fa0]" />
            <span>Bitácora de Auditoría</span>
          </h2>
          <p className="text-sm text-slate-500 font-sans mt-1">
            Línea de tiempo de actividades críticas del sistema y la organización.
          </p>
        </div>
        <div className="flex items-center space-x-3 w-full sm:w-auto">
          <div className="relative flex-1 sm:w-64">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 transform -translate-y-1/2" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Buscar en logs..."
              className="w-full pl-9 pr-4 py-2 bg-white border border-slate-200 rounded-lg text-sm outline-none focus:border-[#008fa0]"
            />
          </div>
          <button onClick={fetchLogs} className="p-2 text-slate-400 hover:text-[#008fa0] transition-colors rounded-lg hover:bg-slate-50 border border-slate-200">
            <RefreshCw className="w-5 h-5" />
          </button>
          
          <div className="relative">
            <Filter className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 transform -translate-y-1/2" />
            <select
              value={filterAction}
              onChange={(e) => setFilterAction(e.target.value)}
              className="pl-9 pr-4 py-2 bg-white border border-slate-200 rounded-lg text-sm outline-none focus:border-[#008fa0] text-[#00313b] font-bold cursor-pointer"
            >
              <option value="ALL">Todas las Acciones</option>
              <option value="EXPENSE_APPROVED">Gastos Aprobados</option>
              <option value="EXPENSE_REJECTED">Gastos Rechazados</option>
              <option value="PLAN_UPGRADED">Suscripciones / Webhooks</option>
              <option value="SUBSCRIPTION_CREATED">Nuevas Suscripciones</option>
            </select>
          </div>
        </div>
      </div>

      {error && (
        <div className="p-4 bg-red-50 text-red-700 text-sm rounded-xl flex items-center space-x-2 border border-red-100">
          <AlertCircle className="w-5 h-5" />
          <span>{error}</span>
        </div>
      )}

      <div className="bg-white border border-slate-200 rounded-xl shadow-sm p-6">
        {isLoading ? (
          <div className="text-center py-12 text-slate-400">
            <RefreshCw className="w-8 h-8 animate-spin mx-auto mb-4 text-slate-300" />
            Cargando historial de actividades...
          </div>
        ) : filteredLogs.length === 0 ? (
          <div className="text-center py-12 text-slate-500 font-bold">
            No se encontraron registros de auditoría para estos filtros.
          </div>
        ) : (
          <div className="relative border-l border-slate-200 ml-4 space-y-8">
            {filteredLogs.map((log) => (
              <div key={log.id} className="relative pl-8">
                <div className="absolute -left-3 top-1 bg-white p-0.5 rounded-full border border-slate-200">
                  {getActionIcon(log.action)}
                </div>
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <div className="flex items-center space-x-2">
                      <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${getActionBadge(log.action)}`}>
                        {log.action.replace(/_/g, ' ')}
                      </span>
                      <span className="text-xs text-slate-400 font-mono">
                        {new Date(log.createdAt).toLocaleString()}
                      </span>
                    </div>
                    <span className="text-xs text-slate-400 bg-slate-50 px-2 py-1 rounded">
                      IP: {log.ipAddress || 'N/A'}
                    </span>
                  </div>
                  <h4 className="text-sm font-bold text-[#00313b]">
                    Entidad: <span className="font-mono text-xs font-normal text-slate-500">{log.entity.toUpperCase()} #{log.entityId || 'N/A'}</span>
                  </h4>
                  <p className="text-sm text-slate-600 mt-1">
                    Realizado por: <b>{log.userName || `Usuario ID ${log.userId || 'Sistema'}`}</b>
                  </p>
                  {log.metadata && Object.keys(log.metadata).length > 0 && (
                    <div className="mt-3 bg-slate-50 rounded-lg p-3 text-xs font-mono text-slate-600 overflow-x-auto border border-slate-100">
                      <pre>{JSON.stringify(log.metadata, null, 2)}</pre>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
