import React from 'react';
import { UserRole } from '../../types.ts';
import { hasPermission } from '../../lib/rbac.ts';
import { DocumentManager } from '../DocumentManager.tsx';

interface TabDocumentosProps {
  project: any;
  userRole: UserRole;
  // Ignoring the old props for compatibility
  docName?: string;
  setDocName?: (val: string) => void;
  docFile?: File | null;
  setDocFile?: (file: File | null) => void;
  handleAddDocument?: (e: React.FormEvent) => void;
}

export default function TabDocumentos({
  project,
  userRole,
}: TabDocumentosProps) {
  const canView = hasPermission(userRole, 'canUploadDocuments'); // Or checking another permission if needed, but for now we let DocumentManager handle its internal RBAC via UI or we can wrap it

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h4 className="text-xs font-bold text-[#00313b] uppercase tracking-wider">Repositorio Digital de Contratos y Expediente</h4>
          <p className="text-[11px] text-slate-400 font-sans">Expediente digital auditable con checksums</p>
        </div>
      </div>
      
      <DocumentManager projectId={project.id} />
    </div>
  );
}
