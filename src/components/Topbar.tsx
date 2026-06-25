import React from 'react';
import { Calendar, CloudLightning, ShieldAlert } from 'lucide-react';

interface TopbarProps {
  currentTab: string;
  selectedProjectName?: string;
  onClearSelectedProject?: () => void;
}

export default function Topbar({ currentTab, selectedProjectName, onClearSelectedProject }: TopbarProps) {
  // Translate system tabs for display
  const getBreadcrumbs = () => {
    const defaultStyle = "text-slate-400 text-xs font-sans";
    const activeStyle = "text-[#0F172A] text-xs font-sans font-semibold";

    if (selectedProjectName) {
      return (
        <div id="breadcrumbs" className="flex items-center space-x-1.5">
          <button onClick={onClearSelectedProject} className="text-slate-400 hover:text-[#2563EB] text-xs font-sans font-medium cursor-pointer">
            Portafolio
          </button>
          <span className="text-slate-300 text-[10px]">/</span>
          <span className={activeStyle}>{selectedProjectName}</span>
        </div>
      );
    }

    let tabName = 'Dashboard';
    if (currentTab === 'portfolio') tabName = 'Portafolio de Proyectos';
    if (currentTab === 'audit') tabName = 'Bitácora y Auditoría General';

    return (
      <div id="breadcrumbs" className="flex items-center space-x-1.5">
        <span className={defaultStyle}>PROYECTY</span>
        <span className="text-slate-300 text-[10px]">/</span>
        <span className={activeStyle}>{tabName}</span>
      </div>
    );
  };

  return (
    <header id="app-topbar" className="h-14 bg-white border-b border-slate-200 flex items-center justify-between px-6 select-none flex-shrink-0 sticky top-0 z-40">
      {/* Breadcrumbs */}
      <div>{getBreadcrumbs()}</div>

      {/* Operations Panel */}
      <div className="flex items-center space-x-4">
        {/* Connection status */}
        <div className="flex items-center space-x-1.5 bg-emerald-50 text-emerald-700 px-2.5 py-0.5 rounded-full border border-emerald-100/60">
          <CloudLightning className="w-3 h-3" />
          <span className="text-[9px] font-mono font-bold uppercase tracking-wider">Cloud SQL Conectado</span>
        </div>

        {/* Date Display */}
        <div className="flex items-center space-x-1.5 text-slate-500 font-sans text-xs">
          <Calendar className="w-3.5 h-3.5 text-[#2563EB]" />
          <span className="text-[11px] font-medium">{new Date().toLocaleDateString('es-ES', { weekday: 'short', day: 'numeric', month: 'short' })}</span>
        </div>
      </div>
    </header>
  );
}
