import React, { Component, ErrorInfo, ReactNode } from 'react';
import { AlertTriangle, RefreshCcw } from 'lucide-react';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
  moduleName?: string;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export default class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Uncaught error:', error, errorInfo);
  }

  private handleReset = () => {
    this.setState({ hasError: false, error: null });
  };

  public render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      return (
        <div className="flex flex-col items-center justify-center p-12 bg-white rounded-lg border border-slate-200 shadow-sm max-w-2xl mx-auto my-8">
          <div className="w-12 h-12 bg-red-50 rounded-full flex items-center justify-center mb-4">
            <AlertTriangle className="w-6 h-6 text-red-500" />
          </div>
          <h2 className="text-lg font-bold text-slate-900 mb-2 font-sans">
            Algo salió mal en el módulo {this.props.moduleName ? `"${this.props.moduleName}"` : ''}
          </h2>
          <p className="text-sm text-slate-500 mb-6 text-center max-w-md font-sans">
            Se ha producido un error inesperado al intentar cargar esta sección. El equipo técnico ha sido notificado.
          </p>
          <div className="bg-slate-50 p-4 rounded-md border border-slate-100 w-full mb-6 overflow-auto max-h-32 text-left">
            <code className="text-xs text-red-600 font-mono">
              {this.state.error?.message || 'Error desconocido'}
            </code>
          </div>
          <button
            onClick={this.handleReset}
            className="flex items-center space-x-2 px-4 py-2 bg-[#00313b] hover:bg-[#00252c] text-white rounded-md font-semibold text-sm transition-colors shadow-sm"
          >
            <RefreshCcw className="w-4 h-4" />
            <span>Intentar nuevamente</span>
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}
