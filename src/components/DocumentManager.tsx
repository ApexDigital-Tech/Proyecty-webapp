import React, { useState, useEffect, useRef } from 'react';
import { Paperclip, Upload, Trash2, Download, AlertCircle, Loader2 } from 'lucide-react';
import dayjs from 'dayjs';

interface Document {
  id: number;
  name: string;
  originalName: string;
  mimeType: string;
  size: string; // Stored as string in DB for compatibility
  type: string;
  uploadDate: string;
  fileUrl: string;
  uploadedBy: number;
}

interface DocumentManagerProps {
  projectId: number;
}

export function DocumentManager({ projectId }: DocumentManagerProps) {
  const [documents, setDocuments] = useState<Document[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  const [uploadType, setUploadType] = useState('Other');
  const [uploadTitle, setUploadTitle] = useState('');

  const fetchDocuments = async () => {
    try {
      setLoading(true);
      setError(null);
      const token = localStorage.getItem('token');
      const res = await fetch(`/api/projects/${projectId}/documents`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (!res.ok) throw new Error('Error al cargar documentos');
      const data = await res.json();
      setDocuments(data);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDocuments();
  }, [projectId]);

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!uploadTitle.trim()) {
      alert('Por favor ingresa un título para el documento.');
      if (fileInputRef.current) fileInputRef.current.value = '';
      return;
    }

    // Basic validation
    const allowedTypes = [
      'application/pdf',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'image/jpeg',
      'image/png'
    ];
    if (!allowedTypes.includes(file.type)) {
      alert('Tipo de archivo no válido. Solo PDF, DOCX, JPG y PNG.');
      if (fileInputRef.current) fileInputRef.current.value = '';
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      alert('El archivo excede el límite de 10MB.');
      if (fileInputRef.current) fileInputRef.current.value = '';
      return;
    }

    try {
      setUploading(true);
      setError(null);
      
      const formData = new FormData();
      formData.append('file', file);
      formData.append('title', uploadTitle);
      formData.append('type', uploadType);

      const token = localStorage.getItem('token');
      const res = await fetch(`/api/projects/${projectId}/documents`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`
        },
        body: formData
      });

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(errorData.error || 'Error al subir documento');
      }

      await fetchDocuments();
      setUploadTitle('');
      if (fileInputRef.current) fileInputRef.current.value = '';
    } catch (err: any) {
      setError(err.message);
      alert(err.message);
    } finally {
      setUploading(false);
    }
  };

  const handleDownload = async (doc: Document) => {
    try {
      const token = localStorage.getItem('token');
      const res = await fetch(`/api/documents/${doc.id}/download`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (!res.ok) throw new Error('Error al descargar');
      const data = await res.json();
      
      // Open URL in new tab to trigger download
      window.open(data.url, '_blank');
    } catch (err: any) {
      alert(err.message);
    }
  };

  const handleDelete = async (docId: number) => {
    if (!confirm('¿Estás seguro de que deseas eliminar este documento? Esta acción no se puede deshacer.')) return;
    
    try {
      const token = localStorage.getItem('token');
      const res = await fetch(`/api/documents/${docId}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (!res.ok) throw new Error('Error al eliminar');
      
      setDocuments(docs => docs.filter(d => d.id !== docId));
    } catch (err: any) {
      alert(err.message);
    }
  };

  const formatSize = (bytesStr: string) => {
    const bytes = parseInt(bytesStr, 10);
    if (isNaN(bytes)) return bytesStr;
    if (bytes < 1024) return bytes + ' B';
    else if (bytes < 1048576) return (bytes / 1024).toFixed(1) + ' KB';
    else return (bytes / 1048576).toFixed(1) + ' MB';
  };

  return (
    <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
      <div className="p-6 border-b border-slate-200">
        <h3 className="text-lg font-semibold text-slate-800 flex items-center gap-2">
          <Paperclip className="w-5 h-5 text-indigo-600" />
          Expediente Digital
        </h3>
        <p className="text-sm text-slate-500 mt-1">
          Gestiona los documentos de respaldo y entregables del proyecto (Max 10MB).
        </p>
      </div>

      <div className="p-6">
        {/* Upload Form */}
        <div className="flex flex-wrap gap-4 items-end mb-6 bg-slate-50 p-4 rounded-lg border border-slate-200">
          <div className="flex-1 min-w-[200px]">
            <label className="block text-sm font-medium text-slate-700 mb-1">Título del Documento</label>
            <input
              type="text"
              value={uploadTitle}
              onChange={(e) => setUploadTitle(e.target.value)}
              placeholder="Ej. Contrato Principal..."
              className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
            />
          </div>
          <div className="w-48">
            <label className="block text-sm font-medium text-slate-700 mb-1">Tipo</label>
            <select
              value={uploadType}
              onChange={(e) => setUploadType(e.target.value)}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
            >
              <option value="Contract">Contrato</option>
              <option value="Invoice">Factura / Recibo</option>
              <option value="Report">Reporte</option>
              <option value="Design">Diseño / Plano</option>
              <option value="Other">Otro</option>
            </select>
          </div>
          <div>
            <input 
              type="file" 
              ref={fileInputRef} 
              className="hidden" 
              onChange={handleUpload}
              accept=".pdf,.docx,.jpg,.jpeg,.png"
            />
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
              className="bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors flex items-center gap-2 disabled:opacity-50"
            >
              {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
              Subir Archivo
            </button>
          </div>
        </div>

        {error && (
          <div className="mb-6 p-4 bg-red-50 text-red-700 rounded-lg flex items-start gap-3 text-sm">
            <AlertCircle className="w-5 h-5 flex-shrink-0 mt-0.5" />
            <p>{error}</p>
          </div>
        )}

        {/* Document List */}
        {loading ? (
          <div className="flex justify-center items-center py-12">
            <Loader2 className="w-8 h-8 text-indigo-600 animate-spin" />
          </div>
        ) : documents.length === 0 ? (
          <div className="text-center py-12 border-2 border-dashed border-slate-200 rounded-lg">
            <Paperclip className="w-12 h-12 text-slate-300 mx-auto mb-3" />
            <h4 className="text-slate-700 font-medium">No hay documentos</h4>
            <p className="text-slate-500 text-sm mt-1">Sube el primer documento del proyecto</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-200 text-sm font-medium text-slate-500">
                  <th className="py-3 px-4">Documento</th>
                  <th className="py-3 px-4">Tipo</th>
                  <th className="py-3 px-4">Tamaño</th>
                  <th className="py-3 px-4">Fecha</th>
                  <th className="py-3 px-4 text-right">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {documents.map((doc) => (
                  <tr key={doc.id} className="hover:bg-slate-50 transition-colors">
                    <td className="py-3 px-4">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 bg-indigo-50 rounded flex items-center justify-center flex-shrink-0">
                          <Paperclip className="w-4 h-4 text-indigo-600" />
                        </div>
                        <div>
                          <p className="text-sm font-medium text-slate-900">{doc.name}</p>
                          <p className="text-xs text-slate-500 truncate max-w-[200px]">{doc.originalName}</p>
                        </div>
                      </div>
                    </td>
                    <td className="py-3 px-4">
                      <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-slate-100 text-slate-700">
                        {doc.type}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-sm text-slate-600">
                      {formatSize(doc.size)}
                    </td>
                    <td className="py-3 px-4 text-sm text-slate-600">
                      {doc.uploadDate ? dayjs(doc.uploadDate).format('DD/MM/YY HH:mm') : '-'}
                    </td>
                    <td className="py-3 px-4">
                      <div className="flex justify-end gap-2">
                        <button
                          onClick={() => handleDownload(doc)}
                          className="p-1.5 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded transition-colors"
                          title="Descargar"
                        >
                          <Download className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => handleDelete(doc.id)}
                          className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded transition-colors"
                          title="Eliminar"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
