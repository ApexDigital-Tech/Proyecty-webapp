import React, { useState, useEffect } from 'react';
import { X, DollarSign, Calculator, AlertCircle } from 'lucide-react';

interface ExpenseRegistrationModalProps {
  isOpen: boolean;
  onClose: () => void;
  project: any;
  token: string;
  onSuccess: () => void;
}

export default function ExpenseRegistrationModal({ isOpen, onClose, project, token, onSuccess }: ExpenseRegistrationModalProps) {
  const baseCurrency = project?.baseCurrency || 'USD';
  
  const [budgetLineId, setBudgetLineId] = useState('');
  const [originalAmount, setOriginalAmount] = useState('');
  const [originalCurrency, setOriginalCurrency] = useState(baseCurrency);
  const [exchangeRate, setExchangeRate] = useState('1');
  const [exchangeRateSource, setExchangeRateSource] = useState('');
  const [exchangeRateDate, setExchangeRateDate] = useState('');
  const [date, setDate] = useState('');
  const [description, setDescription] = useState('');
  
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Derived state
  const isDifferentCurrency = originalCurrency !== baseCurrency;
  const baseAmount = (parseFloat(originalAmount || '0') * parseFloat(exchangeRate || '1')).toFixed(2);

  useEffect(() => {
    if (!isDifferentCurrency) {
      setExchangeRate('1');
      setExchangeRateSource('');
      setExchangeRateDate('');
    }
  }, [isDifferentCurrency]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsSubmitting(true);

    if (!budgetLineId || !originalAmount || !date) {
      setError('Llene los campos obligatorios (*).');
      setIsSubmitting(false);
      return;
    }

    if (isDifferentCurrency && (!exchangeRate || parseFloat(exchangeRate) <= 0)) {
      setError('La tasa de cambio es obligatoria y debe ser mayor a 0 cuando la moneda original es distinta a la base.');
      setIsSubmitting(false);
      return;
    }

    try {
      const res = await fetch(`/api/projects/${project.id}/expenses`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          budgetLineId,
          originalAmount: parseFloat(originalAmount),
          originalCurrency,
          exchangeRate: parseFloat(exchangeRate),
          baseAmount: parseFloat(baseAmount),
          exchangeRateSource,
          exchangeRateDate,
          date,
          description
        })
      });

      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.error || 'Error al registrar el gasto');
      }

      onSuccess();
      onClose();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl overflow-hidden flex flex-col max-h-[90vh]">
        <div className="flex items-center justify-between p-4 border-b border-slate-100 bg-slate-50">
          <div className="flex items-center space-x-2">
            <div className="w-8 h-8 rounded-lg bg-[#008fa0]/10 flex items-center justify-center">
              <DollarSign className="w-4 h-4 text-[#008fa0]" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-[#00313b]">Registrar Nuevo Gasto</h3>
              <p className="text-[10px] text-slate-500 font-sans">Moneda de consolidación: {baseCurrency}</p>
            </div>
          </div>
          <button onClick={onClose} className="p-1 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-md transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 overflow-y-auto">
          {error && (
            <div className="mb-4 p-3 bg-red-50 border border-red-100 text-red-700 text-xs rounded-lg flex items-start space-x-2">
              <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-5 text-xs font-sans">
            
            <div className="space-y-1">
              <label className="block font-bold text-[#00313b]">Partida Presupuestaria de Imputación (*)</label>
              <select
                value={budgetLineId}
                onChange={(e) => setBudgetLineId(e.target.value)}
                className="w-full p-2.5 bg-white border border-slate-200 rounded-lg outline-none cursor-pointer focus:border-[#008fa0]"
              >
                <option value="">Seleccione Partida...</option>
                {project?.budgetLines?.map((item: any) => (
                  <option key={item.id} value={item.id}>
                    [{item.code}] {item.category} - {item.subcategory} (Saldo: ${item.balance?.toLocaleString()} {baseCurrency})
                  </option>
                ))}
              </select>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <label className="block font-bold text-[#00313b]">Monto Original (*)</label>
                <input
                  type="number"
                  step="0.01"
                  placeholder="0.00"
                  value={originalAmount}
                  onChange={(e) => setOriginalAmount(e.target.value)}
                  className="w-full p-2.5 bg-white border border-slate-200 rounded-lg outline-none focus:border-[#008fa0]"
                />
              </div>
              <div className="space-y-1">
                <label className="block font-bold text-[#00313b]">Moneda Original (*)</label>
                <select
                  value={originalCurrency}
                  onChange={(e) => setOriginalCurrency(e.target.value)}
                  className="w-full p-2.5 bg-white border border-slate-200 rounded-lg outline-none cursor-pointer focus:border-[#008fa0]"
                >
                  <option value="USD">USD</option>
                  <option value="EUR">EUR</option>
                  <option value="MXN">MXN</option>
                  <option value="COP">COP</option>
                  <option value="ARS">ARS</option>
                  <option value="BRL">BRL</option>
                  <option value="CLP">CLP</option>
                  <option value="PEN">PEN</option>
                  <option value="UYU">UYU</option>
                </select>
              </div>
            </div>

            {isDifferentCurrency && (
              <div className="bg-[#e0f2f4]/30 border border-[#008fa0]/20 p-4 rounded-xl space-y-4">
                <div className="flex items-center space-x-2 text-[#008fa0] mb-2">
                  <Calculator className="w-4 h-4" />
                  <span className="font-bold text-xs">Conversión a Moneda Base ({baseCurrency})</span>
                </div>
                
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <label className="block font-bold text-[#00313b]">Tasa de Cambio Aplicada (*)</label>
                    <input
                      type="number"
                      step="0.000001"
                      placeholder="Ej. 18.50"
                      value={exchangeRate}
                      onChange={(e) => setExchangeRate(e.target.value)}
                      className="w-full p-2.5 bg-white border border-[#008fa0]/30 rounded-lg outline-none focus:border-[#008fa0]"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="block font-bold text-[#00313b]">Monto Convertido ({baseCurrency})</label>
                    <div className="w-full p-2.5 bg-slate-100 border border-slate-200 rounded-lg font-mono font-bold text-slate-700">
                      {baseAmount}
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <label className="block font-bold text-[#00313b]">Fuente de Tasa (Opcional)</label>
                    <input
                      type="text"
                      placeholder="Ej. Banco Central, OANDA..."
                      value={exchangeRateSource}
                      onChange={(e) => setExchangeRateSource(e.target.value)}
                      className="w-full p-2.5 bg-white border border-[#008fa0]/30 rounded-lg outline-none focus:border-[#008fa0]"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="block font-bold text-[#00313b]">Fecha de Tasa (Opcional)</label>
                    <input
                      type="date"
                      value={exchangeRateDate}
                      onChange={(e) => setExchangeRateDate(e.target.value)}
                      className="w-full p-2.5 bg-white border border-[#008fa0]/30 rounded-lg outline-none focus:border-[#008fa0]"
                    />
                  </div>
                </div>
              </div>
            )}

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <label className="block font-bold text-[#00313b]">Fecha del Gasto (*)</label>
                <input
                  type="date"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  className="w-full p-2.5 bg-white border border-slate-200 rounded-lg outline-none focus:border-[#008fa0]"
                />
              </div>
            </div>

            <div className="space-y-1">
              <label className="block font-bold text-[#00313b]">Concepto / Descripción</label>
              <textarea
                rows={2}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className="w-full p-2.5 bg-white border border-slate-200 rounded-lg outline-none focus:border-[#008fa0]"
                placeholder="Detalle del gasto..."
              />
            </div>
            
          </form>
        </div>

        <div className="p-4 border-t border-slate-100 bg-slate-50 flex justify-end space-x-3">
          <button
            onClick={onClose}
            className="px-4 py-2 text-slate-500 font-bold hover:bg-slate-200 rounded-lg transition-colors text-xs"
          >
            Cancelar
          </button>
          <button
            onClick={handleSubmit}
            disabled={isSubmitting}
            className="px-6 py-2 bg-[#008fa0] text-white font-bold rounded-lg hover:bg-[#007a8a] transition-colors disabled:opacity-50 text-xs shadow-sm"
          >
            {isSubmitting ? 'Registrando...' : 'Registrar Gasto'}
          </button>
        </div>

      </div>
    </div>
  );
}
