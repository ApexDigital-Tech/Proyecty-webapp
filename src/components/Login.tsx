import React from 'react';
import { LogIn, ShieldAlert, Award, CreditCard, FolderGit2, Eye, Globe, RefreshCw } from 'lucide-react';
import { UserRole } from '../types.ts';

interface LoginProps {
  onLoginSuccess: (token: string, userInfo: { name: string; email: string; role: UserRole }) => void;
}

interface DemoUserItem {
  id: number;
  role: string;
  title: string;
  name: string;
  avatarUrl: string;
}

export default function Login({ onLoginSuccess }: LoginProps) {
  const [error, setError] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState<boolean>(false);
  const [loadingRole, setLoadingRole] = React.useState<string | null>(null);
  const [demoUsers, setDemoUsers] = React.useState<DemoUserItem[]>([]);

  // Default fallback demo catalog in case network is down
  const defaultDemoCatalog: DemoUserItem[] = [
    { id: 1, role: 'DIRECTOR', title: 'Director General', name: 'Gonzalo Alfaro (Demo)', avatarUrl: '' },
    { id: 2, role: 'MANAGER', title: 'Coordinador de Proyecto', name: 'Rodrigo Gómez (Demo)', avatarUrl: '' },
    { id: 3, role: 'FINANCE', title: 'Responsable de Finanzas', name: 'Karla Martínez (Demo)', avatarUrl: '' },
    { id: 4, role: 'AUDITOR', title: 'Auditor Externo', name: 'Andrés Peña (Demo)', avatarUrl: '' },
    { id: 5, role: 'FINANCIADOR', title: 'Oficial de Cooperación', name: 'Representante USAID (Demo)', avatarUrl: '' },
  ];

  const fetchDemoCatalog = React.useCallback(() => {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000);

    fetch('/api/auth/demo-users', { signal: controller.signal })
      .then(res => {
        clearTimeout(timeoutId);
        if (!res.ok) throw new Error('Error al cargar catálogo demo');
        return res.json();
      })
      .then(data => {
        if (Array.isArray(data) && data.length > 0) {
          setDemoUsers(data);
        } else {
          setDemoUsers(defaultDemoCatalog);
        }
      })
      .catch(err => {
        clearTimeout(timeoutId);
        console.warn('Uso de catálogo demo local:', err.message);
        setDemoUsers(defaultDemoCatalog);
      });
  }, []);

  React.useEffect(() => {
    fetchDemoCatalog();
  }, [fetchDemoCatalog]);

  const handleGoogleLogin = async () => {
    setLoading(true);
    setError(null);
    try {
      const { supabase } = await import('../lib/supabase.ts');
      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: window.location.origin,
        },
      });
      if (error) throw error;
    } catch (err: any) {
      console.error('Google Sign In Error:', err);
      setError('No se pudo completar el inicio de sesión de Google. Intente nuevamente.');
      setLoading(false);
    }
  };

  const handleDemoLogin = async (user: DemoUserItem) => {
    setLoading(true);
    setLoadingRole(user.role);
    setError(null);

    const controller = new AbortController();
    const timeoutId = setTimeout(() => {
      controller.abort();
    }, 5000); // 5-second strict timeout for UX-01

    try {
      const res = await fetch('/api/auth/demo-session', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ role: user.role }),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(errorData.error || `Error del servidor (${res.status})`);
      }

      const data = await res.json();
      if (!data.token || !data.user) {
        throw new Error('Respuesta de sesión demo inválida');
      }

      onLoginSuccess(data.token, {
        name: data.user.name,
        email: data.user.email,
        role: data.user.role as UserRole,
      });
    } catch (e: any) {
      clearTimeout(timeoutId);
      console.error('Error al iniciar sesión demo:', e);
      if (e.name === 'AbortError') {
        setError('Tiempo de espera agotado al conectar con el servidor demo. Por favor intente de nuevo.');
      } else {
        setError(e.message || 'No fue posible iniciar la sesión demo seleccionada.');
      }
    } finally {
      setLoading(false);
      setLoadingRole(null);
    }
  };

  const activeCatalog = demoUsers.length > 0 ? demoUsers : defaultDemoCatalog;

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
          <div id="login-error-alert" className="bg-red-50 border-l-4 border-red-500 p-2.5 rounded-r flex items-center justify-between text-red-700 text-xs font-sans">
            <div className="flex items-center space-x-2">
              <ShieldAlert className="w-4 h-4 flex-shrink-0" />
              <span>{error}</span>
            </div>
            <button
              onClick={() => setError(null)}
              className="text-red-500 hover:text-red-700 text-[10px] font-bold underline ml-2 cursor-pointer"
            >
              Reintentar
            </button>
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
            <span>{loading && !loadingRole ? 'Conectando...' : 'Acceder con Google Auth'}</span>
          </button>

          <div className="relative flex py-1 items-center">
            <div className="flex-grow border-t border-slate-200"></div>
            <span className="flex-shrink mx-3 text-slate-400 text-[10px] uppercase font-mono tracking-wider">O probar con un rol demo</span>
            <div className="flex-grow border-t border-slate-200"></div>
          </div>

          {/* Quick Demo Accounts for RBAC Simulation */}
          <div id="demo-roles-panel" className="space-y-2">
            {/* Director occupying full width */}
            {activeCatalog.filter(u => u.role === 'DIRECTOR').map(u => (
              <button
                key={u.role}
                onClick={() => handleDemoLogin(u)}
                disabled={loading}
                className="w-full flex items-center justify-between p-2.5 bg-slate-50 hover:bg-slate-100/80 border border-slate-200 rounded-lg transition-all text-left cursor-pointer group disabled:opacity-60"
              >
                <div className="flex items-center space-x-2.5">
                  <div className="w-8 h-8 bg-emerald-50 text-emerald-600 rounded flex items-center justify-center border border-emerald-100 flex-shrink-0">
                    {loadingRole === u.role ? (
                      <RefreshCw className="w-4.5 h-4.5 animate-spin" />
                    ) : (
                      <Award className="w-4.5 h-4.5" />
                    )}
                  </div>
                  <div>
                    <div className="font-sans font-bold text-xs text-slate-800">{u.name}</div>
                    <div className="text-[10px] font-sans text-slate-400">{u.title}</div>
                  </div>
                </div>
                <span className="text-[9px] font-mono font-bold bg-emerald-50 text-emerald-700 border border-emerald-100 px-1.5 py-0.5 rounded">
                  {loadingRole === u.role ? 'Iniciando...' : 'DIRECTOR'}
                </span>
              </button>
            ))}

            {/* Grid of 2 columns for other roles */}
            <div className="grid grid-cols-2 gap-2">
              {activeCatalog.filter(u => u.role !== 'DIRECTOR').map(u => {
                let Icon = Eye;
                let bgClass = "bg-slate-50 text-slate-600 border-slate-100";
                let labelClass = "bg-slate-50 text-slate-700 border-slate-100";
                
                if (u.role === 'MANAGER') {
                  Icon = FolderGit2;
                  bgClass = "bg-blue-50 text-blue-600 border-blue-100";
                  labelClass = "bg-blue-50 text-blue-700 border-blue-100";
                } else if (u.role === 'FINANCE') {
                  Icon = CreditCard;
                  bgClass = "bg-rose-50 text-rose-600 border-rose-100";
                  labelClass = "bg-rose-50 text-rose-700 border-rose-100";
                } else if (u.role === 'AUDITOR') {
                  Icon = Eye;
                  bgClass = "bg-indigo-50 text-indigo-600 border-indigo-100";
                  labelClass = "bg-indigo-50 text-indigo-700 border-indigo-100";
                } else if (u.role === 'FINANCIADOR') {
                  Icon = Globe;
                  bgClass = "bg-amber-50 text-amber-600 border-amber-100";
                  labelClass = "bg-amber-50 text-amber-700 border-amber-100";
                }

                const isThisLoading = loadingRole === u.role;

                return (
                  <button
                    key={u.role}
                    onClick={() => handleDemoLogin(u)}
                    disabled={loading}
                    className="flex flex-col justify-between p-2.5 bg-slate-50 hover:bg-slate-100/80 border border-slate-200 rounded-lg transition-all text-left cursor-pointer group space-y-2 disabled:opacity-60"
                  >
                    <div className="flex items-center space-x-2">
                      <div className={`w-7 h-7 rounded flex items-center justify-center border flex-shrink-0 ${bgClass}`}>
                        {isThisLoading ? (
                          <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                        ) : (
                          <Icon className="w-3.5 h-3.5" />
                        )}
                      </div>
                      <div className="overflow-hidden">
                        <div className="font-sans font-bold text-[11px] text-slate-800 truncate">{u.name}</div>
                        <div className="text-[9px] font-sans text-slate-400 truncate">{u.title}</div>
                      </div>
                    </div>
                    <span className={`text-[8px] font-mono font-bold border px-1.5 py-0.2 rounded self-start ${labelClass}`}>
                      {isThisLoading ? 'Accediendo...' : u.role}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* Footer info (ARCH-01 resolved: no outdated Cloud SQL / Firebase mentions) */}
        <div className="text-center text-[9px] font-mono text-slate-400">
          PROYECTY v1.0 • Plataforma Institucional SaaS
        </div>

      </div>
    </div>
  );
}
