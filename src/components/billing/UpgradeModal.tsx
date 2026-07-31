import React from 'react';
import { X, Sparkles, Zap, Lock } from 'lucide-react';
import PricingTable from './PricingTable.tsx';

interface UpgradeModalProps {
  isOpen: boolean;
  onClose: () => void;
  message?: string;
}

export default function UpgradeModal({ isOpen, onClose, message }: UpgradeModalProps) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 sm:p-6">
      <div className="absolute inset-0 bg-gray-900/50 backdrop-blur-sm" onClick={onClose} />
      
      <div className="relative bg-white rounded-2xl shadow-xl w-full max-w-4xl max-h-[90vh] overflow-y-auto animate-in fade-in zoom-in-95 duration-200">
        <button
          onClick={onClose}
          className="absolute right-4 top-4 text-gray-400 hover:text-gray-600 transition-colors z-10 bg-white rounded-full p-1 shadow-sm border border-gray-100"
        >
          <X className="w-6 h-6" />
        </button>

        <div className="p-6 sm:p-10 border-b border-gray-100 bg-gradient-to-br from-blue-50 to-indigo-50/30">
          <div className="w-12 h-12 bg-blue-100 rounded-xl flex items-center justify-center mb-4 border border-blue-200 shadow-sm">
            <Lock className="w-6 h-6 text-blue-600" />
          </div>
          <h2 className="text-2xl sm:text-3xl font-bold text-gray-900 mb-2">
            Funcionalidad Premium
          </h2>
          <p className="text-gray-600 text-lg">
            {message || 'Esta funcionalidad está reservada para organizaciones con el Plan Pro. Mejora tu suscripción para acceder a todo el poder de Proyecty.'}
          </p>
        </div>

        <div className="p-2">
          <PricingTable />
        </div>
      </div>
    </div>
  );
}
