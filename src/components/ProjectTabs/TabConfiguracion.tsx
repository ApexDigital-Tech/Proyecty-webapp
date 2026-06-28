import React from 'react';
import { Settings, Save } from 'lucide-react';
import { UserRole } from '../../types.ts';
import { hasPermission } from '../../lib/rbac.ts';

interface TabConfiguracionProps {
  project: any;
  userRole: UserRole;
  token: string;
  onRefresh: () => void;
}

export default function TabConfiguracion({ project, userRole, token, onRefresh }: TabConfiguracionProps) {
  const [baseCurrency, setBaseCurrency] = React.useState(project.baseCurrency || 'USD');
  const [isSaving, setIsSaving] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [success, setSuccess] = React.useState<string | null>(null);

  const canEdit = hasPermission(userRole, 'canEditProject'); // assuming director or project manager

  const handleSave = async () => {
    if (!canEdit) return;
    setIsSaving(true);
    setError(null);
    setSuccess(null);
    try {
      const res = await fetch(`/api/projects/${project.id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ baseCurrency })
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Error al actualizar configuración');
      }
      setSuccess('Configuración actualizada correctamente.');
      onRefresh();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h4 className="text-xs font-bold text-[#00313b] uppercase tracking-wider flex items-center space-x-2">
          <Settings className="w-4 h-4" />
          <span>Configuración del Proyecto</span>
        </h4>
        <p className="text-[11px] text-slate-400 font-sans mt-1">Ajuste parámetros globales como la moneda de consolidación financiera.</p>
      </div>

      {error && <div className="text-xs text-red-600 bg-red-50 p-2 rounded">{error}</div>}
      {success && <div className="text-xs text-green-600 bg-green-50 p-2 rounded">{success}</div>}

      <div className="bg-slate-50 border border-slate-100 p-5 rounded-xl space-y-4">
        <div>
          <label className="block text-xs font-bold text-[#00313b] mb-1">Moneda Base (Consolidación)</label>
          <p className="text-[10px] text-slate-500 mb-3">
            Esta moneda se utilizará para reportar el presupuesto aprobado y ejecutado, independientemente de la moneda original en que se registren los gastos.
          </p>
          <select 
            value={baseCurrency}
            onChange={(e) => setBaseCurrency(e.target.value)}
            disabled={!canEdit || isSaving}
            className="w-full max-w-sm p-2.5 text-xs bg-white border border-slate-200 rounded-lg outline-none"
          >
            <option value="USD">Dólar Estadounidense (USD)</option>
            <option value="EUR">Euro (EUR)</option>
            <option value="MXN">Peso Mexicano (MXN)</option>
            <option value="COP">Peso Colombiano (COP)</option>
            <option value="ARS">Peso Argentino (ARS)</option>
            <option value="BRL">Real Brasileño (BRL)</option>
            <option value="CLP">Peso Chileno (CLP)</option>
            <option value="PEN">Sol Peruano (PEN)</option>
            <option value="UYU">Peso Uruguayo (UYU)</option>
          </select>
        </div>

        {canEdit && (
          <div className="pt-2">
            <button
              onClick={handleSave}
              disabled={isSaving}
              className="flex items-center space-x-2 bg-[#008fa0] text-white px-4 py-2 rounded-lg text-xs font-bold hover:bg-[#007a8a] disabled:opacity-50"
            >
              <Save className="w-3.5 h-3.5" />
              <span>{isSaving ? 'Guardando...' : 'Guardar Configuración'}</span>
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
