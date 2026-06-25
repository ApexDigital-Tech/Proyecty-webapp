import React from 'react';
import { Calendar } from 'lucide-react';

interface TabConvenioProps {
  project: any;
  isEditable: boolean;
  milestoneTitle: string;
  setMilestoneTitle: (val: string) => void;
  disbDate: string;
  setDisbDate: (val: string) => void;
  disbAmount: string;
  setDisbAmount: (val: string) => void;
  disbCond: string;
  setDisbCond: (val: string) => void;
  handleAddDisbursement: (agId: number) => void;
  handleToggleDisbStatus: (disbId: number, status: string) => void;
  clauseTitle: string;
  setClauseTitle: (val: string) => void;
  clauseDesc: string;
  setClauseDesc: (val: string) => void;
  clausePriority: string;
  setClausePriority: (val: string) => void;
  clauseCat: string;
  setClauseCat: (val: string) => void;
  handleAddClause: (agId: number) => void;
  agCounterparty: string;
  setAgCounterparty: (val: string) => void;
  agSignedDate: string;
  setAgSignedDate: (val: string) => void;
  agAmount: string;
  setAgAmount: (val: string) => void;
  agDuration: string;
  setAgDuration: (val: string) => void;
  handleAddAgreement: () => void;
}

export default function TabConvenio({
  project,
  isEditable,
  milestoneTitle,
  setMilestoneTitle,
  disbDate,
  setDisbDate,
  disbAmount,
  setDisbAmount,
  disbCond,
  setDisbCond,
  handleAddDisbursement,
  handleToggleDisbStatus,
  clauseTitle,
  setClauseTitle,
  clauseDesc,
  setClauseDesc,
  clausePriority,
  setClausePriority,
  clauseCat,
  setClauseCat,
  handleAddClause,
  agCounterparty,
  setAgCounterparty,
  agSignedDate,
  setAgSignedDate,
  agAmount,
  setAgAmount,
  agDuration,
  setAgDuration,
  handleAddAgreement,
}: TabConvenioProps) {
  return (
    <div className="space-y-8">
      {project.agreements?.length === 0 ? (
        <div className="text-center py-10 text-slate-400">No se encontraron convenios ni contratos registrados para este proyecto.</div>
      ) : (
        project.agreements?.map((ag: any) => (
          <div key={ag.id} className="space-y-8 divide-y divide-slate-100">
            
            {/* Agreement Metadata Card */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-6 bg-slate-50 p-6 rounded-xl border border-slate-100 text-xs">
              <div className="space-y-1">
                <span className="text-slate-400 block uppercase font-mono text-[9px]">Contraparte Legal</span>
                <strong className="text-slate-700 font-display">{ag.counterparty}</strong>
              </div>
              <div className="space-y-1">
                <span className="text-slate-400 block uppercase font-mono text-[9px]">Fecha de Firma</span>
                <strong className="text-slate-700 font-mono">{ag.signedDate}</strong>
              </div>
              <div className="space-y-1">
                <span className="text-slate-400 block uppercase font-mono text-[9px]">Monto del Convenio</span>
                <strong className="text-emerald-700 font-mono font-bold">${ag.amount.toLocaleString()} USD</strong>
              </div>
              <div className="space-y-1">
                <span className="text-slate-400 block uppercase font-mono text-[9px]">Vigencia Contrato</span>
                <strong className="text-slate-700 font-sans">{ag.startDate} - {ag.endDate} ({ag.durationMonths} meses)</strong>
              </div>
            </div>

            {/* Milestones / Disbursements list */}
            <div className="pt-6 grid grid-cols-1 lg:grid-cols-3 gap-8">
              
              {/* Disbursements List */}
              <div className="lg:col-span-2 space-y-4">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-bold text-[#00313b] uppercase tracking-wider">Cronograma de Desembolsos</h4>
                </div>

                <div className="divide-y divide-slate-100 border border-slate-100 rounded-xl overflow-hidden">
                  {ag.disbursements?.length === 0 ? (
                    <div className="text-center py-6 text-slate-400 text-xs">No hay desembolsos agendados.</div>
                  ) : (
                    ag.disbursements.map((d: any) => (
                      <div key={d.id} className="p-4 flex items-center justify-between bg-slate-50/20 hover:bg-slate-50 transition-colors">
                        <div className="space-y-1 pr-4">
                          <h5 className="text-xs font-bold text-[#00313b]">{d.milestoneTitle}</h5>
                          <div className="flex flex-wrap items-center gap-2 text-[10px] text-slate-400 font-mono">
                            <Calendar className="w-3 h-3 text-[#008fa0]" />
                            <span>Estimado: {d.estimatedDate}</span>
                            <span className="text-slate-300">|</span>
                            <span>Condición: {d.condition}</span>
                          </div>
                        </div>

                        <div className="flex items-center space-x-4">
                          <span className="text-xs font-mono font-bold text-[#00313b]">${d.amount.toLocaleString()}</span>
                          <button
                            onClick={() => handleToggleDisbStatus(d.id, d.status)}
                            className={`text-[9px] font-mono font-bold px-2 py-0.5 rounded-full border cursor-pointer ${
                              d.status === 'PAGADO'
                                ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                                : 'bg-amber-50 text-amber-700 border-amber-200 animate-pulse'
                            }`}
                            title="Haga clic para cambiar estado de pago"
                          >
                            {d.status}
                          </button>
                        </div>
                      </div>
                    ))
                  )}
                </div>

                {/* Add Milestone Form */}
                {isEditable && (
                  <div className="p-4 bg-slate-50 rounded-xl border border-slate-100 space-y-3">
                    <span className="text-[10px] font-mono font-bold text-slate-400 uppercase">Añadir Desembolso Programado</span>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                      <input
                        type="text"
                        placeholder="Título del Hito"
                        value={milestoneTitle}
                        onChange={(e) => setMilestoneTitle(e.target.value)}
                        className="p-2 bg-white border border-slate-200 rounded-lg text-xs font-sans outline-none focus:ring-1 focus:ring-[#008fa0]"
                      />
                      <input
                        type="text"
                        placeholder="Fecha Estimada"
                        value={disbDate}
                        onChange={(e) => setDisbDate(e.target.value)}
                        className="p-2 bg-white border border-slate-200 rounded-lg text-xs font-sans outline-none focus:ring-1 focus:ring-[#008fa0]"
                      />
                      <input
                        type="number"
                        placeholder="Monto ($)"
                        value={disbAmount}
                        onChange={(e) => setDisbAmount(e.target.value)}
                        className="p-2 bg-white border border-slate-200 rounded-lg text-xs font-sans outline-none focus:ring-1 focus:ring-[#008fa0]"
                      />
                      <input
                        type="text"
                        placeholder="Condición del Desembolso"
                        value={disbCond}
                        onChange={(e) => setDisbCond(e.target.value)}
                        className="p-2 bg-white border border-slate-200 rounded-lg text-xs font-sans outline-none focus:ring-1 focus:ring-[#008fa0]"
                      />
                    </div>
                    <button
                      onClick={() => handleAddDisbursement(ag.id)}
                      className="w-full py-2 bg-[#008fa0] text-white text-[10px] font-bold rounded-lg hover:bg-[#007a8a] cursor-pointer"
                    >
                      Agendar Desembolso
                    </button>
                  </div>
                )}
              </div>

              {/* Clauses List */}
              <div className="space-y-4">
                <h4 className="text-xs font-bold text-[#00313b] uppercase tracking-wider">Obligaciones Clave</h4>
                <div className="space-y-3">
                  {ag.clauses?.length === 0 ? (
                    <div className="text-[10px] text-slate-400 bg-slate-50 p-4 rounded-xl text-center border border-slate-100">
                      No hay cláusulas críticas.
                    </div>
                  ) : (
                    ag.clauses.map((c: any) => (
                      <div key={c.id} className="p-4 border-l-2 border-[#008fa0] bg-white shadow-sm rounded-r-xl border-y border-r border-slate-100 space-y-1.5">
                        <div className="flex items-center justify-between">
                          <span className="text-[9px] font-mono font-bold uppercase text-rose-600 bg-rose-50 px-1.5 py-0.5 rounded">
                            {c.priority}
                          </span>
                          <span className="text-[9px] text-slate-400 font-sans">{c.category}</span>
                        </div>
                        <h5 className="text-xs font-bold text-[#00313b] pt-1">{c.title}</h5>
                        <p className="text-[10px] text-slate-500 leading-relaxed">{c.description}</p>
                      </div>
                    ))
                  )}

                  {/* Add Clause Form */}
                  {isEditable && (
                    <div className="p-4 bg-slate-50 rounded-xl border border-slate-100 space-y-3 mt-4">
                      <span className="text-[10px] font-mono font-bold text-slate-400 uppercase">Añadir Cláusula Crítica</span>
                      <input
                        type="text"
                        placeholder="Título de la obligación"
                        value={clauseTitle}
                        onChange={(e) => setClauseTitle(e.target.value)}
                        className="w-full p-2 bg-white border border-slate-200 rounded-lg text-xs font-sans outline-none focus:ring-1 focus:ring-[#008fa0]"
                      />
                      <textarea
                        placeholder="Descripción y penalidad"
                        rows={2}
                        value={clauseDesc}
                        onChange={(e) => setClauseDesc(e.target.value)}
                        className="w-full p-2 bg-white border border-slate-200 rounded-lg text-xs font-sans outline-none focus:ring-1 focus:ring-[#008fa0] resize-none"
                      />
                      <div className="grid grid-cols-2 gap-2">
                        <select
                          value={clausePriority}
                          onChange={(e) => setClausePriority(e.target.value)}
                          className="p-2 bg-white border border-slate-200 rounded-lg text-xs font-sans outline-none"
                        >
                          <option>ALTA PRIORIDAD</option>
                          <option>MANDATORIO</option>
                          <option>INFORMATIVO</option>
                        </select>
                        <select
                          value={clauseCat}
                          onChange={(e) => setClauseCat(e.target.value)}
                          className="p-2 bg-white border border-slate-200 rounded-lg text-xs font-sans outline-none"
                        >
                          <option>COMPLIANCE</option>
                          <option>FINANCIERO</option>
                          <option>TÉCNICO</option>
                        </select>
                      </div>
                      <button
                        onClick={() => handleAddClause(ag.id)}
                        className="w-full py-2 bg-white border border-slate-200 text-[#00313b] text-[10px] font-bold rounded-lg hover:bg-slate-100 cursor-pointer transition-colors"
                      >
                        Registrar Obligación
                      </button>
                    </div>
                  )}
                </div>
              </div>

            </div>
          </div>
        ))
      )}

      {/* Add New Agreement Form */}
      {isEditable && (
        <div className="mt-8 pt-8 border-t border-slate-200">
          <div className="p-6 bg-slate-50 border border-slate-200 rounded-xl space-y-4">
            <span className="text-xs font-mono font-bold text-[#00313b] uppercase">Registrar Nuevo Convenio / Contrato</span>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="space-y-1">
                <label className="text-[10px] font-bold text-slate-500 uppercase">Contraparte Legal (*)</label>
                <input
                  type="text"
                  placeholder="Ej. Donante Corp"
                  value={agCounterparty}
                  onChange={(e) => setAgCounterparty(e.target.value)}
                  className="w-full p-2.5 bg-white border border-slate-200 rounded-lg text-xs outline-none"
                />
              </div>
              <div className="space-y-1">
                <label className="text-[10px] font-bold text-slate-500 uppercase">Fecha de Firma (*)</label>
                <input
                  type="date"
                  value={agSignedDate}
                  onChange={(e) => setAgSignedDate(e.target.value)}
                  className="w-full p-2.5 bg-white border border-slate-200 rounded-lg text-xs outline-none"
                />
              </div>
              <div className="space-y-1">
                <label className="text-[10px] font-bold text-slate-500 uppercase">Monto Total ($ USD) (*)</label>
                <input
                  type="number"
                  placeholder="Ej. 50000"
                  value={agAmount}
                  onChange={(e) => setAgAmount(e.target.value)}
                  className="w-full p-2.5 bg-white border border-slate-200 rounded-lg text-xs outline-none"
                />
              </div>
              <div className="space-y-1">
                <label className="text-[10px] font-bold text-slate-500 uppercase">Duración (Meses) (*)</label>
                <input
                  type="number"
                  placeholder="Ej. 12"
                  value={agDuration}
                  onChange={(e) => setAgDuration(e.target.value)}
                  className="w-full p-2.5 bg-white border border-slate-200 rounded-lg text-xs outline-none"
                />
              </div>
            </div>
            <button
              onClick={handleAddAgreement}
              className="w-full mt-4 py-2.5 bg-[#00313b] text-white text-xs font-bold rounded-lg hover:bg-slate-800 transition-colors cursor-pointer"
            >
              Registrar Convenio
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
