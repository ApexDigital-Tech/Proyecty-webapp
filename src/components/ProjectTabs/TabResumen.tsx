import React from 'react';
import { CheckCircle, Lock } from 'lucide-react';

interface TabResumenProps {
  project: any;
  isEditable: boolean;
  physicalVal: number;
  setPhysicalVal: (val: number) => void;
  statusVal: string;
  setStatusVal: (val: string) => void;
  handleUpdatePhysical: () => void;
}

export default function TabResumen({
  project,
  isEditable,
  physicalVal,
  setPhysicalVal,
  statusVal,
  setStatusVal,
  handleUpdatePhysical,
}: TabResumenProps) {
  return (
    <div className="space-y-8">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        
        {/* Progress Gauges */}
        <div className="bg-slate-50 p-6 rounded-xl border border-slate-100 space-y-4">
          <h4 className="text-xs font-bold text-[#00313b]">Avance Físico del Proyecto</h4>
          <div className="flex items-end space-x-2">
            <span className="text-4xl font-mono font-black text-[#00313b]">{project.physicalProgress}%</span>
            <span className="text-[10px] text-slate-400 font-sans pb-1.5">Meta Anual</span>
          </div>
          <div className="w-full h-2.5 bg-slate-200 rounded-full overflow-hidden">
            <div className="h-full bg-[#008fa0]" style={{ width: `${project.physicalProgress}%` }}></div>
          </div>

          {isEditable ? (
            <div className="space-y-3 pt-4 border-t border-slate-200/60">
              <label className="text-[10px] font-mono text-slate-400 uppercase">Actualizar Progreso Físico</label>
              <div className="flex items-center space-x-3">
                <input
                  type="range"
                  min="0"
                  max="100"
                  value={physicalVal}
                  onChange={(e) => setPhysicalVal(parseInt(e.target.value))}
                  className="w-full accent-[#008fa0]"
                />
                <span className="font-mono text-xs font-bold text-[#00313b]">{physicalVal}%</span>
              </div>
              <div className="flex space-x-2">
                <select
                  value={statusVal}
                  onChange={(e) => setStatusVal(e.target.value)}
                  className="bg-white border border-slate-200 rounded-lg py-1 px-2 text-xs font-sans cursor-pointer flex-1 outline-none"
                >
                  <option value="PLANIFICACIÓN">Planificación</option>
                  <option value="EJECUCIÓN">En Ejecución</option>
                  <option value="ACTIVO">Activo</option>
                </select>
                <button
                  onClick={handleUpdatePhysical}
                  className="bg-[#008fa0] text-white text-[10px] font-bold px-3 py-1.5 rounded-lg hover:bg-[#007a8a] cursor-pointer"
                >
                  Guardar
                </button>
              </div>
            </div>
          ) : (
            <div className="p-3 bg-amber-50 rounded-lg text-amber-700 text-[10px] flex items-center space-x-1">
              <Lock className="w-3.5 h-3.5" />
              <span>Se requieren privilegios de Director o Manager para actualizar.</span>
            </div>
          )}
        </div>

        {/* Financial Progress Gauge */}
        <div className="bg-slate-50 p-6 rounded-xl border border-slate-100 space-y-4">
          <h4 className="text-xs font-bold text-[#00313b]">Avance Financiero Ejecutado</h4>
          <div className="flex items-end space-x-2">
            <span className="text-4xl font-mono font-black text-blue-600">{project.financialProgress}%</span>
            <span className="text-[10px] text-slate-400 font-sans pb-1.5">Liquidado</span>
          </div>
          <div className="w-full h-2.5 bg-slate-200 rounded-full overflow-hidden">
            <div className="h-full bg-blue-500" style={{ width: `${project.financialProgress}%` }}></div>
          </div>
          <p className="text-[10px] text-slate-400 font-sans leading-relaxed pt-2">
            Calculado automáticamente por el sistema en base a los comprobantes de pago cargados y verificados contra el presupuesto reformulado.
          </p>
        </div>

        {/* score cards */}
        <div className="bg-slate-50 p-6 rounded-xl border border-slate-100 space-y-3 flex flex-col justify-between">
          <div>
            <h4 className="text-xs font-bold text-[#00313b]">Calificación de Cumplimiento (Score)</h4>
            <div className="text-5xl font-mono font-black text-[#00313b] pt-2">{project.score}/100</div>
          </div>
          <div className="p-3 bg-emerald-50 text-emerald-800 text-[10px] rounded-lg border border-emerald-100">
            <div className="font-bold flex items-center">
              <CheckCircle className="w-3.5 h-3.5 text-emerald-600 mr-1" />
              <span>Proyecto Confiable</span>
            </div>
            <p className="text-slate-500 pt-1">Cumplimiento total de auditorías anuales y carga de facturas.</p>
          </div>
        </div>

      </div>

      {/* Description */}
      <div className="space-y-2">
        <h4 className="text-xs font-bold text-[#00313b] uppercase tracking-wider">Alcance del Proyecto</h4>
        <p className="text-xs text-slate-600 leading-relaxed font-sans bg-slate-50 p-4 rounded-xl border border-slate-100">
          {project.description || 'No hay descripción detallada registrada para este proyecto.'}
        </p>
      </div>
    </div>
  );
}
