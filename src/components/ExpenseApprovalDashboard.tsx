import React, { useState, useEffect } from 'react';
import { DollarSign, Check, X, Filter, AlertCircle, RefreshCw } from 'lucide-react';
import { hasPermission } from '../lib/rbac.ts';
import { UserRole } from '../types.ts';

interface ExpenseApprovalDashboardProps {
  token: string;
  userRole: UserRole;
}

export default function ExpenseApprovalDashboard({ token, userRole }: ExpenseApprovalDashboardProps) {
  const [expenses, setExpenses] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filterStatus, setFilterStatus] = useState<string>('PENDING_APPROVAL');

  const canApprove = hasPermission(userRole, 'canApproveExpenses'); // Manager, Director, Finance

  const fetchExpenses = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/expenses?status=${filterStatus}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (!res.ok) {
        throw new Error('Error al obtener los gastos');
      }
      const data = await res.json();
      setExpenses(data);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchExpenses();
  }, [filterStatus]);

  const handleApproveReject = async (expenseId: number, newStatus: string) => {
    if (!canApprove) return;
    
    // Optimistic Update (Optional) or re-fetch
    try {
      const res = await fetch(`/api/expenses/${expenseId}/approve`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ status: newStatus })
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Error al actualizar el gasto');
      }
      // Re-fetch to guarantee accuracy and re-calculate
      fetchExpenses();
    } catch (err: any) {
      alert(err.message);
    }
  };

  if (!canApprove) {
    return (
      <div className="p-8">
        <div className="bg-red-50 text-red-700 p-4 rounded-xl flex items-center space-x-2">
          <AlertCircle className="w-5 h-5" />
          <span className="font-bold text-sm">Acceso Denegado</span>
        </div>
        <p className="mt-2 text-xs text-slate-500">No tienes permisos para aprobar o rechazar gastos.</p>
      </div>
    );
  }

  return (
    <div className="p-8 max-w-7xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-[#00313b] flex items-center space-x-2">
            <DollarSign className="w-6 h-6 text-[#008fa0]" />
            <span>Aprobación de Gastos</span>
          </h2>
          <p className="text-sm text-slate-500 font-sans mt-1">
            Gestione las solicitudes de gastos y apruebe para impactar el presupuesto ejecutado.
          </p>
        </div>
        <div className="flex items-center space-x-3">
          <button onClick={fetchExpenses} className="p-2 text-slate-400 hover:text-[#008fa0] transition-colors rounded-lg hover:bg-slate-50">
            <RefreshCw className="w-5 h-5" />
          </button>
          <div className="relative">
            <Filter className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 transform -translate-y-1/2" />
            <select
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value)}
              className="pl-9 pr-4 py-2 bg-white border border-slate-200 rounded-lg text-sm outline-none focus:border-[#008fa0] text-[#00313b] font-bold cursor-pointer"
            >
              <option value="PENDING_APPROVAL">Pendientes de Aprobación</option>
              <option value="APPROVED">Aprobados</option>
              <option value="REJECTED">Rechazados</option>
              <option value="">Todos los Gastos</option>
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

      <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr className="text-slate-500 uppercase font-mono text-[10px] tracking-wider">
                <th className="p-4">Fecha</th>
                <th className="p-4">Proyecto</th>
                <th className="p-4">Partida</th>
                <th className="p-4">Concepto</th>
                <th className="p-4 text-right">Monto Original</th>
                <th className="p-4 text-right">Monto Base</th>
                <th className="p-4 text-center">Estado</th>
                <th className="p-4 text-center">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 font-sans">
              {isLoading ? (
                <tr>
                  <td colSpan={8} className="p-8 text-center text-slate-400">
                    <RefreshCw className="w-5 h-5 animate-spin mx-auto mb-2 text-slate-300" />
                    Cargando gastos...
                  </td>
                </tr>
              ) : expenses.length === 0 ? (
                <tr>
                  <td colSpan={8} className="p-8 text-center text-slate-500 font-bold">
                    No se encontraron gastos en este estado.
                  </td>
                </tr>
              ) : (
                expenses.map((exp) => (
                  <tr key={exp.id} className="hover:bg-slate-50 transition-colors">
                    <td className="p-4 whitespace-nowrap text-slate-600">
                      {new Date(exp.date).toLocaleDateString()}
                    </td>
                    <td className="p-4">
                      <div className="font-bold text-[#00313b]">{exp.projectCode}</div>
                      <div className="text-[10px] text-slate-400 truncate max-w-[150px]">{exp.projectName}</div>
                    </td>
                    <td className="p-4">
                      <div className="font-mono font-bold text-slate-700">{exp.budgetCode}</div>
                      <div className="text-[10px] text-slate-400 truncate max-w-[150px]">{exp.budgetCategory}</div>
                    </td>
                    <td className="p-4">
                      <div className="text-slate-700 truncate max-w-[200px]" title={exp.description}>{exp.description || '-'}</div>
                      <div className="text-[10px] text-slate-400">Reg: {exp.registeredByName}</div>
                    </td>
                    <td className="p-4 text-right">
                      <div className="font-bold text-slate-700">
                        {parseFloat(exp.originalAmount || exp.amount || '0').toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} {exp.originalCurrency || exp.currency || ''}
                      </div>
                      {exp.exchangeRate && exp.exchangeRate !== '1' && (
                        <div className="text-[10px] text-slate-400 font-mono">Tasa: {exp.exchangeRate}</div>
                      )}
                    </td>
                    <td className="p-4 text-right">
                      <div className="font-bold text-[#008fa0] text-sm">
                        ${parseFloat(exp.baseAmount || exp.amount || '0').toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </div>
                    </td>
                    <td className="p-4 text-center">
                      <span className={`inline-flex items-center px-2 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                        exp.status === 'APPROVED' ? 'bg-green-100 text-green-700' :
                        exp.status === 'REJECTED' ? 'bg-red-100 text-red-700' :
                        'bg-yellow-100 text-yellow-700'
                      }`}>
                        {exp.status === 'PENDING_APPROVAL' ? 'Pendiente' : exp.status === 'APPROVED' ? 'Aprobado' : 'Rechazado'}
                      </span>
                    </td>
                    <td className="p-4">
                      <div className="flex items-center justify-center space-x-2">
                        {exp.status === 'PENDING_APPROVAL' ? (
                          <>
                            <button
                              onClick={() => handleApproveReject(exp.id, 'APPROVED')}
                              title="Aprobar Gasto"
                              className="p-1.5 bg-green-50 text-green-600 rounded-md hover:bg-green-100 transition-colors"
                            >
                              <Check className="w-4 h-4" />
                            </button>
                            <button
                              onClick={() => handleApproveReject(exp.id, 'REJECTED')}
                              title="Rechazar Gasto"
                              className="p-1.5 bg-red-50 text-red-600 rounded-md hover:bg-red-100 transition-colors"
                            >
                              <X className="w-4 h-4" />
                            </button>
                          </>
                        ) : (
                          <button
                            onClick={() => handleApproveReject(exp.id, 'PENDING_APPROVAL')}
                            title="Revertir a Pendiente"
                            className="text-[10px] font-bold text-slate-400 hover:text-slate-600 underline"
                          >
                            Revertir
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
