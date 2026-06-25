import React from 'react';
import { Sparkles } from 'lucide-react';

interface TabReporteAIProps {
  reportType: string;
  setReportType: (val: string) => void;
  focusArea: string;
  setFocusArea: (val: string) => void;
  handleGenerateAIReport: () => void;
  aiLoading: boolean;
  aiReportOutput: string;
}

export default function TabReporteAI({
  reportType, setReportType,
  focusArea, setFocusArea,
  handleGenerateAIReport,
  aiLoading,
  aiReportOutput,
}: TabReporteAIProps) {
  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h4 className="text-xs font-bold text-[#00313b] uppercase tracking-wider flex items-center space-x-1">
            <Sparkles className="w-4 h-4 text-[#008fa0] animate-pulse" />
            <span>Asistente Inteligente de Reportes AI (Gemini)</span>
          </h4>
          <p className="text-[11px] text-slate-400 font-sans">Genere de manera instantánea diagnósticos auditables del estado de su subvención</p>
        </div>
      </div>

      {/* AI Settings Parameters Panel */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 bg-slate-50 p-6 rounded-xl border border-slate-100 text-xs font-sans">
        <div className="space-y-1.5">
          <label className="block font-bold text-[#00313b]">Plantilla de Reporte (*)</label>
          <select
            value={reportType}
            onChange={(e) => setReportType(e.target.value)}
            className="w-full p-2.5 bg-white border border-slate-200 rounded-lg outline-none cursor-pointer font-medium text-slate-700"
          >
            <option value="Reporte Narrativo de Donante">Reporte Narrativo de Donante (Progreso y Actividades)</option>
            <option value="Reporte Financiero Presupuesto vs Ejecutado">Reporte Financiero (Presupuesto vs Ejecutado)</option>
            <option value="Reporte Anual Institucional">Reporte Anual Institucional (Impacto y Transparencia)</option>
          </select>
        </div>

        <div className="space-y-1.5">
          <label className="block font-bold text-[#00313b]">Nivel de Análisis (*)</label>
          <select
            value={focusArea}
            onChange={(e) => setFocusArea(e.target.value)}
            className="w-full p-2.5 bg-white border border-slate-200 rounded-lg outline-none cursor-pointer font-medium text-slate-700"
          >
            <option value="General">Balance Integral (Físico vs Financiero)</option>
            <option value="Desviaciones">Explicación de Variaciones y Alertas RAG</option>
            <option value="Auditoría">Trazabilidad y Evidencias Digitales</option>
          </select>
        </div>

        <div className="flex items-end">
          <button
            onClick={handleGenerateAIReport}
            disabled={aiLoading}
            className="w-full py-3 bg-[#00313b] hover:bg-[#001d24] text-white font-semibold rounded-xl flex items-center justify-center space-x-2 shadow cursor-pointer transition-colors"
          >
            <Sparkles className="w-4 h-4 text-[#008fa0]" />
            <span>{aiLoading ? 'Generando Reporte...' : 'Generar Reporte Gemini'}</span>
          </button>
        </div>
      </div>

      {/* AI Output Window */}
      {aiReportOutput && (
        <div className="p-6 bg-slate-50 border border-slate-200 rounded-xl space-y-4">
          <div className="flex items-center justify-between border-b border-slate-200 pb-3">
            <span className="text-[9px] font-mono uppercase bg-[#00313b] text-white px-2 py-0.5 rounded">
              Informe Generado con Éxito
            </span>
            <span className="text-[10px] font-mono text-slate-400">Modelo: gemini-3.5-flash</span>
          </div>
          <div className="prose max-w-none text-xs text-[#00313b] font-sans whitespace-pre-wrap leading-relaxed space-y-4">
            {aiReportOutput}
          </div>
        </div>
      )}
    </div>
  );
}
