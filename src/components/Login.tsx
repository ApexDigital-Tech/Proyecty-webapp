import React, { useState, useEffect, useCallback } from 'react';
import { LogIn, ShieldAlert, FolderGit2, Mail, CheckCircle2, Shield, HelpCircle, ArrowRight, RefreshCw, Award, CreditCard, Eye, Globe } from 'lucide-react';
import { UserRole } from '../types.ts';

interface LoginProps {
  onLoginSuccess: (token: string, userInfo: { name: string; email: string; role: UserRole; tenantId?: string | number }) => void;
  sessionNotice?: string | null;
}

interface DemoUserItem {
  id: number;
  role: string;
  title: string;
  name: string;
  avatarUrl: string;
}

export default function Login({ onLoginSuccess, sessionNotice }: LoginProps) {
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [emailInput, setEmailInput] = useState<string>('');
  const [emailSent, setEmailSent] = useState<boolean>(false);
  const [loadingEmail, setLoadingEmail] = useState<boolean>(false);
  const [showPrivacyModal, setShowPrivacyModal] = useState<boolean>(false);
  const [showSupportModal, setShowSupportModal] = useState<boolean>(false);

  // Protected internal demo path check (strictly dependent on server-side enablement)
  const isInternalDemo = typeof window !== 'undefined' && window.location.pathname === '/internal-demo';

  const [loadingRole, setLoadingRole] = useState<string | null>(null);
  const [demoUsers, setDemoUsers] = useState<DemoUserItem[]>([]);

  const fetchDemoCatalog = useCallback(() => {
    if (!isInternalDemo) return;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000);

    fetch('/api/auth/demo-users', { signal: controller.signal })
      .then(res => {
        clearTimeout(timeoutId);
        if (!res.ok) {
          // If server disabled demo mode, keep list empty
          setDemoUsers([]);
          return [];
        }
        return res.json();
      })
      .then(data => {
        if (Array.isArray(data) && data.length > 0) {
          setDemoUsers(data);
        } else {
          setDemoUsers([]);
        }
      })
      .catch(() => {
        clearTimeout(timeoutId);
        setDemoUsers([]);
      });
  }, [isInternalDemo]);

  useEffect(() => {
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
      setError('No se pudo completar el inicio de sesión con Google. Intente nuevamente.');
      setLoading(false);
    }
  };

  const handleEmailMagicLink = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!emailInput.trim() || !emailInput.includes('@')) {
      setError('Por favor ingrese un correo electrónico válido.');
      return;
    }

    setLoadingEmail(true);
    setError(null);
    try {
      const { supabase } = await import('../lib/supabase.ts');
      const { error } = await supabase.auth.signInWithOtp({
        email: emailInput.trim().toLowerCase(),
        options: {
          emailRedirectTo: window.location.origin,
        },
      });
      if (error) throw error;
      setEmailSent(true);
    } catch (err: any) {
      console.error('Email Magic Link Error:', err);
      setError(err.message || 'No fue posible enviar el enlace seguro. Verifique su correo o intente con Google.');
    } finally {
      setLoadingEmail(false);
    }
  };

  const handleDemoLogin = async (user: DemoUserItem) => {
    setLoading(true);
    setLoadingRole(user.role);
    setError(null);

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000);

    try {
      const res = await fetch('/api/auth/demo-session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
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
        tenantId: data.user.tenantId,
      });
    } catch (e: any) {
      clearTimeout(timeoutId);
      setError(e.message || 'No fue posible iniciar la sesión interna seleccionada.');
    } finally {
      setLoading(false);
      setLoadingRole(null);
    }
  };

  return (
    <div id="login-container" className="min-h-screen flex items-center justify-center bg-[#0F172A] p-4 sm:p-6 select-none font-sans">
      <div id="login-card" className="w-full max-w-md bg-white rounded-2xl shadow-2xl overflow-hidden border border-slate-100 flex flex-col justify-between p-6 sm:p-8 space-y-6">
        
        {/* Header & Official Branding */}
        <div className="text-center space-y-2">
          <div className="mx-auto w-14 h-14 bg-gradient-to-br from-blue-50 to-indigo-50 text-blue-600 rounded-xl flex items-center justify-center border border-blue-100 shadow-sm">
            <FolderGit2 id="logo-icon" className="w-7 h-7" />
          </div>
          <h1 id="platform-title" className="text-2xl font-extrabold tracking-tight text-slate-900">
            PROYECTY
          </h1>
          <p id="platform-subtitle" className="text-xs font-medium text-slate-500 max-w-xs mx-auto">
            Plataforma de Control de Proyectos, Convenios, Presupuestos y Rendición de Cuentas
          </p>
        </div>

        {/* Notices & Alerts */}
        {sessionNotice && (
          <div id="session-notice-alert" className="bg-amber-50 border-l-4 border-amber-500 p-3 rounded-r-lg flex items-start space-x-2 text-amber-900 text-xs shadow-sm">
            <ShieldAlert className="w-4 h-4 flex-shrink-0 text-amber-600 mt-0.5" />
            <span className="leading-relaxed">{sessionNotice}</span>
          </div>
        )}

        {error && (
          <div id="login-error-alert" className="bg-rose-50 border-l-4 border-rose-500 p-3 rounded-r-lg flex items-start justify-between text-rose-800 text-xs shadow-sm">
            <div className="flex items-start space-x-2">
              <ShieldAlert className="w-4 h-4 flex-shrink-0 text-rose-600 mt-0.5" />
              <span className="leading-relaxed">{error}</span>
            </div>
            <button
              onClick={() => setError(null)}
              className="text-rose-600 hover:text-rose-800 text-[11px] font-bold underline ml-2 cursor-pointer flex-shrink-0"
            >
              Cerrar
            </button>
          </div>
        )}

        {/* Google OAuth Section (Primary Action) */}
        <div className="space-y-4">
          <button
            id="google-signin-btn"
            onClick={handleGoogleLogin}
            disabled={loading || loadingEmail}
            className="w-full flex items-center justify-center space-x-3 bg-white hover:bg-slate-50 text-slate-700 py-3 px-4 rounded-xl font-semibold text-xs border border-slate-300 shadow-sm transition-all focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 cursor-pointer group hover:border-slate-400"
          >
            <svg className="w-4 h-4 flex-shrink-0" viewBox="0 0 24 24">
              <path
                fill="#4285F4"
                d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v4.51h6.6c-.29 1.52-1.14 2.82-2.4 3.68v3.05h3.88c2.27-2.09 3.66-5.17 3.66-9.17z"
              />
              <path
                fill="#34A853"
                d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.88-3.05c-1.08.72-2.45 1.16-4.05 1.16-3.12 0-5.77-2.1-6.72-4.93H1.25v3.15C3.26 21.36 7.33 24 12 24z"
              />
              <path
                fill="#FBBC05"
                d="M5.28 14.27c-.25-.72-.38-1.49-.38-2.27s.13-1.55.38-2.27V6.58H1.25C.45 8.18 0 9.99 0 12s.45 3.82 1.25 5.42l4.03-3.15z"
              />
              <path
                fill="#EA4335"
                d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.33 0 3.26 2.64 1.25 6.58l4.03 3.15c.95-2.83 3.6-4.98 6.72-4.98z"
              />
            </svg>
            <span className="text-slate-800 font-medium">
              {loading && !loadingRole ? 'Conectando con Google...' : 'Continuar con Google'}
            </span>
          </button>

          {/* Divider */}
          <div className="relative flex py-1 items-center">
            <div className="flex-grow border-t border-slate-200"></div>
            <span className="flex-shrink mx-3 text-slate-400 text-[10px] uppercase font-mono tracking-wider">o continuar con correo</span>
            <div className="flex-grow border-t border-slate-200"></div>
          </div>

          {/* Email Magic Link Section */}
          {emailSent ? (
            <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-xl text-center space-y-2">
              <div className="mx-auto w-8 h-8 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center">
                <CheckCircle2 className="w-5 h-5" />
              </div>
              <p className="text-xs font-semibold text-emerald-900">Enlace de acceso enviado</p>
              <p className="text-[11px] text-emerald-700 leading-relaxed">
                Hemos enviado un enlace seguro de un solo uso a <strong className="font-mono">{emailInput}</strong>. Revise su bandeja de entrada.
              </p>
              <button
                onClick={() => { setEmailSent(false); setEmailInput(''); }}
                className="text-[10px] font-bold text-emerald-800 underline hover:text-emerald-950 mt-1 cursor-pointer"
              >
                Ingresar con otro correo
              </button>
            </div>
          ) : (
            <form onSubmit={handleEmailMagicLink} className="space-y-2">
              <div className="relative">
                <Mail className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
                <input
                  type="email"
                  placeholder="correo@organizacion.org"
                  value={emailInput}
                  onChange={(e) => setEmailInput(e.target.value)}
                  disabled={loading || loadingEmail}
                  className="w-full pl-9 pr-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 placeholder-slate-400 outline-none focus:bg-white focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-all font-mono"
                />
              </div>
              <button
                type="submit"
                disabled={loading || loadingEmail || !emailInput.trim()}
                className="w-full flex items-center justify-center space-x-2 bg-slate-800 hover:bg-slate-900 text-white py-2.5 px-4 rounded-xl font-medium text-xs transition-all disabled:opacity-50 cursor-pointer shadow-sm"
              >
                {loadingEmail ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    <span>Enviando enlace seguro...</span>
                  </>
                ) : (
                  <>
                    <span>Enviar enlace de acceso seguro</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </>
                )}
              </button>
            </form>
          )}

          {/* Internal Demo Panel: ONLY visible on /internal-demo when enabled by server */}
          {isInternalDemo && demoUsers.length > 0 && (
            <div className="pt-4 border-t border-dashed border-amber-300 space-y-3 bg-amber-50/50 p-4 rounded-xl border">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-mono font-bold text-amber-800 uppercase tracking-wider flex items-center space-x-1">
                  <Shield className="w-3 h-3 text-amber-600" />
                  <span>Entorno de Simulación Interna RBAC</span>
                </span>
                <span className="text-[9px] bg-amber-200 text-amber-900 px-1.5 py-0.5 rounded font-mono font-bold">INTERNAL</span>
              </div>

              <div className="space-y-1.5">
                {demoUsers.map(u => (
                  <button
                    key={u.role}
                    onClick={() => handleDemoLogin(u)}
                    disabled={loading}
                    className="w-full flex items-center justify-between p-2 bg-white hover:bg-amber-100/50 border border-amber-200 rounded-lg text-left transition-all cursor-pointer text-xs group disabled:opacity-60"
                  >
                    <div className="flex items-center space-x-2">
                      <span className="font-bold text-slate-800 text-[11px]">{u.name}</span>
                      <span className="text-slate-400 text-[10px]">({u.title})</span>
                    </div>
                    <span className="text-[9px] font-mono font-bold bg-slate-100 text-slate-700 px-1.5 py-0.5 rounded">
                      {loadingRole === u.role ? 'Iniciando...' : u.role}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Institutional Footer & Legal Links */}
        <div className="pt-2 border-t border-slate-100 space-y-2 text-center">
          <div className="flex items-center justify-center space-x-4 text-[11px] text-slate-500">
            <button
              onClick={() => setShowPrivacyModal(true)}
              className="hover:text-blue-600 transition-colors underline cursor-pointer"
            >
              Aviso de Privacidad
            </button>
            <span>•</span>
            <button
              onClick={() => setShowSupportModal(true)}
              className="hover:text-blue-600 transition-colors underline cursor-pointer"
            >
              Centro de Soporte
            </button>
          </div>
          <p className="text-[10px] font-mono text-slate-400">
            PROYECTY v1.5.0 • Plataforma Institucional SaaS
          </p>
        </div>

      </div>

      {/* Privacy Notice Modal */}
      {showPrivacyModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl max-w-lg w-full p-6 space-y-4">
            <div className="flex items-center justify-between border-b pb-3">
              <h3 className="font-bold text-slate-900 text-sm flex items-center space-x-2">
                <Shield className="w-4 h-4 text-blue-600" />
                <span>Aviso de Privacidad y Seguridad Institucional</span>
              </h3>
              <button
                onClick={() => setShowPrivacyModal(false)}
                className="text-slate-400 hover:text-slate-600 text-xs font-bold"
              >
                ✕
              </button>
            </div>
            <div className="text-xs text-slate-600 space-y-2.5 max-h-60 overflow-y-auto leading-relaxed">
              <p>
                <strong>1. Aislamiento Multi-inquilino:</strong> Cada organización y proyecto cuenta con aislamiento lógico estricto (Tenant Isolation). Ninguna entidad externa o tercero puede acceder a datos sin autorización expresa.
              </p>
              <p>
                <strong>2. Autenticación y Criptografía:</strong> Las credenciales y sesiones son procesadas bajo protocolos criptográficos robustos (OAuth 2.0 / AES-256-GCM). No almacenamos contraseñas de terceros.
              </p>
              <p>
                <strong>3. Auditoría de Operaciones:</strong> Toda acción sobre proyectos, presupuestos y desembolsos queda registrada en una bitácora inmutable de auditoría.
              </p>
            </div>
            <div className="text-right pt-2">
              <button
                onClick={() => setShowPrivacyModal(false)}
                className="px-4 py-2 bg-slate-900 text-white rounded-lg text-xs font-semibold hover:bg-slate-800"
              >
                Entendido
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Support Modal */}
      {showSupportModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl max-w-sm w-full p-6 space-y-4 text-center">
            <div className="mx-auto w-10 h-10 bg-blue-50 text-blue-600 rounded-full flex items-center justify-center">
              <HelpCircle className="w-5 h-5" />
            </div>
            <div className="space-y-1">
              <h3 className="font-bold text-slate-900 text-sm">Centro de Soporte PROYECTY</h3>
              <p className="text-xs text-slate-500">
                Para asistencia técnica, incorporación institucional o consultas sobre su cuenta:
              </p>
            </div>
            <div className="bg-slate-50 p-3 rounded-xl border border-slate-200 text-xs font-mono text-slate-800">
              soporte@proyecty.org
            </div>
            <div>
              <button
                onClick={() => setShowSupportModal(false)}
                className="w-full py-2 bg-blue-600 text-white rounded-xl text-xs font-semibold hover:bg-blue-700"
              >
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
