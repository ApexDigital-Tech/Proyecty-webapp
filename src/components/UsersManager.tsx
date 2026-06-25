import React from 'react';
import { 
  Users, 
  UserCheck, 
  ShieldAlert, 
  Trash2, 
  Search, 
  RefreshCw, 
  Activity, 
  AlertTriangle,
  CheckCircle2,
  Lock,
  UserCog
} from 'lucide-react';
import { UserRole } from '../types.ts';

interface UserData {
  id: number;
  uid: string;
  email: string;
  name: string;
  role: UserRole;
  avatarUrl?: string;
  createdAt: string;
  activityCount: number;
  lastActive?: string;
  recentActions?: Array<{
    id: number;
    actionDescription: string;
    createdAt: string;
  }>;
}

interface UsersManagerProps {
  token: string;
  currentUser: { name: string; email: string; role: UserRole };
  onLogActivity: (projId: number | null, desc: string) => void;
}

export default function UsersManager({ token, currentUser, onLogActivity }: UsersManagerProps) {
  const [usersList, setUsersList] = React.useState<UserData[]>([]);
  const [isLoading, setIsLoading] = React.useState(false);
  const [searchTerm, setSearchTerm] = React.useState('');
  const [selectedUser, setSelectedUser] = React.useState<UserData | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [success, setSuccess] = React.useState<string | null>(null);
  const [isUpdating, setIsUpdating] = React.useState<number | null>(null);

  const fetchUsers = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/users', {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setUsersList(data);
      } else {
        const errData = await res.json();
        setError(errData.error || 'Error al obtener la lista de usuarios.');
      }
    } catch (err) {
      console.error('Error fetching users:', err);
      setError('Error de conexión al cargar usuarios.');
    } finally {
      setIsLoading(false);
    }
  };

  React.useEffect(() => {
    fetchUsers();
  }, [token]);

  const handleRoleChange = async (userId: number, currentName: string, newRole: UserRole) => {
    setIsUpdating(userId);
    setError(null);
    setSuccess(null);
    try {
      const res = await fetch(`/api/users/${userId}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ role: newRole }),
      });

      if (res.ok) {
        setSuccess(`Rol de ${currentName} actualizado correctamente a ${newRole}.`);
        fetchUsers();
        if (selectedUser && selectedUser.id === userId) {
          setSelectedUser(prev => prev ? { ...prev, role: newRole } : null);
        }
        // Log locally
        onLogActivity(null, `Modificó el rol de acceso del usuario "${currentName}" a ${newRole}`);
      } else {
        const data = await res.json();
        setError(data.error || 'Error al actualizar el rol.');
      }
    } catch (err) {
      setError('Error al actualizar el rol del usuario.');
    } finally {
      setIsUpdating(null);
    }
  };

  const handleDeleteUser = async (userId: number, userName: string) => {
    if (!confirm(`¿Está seguro de que desea eliminar permanentemente al usuario "${userName}"? El usuario perderá todo acceso al sistema.`)) {
      return;
    }

    setError(null);
    setSuccess(null);
    try {
      const res = await fetch(`/api/users/${userId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });

      if (res.ok) {
        setSuccess(`El usuario "${userName}" ha sido eliminado exitosamente.`);
        if (selectedUser?.id === userId) {
          setSelectedUser(null);
        }
        fetchUsers();
        onLogActivity(null, `Eliminó permanentemente al usuario "${userName}" del sistema`);
      } else {
        const data = await res.json();
        setError(data.error || 'Error al eliminar usuario.');
      }
    } catch (err) {
      setError('Error de conexión al eliminar usuario.');
    }
  };

  // Filtered lists
  const filteredUsers = usersList.filter(u => 
    u.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
    u.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
    u.role.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const directorCount = usersList.filter(u => u.role === 'DIRECTOR').length;
  const managerCount = usersList.filter(u => u.role === 'MANAGER').length;
  const financeCount = usersList.filter(u => u.role === 'FINANCE').length;
  const externalCount = usersList.filter(u => u.role === 'AUDITOR' || u.role === 'FINANCIADOR').length;

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      {/* Header and Quick Stats */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-sans font-bold text-slate-900 tracking-tight flex items-center gap-2">
            <UserCog className="w-5 h-5 text-blue-600" />
            Panel de Control de SuperAdmin y Monitoreo
          </h2>
          <p className="text-xs font-sans text-slate-500">
            Administra roles, audita el uso de la plataforma y monitorea las actividades operativas de todo tu equipo de cooperación.
          </p>
        </div>
        <button
          onClick={fetchUsers}
          disabled={isLoading}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-medium rounded border border-slate-200 transition cursor-pointer self-start md:self-auto"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
          Sincronizar Panel
        </button>
      </div>

      {/* Stats Summary Bento Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
        <div className="bg-white p-4 rounded-lg border border-slate-100 shadow-sm flex items-center space-x-3">
          <div className="p-2.5 bg-blue-50 text-blue-600 rounded-lg">
            <Users className="w-5 h-5" />
          </div>
          <div>
            <div className="text-[10px] font-mono tracking-wider uppercase text-slate-400">Usuarios Totales</div>
            <div className="text-xl font-sans font-extrabold text-slate-900">{usersList.length}</div>
          </div>
        </div>

        <div className="bg-white p-4 rounded-lg border border-slate-100 shadow-sm flex items-center space-x-3">
          <div className="p-2.5 bg-emerald-50 text-emerald-600 rounded-lg">
            <UserCheck className="w-5 h-5" />
          </div>
          <div>
            <div className="text-[10px] font-mono tracking-wider uppercase text-slate-400">Directores Operativos</div>
            <div className="text-xl font-sans font-extrabold text-slate-900">{directorCount}</div>
          </div>
        </div>

        <div className="bg-white p-4 rounded-lg border border-slate-100 shadow-sm flex items-center space-x-3">
          <div className="p-2.5 bg-indigo-50 text-indigo-600 rounded-lg">
            <Activity className="w-5 h-5" />
          </div>
          <div>
            <div className="text-[10px] font-mono tracking-wider uppercase text-slate-400">Project Managers / M&E</div>
            <div className="text-xl font-sans font-extrabold text-slate-900">{managerCount}</div>
          </div>
        </div>

        <div className="bg-white p-4 rounded-lg border border-slate-100 shadow-sm flex items-center space-x-3">
          <div className="p-2.5 bg-rose-50 text-rose-600 rounded-lg">
            <ShieldAlert className="w-5 h-5" />
          </div>
          <div>
            <div className="text-[10px] font-mono tracking-wider uppercase text-slate-400">Finanzas y Externos</div>
            <div className="text-xl font-sans font-extrabold text-slate-900">
              {financeCount} <span className="text-xs font-normal text-slate-400 font-mono">({externalCount} ext)</span>
            </div>
          </div>
        </div>
      </div>

      {/* Notifications */}
      {error && (
        <div className="p-3 bg-red-50 border border-red-100 text-red-700 text-xs rounded-md flex items-center space-x-2">
          <AlertTriangle className="w-4 h-4 flex-shrink-0" />
          <span>{error}</span>
        </div>
      )}
      {success && (
        <div className="p-3 bg-emerald-50 border border-emerald-100 text-emerald-700 text-xs rounded-md flex items-center space-x-2">
          <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
          <span>{success}</span>
        </div>
      )}

      {/* Main Workspace Layout (List on Left, Monitor Logs on Right) */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* User Table Card */}
        <div className="lg:col-span-2 bg-white rounded-lg border border-slate-200 shadow-sm overflow-hidden flex flex-col">
          <div className="p-4 border-b border-slate-100 flex flex-col sm:flex-row items-center justify-between gap-3 bg-slate-50/50">
            <span className="text-xs font-bold text-slate-800 font-sans uppercase tracking-wider">
              Registro de Personal Autorizado (RBAC)
            </span>
            <div className="relative w-full sm:w-60">
              <Search className="absolute left-2.5 top-2.5 w-3.5 h-3.5 text-slate-400" />
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Buscar por nombre, email, rol..."
                className="w-full pl-8 pr-3 py-1.5 bg-white border border-slate-200 rounded font-sans text-xs focus:ring-1 focus:ring-blue-500 focus:outline-none placeholder-slate-400 text-slate-700"
              />
            </div>
          </div>

          <div className="overflow-x-auto">
            {isLoading ? (
              <div className="p-12 flex flex-col items-center justify-center space-y-2">
                <RefreshCw className="w-6 h-6 text-blue-500 animate-spin" />
                <span className="text-xs text-slate-500">Cargando datos de seguridad del sistema...</span>
              </div>
            ) : filteredUsers.length === 0 ? (
              <div className="p-12 text-center text-slate-400 text-xs">
                No se encontraron usuarios que coincidan con la búsqueda.
              </div>
            ) : (
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-slate-50/70 border-b border-slate-200">
                    <th className="p-3 text-[10px] font-mono tracking-wider uppercase text-slate-500">Miembro</th>
                    <th className="p-3 text-[10px] font-mono tracking-wider uppercase text-slate-500">Rol Operativo</th>
                    <th className="p-3 text-[10px] font-mono tracking-wider uppercase text-slate-500">Actividad</th>
                    <th className="p-3 text-[10px] font-mono tracking-wider uppercase text-slate-500 text-right">Acción</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredUsers.map((user) => {
                    const isSelected = selectedUser?.id === user.id;
                    const isMe = user.email === currentUser.email;

                    return (
                      <tr 
                        key={user.id} 
                        className={`hover:bg-slate-50/50 transition-colors duration-100 ${
                          isSelected ? 'bg-blue-50/30' : ''
                        }`}
                      >
                        {/* Member Information */}
                        <td className="p-3">
                          <div className="flex items-center space-x-3">
                            <img
                              src={user.avatarUrl || `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(user.name)}`}
                              alt={user.name}
                              className="w-8 h-8 rounded-full border border-slate-200 flex-shrink-0 bg-white"
                            />
                            <div className="overflow-hidden">
                              <div className="flex items-center space-x-1">
                                <button 
                                  onClick={() => setSelectedUser(user)}
                                  className="text-xs font-semibold text-slate-900 font-sans hover:text-blue-600 hover:underline cursor-pointer text-left focus:outline-none"
                                >
                                  {user.name}
                                </button>
                                {isMe && (
                                  <span className="text-[8px] bg-slate-100 text-slate-600 font-bold px-1.5 py-0.2 rounded border border-slate-200">
                                    TÚ
                                  </span>
                                )}
                              </div>
                              <div className="text-[10px] text-slate-400 font-sans truncate">
                                {user.email}
                              </div>
                            </div>
                          </div>
                        </td>

                        {/* Role Status Badge & Dropdown Selector */}
                        <td className="p-3">
                          {isMe ? (
                            <div className="flex items-center space-x-1.5">
                              <span className="text-[10px] font-mono font-bold bg-emerald-500/15 text-emerald-700 border border-emerald-500/20 px-1.5 py-0.5 rounded uppercase">
                                {user.role}
                              </span>
                              <Lock className="w-2.5 h-2.5 text-slate-400" title="No puedes cambiar tu propio rol" />
                            </div>
                          ) : (
                            <select
                              value={user.role}
                              disabled={isUpdating === user.id}
                              onChange={(e) => handleRoleChange(user.id, user.name, e.target.value as UserRole)}
                              className="text-xs font-sans bg-white border border-slate-200 hover:border-slate-300 rounded px-1.5 py-1 focus:outline-none focus:ring-1 focus:ring-blue-500 cursor-pointer text-slate-700 font-medium"
                            >
                              <option value="DIRECTOR">DIRECTOR (Admin Total)</option>
                              <option value="MANAGER">MANAGER (Gestor Proyectos)</option>
                              <option value="FINANCE">FINANCE (Finanzas / Operaciones)</option>
                              <option value="AUDITOR">AUDITOR (Auditoría Lectura)</option>
                              <option value="FINANCIADOR">FINANCIADOR (Donante Lectura)</option>
                            </select>
                          )}
                        </td>

                        {/* Actions Registered Tracker */}
                        <td className="p-3">
                          <button
                            onClick={() => setSelectedUser(user)}
                            className="flex items-center space-x-1 bg-slate-50 hover:bg-slate-100 border border-slate-200 text-slate-700 text-[10px] font-medium font-mono px-2 py-0.5 rounded cursor-pointer"
                          >
                            <Activity className="w-3 h-3 text-blue-500" />
                            <span>{user.activityCount} acciones</span>
                          </button>
                        </td>

                        {/* Action Operations */}
                        <td className="p-3 text-right">
                          <div className="flex items-center justify-end space-x-2">
                            <button
                              onClick={() => setSelectedUser(user)}
                              className="text-[10px] text-blue-600 hover:text-blue-800 font-medium font-sans cursor-pointer hover:underline"
                            >
                              Monitorear
                            </button>
                            {!isMe && (
                              <button
                                onClick={() => handleDeleteUser(user.id, user.name)}
                                className="text-slate-400 hover:text-rose-600 p-1 hover:bg-rose-50 rounded transition-colors cursor-pointer"
                                title="Eliminar acceso de forma permanente"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        </div>

        {/* Activity & Platform Usage Monitor Panel */}
        <div className="bg-white rounded-lg border border-slate-200 shadow-sm overflow-hidden flex flex-col">
          <div className="p-4 border-b border-slate-100 bg-slate-50/50 flex items-center justify-between">
            <span className="text-xs font-bold text-slate-800 font-sans uppercase tracking-wider flex items-center gap-1.5">
              <Activity className="w-3.5 h-3.5 text-blue-500" />
              Monitoreo en Tiempo Real
            </span>
          </div>

          <div className="p-4 flex-grow flex flex-col">
            {selectedUser ? (
              <div className="space-y-4">
                {/* Selected User Header */}
                <div className="flex items-center space-x-3 p-3 bg-slate-50 border border-slate-100 rounded-lg">
                  <img
                    src={selectedUser.avatarUrl || `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(selectedUser.name)}`}
                    alt={selectedUser.name}
                    className="w-10 h-10 rounded-full border border-white shadow-sm flex-shrink-0"
                  />
                  <div className="overflow-hidden">
                    <h4 className="text-xs font-bold text-slate-950 font-sans leading-none truncate">
                      {selectedUser.name}
                    </h4>
                    <p className="text-[10px] text-slate-400 font-mono truncate mt-0.5">
                      {selectedUser.email}
                    </p>
                    <div className="flex items-center space-x-1.5 mt-1">
                      <span className="text-[8px] font-mono font-bold bg-blue-500/10 text-blue-700 px-1.5 py-0.2 rounded">
                        {selectedUser.role}
                      </span>
                      <span className="text-[8px] text-slate-400 font-mono">
                        ID: #{selectedUser.id}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Audit Actions History list */}
                <div>
                  <h5 className="text-[10px] font-mono tracking-wider uppercase text-slate-400 mb-2 font-bold">
                    Registro de Acciones Recientes
                  </h5>
                  {selectedUser.recentActions && selectedUser.recentActions.length > 0 ? (
                    <div className="space-y-2">
                      {selectedUser.recentActions.map((log, idx) => (
                        <div 
                          key={log.id} 
                          className="p-2.5 bg-white border border-slate-100 hover:border-slate-200 rounded-md shadow-sm space-y-1"
                        >
                          <div className="text-[11px] font-sans text-slate-800 leading-normal">
                            {log.actionDescription}
                          </div>
                          <div className="flex items-center justify-between text-[8px] font-mono text-slate-400">
                            <span>Sincronizado vía Cloud SQL</span>
                            <span>{new Date(log.createdAt).toLocaleString('es-ES', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="p-8 text-center text-slate-400 text-xs border border-dashed border-slate-200 rounded-lg">
                      Este usuario no ha registrado ninguna acción operativa en el sistema de auditoría.
                    </div>
                  )}
                </div>

                <div className="pt-2 text-center">
                  <button
                    onClick={() => setSelectedUser(null)}
                    className="text-[10px] text-slate-500 hover:text-slate-800 font-sans cursor-pointer hover:underline"
                  >
                    Cerrar monitoreo de usuario
                  </button>
                </div>
              </div>
            ) : (
              <div className="flex-grow flex flex-col items-center justify-center text-center p-8 border border-dashed border-slate-200 rounded-lg">
                <Users className="w-8 h-8 text-slate-300 mb-2" />
                <h4 className="text-xs font-bold text-slate-700">Ningún usuario seleccionado</h4>
                <p className="text-[10px] text-slate-400 font-sans max-w-[200px] mt-1">
                  Haz clic en "Monitorear" o en el nombre de cualquier miembro del equipo para auditar sus acciones e historial.
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
