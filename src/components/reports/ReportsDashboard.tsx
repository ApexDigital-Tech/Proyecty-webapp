import React, { useState, useEffect } from 'react';
import { FileSpreadsheet, Bot, AlertCircle, RefreshCw, TrendingUp, TrendingDown, DollarSign } from 'lucide-react';
import { UserRole } from '../../types.ts';

interface ReportsDashboardProps {
  token: string;
  userRole: UserRole;
}

export default function ReportsDashboard({ token, userRole }: ReportsDashboardProps) {
  const [metrics, setMetrics] = useState({ totalGastado: 0, gastosPendientes: 0, categoriaTop: 'N/A' });
  const [aiReport, setAiReport] = useState<string | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchMetrics = async () => {
    setIsLoading(true);
    try {
      const res = await fetch(`/api/expenses`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (!res.ok) throw new Error('No se pudieron obtener los datos de gastos');
      
      const expenses = await res.json();
      
      let total = 0;
      let pending = 0;
      const categories: Record<string, number> = {};
      
      expenses.forEach((e: any) => {
        if (e.status === 'approved') total += Number(e.amount);
        if (e.status === 'pending') pending += Number(e.amount);
        
        if (e.status === 'approved') {
          categories[e.category] = (categories[e.category] || 0) + Number(e.amount);
        }
      });
      
      let topCategory = 'N/A';
      let maxCategoryAmount = 0;
      for (const [cat, amt] of Object.entries(categories)) {
        if (amt > maxCategoryAmount) {
          maxCategoryAmount = amt as number;
          topCategory = cat;
        }
      }

      setMetrics({
        totalGastado: total,
        gastosPendientes: pending,
        categoriaTop: topCategory,
      });
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchMetrics();
  }, []);

  const generateAiReport = async () => {
    setIsGenerating(true);
    setError(null);
    try {
      const res = await fetch(`/api/reports/ai-generate`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` }
      });
      
      if (!res.ok) {
        if (res.status === 403) {
          const data = await res.json();
          throw new Error(data.message || 'Funcionalidad bloqueada. Mejora tu plan.');
        }
        throw new Error('Error al generar el reporte con IA');
      }
      const data = await res.json();
      setAiReport(data.report);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <div className="p-8 max-w-7xl mx-auto space-y-6">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-[#00313b] flex items-center space-x-2">
            <FileSpreadsheet className="w-6 h-6 text-[#008fa0]" />
            <span>Reportes & Analítica Financiera</span>
          </h2>
          <p className="text-sm text-slate-500 font-sans mt-1">
            Resumen visual y análisis impulsado por inteligencia artificial.
          </p>
        </div>
        <button 
          onClick={generateAiReport}
          disabled={isGenerating}
          className="px-4 py-2 bg-gradient-to-r from-indigo-500 to-purple-600 text-white rounded-lg text-sm font-bold shadow hover:opacity-90 transition flex items-center justify-center space-x-2 disabled:opacity-50"
        >
          {isGenerating ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Bot className="w-4 h-4" />}
          <span>Generar Reporte con IA</span>
        </button>
      </div>

      {error && (
        <div className="p-4 bg-red-50 text-red-700 text-sm rounded-xl flex items-center space-x-2 border border-red-100">
          <AlertCircle className="w-5 h-5 flex-shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-sm flex flex-col">
          <div className="flex items-center justify-between mb-2">
            <span className="text-slate-500 text-sm font-bold">Total Gastado (Aprobado)</span>
            <div className="bg-green-100 p-2 rounded-lg">
              <DollarSign className="w-4 h-4 text-green-600" />
            </div>
          </div>
          {isLoading ? (
            <div className="h-8 bg-slate-100 animate-pulse rounded w-1/2"></div>
          ) : (
            <span className="text-2xl font-bold text-[#00313b] font-mono">
              ${metrics.totalGastado.toLocaleString(undefined, { minimumFractionDigits: 2 })}
            </span>
          )}
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-sm flex flex-col">
          <div className="flex items-center justify-between mb-2">
            <span className="text-slate-500 text-sm font-bold">Gastos Pendientes</span>
            <div className="bg-yellow-100 p-2 rounded-lg">
              <TrendingUp className="w-4 h-4 text-yellow-600" />
            </div>
          </div>
          {isLoading ? (
            <div className="h-8 bg-slate-100 animate-pulse rounded w-1/2"></div>
          ) : (
            <span className="text-2xl font-bold text-[#00313b] font-mono">
              ${metrics.gastosPendientes.toLocaleString(undefined, { minimumFractionDigits: 2 })}
            </span>
          )}
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-sm flex flex-col">
          <div className="flex items-center justify-between mb-2">
            <span className="text-slate-500 text-sm font-bold">Categoría de Mayor Gasto</span>
            <div className="bg-blue-100 p-2 rounded-lg">
              <TrendingDown className="w-4 h-4 text-blue-600" />
            </div>
          </div>
          {isLoading ? (
            <div className="h-8 bg-slate-100 animate-pulse rounded w-full"></div>
          ) : (
            <span className="text-xl font-bold text-[#00313b] uppercase truncate">
              {metrics.categoriaTop}
            </span>
          )}
        </div>
      </div>

      {/* AI Report Card */}
      {aiReport && (
        <div className="bg-gradient-to-b from-indigo-50 to-white border border-indigo-100 rounded-xl shadow-sm overflow-hidden">
          <div className="bg-indigo-600 text-white p-4 flex items-center space-x-2">
            <Bot className="w-5 h-5" />
            <h3 className="font-bold">Análisis Ejecutivo (Gemini Pro)</h3>
          </div>
          <div className="p-6 prose prose-slate prose-sm sm:prose-base max-w-none prose-headings:text-indigo-900 prose-a:text-indigo-600">
            {/* Simple Markdown Renderer fallback */}
            <div dangerouslySetInnerHTML={{ __html: aiReport.replace(/\n/g, '<br />').replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>').replace(/\*(.*?)\*/g, '<em>$1</em>').replace(/# (.*?)(<br \/>|$)/g, '<h2>$1</h2>') }} />
          </div>
        </div>
      )}
    </div>
  );
}
