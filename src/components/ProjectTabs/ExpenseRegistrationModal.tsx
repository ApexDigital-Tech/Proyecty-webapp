import React, { useState, useEffect } from 'react';
import { X, DollarSign, Calculator, AlertCircle, FileText, CheckCircle2, Upload } from 'lucide-react';
import { AUTHORIZED_CURRENCIES } from '../../types.ts';

interface ExpenseRegistrationModalProps {
  isOpen: boolean;
  onClose: () => void;
  project: any;
  token: string;
  onSuccess: () => void;
  preselectedBudgetLineId?: number;
}

export default function ExpenseRegistrationModal({
  isOpen,
  onClose,
  project,
  token,
  onSuccess,
  preselectedBudgetLineId,
}: ExpenseRegistrationModalProps) {
  const baseCurrency = project?.baseCurrency || 'USD';
  
  const [budgetLineId, setBudgetLineId] = useState('');
  const [title, setTitle] = useState('');
  const [originalAmount, setOriginalAmount] = useState('');
  const [originalCurrency, setOriginalCurrency] = useState('USD');
  const [exchangeRate, setExchangeRate] = useState('1');
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState('');
  
  // Archivo comprobante adjunto opcional
  const [voucherFile, setVoucherFile] = useState<File | null>(null);
  const [provider, setProvider] = useState('');
  
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Preselección de partida
  useEffect(() => {
    if (preselectedBudgetLineId) {
      setBudgetLineId(String(preselectedBudgetLineId));
    }
  }, [preselectedBudgetLineId, isOpen]);

  // Obtener partida seleccionada
  const selectedBudgetLine = project?.budgetLines?.find(
    (b: any) => String(b.id) === String(budgetLineId)
  );

  // Derived state
  const isDifferentCurrency = originalCurrency !== baseCurrency;
  const numOriginal = parseFloat(originalAmount || '0');
  const numRate = parseFloat(exchangeRate || '1');
  const baseAmount = (numOriginal * numRate).toFixed(2);
  const numBaseAmount = parseFloat(baseAmount);

  // Validación de saldo
  const availableBalance = selectedBudgetLine ? selectedBudgetLine.balance : 0;
  const exceedsBalance = selectedBudgetLine && numBaseAmount > availableBalance;

  useEffect(() => {
    if (!isDifferentCurrency) {
      setExchangeRate('1');
    }
  }, [isDifferentCurrency]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    setIsSubmitting(true);

    if (!budgetLineId || !title || !originalAmount || !date) {
      setError('Llene todos los campos obligatorios (*).');
      setIsSubmitting(false);
      return;
    }

    if (numOriginal <= 0) {
      setError('El monto del gasto debe ser estrictamente positivo.');
      setIsSubmitting(false);
      return;
    }

    if (isDifferentCurrency && (!exchangeRate || numRate <= 0)) {
      setError('La tasa de cambio debe ser mayor a 0 cuando la moneda es distinta a la base.');
      setIsSubmitting(false);
      return;
    }

    try {
      // 1. Crear el gasto mediante el endpoint canónico
      const res = await fetch(`/api/projects/${project.id}/expenses`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          projectId: Number(project.id),
          budgetLineId: parseInt(budgetLineId, 10),
          title,
          amount: numOriginal,
          currency: originalCurrency,
          exchangeRate: numRate,
          category: category || selectedBudgetLine?.category || 'General',
          date,
          description,
        })
      });

      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.error || 'Error al registrar el gasto');
      }

      const createdExpense = await res.json();

      // 2. Si se adjuntó un comprobante, subirlo y asociarlo inmediatamente al gasto
      if (voucherFile) {
        const formData = new FormData();
        formData.append('file', voucherFile);
        formData.append('projectId', String(project.id));
        formData.append('expenseId', String(createdExpense.id));
        formData.append('budgetLineId', String(budgetLineId));
        formData.append('type', 'Factura');
        formData.append('amount', String(numBaseAmount));
        formData.append('provider', provider || 'Proveedor Registrado');
        formData.append('issueDate', date);
        formData.append('description', description || title);

        const uploadRes = await fetch('/api/uploads/voucher', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
          },
          body: formData,
        });

        if (!uploadRes.ok) {
          console.warn('El gasto se creó pero hubo un error cargando el comprobante.');
        }
      }

      setSuccess('Gasto registrado con éxito en estado pendiente.');
      setTimeout(() => {
        onSuccess();
        onClose();
      }, 700);
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
              <p className="text-[10px] text-slate-500 font-sans">Moneda base del proyecto: {baseCurrency}</p>
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
          {success && (
            <div className="mb-4 p-3 bg-emerald-50 border border-emerald-100 text-emerald-700 text-xs rounded-lg flex items-center space-x-2">
              <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
              <span>{success}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4 text-xs font-sans">
            
            {/* Partida presupuestaria */}
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
                    [{item.code}] {item.category} - {item.subcategory} (Saldo disponible: ${item.balance?.toLocaleString()} {baseCurrency})
                  </option>
                ))}
              </select>
            </div>

            {/* Advertencia de saldo si excede */}
            {exceedsBalance && (
              <div className="p-2.5 bg-amber-50 border border-amber-200 text-amber-800 text-[11px] rounded-lg flex items-center space-x-2">
                <AlertCircle className="w-4 h-4 text-amber-600 flex-shrink-0" />
                <span>
                  Advertencia de saldo: El monto ($ {baseAmount}) supera el saldo disponible actual (${availableBalance.toLocaleString()}).
                  El gasto podrá registrarse como pendiente, pero requerirá reformulación antes de su aprobación.
                </span>
              </div>
            )}

            {/* Título del Gasto */}
            <div className="space-y-1">
              <label className="block font-bold text-[#00313b]">Título o Concepto del Gasto (*)</label>
              <input
                type="text"
                placeholder="Ej. Adquisición de Lote 3 de filtros hidráulicos"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="w-full p-2.5 bg-white border border-slate-200 rounded-lg outline-none focus:border-[#008fa0]"
              />
            </div>

            {/* Monto y Moneda */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <label className="block font-bold text-[#00313b]">Monto Original (*)</label>
                <input
                  type="number"
                  step="0.01"
                  placeholder="0.00"
                  value={originalAmount}
                  onChange={(e) => setOriginalAmount(e.target.value)}
                  className="w-full p-2.5 bg-white border border-slate-200 rounded-lg outline-none focus:border-[#008fa0] font-mono"
                />
              </div>
              <div className="space-y-1">
                <label className="block font-bold text-[#00313b]">Moneda Original (*)</label>
                <select
                  value={originalCurrency}
                  onChange={(e) => setOriginalCurrency(e.target.value)}
                  className="w-full p-2.5 bg-white border border-slate-200 rounded-lg outline-none cursor-pointer focus:border-[#008fa0]"
                >
                  {AUTHORIZED_CURRENCIES.map((c) => (
                    <option key={c.code} value={c.code}>{c.label}</option>
                  ))}
                </select>
              </div>
            </div>

            {/* Conversión si es moneda diferente */}
            {isDifferentCurrency && (
              <div className="bg-[#e0f2f4]/30 border border-[#008fa0]/20 p-3.5 rounded-xl space-y-3">
                <div className="flex items-center space-x-2 text-[#008fa0]">
                  <Calculator className="w-4 h-4" />
                  <span className="font-bold text-xs">Conversión a Moneda Base ({baseCurrency})</span>
                </div>
                
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <label className="block font-bold text-[#00313b]">Tasa de Cambio (*)</label>
                    <input
                      type="number"
                      step="0.000001"
                      placeholder="1.0"
                      value={exchangeRate}
                      onChange={(e) => setExchangeRate(e.target.value)}
                      className="w-full p-2 bg-white border border-[#008fa0]/30 rounded-lg outline-none focus:border-[#008fa0] font-mono"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="block font-bold text-[#00313b]">Monto Base ({baseCurrency})</label>
                    <div className="w-full p-2 bg-slate-100 border border-slate-200 rounded-lg font-mono font-bold text-slate-700">
                      ${baseAmount}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Fecha y Categoría */}
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
              <div className="space-y-1">
                <label className="block font-bold text-[#00313b]">Categoría Operativa</label>
                <input
                  type="text"
                  placeholder="Ej. Insumos Técnicos"
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                  className="w-full p-2.5 bg-white border border-slate-200 rounded-lg outline-none focus:border-[#008fa0]"
                />
              </div>
            </div>

            {/* Proveedor y Comprobante PDF Opcional */}
            <div className="border border-slate-200 rounded-xl p-3.5 bg-slate-50 space-y-3">
              <span className="font-bold text-[#00313b] block">Comprobante de Respaldo (PDF)</span>
              
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="block text-[11px] text-slate-500">Proveedor / Emisor</label>
                  <input
                    type="text"
                    placeholder="Ej. Suministros Globales S.A."
                    value={provider}
                    onChange={(e) => setProvider(e.target.value)}
                    className="w-full p-2 bg-white border border-slate-200 rounded-lg outline-none"
                  />
                </div>
                <div className="space-y-1">
                  <label className="block text-[11px] text-slate-500">Archivo PDF</label>
                  <input
                    type="file"
                    accept=".pdf,application/pdf"
                    onChange={(e) => setVoucherFile(e.target.files ? e.target.files[0] : null)}
                    className="w-full p-1.5 bg-white border border-slate-200 rounded-lg text-xs"
                  />
                </div>
              </div>

              {voucherFile && (
                <div className="flex items-center space-x-2 text-[11px] text-[#008fa0] bg-cyan-50 p-2 rounded-lg font-mono">
                  <FileText className="w-3.5 h-3.5" />
                  <span>Archivo seleccionado: {voucherFile.name} ({(voucherFile.size / 1024).toFixed(1)} KB)</span>
                </div>
              )}
            </div>

            {/* Descripción */}
            <div className="space-y-1">
              <label className="block font-bold text-[#00313b]">Justificación / Glosa</label>
              <textarea
                rows={2}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className="w-full p-2.5 bg-white border border-slate-200 rounded-lg outline-none focus:border-[#008fa0]"
                placeholder="Detalle operativo de la imputación..."
              />
            </div>
            
          </form>
        </div>

        <div className="p-4 border-t border-slate-100 bg-slate-50 flex justify-end space-x-3">
          <button
            onClick={onClose}
            className="px-4 py-2 text-slate-500 font-bold hover:bg-slate-200 rounded-lg transition-colors text-xs cursor-pointer"
          >
            Cancelar
          </button>
          <button
            onClick={handleSubmit}
            disabled={isSubmitting}
            className="px-6 py-2 bg-[#008fa0] text-white font-bold rounded-lg hover:bg-[#007a8a] transition-colors disabled:opacity-50 text-xs shadow-sm cursor-pointer"
          >
            {isSubmitting ? 'Registrando...' : 'Registrar Gasto'}
          </button>
        </div>

      </div>
    </div>
  );
}
