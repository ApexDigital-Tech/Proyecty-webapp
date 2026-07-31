import React, { useState } from 'react';
import { CreditCard, ExternalLink, Loader2, Sparkles } from 'lucide-react';

export default function SubscriptionStatusCard({ status, variantId, renewsAt }: { status: string; variantId?: string; renewsAt?: string }) {
  const [loading, setLoading] = useState(false);

  const handlePortal = async () => {
    setLoading(true);
    try {
      const response = await fetch('/api/billing/portal', {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('proyecty_token')}`,
        }
      });
      if (!response.ok) throw new Error('Error al obtener portal');
      
      const { portalUrl } = await response.json();
      window.open(portalUrl, '_blank');
    } catch (error) {
      console.error(error);
      alert('Error al acceder al portal de facturación.');
    } finally {
      setLoading(false);
    }
  };

  const isActive = status === 'active' || status === 'on_trial';
  const isPro = !!variantId; // Simplification, can be improved.

  return (
    <div className="bg-white rounded-lg border border-gray-200 p-6 shadow-sm">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
          <CreditCard className="w-5 h-5 text-gray-500" />
          Suscripción Actual
        </h3>
        <span className={`px-2.5 py-1 text-xs font-semibold rounded-full ${isActive ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'}`}>
          {isActive ? 'Activa' : (status || 'Gratis').toUpperCase()}
        </span>
      </div>

      <div className="mb-6">
        <p className="text-3xl font-bold text-gray-900 flex items-center gap-2">
          {isPro ? 'Plan Pro' : 'Plan Básico'}
          {isPro && <Sparkles className="w-6 h-6 text-blue-500" />}
        </p>
        {renewsAt && (
          <p className="text-sm text-gray-500 mt-2">
            Próxima renovación: {new Date(renewsAt).toLocaleDateString()}
          </p>
        )}
      </div>

      {isActive ? (
        <button
          onClick={handlePortal}
          disabled={loading}
          className="flex items-center gap-2 bg-white border border-gray-300 text-gray-700 hover:bg-gray-50 font-medium py-2 px-4 rounded-md transition-colors text-sm"
        >
          {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <ExternalLink className="w-4 h-4" />}
          Gestionar Facturación
        </button>
      ) : null}
    </div>
  );
}
