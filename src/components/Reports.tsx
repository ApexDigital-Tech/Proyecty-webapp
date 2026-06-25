import React, { useState, useEffect } from 'react';
import { FileText, Download, Printer, Filter, Building2, TrendingUp, ShieldCheck } from 'lucide-react';
import { Project } from '../types.ts';
import { TableSkeleton } from './common/Skeletons.tsx';

interface ReportsProps {
  token: string | null;
}

export default function Reports({ token }: ReportsProps) {
  const [reportType, setReportType] = useState('financiero');
  const [selectedProjectId, setSelectedProjectId] = useState<string>('ALL');
  const [reportData, setReportData] = useState<any[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (token) {
      fetchProjects();
    }
  }, [token]);

  useEffect(() => {
    if (token) {
      fetchReportData();
    }
  }, [reportType, selectedProjectId, token]);

  const fetchProjects = async () => {
    try {
      const res = await fetch('/api/projects', {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setProjects(data.projects || []);
      }
    } catch (err) {
      console.error('Error fetching projects:', err);
    }
  };

  const fetchReportData = async () => {
    setIsLoading(true);
    try {
      const url = new URL('/api/reports/data', window.location.origin);
      url.searchParams.append('type', reportType);
      if (selectedProjectId !== 'ALL') {
        url.searchParams.append('projectId', selectedProjectId);
      }
      
      const res = await fetch(url.toString(), {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setReportData(data);
      }
    } catch (err) {
      console.error('Error fetching report data:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const exportCSV = () => {
    if (!reportData || reportData.length === 0) return;
    
    // Extract headers
    const headers = Object.keys(reportData[0]);
    const csvRows = [];
    csvRows.push(headers.join(','));
    
    for (const row of reportData) {
      const values = headers.map(header => {
        const val = row[header];
        const escaped = ('' + (val || '')).replace(/"/g, '""');
        return `"${escaped}"`;
      });
      csvRows.push(values.join(','));
    }
    
    const csvString = csvRows.join('\n');
    const blob = new Blob([csvString], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `reporte_${reportType}_${new Date().toISOString().split('T')[0]}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  const handlePrint = () => {
    window.print();
  };

  const getReportIcon = () => {
    switch(reportType) {
      case 'financiero': return <TrendingUp className="w-5 h-5 text-indigo-500" />;
      case 'ejecutivo': return <Building2 className="w-5 h-5 text-blue-500" />;
      case 'cumplimiento': return <ShieldCheck className="w-5 h-5 text-emerald-500" />;
      default: return <FileText className="w-5 h-5 text-slate-500" />;
    }
  };

  return (
    <div id="reports-tab" className="p-6 space-y-5 max-w-7xl mx-auto select-none print:p-0 print:m-0 print:max-w-none">
      
      {/* Header - Hidden on print */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 print:hidden">
        <div>
          <h2 className="text-base font-sans font-bold text-slate-900">
            Centro de Reportes y Analítica
          </h2>
          <p className="text-[11px] text-slate-400 font-sans">
            Módulo de exportación financiera y de cumplimiento en formato tabular estructurado.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={exportCSV}
            disabled={isLoading || reportData.length === 0}
            className="bg-white border border-slate-200 hover:bg-slate-50 text-slate-600 text-xs font-semibold px-3 py-1.5 rounded-md flex items-center space-x-1.5 shadow-sm cursor-pointer transition-colors disabled:opacity-50"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Exportar CSV</span>
          </button>
          
          <button
            onClick={handlePrint}
            disabled={isLoading || reportData.length === 0}
            className="bg-[#00313b] hover:bg-[#00252c] text-white text-xs font-semibold px-3 py-1.5 rounded-md flex items-center space-x-1.5 shadow-sm cursor-pointer transition-colors disabled:opacity-50"
          >
            <Printer className="w-3.5 h-3.5" />
            <span>Imprimir / PDF</span>
          </button>
        </div>
      </div>

      {/* Filters - Hidden on print */}
      <div className="bg-white p-3 rounded-lg border border-slate-200 shadow-sm flex flex-col md:flex-row items-center gap-3 print:hidden">
        <div className="flex items-center space-x-2 w-full md:w-auto flex-1">
          <Filter className="w-4 h-4 text-slate-400 ml-1" />
          
          <select
            value={reportType}
            onChange={(e) => setReportType(e.target.value)}
            className="bg-slate-50 border border-slate-200 text-slate-600 text-xs rounded-md px-2 py-1.5 outline-none cursor-pointer flex-1"
          >
            <option value="financiero">Reporte Financiero (Partidas y Ejecución)</option>
            <option value="ejecutivo">Reporte Ejecutivo (Métricas de Proyectos)</option>
            <option value="cumplimiento">Reporte de Cumplimiento (Convenios)</option>
          </select>
          
          <select
            value={selectedProjectId}
            onChange={(e) => setSelectedProjectId(e.target.value)}
            className="bg-slate-50 border border-slate-200 text-slate-600 text-xs rounded-md px-2 py-1.5 outline-none cursor-pointer flex-1"
          >
            <option value="ALL">Todos los Proyectos</option>
            {projects.map(p => (
              <option key={p.id} value={p.id}>{p.code} - {p.name}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Print Header - Visible only on print */}
      <div className="hidden print:block mb-8 text-center border-b pb-4">
        <h1 className="text-2xl font-bold text-slate-900 mb-1 uppercase">
          REPORTE {reportType === 'financiero' ? 'FINANCIERO' : reportType === 'ejecutivo' ? 'EJECUTIVO DE PROYECTOS' : 'DE CUMPLIMIENTO'}
        </h1>
        <p className="text-sm text-slate-500">Generado el {new Date().toLocaleDateString('es-ES')}</p>
        {selectedProjectId !== 'ALL' && (
          <p className="text-sm font-semibold mt-2">Proyecto Filtro: {projects.find(p => p.id.toString() === selectedProjectId)?.name}</p>
        )}
      </div>

      {/* Report Data Table */}
      <div className="bg-white rounded-lg border border-slate-200 overflow-hidden shadow-sm print:shadow-none print:border-none print:overflow-visible">
        <div className="p-4 border-b border-slate-100 bg-slate-50/50 flex items-center space-x-2 print:hidden">
          {getReportIcon()}
          <h3 className="text-xs font-bold text-slate-700 uppercase">Vista Previa de Datos</h3>
        </div>
        
        <div className="overflow-x-auto print:overflow-visible">
          {isLoading ? (
            <div className="p-4">
              <TableSkeleton rows={10} columns={5} />
            </div>
          ) : reportData.length === 0 ? (
            <div className="text-center py-16 text-slate-400 text-xs">
              No hay datos para mostrar con los filtros seleccionados.
            </div>
          ) : (
            <table className="w-full text-left text-xs font-sans print:text-[10px]">
              <thead className="bg-slate-50 text-slate-500 font-bold uppercase text-[9px] print:bg-slate-100">
                <tr>
                  {reportData.length > 0 && Object.keys(reportData[0]).map(key => (
                    <th key={key} className="px-4 py-3 border-b border-slate-200">{key}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {reportData.map((row, i) => (
                  <tr key={i} className="hover:bg-slate-50/50 transition-colors">
                    {Object.values(row).map((val: any, j) => (
                      <td key={j} className="px-4 py-2 text-slate-700 whitespace-nowrap">
                        {typeof val === 'number' ? (
                          keyIncludesCurrency(Object.keys(reportData[0])[j]) 
                            ? `$${val.toLocaleString('es-ES', { minimumFractionDigits: 2 })}`
                            : val.toLocaleString('es-ES')
                        ) : (
                          String(val || '-')
                        )}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
      
    </div>
  );
}

function keyIncludesCurrency(key: string) {
  const k = key.toLowerCase();
  return k.includes('amount') || k.includes('budget') || k.includes('balance') || k.includes('executed') || k.includes('approved') || k.includes('reformulated');
}
