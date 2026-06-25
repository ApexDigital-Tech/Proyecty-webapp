import React from 'react';
import { Clock, Download, FileCheck2 } from 'lucide-react';
import { UserRole } from '../../types.ts';
import { hasPermission } from '../../lib/rbac.ts';

interface TabComprobantesProps {
  project: any;
  userRole: UserRole;
  vBudgetItem: string;
  setVBudgetItem: (val: string) => void;
  vType: string;
  setVType: (val: string) => void;
  vAmount: string;
  setVAmount: (val: string) => void;
  vProvider: string;
  setVProvider: (val: string) => void;
  vDate: string;
  setVDate: (val: string) => void;
  vMilestone: string;
  setVMilestone: (val: string) => void;
  vFileName: string;
  setVFileName: (val: string) => void;
  vFile: File | null;
  setVFile: (file: File | null) => void;
  vDesc: string;
  setVDesc: (val: string) => void;
  handleAddVoucher: (e: React.FormEvent) => void;
  handleVerifyVoucher: (vid: number, currentStatus: boolean) => void;
}

export default function TabComprobantes({
  project,
  userRole,
  vBudgetItem, setVBudgetItem,
  vType, setVType,
  vAmount, setVAmount,
  vProvider, setVProvider,
  vDate, setVDate,
  vMilestone, setVMilestone,
  vFileName,
  setVFileName,
  vFile,
  setVFile,
  vDesc,
  setVDesc,
  handleAddVoucher,
  handleVerifyVoucher,
}: TabComprobantesProps) {
  const canVerify = hasPermission(userRole, 'canApproveVouchers');
  const canUpload = hasPermission(userRole, 'canUploadDocuments');

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h4 className="text-xs font-bold text-[#00313b] uppercase tracking-wider">Cumplimiento y Rendición de Comprobantes</h4>
          <p className="text-[11px] text-slate-400 font-sans">Suba comprobantes y verifique que no excedan el presupuesto asignado</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        
        {/* Voucher List */}
        <div className="lg:col-span-2 space-y-4">
          <div className="divide-y divide-slate-100 border border-slate-100 rounded-xl overflow-hidden shadow-sm text-xs">
            {project.receiptsVouchers?.length === 0 ? (
              <div className="text-center py-12 text-slate-400">No hay comprobantes cargados en el proyecto.</div>
            ) : (
              project.receiptsVouchers?.map((v: any) => (
                <div key={v.id} className="p-4 flex items-center justify-between hover:bg-slate-50 transition-colors">
                  <div className="space-y-1 pr-4">
                    <div className="flex items-center space-x-2">
                      <span className="font-bold text-[#00313b] text-xs">{v.provider}</span>
                      <span className="text-[9px] font-mono text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded">
                        {v.type}
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-500 font-sans">{v.description}</p>
                    <div className="flex flex-wrap items-center gap-2 text-[10px] text-slate-400 font-mono">
                      <Clock className="w-3.5 h-3.5" />
                      <span>Fecha: {v.issueDate}</span>
                      <span>•</span>
                      <span>Archivo: <a href={v.fileUrl} download className="text-[#008fa0] hover:underline inline-flex items-center"><Download className="w-2.5 h-2.5 mr-0.5" />{v.fileName}</a></span>
                    </div>
                  </div>

                  <div className="flex items-center space-x-4">
                    <span className="font-mono font-bold text-[#00313b]">${v.amount.toLocaleString()}</span>
                    
                    {canVerify && (
                      <button
                        onClick={() => handleVerifyVoucher(v.id, v.isVerified)}
                        className={`flex items-center space-x-1 px-2 py-1 rounded-full border cursor-pointer font-mono text-[9px] font-bold ${
                          v.isVerified
                            ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                            : 'bg-amber-50 text-amber-700 border-amber-200 animate-pulse'
                        }`}
                        title="Verificación de Auditoría Financiera"
                      >
                        <FileCheck2 className="w-3 h-3" />
                        <span>{v.isVerified ? 'VERIFICADO' : 'PENDIENTE'}</span>
                      </button>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Upload Voucher Form (with live compliance validation) */}
        {canUpload && (
          <div className="bg-slate-50 p-6 rounded-xl border border-slate-100 space-y-4 text-xs font-sans">
            <span className="text-[10px] font-mono font-black text-slate-400 uppercase block">Carga de Comprobante / Factura</span>
            
            <form onSubmit={handleAddVoucher} className="space-y-3">
            <div className="space-y-1">
              <label className="block font-bold text-[#00313b]">Partida Presupuestaria de Imputación (*)</label>
              <select
                value={vBudgetItem}
                onChange={(e) => setVBudgetItem(e.target.value)}
                className="w-full p-2.5 bg-white border border-slate-200 rounded-lg outline-none cursor-pointer"
              >
                <option value="">Seleccione Partida...</option>
                {project.budgetLines?.map((item: any) => (
                  <option key={item.id} value={item.id}>
                    [{item.code}] {item.category} - {item.subcategory} (Saldo: ${item.balance.toLocaleString()})
                  </option>
                ))}
              </select>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="block font-bold text-[#00313b]">Tipo Documento</label>
                <select
                  value={vType}
                  onChange={(e) => setVType(e.target.value)}
                  className="w-full p-2.5 bg-white border border-slate-200 rounded-lg outline-none cursor-pointer"
                >
                  <option value="Factura">Factura</option>
                  <option value="Recibo de Honorarios">Recibo Honorarios</option>
                  <option value="Comprobante de Pago">Boleta de Gasto</option>
                </select>
              </div>

              <div className="space-y-1">
                <label className="block font-bold text-[#00313b]">Monto ($ USD) (*)</label>
                <input
                  type="number"
                  placeholder="Monto"
                  value={vAmount}
                  onChange={(e) => setVAmount(e.target.value)}
                  className="w-full p-2.5 bg-white border border-slate-200 rounded-lg outline-none"
                />
              </div>
            </div>

            <div className="space-y-1">
              <label className="block font-bold text-[#00313b]">Proveedor Contratista (*)</label>
              <input
                type="text"
                placeholder="Ej. Suministros de Obra S.A."
                value={vProvider}
                onChange={(e) => setVProvider(e.target.value)}
                className="w-full p-2.5 bg-white border border-slate-200 rounded-lg outline-none"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="block font-bold text-[#00313b]">Fecha Emisión (*)</label>
                <input
                  type="date"
                  value={vDate}
                  onChange={(e) => setVDate(e.target.value)}
                  className="w-full p-2.5 bg-white border border-slate-200 rounded-lg outline-none cursor-pointer"
                />
              </div>

              <div className="space-y-1">
                <label className="block font-bold text-[#00313b]">Hito del Proyecto</label>
                <input
                  type="text"
                  placeholder="Ej. Hito 1"
                  value={vMilestone}
                  onChange={(e) => setVMilestone(e.target.value)}
                  className="w-full p-2.5 bg-white border border-slate-200 rounded-lg outline-none"
                />
              </div>
            </div>

            <div className="space-y-1">
              <label className="block font-bold text-[#00313b]">Archivo PDF Comprobante (*)</label>
              <input
                type="file"
                accept=".pdf,.jpg,.jpeg,.png"
                onChange={(e) => setVFile(e.target.files ? e.target.files[0] : null)}
                className="w-full p-2.5 bg-white border border-slate-200 rounded-lg outline-none"
              />
            </div>

            <div className="space-y-1">
              <label className="block font-bold text-[#00313b]">Glosa / Justificación</label>
              <textarea
                rows={2}
                placeholder="Justifique el gasto para compliance..."
                value={vDesc}
                onChange={(e) => setVDesc(e.target.value)}
                className="w-full p-2.5 bg-white border border-slate-200 rounded-lg outline-none"
              />
            </div>

            <button
              type="submit"
              className="w-full py-3 bg-[#008fa0] text-white font-bold rounded-xl hover:bg-[#007a8a] cursor-pointer"
            >
              Subir Comprobante a Compliance
            </button>
          </form>
        </div>
        )}

      </div>
    </div>
  );
}
