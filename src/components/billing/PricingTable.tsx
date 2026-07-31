import React, { useState } from 'react';
import { Check, Loader2 } from 'lucide-react';

export default function PricingTable() {
  const [loading, setLoading] = useState(false);

  const handleCheckout = async () => {
    setLoading(true);
    try {
      const response = await fetch('/api/billing/checkout-session', {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('proyecty_token')}`,
        }
      });
      if (!response.ok) throw new Error('Error al generar checkout');
      
      const { checkoutUrl } = await response.json();
      window.location.href = checkoutUrl;
    } catch (error) {
      console.error(error);
      alert('Hubo un error al conectar con el servicio de pagos.');
      setLoading(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto py-12 px-4 sm:px-6 lg:px-8">
      <div className="text-center">
        <h2 className="text-3xl font-extrabold text-gray-900 sm:text-4xl">
          Precios simples y transparentes
        </h2>
        <p className="mt-4 text-xl text-gray-600">
          Potencia tu organización con reportes IA y acceso ilimitado.
        </p>
      </div>
      <div className="mt-12 space-y-4 sm:mt-16 sm:space-y-0 sm:grid sm:grid-cols-2 sm:gap-6 lg:max-w-4xl lg:mx-auto xl:max-w-none xl:mx-0">
        
        {/* Free Plan */}
        <div className="border border-gray-200 rounded-lg shadow-sm divide-y divide-gray-200 bg-white">
          <div className="p-6">
            <h2 className="text-lg leading-6 font-medium text-gray-900">Básico</h2>
            <p className="mt-4 text-sm text-gray-500">Perfecto para empezar a gestionar proyectos.</p>
            <p className="mt-8">
              <span className="text-4xl font-extrabold text-gray-900">$0</span>
              <span className="text-base font-medium text-gray-500">/mes</span>
            </p>
            <button
              disabled
              className="mt-8 block w-full bg-gray-100 border border-gray-300 rounded-md py-2 text-sm font-semibold text-gray-500 text-center cursor-not-allowed"
            >
              Plan Actual
            </button>
          </div>
          <div className="pt-6 pb-8 px-6">
            <h3 className="text-xs font-medium text-gray-900 tracking-wide uppercase">Qué incluye</h3>
            <ul className="mt-6 space-y-4">
              <li className="flex space-x-3"><Check className="flex-shrink-0 h-5 w-5 text-green-500" /><span className="text-sm text-gray-500">Gestión de proyectos</span></li>
              <li className="flex space-x-3"><Check className="flex-shrink-0 h-5 w-5 text-green-500" /><span className="text-sm text-gray-500">Aprobación de presupuestos</span></li>
              <li className="flex space-x-3"><Check className="flex-shrink-0 h-5 w-5 text-green-500" /><span className="text-sm text-gray-500">1 Usuario</span></li>
            </ul>
          </div>
        </div>

        {/* Pro Plan */}
        <div className="border border-blue-500 rounded-lg shadow-sm divide-y divide-gray-200 bg-white ring-1 ring-blue-500 relative">
          <div className="absolute top-0 right-0 -translate-y-1/2 translate-x-0 bg-blue-500 text-white px-3 py-1 text-xs font-semibold rounded-full uppercase tracking-wide">
            Recomendado
          </div>
          <div className="p-6">
            <h2 className="text-lg leading-6 font-medium text-gray-900">Pro</h2>
            <p className="mt-4 text-sm text-gray-500">Todo el poder de Proyecty con automatización IA.</p>
            <p className="mt-8">
              <span className="text-4xl font-extrabold text-gray-900">$49</span>
              <span className="text-base font-medium text-gray-500">/mes</span>
            </p>
            <button
              onClick={handleCheckout}
              disabled={loading}
              className="mt-8 block w-full bg-blue-600 hover:bg-blue-700 border border-transparent rounded-md py-2 text-sm font-semibold text-white text-center transition-colors disabled:opacity-50 flex justify-center items-center"
            >
              {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : 'Actualizar a Pro'}
            </button>
          </div>
          <div className="pt-6 pb-8 px-6">
            <h3 className="text-xs font-medium text-gray-900 tracking-wide uppercase">Qué incluye</h3>
            <ul className="mt-6 space-y-4">
              <li className="flex space-x-3"><Check className="flex-shrink-0 h-5 w-5 text-green-500" /><span className="text-sm text-gray-500">Todo lo de Básico</span></li>
              <li className="flex space-x-3"><Check className="flex-shrink-0 h-5 w-5 text-green-500" /><span className="text-sm text-gray-700 font-semibold">Reportes generados por IA</span></li>
              <li className="flex space-x-3"><Check className="flex-shrink-0 h-5 w-5 text-green-500" /><span className="text-sm text-gray-700 font-semibold">Usuarios ilimitados</span></li>
              <li className="flex space-x-3"><Check className="flex-shrink-0 h-5 w-5 text-green-500" /><span className="text-sm text-gray-700 font-semibold">Métricas Avanzadas</span></li>
            </ul>
          </div>
        </div>

      </div>
    </div>
  );
}
