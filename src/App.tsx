import React from 'react';
import Login from './components/Login.tsx';
import Sidebar from './components/Sidebar.tsx';
import Topbar from './components/Topbar.tsx';
import Dashboard from './components/Dashboard.tsx';
import Portfolio from './components/Portfolio.tsx';
import ProjectDetail from './components/ProjectDetail.tsx';
import AuditTrail from './components/AuditTrail.tsx';
import UsersManager from './components/UsersManager.tsx';
import Reports from './components/Reports.tsx';
import ExpenseApprovalDashboard from './components/ExpenseApprovalDashboard.tsx';
import ErrorBoundary from './components/common/ErrorBoundary.tsx';
import { Project, ActivityLog, UserRole } from './types.ts';
import { hasPermission } from './lib/rbac.ts';
import { LayoutDashboard, FolderGit2, FileSpreadsheet, History, Users, CalendarDays, DollarSign } from 'lucide-react';
import GlobalAgenda from './components/GlobalAgenda.tsx';
import Settings from './components/Settings.tsx';
import UpgradeModal from './components/billing/UpgradeModal.tsx';
import ExpensesDashboard from './components/expenses/ExpensesDashboard.tsx';
import AuditLogsDashboard from './components/audit/AuditLogsDashboard.tsx';
import ReportsDashboard from './components/reports/ReportsDashboard.tsx';

import { onAuthFailure, clearClientSession, apiFetch } from './lib/api-client.ts';
import { AlertTriangle, Clock, Shield } from 'lucide-react';

