import React, { useState, useEffect } from 'react';
import { DollarSign, Check, X, Filter, AlertCircle, RefreshCw, Plus, ShieldCheck } from 'lucide-react';
import { UserRole } from '../../types.ts';

interface ExpensesDashboardProps {
  token: string;
  userRole: UserRole;
  currentUser?: { name: string; email: string; role: UserRole; id?: number };
}

export default function ExpensesDashboard({ token, userRole, currentUser }: ExpensesDashboardProps) {
  const [expenses, setExpenses] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filterStatus, setFilterStatus] = useState<string>('pending');
  const [showCreateModal, setShowCreateModal] = useState(false);

  // New expense form state
  const [newTitle, setNewTitle] = useState('');
  const [newAmount, setNewAmount] = useState('');
  const [newCategory, setNewCategory] = useState('');

  const canApprove = userRole === 'DIRECTOR' || userRole === 'MANAGER' || userRole === 'FINANCE';

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
          projectId: 1,
          budgetLineId: 1
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

  const filteredExpenses = expenses.filter(e => {
    if (filterStatus === 'all') return true;
    return e.status?.toLowerCase() === filterStatus.toLowerCase();
  });

  return (
    <div className="p-8 max-w-7xl mx-auto space-y-6">
      {/* Header and Controls */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white p-6 rounded-2xl border border-slate-100 shadow-sm">
        <div>
          <div className="flex items-center space-x-2">
            <h2 className="text-xl font-bold text-[#00313b]">Control y Aprobación de Gastos</h2>
            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-blue-50 text-blue-700 border border-blue-100">
              <ShieldCheck className="w-3.5 h-3.5 mr-1" />
              Segregación FIN-01 Activa
            </span>
          </div>
          <p className="text-xs text-slate-400 mt-1">
            Gestión de comprobantes, control de balance presupuestario y validación cruzada de aprobaciones.
          </p>
        </div>

        <div className="flex items-center space-x-3">
          <div className="flex items-center bg-slate-50 border border-slate-200 rounded-lg p-1">
            <button
              onClick={() => setFilterStatus('pending')}
              className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all ${
                filterStatus === 'pending' ? 'bg-white shadow-sm text-slate-800' : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              Pendientes
            </button>
            <button
              onClick={() => setFilterStatus('approved')}
              className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all ${
                filterStatus === 'approved' ? 'bg-white shadow-sm text-slate-800' : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              Aprobados
            </button>
            <button
              onClick={() => setFilterStatus('all')}
              className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all ${
                filterStatus === 'all' ? 'bg-white shadow-sm text-slate-800' : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              Todos
            </button>
          </div>

          <button
            onClick={() => setShowCreateModal(true)}
            className="flex items-center space-x-1.5 bg-[#008fa0] hover:bg-[#007b8a] text-white px-4 py-2 rounded-lg text-xs font-bold transition-all shadow-sm cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>Registrar Gasto</span>
          </button>
        </div>
      </div>

      {error && (
        <div className="p-4 bg-red-50 text-red-700 border border-red-200 rounded-xl text-xs flex items-center justify-between">
          <span>{error}</span>
          <button onClick={fetchExpenses} className="underline font-bold text-red-800 cursor-pointer">
            Reintentar
          </button>
        </div>
      )}

      {/* Table List */}
      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-100 text-slate-500 font-semibold uppercase tracking-wider">
                <th className="p-4">ID</th>
                <th className="p-4">Concepto</th>
                <th className="p-4">Categoría</th>
                <th className="p-4">Fecha</th>
                <th className="p-4 text-right">Monto</th>
                <th className="p-4 text-center">Estado</th>
                <th className="p-4 text-center">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {isLoading ? (
                <tr>
                  <td colSpan={7} className="p-8 text-center text-slate-400">
                    <RefreshCw className="w-5 h-5 animate-spin mx-auto mb-2 text-[#008fa0]" />
                    <span>Cargando registros...</span>
                  </td>
                </tr>
              ) : filteredExpenses.length === 0 ? (
                <tr>
                  <td colSpan={7} className="p-8 text-center text-slate-400">
                    No se encontraron gastos con el filtro seleccionado.
                  </td>
                </tr>
              ) : (
                filteredExpenses.map((exp) => {
                  const isSelfRegistered = currentUser?.id && exp.registeredBy === currentUser.id;

                  return (
                    <tr key={exp.id} className="hover:bg-slate-50/50 transition-colors">
                      <td className="p-4 font-mono text-slate-400">#{exp.id}</td>
                      <td className="p-4">
                        <div className="font-bold text-slate-800">{exp.title}</div>
                        {isSelfRegistered && (
                          <span className="text-[10px] font-semibold text-amber-600 bg-amber-50 px-1.5 py-0.5 rounded border border-amber-200">
                            Registrado por ti
                          </span>
                        )}
                      </td>
                      <td className="p-4">
                        <span className="bg-slate-100 text-slate-700 px-2 py-0.5 rounded text-[10px]">
                          {exp.category || 'General'}
                        </span>
                      </td>
                      <td className="p-4 text-slate-500">
                        {exp.date ? new Date(exp.date).toLocaleDateString() : '-'}
                      </td>
                      <td className="p-4 text-right font-mono font-bold text-slate-800">
                        ${parseFloat(exp.amount || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
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
                            isSelfRegistered ? (
                              <span
                                className="text-slate-400 text-[10px] italic"
                                title="Segregación de funciones (FIN-01): No puedes aprobar un gasto registrado por ti mismo."
                              >
                                Revisor independiente requerido
                              </span>
                            ) : (
                              <div className="flex items-center justify-center space-x-2">
                                <button
                                  onClick={() => handleApproveReject(exp.id, 'approved')}
                                  className="p-1.5 bg-green-50 text-green-600 hover:bg-green-100 rounded transition-colors cursor-pointer"
                                  title="Aprobar Gasto"
                                >
                                  <Check className="w-4 h-4" />
                                </button>
                                <button
                                  onClick={() => handleApproveReject(exp.id, 'rejected')}
                                  className="p-1.5 bg-red-50 text-red-600 hover:bg-red-100 rounded transition-colors cursor-pointer"
                                  title="Rechazar Gasto"
                                >
                                  <X className="w-4 h-4" />
                                </button>
                              </div>
                            )
                          ) : (
                            <span className="text-slate-400 text-xs italic">Solo lectura</span>
                          )
                        ) : (
                          <span className="text-slate-400 text-xs">Procesado</span>
                        )}
                      </td>
                    </tr>
                  );
                })
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
              <button onClick={() => setShowCreateModal(false)} className="text-slate-400 hover:text-slate-600 cursor-pointer">
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handleCreateExpense} className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Concepto / Título</label>
                <input
                  type="text"
                  required
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                  placeholder="Ej: Materiales para taller de capacitación"
                  className="w-full text-xs px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-[#008fa0]"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Monto (USD)</label>
                <input
                  type="number"
                  step="0.01"
                  required
                  value={newAmount}
                  onChange={(e) => setNewAmount(e.target.value)}
                  placeholder="0.00"
                  className="w-full text-xs px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-[#008fa0]"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Categoría</label>
                <input
                  type="text"
                  required
                  value={newCategory}
                  onChange={(e) => setNewCategory(e.target.value)}
                  placeholder="Ej: Insumos, Personal, Logística"
                  className="w-full text-xs px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-[#008fa0]"
                />
              </div>

              <div className="pt-2 flex items-center justify-end space-x-2">
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="px-4 py-2 rounded-lg border border-slate-200 text-xs font-semibold text-slate-600 hover:bg-slate-50 cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-lg bg-[#008fa0] hover:bg-[#007b8a] text-white text-xs font-bold cursor-pointer"
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
