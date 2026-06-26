import React from 'react';
import { Calendar, CloudLightning, ShieldAlert } from 'lucide-react';

interface TopbarProps {
  currentTab: string;
  selectedProjectName?: string;
  onClearSelectedProject?: () => void;
  currentUser?: { name: string; email: string; role: string };
  onLogout?: () => void;
  onRoleSwitch?: (role: any) => void;
}

export default function Topbar({ currentTab, selectedProjectName, onClearSelectedProject, currentUser, onLogout, onRoleSwitch }: TopbarProps) {
  const [showProfileMenu, setShowProfileMenu] = React.useState(false);
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
        <div className="hidden md:flex items-center space-x-1.5 text-slate-500 font-sans text-xs">
          <Calendar className="w-3.5 h-3.5 text-[#2563EB]" />
          <span className="text-[11px] font-medium">{new Date().toLocaleDateString('es-ES', { weekday: 'short', day: 'numeric', month: 'short' })}</span>
        </div>

        {/* Mobile Profile Actions (Only visible on md:hidden) */}
        {currentUser && (
          <div className="md:hidden relative">
            <button 
              onClick={() => setShowProfileMenu(!showProfileMenu)}
              className="flex items-center justify-center w-8 h-8 rounded-full bg-blue-100 text-blue-700 font-bold text-xs"
            >
              {currentUser.name.charAt(0).toUpperCase()}
            </button>

            {showProfileMenu && (
              <div className="absolute right-0 mt-2 w-48 bg-white rounded-lg shadow-xl border border-slate-100 p-2 z-50">
                <div className="px-2 py-1.5 border-b border-slate-100 mb-1">
                  <p className="text-xs font-bold text-slate-800 truncate">{currentUser.name}</p>
                  <p className="text-[10px] text-slate-500 truncate">{currentUser.email}</p>
                </div>
                
                <button
                  onClick={() => {
                    if (onRoleSwitch) {
                      const current = currentUser.role;
                      let next = 'MANAGER';
                      if (current === 'DIRECTOR') next = 'MANAGER';
                      else if (current === 'MANAGER') next = 'FINANCE';
                      else if (current === 'FINANCE') next = 'AUDITOR';
                      else if (current === 'AUDITOR') next = 'FINANCIADOR';
                      else next = 'DIRECTOR';
                      onRoleSwitch(next);
                    }
                    setShowProfileMenu(false);
                  }}
                  className="w-full text-left px-2 py-2 text-xs text-blue-600 font-medium hover:bg-blue-50 rounded"
                >
                  Cambiar Rol ({currentUser.role})
                </button>
                
                <button
                  onClick={() => {
                    if (onLogout) onLogout();
                    setShowProfileMenu(false);
                  }}
                  className="w-full text-left px-2 py-2 text-xs text-red-600 font-medium hover:bg-red-50 rounded mt-1"
                >
                  Cerrar Sesión
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </header>
  );
}