export default function App() {
  const [token, setToken] = React.useState<string | null>(() => localStorage.getItem('proyecty_token'));
  const [currentUser, setCurrentUser] = React.useState<{ name: string; email: string; role: UserRole; tenantId?: string | number; uid?: string } | null>(() => {
    const cached = localStorage.getItem('proyecty_user');
    return cached ? JSON.parse(cached) : null;
  });

  const [sessionNotice, setSessionNotice] = React.useState<string | null>(null);
  const [showUpgradeModal, setShowUpgradeModal] = React.useState(false);
  const [upgradeMessage, setUpgradeMessage] = React.useState('');

  // Subscribe to centralized API client auth failure events
  React.useEffect(() => {
    const unsubscribe = onAuthFailure((reason, message) => {
      if (reason === 'SESSION_EXPIRED') {
        handleLogout();
        setSessionNotice(message || 'Tu sesión ha expirado o no es válida. Por favor inicia sesión nuevamente.');
      } else if (reason === 'USER_SUSPENDED') {
        handleLogout();
        setSessionNotice(message || 'Acceso denegado: Tu cuenta ha sido suspendida.');
      } else if (reason === 'UPGRADE_REQUIRED') {
        setUpgradeMessage(message || 'Esta funcionalidad requiere un plan superior.');
        setShowUpgradeModal(true);
      }
    });

    return () => {
      unsubscribe();
    };
  }, []);

  const syncSessionWithBackend = async (accessToken: string) => {
    try {
      const res = await apiFetch('/api/auth/me', {
        headers: { 'Authorization': `Bearer ${accessToken}` },
        skipAuth: false,
      });
      if (res.ok) {
        const data = await res.json();
        const email = data.email || '';
        const name = data.name || email.split('@')[0] || 'Usuario';
        handleLoginSuccess(accessToken, { 
          name, 
          email, 
          role: data.role as UserRole, 
          tenantId: data.tenantId,
          uid: data.uid 
        });
      } else {
        handleLogout(false);
      }
    } catch (err) {
      handleLogout(false);
    }
  };

  React.useEffect(() => {
    // 1. INITIAL_SESSION: If token exists locally, validate it against /api/auth/me
    const initialToken = localStorage.getItem('proyecty_token');
    if (initialToken) {
      syncSessionWithBackend(initialToken);
    }

    // 2. Supabase auth listener for OAuth events (SIGNED_IN, TOKEN_REFRESHED, SIGNED_OUT)
    let isMounted = true;
    import('./lib/supabase.ts')
      .then(({ supabase }) => {
        if (!isMounted) return;
        const { data: authListener } = supabase.auth.onAuthStateChange(async (event, session) => {
          if (!isMounted) return;

          if (session && (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED' || event === 'USER_UPDATED')) {
            await syncSessionWithBackend(session.access_token);
          } else if (event === 'SIGNED_OUT') {
            // SIGNED_OUT from Supabase should NOT destroy a valid backend/demo token.
            // Check if existing local token is still valid via /api/auth/me
            const currentToken = localStorage.getItem('proyecty_token');
            if (currentToken) {
              await syncSessionWithBackend(currentToken);
            } else {
              handleLogout(false);
            }
          }
        });

        return () => {
          authListener?.subscription?.unsubscribe();
        };
      })
      .catch((err) => {
        console.warn('Supabase client initialization skipped or failed:', err);
      });

    return () => {
      isMounted = false;
    };
  }, []);

  // Navigation states with session persistence
  const [currentTab, setCurrentTabState] = React.useState<string>(() => {
    return sessionStorage.getItem('proyecty_current_tab') || 'dashboard';
  });
  const [selectedProjectId, setSelectedProjectIdState] = React.useState<number | null>(() => {
    const saved = sessionStorage.getItem('proyecty_selected_project_id');
    return saved ? Number(saved) : null;
  });

  const setTab = React.useCallback((tab: string) => {
    setCurrentTabState(tab);
    sessionStorage.setItem('proyecty_current_tab', tab);
  }, []);

  const setSelectedProjectId = React.useCallback((id: number | null) => {
    setSelectedProjectIdState(id);
    if (id !== null) {
      sessionStorage.setItem('proyecty_selected_project_id', String(id));
    } else {
      sessionStorage.removeItem('proyecty_selected_project_id');
    }
  }, []);

  // Dynamic database lists
  const [auditLogs, setAuditLogs] = React.useState<ActivityLog[]>([]);
  
  const [isLoadingProjects, setIsLoadingProjects] = React.useState(false);
  const [isLoadingLogs, setIsLoadingLogs] = React.useState(false);

  React.useEffect(() => {
    if (token) {
      fetchAuditLogs();
    }
  }, [token, currentTab]);

  const fetchAuditLogs = async () => {
    if (!token) return;
    setIsLoadingLogs(true);
    try {
      const res = await apiFetch('/api/activity-logs');
      if (res.ok) {
        const data = await res.json();
        const items = Array.isArray(data) ? data : (Array.isArray(data?.data) ? data.data : []);
        setAuditLogs(items);
      }
    } catch (err) {
      console.error('Error fetching activity logs:', err);
    } finally {
      setIsLoadingLogs(false);
    }
  };

  const handleLoginSuccess = async (
    userToken: string, 
    userInfo?: { name: string; email: string; role: UserRole; tenantId?: string | number; uid?: string },
    resetNavigation: boolean = false
  ) => {
    localStorage.removeItem('user_role');
    localStorage.removeItem('auth_user');
    localStorage.setItem('proyecty_token', userToken);

    try {
      const res = await apiFetch('/api/auth/me', {
        headers: { 'Authorization': `Bearer ${userToken}` },
        skipAuth: false,
      });

      if (res.ok) {
        const data = await res.json();
        const email = data.email || userInfo?.email || '';
        const name = data.name || userInfo?.name || email.split('@')[0] || 'Usuario';
        const authoritativeUser = {
          name,
          email,
          role: data.role as UserRole,
          tenantId: data.tenantId,
          uid: data.uid || userInfo?.uid,
        };
        localStorage.setItem('proyecty_user', JSON.stringify(authoritativeUser));
        setToken(userToken);
        setCurrentUser(authoritativeUser);
        setSessionNotice(null);
        if (resetNavigation) {
          setTab('dashboard');
          setSelectedProjectId(null);
        }
      } else if (userInfo) {
        localStorage.setItem('proyecty_user', JSON.stringify(userInfo));
        setToken(userToken);
        setCurrentUser(userInfo);
        setSessionNotice(null);
        if (resetNavigation) {
          setTab('dashboard');
          setSelectedProjectId(null);
        }
      } else {
        handleLogout(false);
      }
    } catch {
      if (userInfo) {
        localStorage.setItem('proyecty_user', JSON.stringify(userInfo));
        setToken(userToken);
        setCurrentUser(userInfo);
        setSessionNotice(null);
        if (resetNavigation) {
          setTab('dashboard');
          setSelectedProjectId(null);
        }
      } else {
        handleLogout(false);
      }
    }
  };

  const handleLogout = (shouldSignOutSupabase: boolean = true) => {
    sessionStorage.removeItem('proyecty_current_tab');
    sessionStorage.removeItem('proyecty_selected_project_id');
    clearClientSession();
    setToken(null);
    setCurrentUser(null);
    if (shouldSignOutSupabase) {
      import('./lib/supabase.ts')
        .then(({ supabase }) => {
          supabase.auth.signOut().catch(() => {});
        })
        .catch(() => {});
    }
  };


  const handleRoleSwitch = (newRole: UserRole) => {
    if (!currentUser || !token) return;
    
    // Switch on-the-fly inside state & local storage
    const updatedUser = { ...currentUser, role: newRole };
    
    // If it's a demo token, switch token suffix to let backend sync roles correctly
    let updatedToken = token;
    if (token.startsWith('demo-uid-')) {
       const uidMatch = token.match(/demo-uid-(.*?)(?:-role-|$)/);
       if (uidMatch) {
         updatedToken = `demo-uid-${uidMatch[1]}-role-${newRole.toUpperCase()}`;
       }
    } else if (token.startsWith('demo-')) {
       updatedToken = `demo-${newRole.toLowerCase()}`;
    }

    localStorage.setItem('proyecty_token', updatedToken);
    localStorage.setItem('proyecty_user', JSON.stringify(updatedUser));
    
    setToken(updatedToken);
    setCurrentUser(updatedUser);
    
    // Force a small reload to trigger database synchronization
    setTimeout(() => {
      fetchAuditLogs();
    }, 100);
  };


  const handleLogActivity = async () => {
    // Reload database datasets after a write activity
    fetchAuditLogs();
  };

  if (!token || !currentUser) {
    return <Login onLoginSuccess={(tok, usr) => handleLoginSuccess(tok, usr, true)} sessionNotice={sessionNotice} />;
  }

  // Find the selected project name for the Topbar breadcrumb
  const selectedProjectName = undefined;

  const isTrialTenant = currentUser?.email === 'mirosromeroc@gmail.com' || (currentUser?.tenantId && String(currentUser.tenantId).includes('VOSERDEM'));

  return (
    <div id="proyecty-app-shell" className="flex bg-[#f8f9fc] min-h-screen overflow-x-hidden">
      
      {/* Sidebar Navigation */}
      <Sidebar
        currentTab={currentTab}
        setTab={(tab) => {
          setTab(tab);
          setSelectedProjectId(null);
        }}
        currentUser={currentUser}
        onLogout={handleLogout}
        onRoleSwitch={handleRoleSwitch}
        isRealSession={token ? !token.startsWith('demo-') : false}
      />

      {/* Main Panel Content */}
      <div className="flex-1 flex flex-col min-h-screen overflow-y-auto">
        
        {/* Topbar navigation indicators */}
        <Topbar
          currentTab={currentTab}
          selectedProjectName={selectedProjectName}
          onClearSelectedProject={() => setSelectedProjectId(null)}
          currentUser={currentUser}
          onLogout={handleLogout}
          onRoleSwitch={handleRoleSwitch}
        />

        {/* Trial Restriction Notice Banner */}
        {isTrialTenant && (
          <div id="trial-evaluation-banner" className="bg-amber-500/10 border-b border-amber-500/20 px-6 py-2 flex items-center justify-between text-xs text-amber-900">
            <div className="flex items-center space-x-2">
              <Clock className="w-4 h-4 text-amber-600 flex-shrink-0" />
              <span><strong>Evaluación Privada VOSERDEM:</strong> Vigencia hasta el 24 de septiembre de 2026 (Capacidad: máx. 6 proyectos).</span>
            </div>
            <div className="flex items-center space-x-1.5 text-[11px] text-amber-800 hidden md:flex">
              <Shield className="w-3.5 h-3.5 text-amber-600 flex-shrink-0" />
              <span>Entorno de evaluación: absténgase de cargar datos personales sensibles o información bancaria real.</span>
            </div>
          </div>
        )}

        {/* Dynamic Route Screen Swapper */}
        <main className="flex-grow pb-20 md:pb-0">
          <ErrorBoundary moduleName="Vista Principal">
            {selectedProjectId !== null ? (
              <ProjectDetail
                projectId={selectedProjectId}
                userRole={currentUser.role}
                onBack={() => {
                  setSelectedProjectId(null);
                }}
                onLogActivity={handleLogActivity}
                token={token}
              />
            ) : (
            <div key={`${currentUser.role}-${currentTab}`}>
              {currentTab === 'dashboard' && hasPermission(currentUser.role, 'canViewDashboard') && (
                <Dashboard
                  token={token}
                  onSelectProject={(id) => setSelectedProjectId(id)}
                />
              )}

              {currentTab === 'portfolio' && hasPermission(currentUser.role, 'canViewPortfolio') && (
                <Portfolio
                  token={token}
                  userRole={currentUser.role}
                  onSelectProject={(id) => setSelectedProjectId(id)}
                  onActivityLogged={handleLogActivity}
                />
              )}

              {currentTab === 'global-agenda' && hasPermission(currentUser.role, 'canViewPortfolio') && (
                <GlobalAgenda
                  token={token}
                />
              )}

              {currentTab === 'audit' && hasPermission(currentUser.role, 'canViewAudit') && (
                <AuditLogsDashboard
                  token={token}
                  userRole={currentUser.role}
                />
              )}

              {currentTab === 'reports' && hasPermission(currentUser.role, 'canViewReports') && (
                <ReportsDashboard
                  token={token}
                  userRole={currentUser.role}
                />
              )}

              {currentTab === 'gastos' && (
                <ExpensesDashboard
                  token={token}
                  userRole={currentUser.role}
                  currentUser={currentUser}
                />
              )}

              {currentTab === 'users' && hasPermission(currentUser.role, 'canViewUsers') && (
                <UsersManager
                  token={token}
                  currentUser={currentUser}
                  onLogActivity={handleLogActivity}
                />
              )}

              {currentTab === 'settings' && hasPermission(currentUser.role, 'canManageBilling') && (
                <Settings token={token} />
              )}
            </div>
          )}
          </ErrorBoundary>
        </main>
      </div>

      {/* Global Modals */}
      <UpgradeModal 
        isOpen={showUpgradeModal} 
        onClose={() => setShowUpgradeModal(false)} 
        message={upgradeMessage}
      />

      {/* Mobile Bottom Navigation */}
      <div className="md:hidden fixed bottom-0 left-0 right-0 bg-white border-t border-slate-200 flex items-center justify-around z-50 h-16 shadow-[0_-4px_10px_rgba(0,0,0,0.05)] pb-safe">
        {['dashboard', 'portfolio', 'global-agenda', 'reports', 'gastos', 'audit', 'users'].filter(id => {
          if (id === 'dashboard') return hasPermission(currentUser.role, 'canViewDashboard');
          if (id === 'portfolio') return hasPermission(currentUser.role, 'canViewPortfolio');
          if (id === 'global-agenda') return hasPermission(currentUser.role, 'canViewPortfolio');
          if (id === 'reports') return hasPermission(currentUser.role, 'canViewReports');
          if (id === 'gastos') return hasPermission(currentUser.role, 'canApproveExpenses');
          if (id === 'audit') return hasPermission(currentUser.role, 'canViewAudit');
          if (id === 'users') return hasPermission(currentUser.role, 'canViewUsers');
          return false;
        }).map(id => {
          let Icon = LayoutDashboard;
          let label = 'Inicio';
          if (id === 'portfolio') { Icon = FolderGit2; label = 'Proyectos'; }
          if (id === 'global-agenda') { Icon = CalendarDays; label = 'Agenda'; }
          if (id === 'reports') { Icon = FileSpreadsheet; label = 'Reportes'; }
          if (id === 'gastos') { Icon = DollarSign; label = 'Gastos'; }
          if (id === 'audit') { Icon = History; label = 'Bitácora'; }
          if (id === 'users') { Icon = Users; label = 'Usuarios'; }
          const isActive = currentTab === id && selectedProjectId === null;
          return (
            <button
              key={id}
              onClick={() => { setTab(id); setSelectedProjectId(null); }}
              className={`flex flex-col items-center justify-center w-full h-full space-y-1 ${isActive ? 'text-[#2563EB]' : 'text-slate-400 hover:text-slate-600'}`}
            >
              <Icon className={`w-5 h-5 ${isActive ? 'scale-110 transition-transform' : ''}`} />
              <span className={`text-[10px] font-medium ${isActive ? 'font-bold' : ''}`}>{label}</span>
            </button>
          )
        })}
      </div>
    </div>
  );
}
