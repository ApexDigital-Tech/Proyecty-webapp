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
import ErrorBoundary from './components/common/ErrorBoundary.tsx';
import { Project, ActivityLog, UserRole } from './types.ts';
import { hasPermission } from './lib/rbac.ts';

export default function App() {
  const [token, setToken] = React.useState<string | null>(() => localStorage.getItem('proyecty_token'));
  const [currentUser, setCurrentUser] = React.useState<{ name: string; email: string; role: UserRole; tenantId?: string } | null>(() => {
    const cached = localStorage.getItem('proyecty_user');
    return cached ? JSON.parse(cached) : null;
  });

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

  // Load activity logs when authenticated
  React.useEffect(() => {
    if (token) {
      fetchAuditLogs();
    }
  }, [token]);

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
    const updatedToken = token.startsWith('demo-') ? `demo-${newRole.toLowerCase()}` : token;
    
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
        />

        {/* Dynamic Route Screen Swapper */}
        <main className="flex-grow">
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
    </div>
  );
}
