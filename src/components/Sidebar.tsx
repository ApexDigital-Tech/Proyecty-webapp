import React from 'react';
import {
  LayoutDashboard,
  FolderGit2,
  ScrollText,
  FileSpreadsheet,
  FileCheck,
  History,
  LogOut,
  UserCheck,
  Building,
  Users,
  CalendarDays,
} from 'lucide-react';
import { UserRole } from '../types.ts';
import { hasPermission } from '../lib/rbac.ts';

interface SidebarProps {
  currentTab: string;
  setTab: (tab: string) => void;
  currentUser: { name: string; email: string; role: UserRole };
  onLogout: () => void;
  onRoleSwitch: (role: UserRole) => void;
}

export default function Sidebar({
  currentTab,
  setTab,
  currentUser,
  onLogout,
  onRoleSwitch,
}: SidebarProps) {
  const menuItems = [];
  
  if (hasPermission(currentUser.role, 'canViewDashboard')) {
    menuItems.push({ id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard });
  }
  if (hasPermission(currentUser.role, 'canViewPortfolio')) {
    menuItems.push({ id: 'portfolio', label: 'Portafolio de Proyectos', icon: FolderGit2 });
    menuItems.push({ id: 'global-agenda', label: 'Agenda Global', icon: CalendarDays });
  }
  if (hasPermission(currentUser.role, 'canViewReports')) {
    menuItems.push({ id: 'reports', label: 'Reportes y Analítica', icon: FileSpreadsheet });
  }
  if (hasPermission(currentUser.role, 'canViewAudit')) {
    menuItems.push({ id: 'audit', label: 'Bitácora y Auditoría', icon: History });
  }
  if (hasPermission(currentUser.role, 'canViewUsers')) {
    menuItems.push({ id: 'users', label: 'Usuarios y Monitoreo', icon: Users });
  }

  const handleRoleToggle = () => {
    // Cycles DIRECTOR -> MANAGER -> FINANCE -> AUDITOR -> FINANCIADOR -> DIRECTOR
    if (currentUser.role === 'DIRECTOR') onRoleSwitch('MANAGER');
    else if (currentUser.role === 'MANAGER') onRoleSwitch('FINANCE');
    else if (currentUser.role === 'FINANCE') onRoleSwitch('AUDITOR');
    else if (currentUser.role === 'AUDITOR') onRoleSwitch('FINANCIADOR');
    else onRoleSwitch('DIRECTOR');
  };

  return (
    <div
      id="app-sidebar"
      className="hidden md:flex w-64 bg-[#0F172A] text-slate-300 flex-col justify-between h-screen sticky top-0 flex-shrink-0 select-none shadow-xl border-r border-slate-800"
    >
      <div>
        {/* Logo Brand Section */}
        <div className="p-5 border-b border-slate-800 flex items-center space-x-3">
          <div className="w-8 h-8 bg-[#2563EB] rounded-lg flex items-center justify-center shadow-md">
            <Building className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="font-sans font-extrabold text-sm tracking-tight text-white leading-none">
              PROYECTY
            </h1>
            <p className="text-[9px] font-mono tracking-wider text-slate-400 uppercase opacity-90 mt-0.5">
              Cooperación ONGs
            </p>
          </div>
        </div>

        {/* Navigation Items */}
        <nav id="sidebar-nav" className="p-3 space-y-1 flex-1">
          <div className="text-[9px] font-mono tracking-wider text-slate-400 uppercase font-semibold px-2 py-1.5">
            Módulos Principales
          </div>
          {menuItems.map((item) => {
            const IconComponent = item.icon;
            const isActive = currentTab === item.id;
            return (
              <button
                key={item.id}
                id={`sidebar-tab-${item.id}`}
                onClick={() => setTab(item.id)}
                className={`w-full flex items-center space-x-2.5 px-3 py-2 rounded-md font-sans text-xs font-medium transition-all duration-150 text-left cursor-pointer ${
                  isActive
                    ? 'bg-[#1E293B] text-white shadow font-semibold'
                    : 'text-slate-400 hover:bg-white/5 hover:text-slate-200'
                }`}
              >
                <IconComponent className="w-3.5 h-3.5 flex-shrink-0" />
                <span>{item.label}</span>
              </button>
            );
          })}
        </nav>
      </div>

      {/* User Information & Role Changer Panel */}
      <div className="p-3 border-t border-slate-800 space-y-3 bg-[#090d16]">
        {/* Quick Role Switcher */}
        <div className="bg-[#1E293B]/40 p-2.5 rounded-lg border border-slate-800/80 space-y-1.5">
          <div className="flex items-center justify-between">
            <span className="text-[8px] font-mono uppercase tracking-wider text-slate-400">
              Rol Activo (RBAC)
            </span>
            <button
              onClick={handleRoleToggle}
              className="text-[8px] font-mono font-semibold text-blue-400 hover:text-white flex items-center space-x-1 border border-blue-500/20 hover:border-blue-500 rounded px-1.5 py-0.5 cursor-pointer bg-transparent"
              title="Cambiar rol rápido para simular RBAC"
            >
              <UserCheck className="w-2 h-2 inline mr-0.5" />
              <span>Simular</span>
            </button>
          </div>
          <div className="flex items-center space-x-2">
            <span
              className={`text-[9px] font-mono font-bold px-1.5 py-0.2 rounded ${
                currentUser.role === 'DIRECTOR'
                  ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                  : currentUser.role === 'MANAGER'
                  ? 'bg-blue-500/20 text-blue-300 border border-blue-500/30'
                  : currentUser.role === 'FINANCE'
                  ? 'bg-rose-500/20 text-rose-300 border border-rose-500/30'
                  : currentUser.role === 'AUDITOR'
                  ? 'bg-indigo-500/20 text-indigo-300 border border-indigo-500/30'
                  : 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
              }`}
            >
              {currentUser.role}
            </span>
            <span className="text-[10px] text-slate-300 font-sans truncate max-w-[110px]">
              {currentUser.name}
            </span>
          </div>
        </div>

        {/* User profile item */}
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2 overflow-hidden">
            <img
              src={`https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(
                currentUser.name
              )}`}
              alt="Avatar"
              className="w-7 h-7 rounded-full border border-blue-500 bg-white flex-shrink-0"
            />
            <div className="overflow-hidden">
              <h4 className="text-xs font-semibold text-white truncate leading-none">
                {currentUser.name}
              </h4>
              <p className="text-[9px] text-slate-400 truncate mt-0.5">
                {currentUser.email}
              </p>
            </div>
          </div>
          <button
            id="sidebar-logout"
            onClick={onLogout}
            className="text-slate-400 hover:text-white p-1 hover:bg-slate-800 rounded-md transition-colors cursor-pointer"
            title="Cerrar sesión"
          >
            <LogOut className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
}
