import React, { useState } from 'react';
import { DollarSign } from 'lucide-react';
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
}: TabPresupuestoProps) {
  const [isExpenseModalOpen, setIsExpenseModalOpen] = useState(false);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h4 className="text-xs font-bold text-[#00313b] uppercase tracking-wider">Control de Partidas Presupuestarias</h4>
          <p className="text-[11px] text-slate-400 font-sans">Compare partidas originales contra reformulaciones y ejecución total</p>
        </div>
        {isEditable && (
          <button
            onClick={() => setIsExpenseModalOpen(true)}
            className="flex items-center space-x-2 bg-[#008fa0] text-white px-4 py-2 rounded-lg text-xs font-bold hover:bg-[#007a8a] transition-colors shadow-sm"
          >
            <DollarSign className="w-4 h-4" />
            <span>Registrar Gasto</span>
          </button>
        )}
      </div>

      {/* Table */}
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
              {isEditable && <th className="p-3.5 text-center">Acción</th>}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {project.budgetLines?.length === 0 ? (
              <tr>
                <td colSpan={7} className="p-6 text-center text-slate-400">Sin partidas cargadas.</td>
              </tr>
            ) : (
              project.budgetLines?.map((item: any) => (
                <tr key={item.id} className="hover:bg-slate-50 transition-colors">
                  <td className="p-3.5 font-mono font-bold text-[#00313b]">{item.code}</td>
                  <td className="p-3.5">
                    <div className="font-bold text-[#00313b] text-xs">{item.category}</div>
                    <div className="text-[10px] text-slate-400">{item.subcategory}</div>
                  </td>
                  <td className="p-3.5 text-right font-mono text-slate-500">${item.approvedAmount.toLocaleString()}</td>
                  <td className="p-3.5 text-right font-mono text-emerald-700 font-bold">${item.reformulatedAmount.toLocaleString()}</td>
                  <td className="p-3.5 text-right font-mono text-blue-600">${item.executedAmount.toLocaleString()}</td>
                  <td className="p-3.5 text-right font-mono font-bold text-slate-700">${item.balance.toLocaleString()}</td>
                  {isEditable && (
                    <td className="p-3.5 text-center">
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
        onSuccess={onRefresh}
      />
    </div>
  );
}
