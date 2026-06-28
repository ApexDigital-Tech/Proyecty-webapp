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

export default function App() {
  const [token, setToken] = React.useState<string | null>(() => localStorage.getItem('proyecty_token'));
  const [currentUser, setCurrentUser] = React.useState<{ name: string; email: string; role: UserRole; tenantId?: string; uid?: string } | null>(() => {
    const cached = localStorage.getItem('proyecty_user');
    return cached ? JSON.parse(cached) : null;
  });

  React.useEffect(() => {
    const originalFetch = window.fetch;
    window.fetch = async (...args) => {
      const response = await originalFetch(...args);
      if (response.status === 403) {
        try {
          const cloned = response.clone();
          const data = await cloned.json();
          if (data?.code === 'USER_SUSPENDED') {
            handleLogout();
            alert("Acceso denegado: Usuario suspendido");
          }
        } catch(e) {}
      }
      return response;
    };
    return () => {
      window.fetch = originalFetch;
    };
  }, []);

  React.useEffect(() => {
    import('./lib/supabase.ts').then(({ supabase }) => {
      supabase.auth.getSession().then(({ data: { session } }) => {
        if (session) {
          const u = session.user;
          const email = u.email || '';
          const name = u.user_metadata?.full_name || email.split('@')[0] || 'User';
          handleLoginSuccess(session.access_token, { name, email, role: 'MANAGER' });
        }
      });

      supabase.auth.onAuthStateChange((_event, session) => {
        if (session) {
          const u = session.user;
          const email = u.email || '';
          const name = u.user_metadata?.full_name || email.split('@')[0] || 'User';
          handleLoginSuccess(session.access_token, { name, email, role: 'MANAGER' });
        } else {
          handleLogout();
        }
      });
    });
  }, []);

  // Navigation states
  const [currentTab, setTab] = React.useState<string>('dashboard');
  const [selectedProjectId, setSelectedProjectId] = React.useState<number | null>(null);

  // Dynamic database lists
  const [auditLogs, setAuditLogs] = React.useState<ActivityLog[]>([]);
  
  const [isLoadingProjects, setIsLoadingProjects] = React.useState(false);
  const [isLoadingLogs, setIsLoadingLogs] = React.useState(false);

  // Load activity logs and validate session when authenticated or changing tabs
  React.useEffect(() => {
    if (token) {
      fetch('/api/auth/me', { headers: { Authorization: `Bearer ${token}` } })
        .then(async (res) => {
          if (res.status === 403 || res.status === 401) {
            try {
              const data = await res.json();
              if (data?.code === 'USER_SUSPENDED' || res.status === 401) {
                handleLogout();
                alert("Acceso denegado: Sesión inválida o usuario suspendido");
              }
            } catch(e) {}
          }
        })
        .catch(() => {});
      
      fetchAuditLogs();
    }
  }, [token, currentTab]);

  const fetchAuditLogs = async () => {
    if (!token) return;
    setIsLoadingLogs(true);
    try {
      const res = await fetch('/api/activity-logs', {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setAuditLogs(data);
      }
    } catch (err) {
      console.error('Error fetching activity logs:', err);
    } finally {
      setIsLoadingLogs(false);
    }
  };

  const handleLoginSuccess = (userToken: string, userInfo: { name: string; email: string; role: UserRole }) => {
    localStorage.setItem('proyecty_token', userToken);
    localStorage.setItem('proyecty_user', JSON.stringify(userInfo));
    setToken(userToken);
    setCurrentUser(userInfo);
    setTab('dashboard');
    setSelectedProjectId(null);
  };

  const handleLogout = () => {
    localStorage.removeItem('proyecty_token');
    localStorage.removeItem('proyecty_user');
    setToken(null);
    setCurrentUser(null);
  };

  const handleRoleSwitch = (newRole: UserRole) => {
    if (!currentUser || !token) return;
    
    // Switch on-the-fly inside state & local storage
    const updatedUser = { ...currentUser, role: newRole };
    
    // If it's a demo token, switch token suffix to let backend sync roles correctly
    let updatedToken = token;
    if (token.startsWith('demo-uid-')) {
       const uidMatch = token.match(/demo-uid-([^-]+)/);
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
    return <Login onLoginSuccess={handleLoginSuccess} />;
  }

  // Find the selected project name for the Topbar breadcrumb
  const selectedProjectName = undefined;

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
            <>
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
                <AuditTrail
                  logs={auditLogs}
                  onRefresh={fetchAuditLogs}
                  isLoading={isLoadingLogs}
                />
              )}

              {currentTab === 'reports' && hasPermission(currentUser.role, 'canViewReports') && (
                <Reports
                  token={token}
                />
              )}

              {currentTab === 'gastos' && (
                <ExpenseApprovalDashboard
                  token={token}
                  userRole={currentUser.role}
                />
              )}

              {currentTab === 'users' && hasPermission(currentUser.role, 'canViewUsers') && (
                <UsersManager
                  token={token}
                  currentUser={currentUser}
                  onLogActivity={handleLogActivity}
                />
              )}
            </>
          )}
          </ErrorBoundary>
        </main>
      </div>

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
