import React, { useState } from 'react';
import { Clock, Download, FileCheck2, FileText, AlertCircle, CheckCircle2, Upload, DollarSign } from 'lucide-react';
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
  token?: string;
  onRefresh?: () => void;
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

  const [isUploading, setIsUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploadSuccess, setUploadSuccess] = useState<string | null>(null);

  // Wrapper para manejar submit con feedback visual de progreso y error
  const onSubmitForm = async (e: React.FormEvent) => {
    e.preventDefault();
    setUploadError(null);
    setUploadSuccess(null);

    if (!vBudgetItem) {
      setUploadError('Debe seleccionar una partida presupuestaria de imputación.');
      return;
    }
    if (!vAmount || parseFloat(vAmount) <= 0) {
      setUploadError('Debe ingresar un monto válido mayor a 0.');
      return;
    }
    if (!vProvider) {
      setUploadError('Debe ingresar el nombre del proveedor o contratista.');
      return;
    }
    if (!vDate) {
      setUploadError('Debe indicar la fecha de emisión del comprobante.');
      return;
    }
    if (!vFile) {
      setUploadError('Debe seleccionar un archivo PDF de comprobante.');
      return;
    }

    setIsUploading(true);
    try {
      await handleAddVoucher(e);
      setUploadSuccess('Comprobante cargado y asociado exitosamente.');
    } catch (err: any) {
      setUploadError(err.message || 'Error al cargar el comprobante');
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h4 className="text-xs font-bold text-[#00313b] uppercase tracking-wider">Cumplimiento y Rendición de Comprobantes</h4>
          <p className="text-[11px] text-slate-400 font-sans">Suba comprobantes y facturas con verificación de integridad y gobierno documental</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        
        {/* Voucher List */}
        <div className="lg:col-span-2 space-y-4">
          <div className="divide-y divide-slate-100 border border-slate-100 rounded-xl overflow-hidden shadow-sm text-xs">
            {!project.receiptsVouchers || project.receiptsVouchers.length === 0 ? (
              <div className="text-center py-12 text-slate-400">No hay comprobantes cargados en el proyecto.</div>
            ) : (
              project.receiptsVouchers.map((v: any) => (
                <div key={v.id} className="p-4 flex items-center justify-between hover:bg-slate-50 transition-colors">
                  <div className="space-y-1.5 pr-4 flex-1">
                    <div className="flex items-center space-x-2">
                      <span className="font-bold text-[#00313b] text-xs">{v.provider}</span>
                      <span className="text-[9px] font-mono text-slate-600 bg-slate-100 px-2 py-0.5 rounded font-bold">
                        {v.type}
                      </span>
                      {v.budgetLineId && (
                        <span className="text-[9px] font-mono text-[#008fa0] bg-cyan-50 px-1.5 py-0.5 rounded">
                          Partida #{v.budgetLineId}
                        </span>
                      )}
                    </div>
                    
                    {v.description && (
                      <p className="text-[11px] text-slate-500 font-sans">{v.description}</p>
                    )}

                    <div className="flex flex-wrap items-center gap-3 text-[10px] text-slate-400 font-mono pt-1">
                      <span className="flex items-center space-x-1">
                        <Clock className="w-3 h-3" />
                        <span>{v.issueDate ? new Date(v.issueDate).toLocaleDateString() : 'N/A'}</span>
                      </span>
                      <span>•</span>
                      <span className="flex items-center space-x-1">
                        <FileText className="w-3 h-3 text-[#008fa0]" />
                        <a
                          href={v.fileUrl}
                          download={v.fileName}
                          target="_blank"
                          rel="noreferrer"
                          className="text-[#008fa0] hover:underline inline-flex items-center font-bold"
                          title="Descargar comprobante"
                        >
                          <Download className="w-2.5 h-2.5 mr-1" />
                          <span>{v.fileName}</span>
                        </a>
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center space-x-4 flex-shrink-0">
                    <span className="font-mono font-bold text-[#00313b] text-sm">${Number(v.amount).toLocaleString()}</span>
                    
                    {canVerify && (
                      <button
                        onClick={() => handleVerifyVoucher(v.id, v.isVerified)}
                        className={`flex items-center space-x-1 px-2.5 py-1 rounded-full border cursor-pointer font-mono text-[9px] font-bold transition-colors ${
                          v.isVerified
                            ? 'bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100'
                            : 'bg-amber-50 text-amber-700 border-amber-200 hover:bg-amber-100 animate-pulse'
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

        {/* Upload Voucher Form */}
        {canUpload && (
          <div className="bg-slate-50 p-6 rounded-xl border border-slate-100 space-y-4 text-xs font-sans">
            <span className="text-[10px] font-mono font-black text-slate-400 uppercase block">Carga de Comprobante / Factura</span>
            
            {uploadError && (
              <div className="p-3 bg-red-50 border border-red-200 text-red-700 text-xs rounded-lg flex items-start space-x-2">
                <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                <span>{uploadError}</span>
              </div>
            )}
            {uploadSuccess && (
              <div className="p-3 bg-emerald-50 border border-emerald-200 text-emerald-700 text-xs rounded-lg flex items-center space-x-2">
                <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
                <span>{uploadSuccess}</span>
              </div>
            )}

            <form onSubmit={onSubmitForm} className="space-y-3">
              <div className="space-y-1">
                <label className="block font-bold text-[#00313b]">Partida Presupuestaria de Imputación (*)</label>
                <select
                  value={vBudgetItem}
                  onChange={(e) => setVBudgetItem(e.target.value)}
                  className="w-full p-2.5 bg-white border border-slate-200 rounded-lg outline-none cursor-pointer focus:border-[#008fa0]"
                >
                  <option value="">Seleccione Partida...</option>
                  {project.budgetLines?.map((item: any) => (
                    <option key={item.id} value={item.id}>
                      [{item.code}] {item.category} - {item.subcategory} (Saldo: ${item.balance?.toLocaleString()})
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
                    className="w-full p-2.5 bg-white border border-slate-200 rounded-lg outline-none cursor-pointer focus:border-[#008fa0]"
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
                    step="0.01"
                    placeholder="0.00"
                    value={vAmount}
                    onChange={(e) => setVAmount(e.target.value)}
                    className="w-full p-2.5 bg-white border border-slate-200 rounded-lg outline-none font-mono focus:border-[#008fa0]"
                  />
                </div>
              </div>

              <div className="space-y-1">
                <label className="block font-bold text-[#00313b]">Proveedor / Contratista (*)</label>
                <input
                  type="text"
                  placeholder="Ej. Suministros de Obra S.A."
                  value={vProvider}
                  onChange={(e) => setVProvider(e.target.value)}
                  className="w-full p-2.5 bg-white border border-slate-200 rounded-lg outline-none focus:border-[#008fa0]"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="block font-bold text-[#00313b]">Fecha Emisión (*)</label>
                  <input
                    type="date"
                    value={vDate}
                    onChange={(e) => setVDate(e.target.value)}
                    className="w-full p-2.5 bg-white border border-slate-200 rounded-lg outline-none cursor-pointer focus:border-[#008fa0]"
                  />
                </div>

                <div className="space-y-1">
                  <label className="block font-bold text-[#00313b]">Hito del Proyecto</label>
                  <input
                    type="text"
                    placeholder="Ej. Hito 1"
                    value={vMilestone}
                    onChange={(e) => setVMilestone(e.target.value)}
                    className="w-full p-2.5 bg-white border border-slate-200 rounded-lg outline-none focus:border-[#008fa0]"
                  />
                </div>
              </div>

              {/* Selector de PDF con indicador de archivo */}
              <div className="space-y-1">
                <label className="block font-bold text-[#00313b]">Archivo PDF Comprobante (*)</label>
                <input
                  type="file"
                  accept=".pdf,application/pdf"
                  onChange={(e) => setVFile(e.target.files ? e.target.files[0] : null)}
                  className="w-full p-2 bg-white border border-slate-200 rounded-lg outline-none cursor-pointer text-xs"
                />
                {vFile && (
                  <div className="mt-1 flex items-center space-x-2 text-[11px] text-[#008fa0] font-mono bg-cyan-50 p-2 rounded">
                    <FileText className="w-3.5 h-3.5" />
                    <span>Seleccionado: {vFile.name} ({(vFile.size / 1024).toFixed(1)} KB)</span>
                  </div>
                )}
              </div>

              <div className="space-y-1">
                <label className="block font-bold text-[#00313b]">Glosa / Justificación</label>
                <textarea
                  rows={2}
                  placeholder="Justifique el gasto para compliance..."
                  value={vDesc}
                  onChange={(e) => setVDesc(e.target.value)}
                  className="w-full p-2.5 bg-white border border-slate-200 rounded-lg outline-none focus:border-[#008fa0]"
                />
              </div>

              <button
                type="submit"
                disabled={isUploading}
                className="w-full py-3 bg-[#008fa0] text-white font-bold rounded-xl hover:bg-[#007a8a] cursor-pointer transition-colors disabled:opacity-50 flex items-center justify-center space-x-2 shadow-sm"
              >
                <Upload className="w-4 h-4" />
                <span>{isUploading ? 'Subiendo y Verificando...' : 'Subir Comprobante a Compliance'}</span>
              </button>
            </form>
          </div>
        )}

      </div>
    </div>
  );
}
