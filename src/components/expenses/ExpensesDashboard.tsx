import React, { useState, useEffect } from 'react';
import { DollarSign, Check, X, Filter, AlertCircle, RefreshCw, Plus } from 'lucide-react';
import { hasPermission } from '../../lib/rbac.ts';
import { UserRole } from '../../types.ts';

interface ExpensesDashboardProps {
  token: string;
  userRole: UserRole;
}

export default function ExpensesDashboard({ token, userRole }: ExpensesDashboardProps) {
  const [expenses, setExpenses] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filterStatus, setFilterStatus] = useState<string>('pending');
  const [showCreateModal, setShowCreateModal] = useState(false);

  // New expense form state
  const [newTitle, setNewTitle] = useState('');
  const [newAmount, setNewAmount] = useState('');
  const [newCategory, setNewCategory] = useState('');

  const canApprove = userRole === 'DIRECTOR' || userRole === 'MANAGER';
  // Allow all roles with dashboard access to create, or limit to specific roles if needed. Assuming all can create.

  const fetchExpenses = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/expenses`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (!res.ok) {
        throw new Error('Error al obtener los gastos');
      }
      const data = await res.json();
      const items = Array.isArray(data) ? data : (Array.isArray(data?.data) ? data.data : []);
      setExpenses(items);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchExpenses();
  }, []);

  const handleApproveReject = async (expenseId: number, newStatus: string) => {
    if (!canApprove) return;
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
      fetchExpenses();
    } catch (err: any) {
      alert(err.message);
    }
  };

  const handleCreateExpense = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await fetch(`/api/expenses`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          title: newTitle,
          amount: parseFloat(newAmount),
          category: newCategory,
          projectId: 1, // Defaulting as required by DB
          budgetLineId: 1 // Defaulting as required by DB
        })
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Error al crear el gasto');
      }
      setShowCreateModal(false);
      setNewTitle('');
      setNewAmount('');
      setNewCategory('');
      fetchExpenses();
    } catch (err: any) {
      alert(err.message);
    }
  };

  const filteredExpenses = filterStatus === 'ALL' 
    ? expenses 
    : expenses.filter(exp => exp.status === filterStatus);

  return (
    <div className="p-8 max-w-7xl mx-auto space-y-6">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-[#00313b] flex items-center space-x-2">
            <DollarSign className="w-6 h-6 text-[#008fa0]" />
            <span>Gestión y Aprobación de Gastos</span>
          </h2>
          <p className="text-sm text-slate-500 font-sans mt-1">
            Visualice los gastos registrados y controle el estado del presupuesto.
          </p>
        </div>
        <div className="flex items-center space-x-3 w-full sm:w-auto">
          <button 
            onClick={() => setShowCreateModal(true)} 
            className="flex-1 sm:flex-none px-4 py-2 bg-[#008fa0] text-white rounded-lg text-sm font-bold shadow hover:bg-[#007b8a] transition flex items-center justify-center space-x-2"
          >
            <Plus className="w-4 h-4" />
            <span>Registrar Gasto</span>
          </button>
          
          <button onClick={fetchExpenses} className="p-2 text-slate-400 hover:text-[#008fa0] transition-colors rounded-lg hover:bg-slate-50 border border-slate-200">
            <RefreshCw className="w-5 h-5" />
          </button>
          
          <div className="relative">
            <Filter className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 transform -translate-y-1/2" />
            <select
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value)}
              className="pl-9 pr-4 py-2 bg-white border border-slate-200 rounded-lg text-sm outline-none focus:border-[#008fa0] text-[#00313b] font-bold cursor-pointer"
            >
              <option value="pending">Pendientes</option>
              <option value="approved">Aprobados</option>
              <option value="rejected">Rechazados</option>
              <option value="ALL">Todos los Gastos</option>
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
                <th className="p-4">Concepto</th>
                <th className="p-4">Categoría</th>
                <th className="p-4 text-right">Monto</th>
                <th className="p-4 text-center">Estado</th>
                <th className="p-4 text-center">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 font-sans">
              {isLoading ? (
                <tr>
                  <td colSpan={6} className="p-8 text-center text-slate-400">
                    <RefreshCw className="w-5 h-5 animate-spin mx-auto mb-2 text-slate-300" />
                    Cargando gastos...
                  </td>
                </tr>
              ) : filteredExpenses.length === 0 ? (
                <tr>
                  <td colSpan={6} className="p-8 text-center text-slate-500 font-bold">
                    No hay registros de gastos para esta vista.
                  </td>
                </tr>
              ) : (
                filteredExpenses.map((exp) => (
                  <tr key={exp.id} className="hover:bg-slate-50 transition-colors">
                    <td className="p-4 whitespace-nowrap text-slate-600">
                      {new Date(exp.createdAt || exp.date).toLocaleDateString()}
                    </td>
                    <td className="p-4 font-medium text-slate-900">
                      {exp.title || exp.description || 'Sin concepto'}
                    </td>
                    <td className="p-4">
                      <span className="px-2 py-1 bg-slate-100 text-slate-600 rounded-md text-[10px] font-bold">
                        {exp.category || 'Varios'}
                      </span>
                    </td>
                    <td className="p-4 text-right font-mono text-[#00313b] font-bold">
                      ${Number(exp.amount).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                    </td>
                    <td className="p-4 text-center">
                      {exp.status === 'pending' && (
                        <span className="inline-flex items-center px-2 py-1 rounded-full text-[10px] font-bold bg-yellow-100 text-yellow-800">
                          🟡 Pendiente
                        </span>
                      )}
                      {exp.status === 'approved' && (
                        <span className="inline-flex items-center px-2 py-1 rounded-full text-[10px] font-bold bg-green-100 text-green-800">
                          🟢 Aprobado
                        </span>
                      )}
                      {exp.status === 'rejected' && (
                        <span className="inline-flex items-center px-2 py-1 rounded-full text-[10px] font-bold bg-red-100 text-red-800">
                          🔴 Rechazado
                        </span>
                      )}
                    </td>
                    <td className="p-4 text-center">
                      {exp.status === 'pending' ? (
                        canApprove ? (
                          <div className="flex items-center justify-center space-x-2">
                            <button
                              onClick={() => handleApproveReject(exp.id, 'approved')}
                              className="p-1.5 bg-green-50 text-green-600 rounded hover:bg-green-100 transition-colors"
                              title="Aprobar"
                            >
                              <Check className="w-4 h-4" />
                            </button>
                            <button
                              onClick={() => handleApproveReject(exp.id, 'rejected')}
                              className="p-1.5 bg-red-50 text-red-600 rounded hover:bg-red-100 transition-colors"
                              title="Rechazar"
                            >
                              <X className="w-4 h-4" />
                            </button>
                          </div>
                        ) : (
                          <span className="text-slate-400 text-xs italic">Solo lectura</span>
                        )
                      ) : (
                        <span className="text-slate-400 text-xs">Completado</span>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* CREATE EXPENSE MODAL */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-slate-900/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
              <h3 className="font-bold text-[#00313b]">Registrar Nuevo Gasto</h3>
              <button onClick={() => setShowCreateModal(false)} className="text-slate-400 hover:text-slate-600">
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handleCreateExpense} className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-500 mb-1">Concepto o Título</label>
                <input 
                  type="text" 
                  value={newTitle} 
                  onChange={e => setNewTitle(e.target.value)} 
                  required 
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:border-[#008fa0] outline-none"
                  placeholder="Ej: Viaje de campo, Suministros..."
                />
              </div>
              <div className="flex space-x-4">
                <div className="w-1/2">
                  <label className="block text-xs font-bold text-slate-500 mb-1">Monto ($)</label>
                  <input 
                    type="number" 
                    step="0.01" 
                    value={newAmount} 
                    onChange={e => setNewAmount(e.target.value)} 
                    required 
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:border-[#008fa0] outline-none"
                    placeholder="0.00"
                  />
                </div>
                <div className="w-1/2">
                  <label className="block text-xs font-bold text-slate-500 mb-1">Categoría</label>
                  <select 
                    value={newCategory} 
                    onChange={e => setNewCategory(e.target.value)} 
                    required 
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:border-[#008fa0] outline-none bg-white"
                  >
                    <option value="">Seleccione...</option>
                    <option value="Operaciones">Operaciones</option>
                    <option value="Viajes">Viajes</option>
                    <option value="Materiales">Materiales</option>
                    <option value="Servicios">Servicios</option>
                    <option value="Software">Software</option>
                  </select>
                </div>
              </div>
              <div className="pt-4 flex justify-end space-x-2">
                <button 
                  type="button" 
                  onClick={() => setShowCreateModal(false)}
                  className="px-4 py-2 text-slate-500 hover:text-slate-700 text-sm font-bold"
                >
                  Cancelar
                </button>
                <button 
                  type="submit"
                  className="px-4 py-2 bg-[#008fa0] text-white rounded-lg text-sm font-bold shadow hover:bg-[#007b8a] transition"
                >
                  Guardar Gasto
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
