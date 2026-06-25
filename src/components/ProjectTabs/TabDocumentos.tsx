import React from 'react';
import { FileText, Download } from 'lucide-react';
import { UserRole } from '../../types.ts';
import { hasPermission } from '../../lib/rbac.ts';

interface TabDocumentosProps {
  project: any;
  userRole: UserRole;
  docName: string;
  setDocName: (val: string) => void;
  docFile: File | null;
  setDocFile: (file: File | null) => void;
  handleAddDocument: (e: React.FormEvent) => void;
}

export default function TabDocumentos({
  project,
  userRole,
  docName, setDocName,
  docFile, setDocFile,
  handleAddDocument,
}: TabDocumentosProps) {
  const canUpload = hasPermission(userRole, 'canUploadDocuments');

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h4 className="text-xs font-bold text-[#00313b] uppercase tracking-wider">Repositorio Digital de Contratos y Expediente</h4>
          <p className="text-[11px] text-slate-400 font-sans">Expediente digital auditable con checksums</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        
        {/* Document List */}
        <div className="lg:col-span-2 space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {project.documents?.length === 0 ? (
              <div className="text-center py-6 col-span-2 text-slate-400">Sin archivos adjuntos.</div>
            ) : (
              project.documents?.map((doc: any) => (
                <div key={doc.id} className="p-4 bg-slate-50 hover:bg-slate-100/50 rounded-xl border border-slate-100 flex items-center justify-between text-xs">
                  <div className="flex items-center space-x-3 overflow-hidden">
                    <div className="w-10 h-10 bg-rose-50 text-rose-600 rounded-lg flex items-center justify-center flex-shrink-0">
                      <FileText className="w-5 h-5" />
                    </div>
                    <div className="overflow-hidden">
                      <strong className="text-slate-700 block truncate">{doc.name}</strong>
                      <span className="text-[10px] text-slate-400 font-mono">{doc.size} • {doc.uploadDate}</span>
                    </div>
                  </div>

                  <a
                    href={doc.fileUrl || '#'}
                    download
                    className="text-slate-400 hover:text-[#008fa0] p-1.5 hover:bg-white rounded-lg transition-colors cursor-pointer flex-shrink-0"
                    title="Descargar"
                  >
                    <Download className="w-4 h-4" />
                  </a>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Upload Document Form */}
        {canUpload && (
          <div className="bg-slate-50 p-6 rounded-xl border border-slate-100 space-y-4 text-xs font-sans">
            <span className="text-[10px] font-mono font-black text-slate-400 uppercase block">Adjuntar Expediente PDF/DWG</span>
            
            <form onSubmit={handleAddDocument} className="space-y-4">
            <div className="space-y-1">
              <label className="block font-bold text-[#00313b]">Archivo (*)</label>
              <input
                type="file"
                onChange={(e) => setDocFile(e.target.files ? e.target.files[0] : null)}
                className="w-full p-2.5 bg-white border border-slate-200 rounded-lg outline-none cursor-pointer"
              />
            </div>

            <button
              type="submit"
              className="w-full py-3 bg-[#008fa0] text-white font-bold rounded-xl hover:bg-[#007a8a] cursor-pointer"
            >
              Subir a Repositorio Digital
            </button>
          </form>
        </div>
        )}

      </div>
    </div>
  );
}
