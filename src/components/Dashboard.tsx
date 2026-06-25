import React, { useState, useEffect } from 'react';
import { Project, BudgetItem, Voucher } from '../types.ts';
import {
  TrendingUp,
  AlertOctagon,
  Award,
  Wallet2,
  ChevronRight,
  ArrowRight,
  Clock,
  CheckCircle2,
} from 'lucide-react';
import { DashboardGridSkeleton } from './common/Skeletons.tsx';

interface DashboardProps {
  token: string;
  onSelectProject: (id: number) => void;
}

export default function Dashboard({ token, onSelectProject }: DashboardProps) {
  const [metrics, setMetrics] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filters state (to be sent to backend)
  const [filterDonorId, setFilterDonorId] = useState<string>('');
  const [filterPeriod, setFilterPeriod] = useState<string>('');
  const [filterStatus, setFilterStatus] = useState<string>('');

  useEffect(() => {
    fetchMetrics();
  }, [token, filterDonorId, filterPeriod, filterStatus]);

  const fetchMetrics = async () => {
    try {
      setIsLoading(true);
      setError(null);
      
      const queryParams = new URLSearchParams();
      if (filterDonorId) queryParams.append('donorId', filterDonorId);
      if (filterStatus) queryParams.append('status', filterStatus);
      if (filterPeriod) queryParams.append('period', filterPeriod);

      const response = await fetch(`/api/dashboard/metrics?${queryParams.toString()}`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      
      if (!response.ok) {
        throw new Error('No se pudieron cargar las métricas');
      }
      
      const data = await response.json();
      setMetrics(data);
    } catch (err: any) {
      setError(err.message || 'Error de conexión');
    } finally {
      setIsLoading(false);
    }
  };

  if (isLoading) {
    return (
      <div className="p-6 max-w-7xl mx-auto space-y-6">
        {/* Placeholder for banner */}
        <div className="h-20 bg-slate-100 rounded-lg animate-pulse mb-6"></div>
        <DashboardGridSkeleton />
        <DashboardGridSkeleton />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex justify-center items-center h-64 text-rose-500 font-sans text-sm">
        <AlertOctagon className="w-5 h-5 mr-2" />
        {error}
      </div>
    );
  }

  if (!metrics) {
    return null;
  }

  const {
    totalBudget,
    avgPhysical,
    avgFinancial,
    avgScore,
    highRiskProjectsCount,
    highRiskProjectsDetails,
    statusDistribution,
    pendingDisbursementsCount,
    pendingDisbursementsAmount,
    projectsList
  } = metrics;

  return (
    <div id="dashboard-tab" className="p-6 space-y-6 max-w-7xl mx-auto select-none">
      
      {/* Upper Welcome banner with Filters */}
      <div id="welcome-banner" className="bg-[#0F172A] text-white p-5 rounded-lg flex flex-col md:flex-row md:items-center justify-between shadow-md space-y-4 md:space-y-0 border border-slate-800">
        <div className="space-y-1">
          <h2 className="text-lg font-sans font-extrabold tracking-tight">Resumen de Operaciones LATAM</h2>
          <p className="text-[11px] font-sans text-slate-400">
            Monitoreo integrado de presupuestos, cumplimiento contractual y compliance de subvenciones.
          </p>
        </div>
        
        <div className="flex items-center space-x-3">
          {/* Subtle Filters */}
          <select 
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value)}
            className="bg-slate-800 border border-slate-700 text-xs text-white rounded px-2 py-1 outline-none"
          >
            <option value="">Todos los Estados</option>
            <option value="EJECUCIÓN">En Ejecución</option>
            <option value="ACTIVO">Activos</option>
            <option value="PLANIFICACIÓN">Planificación</option>
          </select>
          
          <div className="flex items-center space-x-1.5 bg-[#2563EB] px-3 py-1 rounded-md border border-blue-500/30 shadow-inner">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
            <span className="text-[9px] font-mono font-bold uppercase tracking-wider">Monitoreo Activo</span>
          </div>
        </div>
      </div>

      {/* KPI Counters Board */}
      <div id="kpi-counters-grid" className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        
        {/* KPI 1: Active Budget */}
        <div className="bg-white p-4 rounded-lg shadow-sm border border-slate-200 flex items-center justify-between">
          <div className="space-y-0.5">
            <span className="text-[10px] font-mono font-semibold text-slate-400 uppercase tracking-wider">Presupuesto Portafolio</span>
            <div className="text-lg font-mono font-bold text-slate-900">
              ${totalBudget.toLocaleString('es-ES', { minimumFractionDigits: 2 })}
            </div>
            <p className="text-[9px] text-emerald-600 font-sans flex items-center">
              <TrendingUp className="w-3 h-3 mr-0.5" />
              <span>100% Fondos Asegurados</span>
            </p>
          </div>
          <div className="w-10 h-10 bg-slate-50 text-slate-600 rounded-lg flex items-center justify-center border border-slate-100">
            <Wallet2 className="w-5 h-5 text-[#2563EB]" />
          </div>
        </div>

        {/* KPI 2: Avg Physical Progress */}
        <div className="bg-white p-4 rounded-lg shadow-sm border border-slate-200 flex items-center justify-between">
          <div className="space-y-0.5">
            <span className="text-[10px] font-mono font-semibold text-slate-400 uppercase tracking-wider">Progreso Físico Promedio</span>
            <div className="text-lg font-mono font-bold text-slate-900">
              {avgPhysical}%
            </div>
            {/* Visual tiny bar */}
            <div className="w-24 h-1 bg-slate-100 rounded-full overflow-hidden mt-1">
              <div className="h-full bg-[#2563EB]" style={{ width: `${avgPhysical}%` }}></div>
            </div>
          </div>
          <div className="w-10 h-10 bg-slate-50 text-slate-600 rounded-lg flex items-center justify-center border border-slate-100">
            <TrendingUp className="w-5 h-5 text-blue-600" />
          </div>
        </div>

        {/* KPI 3: Avg Financial Progress */}
        <div className="bg-white p-4 rounded-lg shadow-sm border border-slate-200 flex items-center justify-between">
          <div className="space-y-0.5">
            <span className="text-[10px] font-mono font-semibold text-slate-400 uppercase tracking-wider">Ejecución Financiera</span>
            <div className="text-lg font-mono font-bold text-slate-900">
              {avgFinancial}%
            </div>
            {/* Visual tiny bar */}
            <div className="w-24 h-1 bg-slate-100 rounded-full overflow-hidden mt-1">
              <div className="h-full bg-indigo-600" style={{ width: `${avgFinancial}%` }}></div>
            </div>
          </div>
          <div className="w-10 h-10 bg-slate-50 text-slate-600 rounded-lg flex items-center justify-center border border-slate-100">
            <Clock className="w-5 h-5 text-indigo-600" />
          </div>
        </div>

        {/* KPI 4: Institutional Score */}
        <div className="bg-white p-4 rounded-lg shadow-sm border border-slate-200 flex items-center justify-between">
          <div className="space-y-0.5">
            <span className="text-[10px] font-mono font-semibold text-slate-400 uppercase tracking-wider">Score Institucional</span>
            <div className="text-lg font-mono font-bold text-slate-900">
              {avgScore}/100
            </div>
            <p className="text-[9px] text-emerald-600 font-sans flex items-center">
              <CheckCircle2 className="w-3 h-3 mr-0.5" />
              <span>Alta Confiabilidad</span>
            </p>
          </div>
          <div className="w-10 h-10 bg-slate-50 text-slate-600 rounded-lg flex items-center justify-center border border-slate-100">
            <Award className="w-5 h-5 text-emerald-600" />
          </div>
        </div>
      </div>

      {/* Main dashboard content blocks */}
      <div id="dashboard-bento" className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Left Column: Projects Overview */}
        <div className="lg:col-span-2 bg-white rounded-lg border border-slate-200 overflow-hidden flex flex-col justify-between shadow-sm">
          <div className="p-4 border-b border-slate-100 bg-[#F8FAFC] flex items-center justify-between">
            <div>
              <h3 className="font-sans font-bold text-slate-900 text-sm">Estado de Ejecución del Portafolio</h3>
              <p className="text-[11px] font-sans text-slate-400">Progreso físico vs presupuestos ejecutados en tiempo real</p>
            </div>
          </div>
          <div className="divide-y divide-slate-100">
            {projectsList.map((p) => (
              <div key={p.id} className="p-4 py-3 flex items-center justify-between hover:bg-slate-50/50 transition-colors">
                <div className="space-y-1 flex-1 pr-4">
                  <div className="flex items-center space-x-2">
                    <span className="text-[9px] font-mono font-bold bg-blue-50 text-blue-700 border border-blue-100 px-1.5 py-0.2 rounded">
                      {p.code}
                    </span>
                    <h4 className="text-xs font-bold text-slate-900 truncate max-w-[240px] md:max-w-md">
                      {p.name}
                    </h4>
                  </div>
                  
                  {/* Progress bars comparison */}
                  <div className="grid grid-cols-2 gap-4 max-w-xs pt-0.5">
                    <div>
                      <div className="flex justify-between text-[8px] font-mono text-slate-400 leading-none mb-0.5">
                        <span>Físico</span>
                        <span className="font-semibold text-slate-700">{p.physicalProgress}%</span>
                      </div>
                      <div className="w-full h-1 bg-slate-100 rounded-full overflow-hidden">
                        <div className="h-full bg-[#2563EB]" style={{ width: `${p.physicalProgress}%` }}></div>
                      </div>
                    </div>
                    <div>
                      <div className="flex justify-between text-[8px] font-mono text-slate-400 leading-none mb-0.5">
                        <span>Financiero</span>
                        <span className="font-semibold text-slate-700">{p.financialProgress}%</span>
                      </div>
                      <div className="w-full h-1 bg-slate-100 rounded-full overflow-hidden">
                        <div className="h-full bg-indigo-600" style={{ width: `${p.financialProgress}%` }}></div>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="flex items-center space-x-3">
                  <div className="text-right">
                    <div className="text-xs font-mono font-bold text-slate-800">
                      ${p.approvedBudget.toLocaleString('es-ES')}
                    </div>
                    <span className={`text-[8px] font-sans font-bold px-1.5 py-0.2 rounded-full border ${
                      p.status === 'EJECUCIÓN' ? 'bg-emerald-50 text-emerald-700 border-emerald-100' :
                      p.status === 'ACTIVO' ? 'bg-emerald-50 text-emerald-700 border-emerald-100' :
                      p.status === 'PLANIFICACIÓN' ? 'bg-blue-50 text-blue-700 border-blue-100' :
                      'bg-slate-100 text-slate-600 border-slate-200'
                    }`}>
                      {p.status}
                    </span>
                  </div>
                  <button
                    onClick={() => onSelectProject(p.id)}
                    className="p-1 hover:bg-slate-100 hover:text-[#2563EB] rounded transition-colors text-slate-400 cursor-pointer"
                  >
                    <ChevronRight className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
          <div className="p-3 bg-[#F8FAFC] border-t border-slate-200 text-center">
            <span className="text-[10px] font-mono text-slate-400">Verificando bases de datos relacionales en la región europe-west1</span>
          </div>
        </div>

        {/* Right Column: AI & Compliance Alerts */}
        <div className="space-y-4">
          
          {/* Alerts Card */}
          <div className="bg-white rounded-lg border border-slate-200 p-4 space-y-3 shadow-sm">
            <div className="flex items-center space-x-1.5 text-rose-600">
              <AlertOctagon className="w-4 h-4" />
              <h3 className="font-sans font-bold text-sm text-slate-900">Alertas Críticas y Desviaciones</h3>
            </div>
            
            <div className="space-y-2.5 text-xs">
              {highRiskProjectsDetails.length === 0 ? (
                <div className="text-center py-6 text-slate-400 text-xs">
                  No se detectan desviaciones ni brechas de progreso físico vs financiero.
                </div>
              ) : (
                highRiskProjectsDetails.map((p: any) => (
                  <div key={p.id} className="p-3 bg-rose-50/40 rounded-lg border border-rose-100 space-y-1.5">
                    <div className="flex justify-between items-center">
                      <span className="font-mono font-bold text-[9px] text-rose-700">{p.code}</span>
                      <span className="font-mono font-bold text-[8px] bg-rose-100 text-rose-800 px-1.5 py-0.2 rounded">Riesgo Alto</span>
                    </div>
                    <p className="font-sans text-xs text-slate-800 font-medium truncate">{p.name}</p>
                    <div className="flex items-center justify-between text-[9px] font-mono text-slate-500">
                      <span>Brecha de progreso:</span>
                      <span className="font-bold text-rose-600">{(p.physicalProgress - p.financialProgress)}%</span>
                    </div>
                    <button
                      onClick={() => onSelectProject(p.id)}
                      className="w-full text-center text-[9px] font-sans font-semibold text-[#2563EB] hover:text-[#1d4ed8] flex items-center justify-center space-x-1 cursor-pointer pt-0.5"
                    >
                      <span>Auditar Partidas</span>
                      <ArrowRight className="w-3 h-3" />
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Pending Disbursements Mini Card */}
          <div className="bg-amber-50 rounded-lg border border-amber-200 p-4 space-y-3 shadow-sm">
            <div className="flex items-center space-x-1.5 text-amber-700">
              <Clock className="w-4 h-4" />
              <h3 className="font-sans font-bold text-sm">Desembolsos Pendientes</h3>
            </div>
            <div className="space-y-1">
              <div className="text-xl font-mono font-black text-amber-900">
                ${pendingDisbursementsAmount.toLocaleString('es-ES', { minimumFractionDigits: 2 })}
              </div>
              <p className="text-[10px] text-amber-700 font-sans">
                {pendingDisbursementsCount} desembolsos esperando aprobación o cumplimiento de condiciones previas.
              </p>
            </div>
          </div>

          {/* AI Advisor Prompt */}
          <div className="bg-[#0F172A] text-slate-300 p-4 rounded-lg shadow-md space-y-3 border border-slate-800">
            <div className="space-y-1">
              <span className="text-[8px] font-mono uppercase text-[#2563EB] tracking-wider font-bold">Inteligencia AI</span>
              <h4 className="text-xs font-sans font-bold text-white">Generador de Diagnósticos</h4>
              <p className="text-[11px] font-sans text-slate-400 leading-normal">
                Gemini analiza la consistencia de tus presupuestos frente a informes físicos para predecir desviaciones de compliance antes del próximo desembolso.
              </p>
            </div>
            <div className="bg-slate-950/60 border border-slate-800 p-2.5 rounded-md flex items-center justify-between">
              <span className="text-[9px] font-mono text-slate-400">Modelo: gemini-3.5-flash</span>
              <span className="text-[8px] font-sans font-bold bg-[#2563EB] text-white px-2 py-0.5 rounded leading-none">Listo</span>
            </div>
          </div>

        </div>

      </div>

    </div>
  );
}
