import React from 'react';
import { LogIn, ShieldAlert, Award, CreditCard, FolderGit2, Eye, Globe } from 'lucide-react';
import { UserRole } from '../types.ts';

interface LoginProps {
  onLoginSuccess: (token: string, userInfo: { name: string; email: string; role: UserRole }) => void;
}

export default function Login({ onLoginSuccess }: LoginProps) {
  const [error, setError] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState<boolean>(false);

  const handleGoogleLogin = async () => {
    setLoading(true);
    setError(null);
    try {
      const { supabase } = await import('../lib/supabase.ts');
      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: window.location.origin
        }
      });
      if (error) throw error;
    } catch (err: any) {
      console.error('Google Sign In Error:', err);
      setError('No se pudo completar el inicio de sesión de Google. Intente nuevamente.');
      setLoading(false);
    }
  };

  const handleDemoLogin = (role: UserRole) => {
    setLoading(true);
    // Use simulated token headers
    let name = 'Luis Morales';
    let email = 'director@proyecty.org';
    
    if (role === 'MANAGER') {
      name = 'Rodrigo G. (Manager)';
      email = 'rodrigo@proyecty.org';
    } else if (role === 'FINANCE') {
      name = 'Karla Martínez (Finanzas)';
      email = 'karla.finanzas@proyecty.org';
    } else if (role === 'AUDITOR') {
      name = 'Andrés Peña (Auditor Externo)';
      email = 'andres.auditor@proyecty.org';
    } else if (role === 'FINANCIADOR') {
      name = 'Representante USAID (Donante)';
      email = 'donante.usaid@proyecty.org';
    }

    setTimeout(() => {
      onLoginSuccess(`demo-${role.toLowerCase()}`, { name, email, role });
      setLoading(false);
    }, 400);
  };

  return (
    <div id="login-container" className="min-h-screen flex items-center justify-center bg-[#0F172A] p-6 select-none">
      <div id="login-card" className="w-full max-w-md bg-white rounded-lg shadow-2xl overflow-hidden border border-slate-200 flex flex-col justify-between p-6 space-y-5">
        
        {/* Logo and Header */}
        <div className="text-center space-y-1.5">
          <div className="mx-auto w-12 h-12 bg-blue-50 text-blue-600 rounded-lg flex items-center justify-center border border-blue-100">
            <FolderGit2 id="logo-icon" className="w-6 h-6" />
          </div>
          <h1 id="platform-title" className="text-xl font-sans font-extrabold tracking-tight text-slate-900">
            PROYECTY
          </h1>
          <p id="platform-subtitle" className="text-xs font-sans text-slate-400">
            Control de Proyectos, Convenios y Presupuestos
          </p>
        </div>

        {error && (
          <div id="login-error-alert" className="bg-red-50 border-l-4 border-red-500 p-2.5 rounded-r flex items-center space-x-2 text-red-700 text-xs font-sans">
            <ShieldAlert className="w-4 h-4 flex-shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {/* Real Sign In Button */}
        <div className="space-y-3">
          <button
            id="google-signin-btn"
            onClick={handleGoogleLogin}
            disabled={loading}
            className="w-full flex items-center justify-center space-x-2 bg-blue-600 hover:bg-blue-700 text-white py-2.5 px-4 rounded-md font-sans text-xs font-semibold transition-colors focus:ring-1 focus:ring-offset-1 focus:ring-blue-500 disabled:opacity-50 cursor-pointer shadow-sm"
          >
            <LogIn className="w-4 h-4" />
            <span>{loading ? 'Iniciando...' : 'Acceder con Google Auth'}</span>
          </button>

          <div className="relative flex py-1 items-center">
            <div className="flex-grow border-t border-slate-200"></div>
            <span className="flex-shrink mx-3 text-slate-400 text-[10px] uppercase font-mono tracking-wider">O probar con un rol demo</span>
            <div className="flex-grow border-t border-slate-200"></div>
          </div>

          {/* Quick Demo Accounts for RBAC Simulation */}
          <div id="demo-roles-panel" className="space-y-2">
            {/* Director occupying full width */}
            <button
              id="demo-role-director"
              onClick={() => handleDemoLogin('DIRECTOR')}
              disabled={loading}
              className="w-full flex items-center justify-between p-2.5 bg-slate-50 hover:bg-slate-100/80 border border-slate-200 rounded-lg transition-all text-left cursor-pointer group"
            >
              <div className="flex items-center space-x-2.5">
                <div className="w-8 h-8 bg-emerald-50 text-emerald-600 rounded flex items-center justify-center border border-emerald-100 flex-shrink-0">
                  <Award className="w-4.5 h-4.5" />
                </div>
                <div>
                  <div className="font-sans font-bold text-xs text-slate-800">Luis Morales</div>
                  <div className="text-[10px] font-sans text-slate-400">Director Operativo (Admin total)</div>
                </div>
              </div>
              <span className="text-[9px] font-mono font-bold bg-emerald-50 text-emerald-700 border border-emerald-100 px-1.5 py-0.2 rounded">DIRECTOR</span>
            </button>

            {/* Grid of 2 columns for other roles */}
            <div className="grid grid-cols-2 gap-2">
              <button
                id="demo-role-manager"
                onClick={() => handleDemoLogin('MANAGER')}
                disabled={loading}
                className="flex flex-col justify-between p-2.5 bg-slate-50 hover:bg-slate-100/80 border border-slate-200 rounded-lg transition-all text-left cursor-pointer group space-y-2"
              >
                <div className="flex items-center space-x-2">
                  <div className="w-7 h-7 bg-blue-50 text-blue-600 rounded flex items-center justify-center border border-blue-100 flex-shrink-0">
                    <FolderGit2 className="w-3.5 h-3.5" />
                  </div>
                  <div className="overflow-hidden">
                    <div className="font-sans font-bold text-[11px] text-slate-800 truncate">Rodrigo G.</div>
                    <div className="text-[9px] font-sans text-slate-400 truncate">Project Manager</div>
                  </div>
                </div>
                <span className="text-[8px] font-mono font-bold bg-blue-50 text-blue-700 border border-blue-100 px-1.5 py-0.2 rounded self-start">MANAGER</span>
              </button>

              <button
                id="demo-role-finance"
                onClick={() => handleDemoLogin('FINANCE')}
                disabled={loading}
                className="flex flex-col justify-between p-2.5 bg-slate-50 hover:bg-slate-100/80 border border-slate-200 rounded-lg transition-all text-left cursor-pointer group space-y-2"
              >
                <div className="flex items-center space-x-2">
                  <div className="w-7 h-7 bg-rose-50 text-rose-600 rounded flex items-center justify-center border border-rose-100 flex-shrink-0">
                    <CreditCard className="w-3.5 h-3.5" />
                  </div>
                  <div className="overflow-hidden">
                    <div className="font-sans font-bold text-[11px] text-slate-800 truncate">Karla Martínez</div>
                    <div className="text-[9px] font-sans text-slate-400 truncate">Finanzas</div>
                  </div>
                </div>
                <span className="text-[8px] font-mono font-bold bg-rose-50 text-rose-700 border border-rose-100 px-1.5 py-0.2 rounded self-start">FINANCE</span>
              </button>

              <button
                id="demo-role-auditor"
                onClick={() => handleDemoLogin('AUDITOR')}
                disabled={loading}
                className="flex flex-col justify-between p-2.5 bg-slate-50 hover:bg-slate-100/80 border border-slate-200 rounded-lg transition-all text-left cursor-pointer group space-y-2"
              >
                <div className="flex items-center space-x-2">
                  <div className="w-7 h-7 bg-indigo-50 text-indigo-600 rounded flex items-center justify-center border border-indigo-100 flex-shrink-0">
                    <Eye className="w-3.5 h-3.5" />
                  </div>
                  <div className="overflow-hidden">
                    <div className="font-sans font-bold text-[11px] text-slate-800 truncate">Andrés Peña</div>
                    <div className="text-[9px] font-sans text-slate-400 truncate">Auditor Externo</div>
                  </div>
                </div>
                <span className="text-[8px] font-mono font-bold bg-indigo-50 text-indigo-700 border border-indigo-100 px-1.5 py-0.2 rounded self-start">AUDITOR</span>
              </button>

              <button
                id="demo-role-financiador"
                onClick={() => handleDemoLogin('FINANCIADOR')}
                disabled={loading}
                className="flex flex-col justify-between p-2.5 bg-slate-50 hover:bg-slate-100/80 border border-slate-200 rounded-lg transition-all text-left cursor-pointer group space-y-2"
              >
                <div className="flex items-center space-x-2">
                  <div className="w-7 h-7 bg-amber-50 text-amber-600 rounded flex items-center justify-center border border-amber-100 flex-shrink-0">
                    <Globe className="w-3.5 h-3.5" />
                  </div>
                  <div className="overflow-hidden">
                    <div className="font-sans font-bold text-[11px] text-slate-800 truncate">USAID Rep.</div>
                    <div className="text-[9px] font-sans text-slate-400 truncate">Donante / Financiador</div>
                  </div>
                </div>
                <span className="text-[8px] font-mono font-bold bg-amber-50 text-amber-700 border border-amber-100 px-1.5 py-0.2 rounded self-start">DONANTE</span>
              </button>
            </div>
          </div>
        </div>

        {/* Footer info */}
        <div className="text-center text-[9px] font-mono text-slate-400">
          PROYECTY v1.0 • Desarrollado con Cloud SQL & Firebase Auth
        </div>

      </div>
    </div>
  );
}
