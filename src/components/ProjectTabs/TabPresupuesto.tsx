import React, { useState } from 'react';
import { DollarSign, ChevronRight, CheckCircle2, Clock, XCircle, RotateCcw, FileText, Download, X, AlertCircle } from 'lucide-react';
import ExpenseRegistrationModal from './ExpenseRegistrationModal.tsx';

interface TabPresupuestoProps {
  project: any;
  isEditable: boolean;
  budgetCode: string;
  setBudgetCode: (val: string) => void;
  budgetCat: string;
  setBudgetCat: (val: string) => void;
  budgetSub: string;
  setBudgetSub: (val: string) => void;
  budgetApproved: string;
  setBudgetApproved: (val: string) => void;
  handleAddBudgetItem: () => void;
  refItemId: number | null;
  setRefItemId: (val: number | null) => void;
  refVal: string;
  setRefVal: (val: string) => void;
  handleReformulate: (itemId: number) => void;
  token: string;
  onRefresh: () => void;
  userRole?: string;
}

export default function TabPresupuesto({
  project,
  isEditable,
  budgetCode,
  setBudgetCode,
  budgetCat,
  setBudgetCat,
  budgetSub,
  setBudgetSub,
  budgetApproved,
  setBudgetApproved,
  handleAddBudgetItem,
  refItemId,
  setRefItemId,
  refVal,
  setRefVal,
  handleReformulate,
  token,
  onRefresh,
  userRole,
}: TabPresupuestoProps) {
  const [isExpenseModalOpen, setIsExpenseModalOpen] = useState(false);
  const [preselectedBudgetLineId, setPreselectedBudgetLineId] = useState<number | undefined>(undefined);
  
  // Estado para el modal de detalle de gastos por partida
  const [selectedBudgetLine, setSelectedBudgetLine] = useState<any | null>(null);
  const [lineExpenses, setLineExpenses] = useState<any[]>([]);
  const [lineTotals, setLineTotals] = useState<any | null>(null);
  const [isLoadingExpenses, setIsLoadingExpenses] = useState(false);
  const [expenseActionError, setExpenseActionError] = useState<string | null>(null);
  const [actionSuccessMessage, setActionSuccessMessage] = useState<string | null>(null);

  // Reversión diálogo
  const [reversingExpenseId, setReversingExpenseId] = useState<number | null>(null);
  const [reversalReason, setReversalReason] = useState('');

  // Abrir detalle de gastos de una partida
  const handleOpenBudgetLineDetail = async (bLine: any) => {
    setSelectedBudgetLine(bLine);
    setIsLoadingExpenses(true);
    setExpenseActionError(null);
    setActionSuccessMessage(null);

    try {
      const res = await fetch(`/api/budget-lines/${bLine.id}/expenses`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setLineExpenses(data.expenses || []);
        setLineTotals(data.totals || null);
      } else {
        // Fallback: filtrar de los gastos del proyecto si están precargados
        const fallbackExpenses = (project.expenses || []).filter((e: any) => e.budgetLineId === bLine.id);
        setLineExpenses(fallbackExpenses);
      }
    } catch (err: any) {
      console.error('Error fetching line expenses:', err);
    } finally {
      setIsLoadingExpenses(false);
    }
  };

  // Aprobar gasto
  const handleApproveExpense = async (expenseId: number) => {
    setExpenseActionError(null);
    try {
      const res = await fetch(`/api/expenses/${expenseId}/approve`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ status: 'approved' }),
      });

      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.error || 'Error al aprobar gasto');
      }

      setActionSuccessMessage(`Gasto #${expenseId} aprobado con éxito`);
      onRefresh();
      if (selectedBudgetLine) {
        handleOpenBudgetLineDetail(selectedBudgetLine);
      }
    } catch (err: any) {
      setExpenseActionError(err.message);
    }
  };

  // Rechazar gasto
  const handleRejectExpense = async (expenseId: number) => {
    setExpenseActionError(null);
    try {
      const res = await fetch(`/api/expenses/${expenseId}/reject`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ status: 'rejected' }),
      });

      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.error || 'Error al rechazar gasto');
      }

      setActionSuccessMessage(`Gasto #${expenseId} rechazado`);
      onRefresh();
      if (selectedBudgetLine) {
        handleOpenBudgetLineDetail(selectedBudgetLine);
      }
    } catch (err: any) {
      setExpenseActionError(err.message);
    }
  };

  // Revertir gasto
  const handleConfirmReversal = async (expenseId: number) => {
    if (!reversalReason || reversalReason.trim().length < 5) {
      setExpenseActionError('Debe ingresar un motivo de reversión de al menos 5 caracteres.');
      return;
    }

    setExpenseActionError(null);
    try {
      const res = await fetch(`/api/expenses/${expenseId}/reverse`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ reason: reversalReason }),
      });

      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.error || 'Error al revertir gasto');
      }

      setActionSuccessMessage(`Gasto #${expenseId} revertido con éxito. Saldo restaurado.`);
      setReversingExpenseId(null);
      setReversalReason('');
      onRefresh();
      if (selectedBudgetLine) {
        handleOpenBudgetLineDetail(selectedBudgetLine);
      }
    } catch (err: any) {
      setExpenseActionError(err.message);
    }
  };

  const isDirector = userRole === 'DIRECTOR' || userRole === 'SUPERADMIN';

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h4 className="text-xs font-bold text-[#00313b] uppercase tracking-wider">Control de Partidas Presupuestarias</h4>
          <p className="text-[11px] text-slate-400 font-sans">Haga clic en cualquier partida para auditar el detalle de gastos y comprobantes asociados</p>
        </div>
        {isEditable && (
          <button
            onClick={() => {
              setPreselectedBudgetLineId(undefined);
              setIsExpenseModalOpen(true);
            }}
            className="flex items-center space-x-2 bg-[#008fa0] text-white px-4 py-2 rounded-lg text-xs font-bold hover:bg-[#007a8a] transition-colors shadow-sm cursor-pointer"
          >
            <DollarSign className="w-4 h-4" />
            <span>Registrar Gasto</span>
          </button>
        )}
      </div>

      {/* Table de Partidas con selección de detalle */}
      <div className="border border-slate-100 rounded-xl overflow-hidden shadow-sm">
        <table className="w-full text-left border-collapse text-xs">
          <thead>
            <tr className="bg-slate-50 border-b border-slate-100 text-slate-500 uppercase font-mono text-[9px] tracking-wider">
              <th className="p-3.5">Código</th>
              <th className="p-3.5">Categoría / Subcategoría</th>
              <th className="p-3.5 text-right">Aprobado Original</th>
              <th className="p-3.5 text-right">Reformulado</th>
              <th className="p-3.5 text-right">Ejecutado</th>
              <th className="p-3.5 text-right">Saldo</th>
              <th className="p-3.5 text-center">Detalle</th>
              {isEditable && <th className="p-3.5 text-center">Acción</th>}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {project.budgetLines?.length === 0 ? (
              <tr>
                <td colSpan={8} className="p-6 text-center text-slate-400">Sin partidas cargadas.</td>
              </tr>
            ) : (
              project.budgetLines?.map((item: any) => (
                <tr
                  key={item.id}
                  className={`hover:bg-cyan-50/50 transition-colors cursor-pointer ${
                    selectedBudgetLine?.id === item.id ? 'bg-cyan-50/80 border-l-4 border-l-[#008fa0]' : ''
                  }`}
                  onClick={() => handleOpenBudgetLineDetail(item)}
                >
                  <td className="p-3.5 font-mono font-bold text-[#00313b]">{item.code}</td>
                  <td className="p-3.5">
                    <div className="font-bold text-[#00313b] text-xs">{item.category}</div>
                    <div className="text-[10px] text-slate-400">{item.subcategory}</div>
                  </td>
                  <td className="p-3.5 text-right font-mono text-slate-500">${item.approvedAmount?.toLocaleString()}</td>
                  <td className="p-3.5 text-right font-mono text-emerald-700 font-bold">${item.reformulatedAmount?.toLocaleString()}</td>
                  <td className="p-3.5 text-right font-mono text-blue-600 font-bold">${item.executedAmount?.toLocaleString()}</td>
                  <td className="p-3.5 text-right font-mono font-bold text-slate-700">${item.balance?.toLocaleString()}</td>
                  <td className="p-3.5 text-center" onClick={(e) => e.stopPropagation()}>
                    <button
                      onClick={() => handleOpenBudgetLineDetail(item)}
                      className="inline-flex items-center space-x-1 text-[10px] font-bold text-[#008fa0] bg-cyan-50 hover:bg-cyan-100 px-2 py-1 rounded transition-colors"
                      title="Ver gastos imputados a esta partida"
                    >
                      <span>Ver Gastos</span>
                      <ChevronRight className="w-3 h-3" />
                    </button>
                  </td>
                  {isEditable && (
                    <td className="p-3.5 text-center" onClick={(e) => e.stopPropagation()}>
                      {refItemId === item.id ? (
                        <div className="flex flex-col space-y-1 items-end">
                          <input
                            type="number"
                            placeholder="Nuevo monto"
                            value={refVal}
                            onChange={(e) => setRefVal(e.target.value)}
                            className="w-24 p-1 text-[10px] font-mono border rounded"
                          />
                          <div className="flex space-x-1">
                            <button onClick={() => setRefItemId(null)} className="text-[9px] text-slate-400 hover:text-slate-600">Cancelar</button>
                            <button onClick={() => handleReformulate(item.id)} className="text-[9px] text-[#008fa0] font-bold">Guardar</button>
                          </div>
                        </div>
                      ) : (
                        <button
                          onClick={() => { setRefItemId(item.id); setRefVal(item.reformulatedAmount.toString()); }}
                          className="text-[10px] font-bold text-[#008fa0] border border-[#008fa0] px-2 py-1 rounded hover:bg-slate-50"
                        >
                          Reformular
                        </button>
                      )}
                    </td>
                  )}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Modal / Panel de Detalle de Gastos por Partida */}
      {selectedBudgetLine && (
        <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-4 shadow-md animate-in fade-in">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3">
            <div>
              <div className="flex items-center space-x-2">
                <span className="font-mono font-bold text-xs bg-[#008fa0] text-white px-2 py-0.5 rounded">
                  {selectedBudgetLine.code}
                </span>
                <h3 className="font-bold text-sm text-[#00313b]">
                  {selectedBudgetLine.category} — {selectedBudgetLine.subcategory}
                </h3>
              </div>
              <p className="text-[10px] text-slate-400 mt-0.5">Auditoría y trazabilidad de gastos imputados</p>
            </div>
            <div className="flex items-center space-x-3">
              {isEditable && (
                <button
                  onClick={() => {
                    setPreselectedBudgetLineId(selectedBudgetLine.id);
                    setIsExpenseModalOpen(true);
                  }}
                  className="flex items-center space-x-1 text-xs bg-[#008fa0] text-white px-3 py-1.5 rounded-lg font-bold hover:bg-[#007a8a] transition-colors"
                >
                  <DollarSign className="w-3.5 h-3.5" />
                  <span>+ Registrar Gasto en Partida</span>
                </button>
              )}
              <button
                onClick={() => setSelectedBudgetLine(null)}
                className="text-slate-400 hover:text-slate-600 p-1 rounded-md"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Tarjetas de Totales de la Partida */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
            <div className="bg-slate-50 p-3 rounded-lg border border-slate-100">
              <span className="text-[10px] font-mono uppercase text-slate-400 block">Presupuesto</span>
              <span className="text-sm font-bold font-mono text-[#00313b]">
                ${(selectedBudgetLine.reformulatedAmount || selectedBudgetLine.approvedAmount)?.toLocaleString()}
              </span>
            </div>
            <div className="bg-emerald-50 p-3 rounded-lg border border-emerald-100">
              <span className="text-[10px] font-mono uppercase text-emerald-600 block">Total Aprobado</span>
              <span className="text-sm font-bold font-mono text-emerald-700">
                ${(selectedBudgetLine.executedAmount || lineTotals?.totalApprovedExpenses || 0)?.toLocaleString()}
              </span>
            </div>
            <div className="bg-amber-50 p-3 rounded-lg border border-amber-100">
              <span className="text-[10px] font-mono uppercase text-amber-600 block">Total Pendiente</span>
              <span className="text-sm font-bold font-mono text-amber-700">
                ${(lineTotals?.totalPendingExpenses || 0)?.toLocaleString()}
              </span>
            </div>
            <div className="bg-cyan-50 p-3 rounded-lg border border-cyan-100">
              <span className="text-[10px] font-mono uppercase text-cyan-700 block">Saldo Disponible</span>
              <span className="text-sm font-bold font-mono text-[#008fa0]">
                ${(selectedBudgetLine.balance || lineTotals?.availableBalance || 0)?.toLocaleString()}
              </span>
            </div>
          </div>

          {/* Mensajes de Feedback */}
          {expenseActionError && (
            <div className="p-3 bg-red-50 border border-red-200 text-red-700 text-xs rounded-lg flex items-center space-x-2">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              <span>{expenseActionError}</span>
            </div>
          )}
          {actionSuccessMessage && (
            <div className="p-3 bg-emerald-50 border border-emerald-200 text-emerald-700 text-xs rounded-lg flex items-center space-x-2">
              <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
              <span>{actionSuccessMessage}</span>
            </div>
          )}

          {/* Diálogo de Reversión */}
          {reversingExpenseId && (
            <div className="p-4 bg-amber-50 border border-amber-200 rounded-xl space-y-3">
              <span className="text-xs font-bold text-amber-800 block">
                Revertir Gasto #{reversingExpenseId} — Motivo Obligatorio de Auditoría
              </span>
              <input
                type="text"
                placeholder="Indique el motivo técnico o legal para revertir este gasto..."
                value={reversalReason}
                onChange={(e) => setReversalReason(e.target.value)}
                className="w-full p-2 text-xs bg-white border border-amber-300 rounded-lg outline-none"
              />
              <div className="flex justify-end space-x-2">
                <button
                  onClick={() => { setReversingExpenseId(null); setReversalReason(''); }}
                  className="px-3 py-1 text-xs text-slate-500 hover:bg-slate-200 rounded"
                >
                  Cancelar
                </button>
                <button
                  onClick={() => handleConfirmReversal(reversingExpenseId)}
                  className="px-3 py-1 text-xs bg-amber-600 text-white font-bold rounded hover:bg-amber-700"
                >
                  Confirmar Reversión
                </button>
              </div>
            </div>
          )}

          {/* Lista de Gastos Imputados */}
          {isLoadingExpenses ? (
            <div className="text-center py-6 text-slate-400 text-xs">Cargando gastos de la partida...</div>
          ) : lineExpenses.length === 0 ? (
            <div className="text-center py-6 text-slate-400 text-xs border border-dashed rounded-lg">
              No hay gastos registrados en esta partida.
            </div>
          ) : (
            <div className="divide-y divide-slate-100 border border-slate-100 rounded-lg overflow-hidden text-xs">
              {lineExpenses.map((exp: any) => {
                const isApproved = exp.status === 'approved';
                const isPending = exp.status === 'pending';
                const isRejected = exp.status === 'rejected';
                const isReversed = exp.status === 'reversed';

                return (
                  <div key={exp.id} className="p-3.5 hover:bg-slate-50 flex items-center justify-between gap-4">
                    <div className="space-y-1 flex-1">
                      <div className="flex items-center space-x-2">
                        <span className="font-bold text-[#00313b]">{exp.title || exp.description || 'Gasto registrado'}</span>
                        <span className={`px-2 py-0.5 rounded-full font-mono text-[9px] font-bold ${
                          isApproved ? 'bg-emerald-100 text-emerald-800' :
                          isPending ? 'bg-amber-100 text-amber-800 animate-pulse' :
                          isRejected ? 'bg-red-100 text-red-800' :
                          'bg-slate-200 text-slate-700'
                        }`}>
                          {exp.status?.toUpperCase()}
                        </span>
                      </div>
                      <div className="flex items-center space-x-4 text-[10px] text-slate-400">
                        <span className="flex items-center space-x-1">
                          <Clock className="w-3 h-3" />
                          <span>Fecha: {exp.date ? new Date(exp.date).toLocaleDateString() : 'N/A'}</span>
                        </span>
                        {exp.category && <span>Categoría: {exp.category}</span>}
                        {exp.vouchers && exp.vouchers.length > 0 && (
                          <span className="flex items-center space-x-1 text-[#008fa0] font-bold">
                            <FileText className="w-3 h-3" />
                            <span>{exp.vouchers.length} Comprobante(s)</span>
                          </span>
                        )}
                      </div>

                      {/* Comprobantes asociados con descarga */}
                      {exp.vouchers && exp.vouchers.length > 0 && (
                        <div className="pt-1 flex flex-wrap gap-2">
                          {exp.vouchers.map((v: any) => (
                            <a
                              key={v.id}
                              href={v.fileUrl}
                              download={v.fileName}
                              target="_blank"
                              rel="noreferrer"
                              className="inline-flex items-center space-x-1 px-2 py-0.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded text-[9px] font-mono"
                            >
                              <Download className="w-2.5 h-2.5" />
                              <span>{v.fileName}</span>
                            </a>
                          ))}
                        </div>
                      )}
                    </div>

                    <div className="text-right space-y-1 flex-shrink-0">
                      <div className="font-mono font-bold text-sm text-[#00313b]">
                        ${Number(exp.baseAmount ?? exp.amount)?.toLocaleString()} {exp.currency || 'USD'}
                      </div>
                      
                      {/* Acciones de Ciclo de Vida para Director */}
                      {isDirector && (
                        <div className="flex items-center space-x-1 justify-end pt-1">
                          {isPending && (
                            <>
                              <button
                                onClick={() => handleApproveExpense(exp.id)}
                                className="px-2 py-0.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded text-[10px] font-bold"
                                title="Aprobar gasto (afecta saldo ejecutado)"
                              >
                                Aprobar
                              </button>
                              <button
                                onClick={() => handleRejectExpense(exp.id)}
                                className="px-2 py-0.5 bg-red-600 hover:bg-red-700 text-white rounded text-[10px] font-bold"
                                title="Rechazar gasto"
                              >
                                Rechazar
                              </button>
                            </>
                          )}
                          {isApproved && (
                            <button
                              onClick={() => { setReversingExpenseId(exp.id); setReversalReason(''); }}
                              className="px-2 py-0.5 bg-slate-600 hover:bg-slate-700 text-white rounded text-[10px] font-bold flex items-center space-x-1"
                              title="Revertir gasto aprobado mediante auditoría"
                            >
                              <RotateCcw className="w-2.5 h-2.5" />
                              <span>Revertir</span>
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Registro de nueva partida */}
      {isEditable && (
        <div className="p-4 bg-slate-50 border border-slate-100 rounded-xl space-y-3">
          <span className="text-[10px] font-mono font-bold text-slate-400 uppercase">Registrar Nueva Partida Original</span>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <input
              type="text"
              placeholder="Código (Ej. 1.1.2)"
              value={budgetCode}
              onChange={(e) => setBudgetCode(e.target.value)}
              className="p-2.5 bg-white border border-slate-200 rounded-lg text-xs outline-none"
            />
            <input
              type="text"
              placeholder="Categoría"
              value={budgetCat}
              onChange={(e) => setBudgetCat(e.target.value)}
              className="p-2.5 bg-white border border-slate-200 rounded-lg text-xs outline-none"
            />
            <input
              type="text"
              placeholder="Subcategoría"
              value={budgetSub}
              onChange={(e) => setBudgetSub(e.target.value)}
              className="p-2.5 bg-white border border-slate-200 rounded-lg text-xs outline-none"
            />
            <input
              type="number"
              placeholder="Monto Aprobado ($)"
              value={budgetApproved}
              onChange={(e) => setBudgetApproved(e.target.value)}
              className="p-2.5 bg-white border border-slate-200 rounded-lg text-xs outline-none"
            />
          </div>
          <button
            onClick={handleAddBudgetItem}
            className="w-full py-2.5 bg-[#008fa0] text-white text-xs font-bold rounded-xl hover:bg-[#007a8a] cursor-pointer"
          >
            Registrar Partida Presupuestaria
          </button>
        </div>
      )}

      <ExpenseRegistrationModal
        isOpen={isExpenseModalOpen}
        onClose={() => setIsExpenseModalOpen(false)}
        project={project}
        token={token}
        onSuccess={() => {
          onRefresh();
          if (selectedBudgetLine) {
            handleOpenBudgetLineDetail(selectedBudgetLine);
          }
        }}
        preselectedBudgetLineId={preselectedBudgetLineId}
      />
    </div>
  );
}
