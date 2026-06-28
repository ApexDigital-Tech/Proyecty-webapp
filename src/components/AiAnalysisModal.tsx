import React, { useState, useEffect } from 'react';
import { Loader2, Sparkles, FileText, CheckCircle2, Tag, Bot, X } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

interface DetectedEntity {
  name: string;
  type: string;
}

interface AiAnalysisData {
  id: number;
  documentId: number;
  summary: string;
  keyPoints: string[];
  detectedEntities: DetectedEntity[];
  suggestedCategory: string;
  createdAt: string;
}

interface AiAnalysisModalProps {
  isOpen: boolean;
  onClose: () => void;
  documentId: number | null;
  documentName: string;
}

export function AiAnalysisModal({ isOpen, onClose, documentId, documentName }: AiAnalysisModalProps) {
  const { token, tenantId } = useAuth();
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<AiAnalysisData | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen && documentId) {
      handleAnalyze(false);
    }
    if (!isOpen) {
      setData(null);
      setError(null);
    }
  }, [isOpen, documentId]);

  const handleAnalyze = async (force: boolean) => {
    if (!documentId) return;
    
    setLoading(true);
    setError(null);
    
    try {
      const url = force 
        ? `/api/documents/${documentId}/analyze?force=true`
        : `/api/documents/${documentId}/analyze`;
        
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'x-tenant-id': String(tenantId)
        }
      });
      
      const json = await res.json();
      
      if (!res.ok) {
        throw new Error(json.error || 'Error al analizar el documento');
      }
      
      setData(json);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm">
      <div className="bg-slate-900/95 backdrop-blur-xl border border-slate-700/50 text-slate-100 shadow-2xl rounded-xl w-full max-w-3xl overflow-hidden flex flex-col max-h-[90vh]">
        <div className="flex items-center justify-between p-6 border-b border-slate-800">
          <div>
            <h3 className="text-2xl font-semibold flex items-center gap-3">
              <div className="p-2 bg-indigo-500/20 rounded-lg">
                <Sparkles className="w-6 h-6 text-indigo-400" />
              </div>
              Análisis Inteligente
            </h3>
            <p className="text-slate-400 mt-2">
              Documento: <span className="text-slate-200 font-medium">{documentName}</span>
            </p>
          </div>
          <button onClick={onClose} className="p-2 text-slate-400 hover:text-slate-200 hover:bg-slate-800 rounded-md transition-colors self-start">
            <X className="w-6 h-6" />
          </button>
        </div>

        <div className="p-6 overflow-y-auto">
          {loading ? (
            <div className="flex flex-col items-center justify-center py-12 space-y-4">
              <div className="relative">
                <div className="absolute inset-0 bg-indigo-500/30 blur-xl rounded-full"></div>
                <Loader2 className="w-12 h-12 text-indigo-400 animate-spin relative" />
              </div>
              <p className="text-slate-400 animate-pulse">Procesando documento con IA...</p>
            </div>
          ) : error ? (
            <div className="p-4 bg-rose-500/10 border border-rose-500/30 rounded-xl">
              <p className="text-rose-400 flex items-center gap-2">
                <span className="font-semibold">Error:</span> {error}
              </p>
              <button 
                onClick={() => handleAnalyze(true)} 
                className="mt-4 px-4 py-2 border border-rose-500/30 rounded-lg text-rose-300 hover:bg-rose-500/20 transition-colors text-sm font-medium"
              >
                Reintentar
              </button>
            </div>
          ) : data ? (
            <div className="space-y-6">
              {/* Summary */}
              <div className="bg-slate-800/50 rounded-xl p-5 border border-slate-700/50">
                <h3 className="text-sm font-medium text-indigo-300 flex items-center gap-2 mb-3">
                  <FileText className="w-4 h-4" />
                  Resumen Ejecutivo
                </h3>
                <p className="text-slate-300 leading-relaxed">
                  {data.summary}
                </p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Key Points */}
                <div className="bg-slate-800/50 rounded-xl p-5 border border-slate-700/50">
                  <h3 className="text-sm font-medium text-emerald-300 flex items-center gap-2 mb-3">
                    <CheckCircle2 className="w-4 h-4" />
                    Puntos Clave
                  </h3>
                  <ul className="space-y-2">
                    {data.keyPoints?.map((point, idx) => (
                      <li key={idx} className="text-sm text-slate-300 flex items-start gap-2">
                        <span className="text-emerald-500 mt-0.5">•</span>
                        <span>{point}</span>
                      </li>
                    ))}
                  </ul>
                </div>

                <div className="space-y-6">
                  {/* Category */}
                  <div className="bg-slate-800/50 rounded-xl p-5 border border-slate-700/50">
                    <h3 className="text-sm font-medium text-amber-300 flex items-center gap-2 mb-3">
                      <Tag className="w-4 h-4" />
                      Categoría Sugerida
                    </h3>
                    <div className="inline-flex items-center px-3 py-1 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/30 text-sm font-medium">
                      {data.suggestedCategory}
                    </div>
                  </div>

                  {/* Entities */}
                  <div className="bg-slate-800/50 rounded-xl p-5 border border-slate-700/50">
                    <h3 className="text-sm font-medium text-purple-300 flex items-center gap-2 mb-3">
                      <Bot className="w-4 h-4" />
                      Entidades Detectadas
                    </h3>
                    <div className="flex flex-wrap gap-2">
                      {data.detectedEntities?.map((entity, idx) => (
                        <div key={idx} className="px-2.5 py-1.5 rounded-lg bg-slate-950 border border-slate-700 text-xs flex flex-col">
                          <span className="text-slate-200 font-medium">{entity.name}</span>
                          <span className="text-slate-500 text-[10px] uppercase tracking-wider">{entity.type}</span>
                        </div>
                      ))}
                      {(!data.detectedEntities || data.detectedEntities.length === 0) && (
                        <span className="text-slate-500 text-sm">No se detectaron entidades específicas.</span>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
