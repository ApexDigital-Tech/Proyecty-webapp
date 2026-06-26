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
  UserCog,
  Plus,
  Edit2,
  PowerOff,
  Power,
  X
} from 'lucide-react';
import { UserRole } from '../types.ts';

interface UserData {
  id: number;
  uid: string;
  email: string;
  name: string;
  role: UserRole;
  isActive: boolean;
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

  // Modal State
  const [isModalOpen, setIsModalOpen] = React.useState(false);
  const [modalMode, setModalMode] = React.useState<'create' | 'edit'>('create');
  const [modalData, setModalData] = React.useState<{ name: string; email: string; role: UserRole }>({ name: '', email: '', role: 'MANAGER' });
  const [editingUserId, setEditingUserId] = React.useState<number | null>(null);

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

  const handleOpenModal = (mode: 'create' | 'edit', user?: UserData) => {
    setModalMode(mode);
    if (mode === 'edit' && user) {
      setEditingUserId(user.id);
      setModalData({ name: user.name, email: user.email, role: user.role });
    } else {
      setEditingUserId(null);
      setModalData({ name: '', email: '', role: 'MANAGER' });
    }
    setIsModalOpen(true);
  };

  const handleCloseModal = () => {
    setIsModalOpen(false);
    setModalData({ name: '', email: '', role: 'MANAGER' });
    setEditingUserId(null);
  };

  const handleSaveUser = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError(null);
    setSuccess(null);
    try {
      const isEdit = modalMode === 'edit' && editingUserId;
      const url = isEdit ? `/api/users/${editingUserId}` : '/api/users';
      const method = isEdit ? 'PATCH' : 'POST';

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(modalData),
      });

      if (res.ok) {
        setSuccess(isEdit ? `Usuario "${modalData.name}" actualizado correctamente.` : `Usuario "${modalData.name}" creado exitosamente.`);
        handleCloseModal();
        fetchUsers();
        onLogActivity(null, isEdit ? `Modificó los datos del usuario "${modalData.name}"` : `Creó al nuevo usuario "${modalData.name}"`);
      } else {
        const data = await res.json();
        setError(data.error || 'Error al guardar usuario.');
      }
    } catch (err) {
      setError('Error de conexión al guardar usuario.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleToggleActive = async (user: UserData) => {
    if (user.email === currentUser.email) {
      setError('No puedes desactivar tu propia cuenta.');
      return;
    }
    setIsUpdating(user.id);
    setError(null);
    setSuccess(null);
    try {
      const newActiveState = !user.isActive;
      const res = await fetch(`/api/users/${user.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ isActive: newActiveState }),
      });
      if (res.ok) {
        setSuccess(`Usuario "${user.name}" ha sido ${newActiveState ? 'reactivado' : 'suspendido'}.`);
        fetchUsers();
        onLogActivity(null, `${newActiveState ? 'Reactivó' : 'Suspendió'} al usuario "${user.name}"`);
      } else {
        const data = await res.json();
        setError(data.error || 'Error al cambiar estado.');
      }
    } catch (err) {
      setError('Error de conexión al suspender/reactivar usuario.');
    } finally {
      setIsUpdating(null);
    }
  };

  const handleDeleteUser = async (userId: number, userName: string) => {
    if (!confirm(`¿Está seguro de que desea eliminar físicamente al usuario "${userName}"? Considere suspenderlo en lugar de eliminarlo permanentemente.`)) {
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
        <div className="flex items-center gap-2 self-start md:self-auto">
          <button
            onClick={fetchUsers}
            disabled={isLoading}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-medium rounded border border-slate-200 transition cursor-pointer"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
            Sincronizar Panel
          </button>
          {currentUser.role === 'DIRECTOR' && (
            <button
              onClick={() => handleOpenModal('create')}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-medium rounded border border-blue-700 transition cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              Nuevo Usuario
            </button>
          )}
        </div>
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
                    <th className="p-3 text-[10px] font-mono tracking-wider uppercase text-slate-500">Estado</th>
                    <th className="p-3 text-[10px] font-mono tracking-wider uppercase text-slate-500 text-right">Acción</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredUsers.map((user) => {
                    const isSelected = selectedUser?.id === user.id;
                    const isMe = user.email === currentUser.email;
                    const isSuspended = user.isActive === false;

                    return (
                      <tr 
                        key={user.id} 
                        className={`hover:bg-slate-50/50 transition-colors duration-100 ${
                          isSelected ? 'bg-blue-50/30' : ''
                        } ${isSuspended ? 'opacity-60 grayscale' : ''}`}
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

                        {/* Role Status Badge */}
                        <td className="p-3">
                          <span className="text-[10px] font-mono font-bold bg-slate-100 text-slate-700 border border-slate-200 px-1.5 py-0.5 rounded uppercase inline-block">
                            {user.role}
                          </span>
                        </td>

                        {/* Active/Suspended Tracker */}
                        <td className="p-3">
                          {isSuspended ? (
                            <span className="inline-flex items-center gap-1 bg-rose-50 border border-rose-200 text-rose-700 text-[10px] font-medium font-mono px-2 py-0.5 rounded">
                              <PowerOff className="w-3 h-3" />
                              Suspendido
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 bg-emerald-50 border border-emerald-200 text-emerald-700 text-[10px] font-medium font-mono px-2 py-0.5 rounded">
                              <CheckCircle2 className="w-3 h-3" />
                              Activo
                            </span>
                          )}
                        </td>

                        {/* Action Operations */}
                        <td className="p-3 text-right">
                          <div className="flex items-center justify-end space-x-2">
                            <button
                              onClick={() => setSelectedUser(user)}
                              className="text-[10px] text-blue-600 hover:text-blue-800 font-medium font-sans cursor-pointer hover:underline"
                            >
                              Auditar
                            </button>
                            
                            {/* Actions only for Directors */}
                            {currentUser.role === 'DIRECTOR' && (
                              <>
                                <button
                                  onClick={() => handleOpenModal('edit', user)}
                                  className="text-slate-400 hover:text-blue-600 p-1 hover:bg-blue-50 rounded transition-colors cursor-pointer"
                                  title="Editar usuario"
                                >
                                  <Edit2 className="w-3.5 h-3.5" />
                                </button>
                                
                                {!isMe && (
                                  <>
                                    <button
                                      onClick={() => handleToggleActive(user)}
                                      disabled={isUpdating === user.id}
                                      className={`p-1 rounded transition-colors cursor-pointer ${
                                        isSuspended 
                                          ? 'text-slate-400 hover:text-emerald-600 hover:bg-emerald-50' 
                                          : 'text-slate-400 hover:text-amber-600 hover:bg-amber-50'
                                      }`}
                                      title={isSuspended ? "Reactivar acceso" : "Suspender acceso"}
                                    >
                                      {isSuspended ? <Power className="w-3.5 h-3.5" /> : <PowerOff className="w-3.5 h-3.5" />}
                                    </button>
                                    
                                    <button
                                      onClick={() => handleDeleteUser(user.id, user.name)}
                                      className="text-slate-400 hover:text-rose-600 p-1 hover:bg-rose-50 rounded transition-colors cursor-pointer"
                                      title="Eliminar permanentemente"
                                    >
                                      <Trash2 className="w-3.5 h-3.5" />
                                    </button>
                                  </>
                                )}
                              </>
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
              Auditoría en Tiempo Real
            </span>
          </div>

          <div className="p-4 flex-grow flex flex-col">
            {selectedUser ? (
              <div className="space-y-4">
                {/* Selected User Header */}
                <div className="flex items-center space-x-3 p-3 bg-slate-50 border border-slate-100 rounded-lg relative overflow-hidden">
                  {selectedUser.isActive === false && (
                    <div className="absolute top-0 right-0 bottom-0 left-0 bg-white/40 z-10 pointer-events-none"></div>
                  )}
                  <img
                    src={selectedUser.avatarUrl || `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(selectedUser.name)}`}
                    alt={selectedUser.name}
                    className="w-10 h-10 rounded-full border border-white shadow-sm flex-shrink-0 z-0"
                  />
                  <div className="overflow-hidden z-0">
                    <h4 className="text-xs font-bold text-slate-950 font-sans leading-none truncate flex items-center gap-1">
                      {selectedUser.name}
                      {selectedUser.isActive === false && (
                         <span className="text-[8px] bg-rose-100 text-rose-700 px-1 py-0.5 rounded font-mono uppercase">Suspensión Lógica</span>
                      )}
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
                  <h5 className="text-[10px] font-mono tracking-wider uppercase text-slate-400 mb-2 font-bold flex items-center justify-between">
                    <span>Acciones Recientes</span>
                    <span className="text-blue-600 bg-blue-50 px-1.5 py-0.5 rounded">{selectedUser.activityCount} total</span>
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
                    Cerrar panel de auditoría
                  </button>
                </div>
              </div>
            ) : (
              <div className="flex-grow flex flex-col items-center justify-center text-center p-8 border border-dashed border-slate-200 rounded-lg">
                <Users className="w-8 h-8 text-slate-300 mb-2" />
                <h4 className="text-xs font-bold text-slate-700">Ningún usuario en auditoría</h4>
                <p className="text-[10px] text-slate-400 font-sans max-w-[200px] mt-1">
                  Haz clic en "Auditar" en cualquier miembro del equipo para revisar su historial de cambios en el sistema.
                </p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* CREATE / EDIT USER MODAL */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-md border border-slate-200 overflow-hidden">
            <div className="flex items-center justify-between p-4 border-b border-slate-100 bg-slate-50/50">
              <h3 className="text-sm font-bold text-slate-800 font-sans uppercase tracking-wider flex items-center gap-2">
                {modalMode === 'create' ? <Plus className="w-4 h-4 text-blue-600" /> : <Edit2 className="w-4 h-4 text-blue-600" />}
                {modalMode === 'create' ? 'Nuevo Usuario' : 'Editar Usuario'}
              </h3>
              <button onClick={handleCloseModal} className="text-slate-400 hover:text-slate-600 cursor-pointer">
                <X className="w-4 h-4" />
              </button>
            </div>
            
            <form onSubmit={handleSaveUser} className="p-4 space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1 font-sans">
                  Nombre Completo
                </label>
                <input
                  type="text"
                  required
                  value={modalData.name}
                  onChange={e => setModalData({...modalData, name: e.target.value})}
                  className="w-full border border-slate-200 rounded px-3 py-1.5 text-xs font-sans focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                  placeholder="Ej. María Pérez"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1 font-sans">
                  Correo Electrónico
                </label>
                <input
                  type="email"
                  required
                  value={modalData.email}
                  onChange={e => setModalData({...modalData, email: e.target.value})}
                  className="w-full border border-slate-200 rounded px-3 py-1.5 text-xs font-sans focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                  placeholder="ejemplo@organizacion.org"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1 font-sans">
                  Rol de Acceso (RBAC)
                </label>
                <select
                  value={modalData.role}
                  onChange={e => setModalData({...modalData, role: e.target.value as UserRole})}
                  className="w-full border border-slate-200 rounded px-3 py-1.5 text-xs font-sans bg-white focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                >
                  <option value="DIRECTOR">DIRECTOR (Admin Total)</option>
                  <option value="MANAGER">MANAGER (Gestor Proyectos)</option>
                  <option value="FINANCE">FINANCE (Finanzas / Operaciones)</option>
                  <option value="AUDITOR">AUDITOR (Auditoría Lectura)</option>
                  <option value="FINANCIADOR">FINANCIADOR (Donante Lectura)</option>
                </select>
                <p className="mt-1.5 text-[10px] text-slate-500 font-sans leading-snug">
                  Los roles DIRECTOR tienen control total sobre el portafolio y los usuarios. Los AUDITOR y FINANCIADOR solo pueden visualizar datos.
                </p>
              </div>

              <div className="pt-4 flex items-center justify-end gap-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={handleCloseModal}
                  className="px-3 py-1.5 text-xs font-medium text-slate-600 bg-slate-100 hover:bg-slate-200 rounded transition-colors cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={isLoading}
                  className="px-3 py-1.5 text-xs font-medium text-white bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 rounded transition-colors cursor-pointer flex items-center gap-1.5"
                >
                  {isLoading && <RefreshCw className="w-3.5 h-3.5 animate-spin" />}
                  {modalMode === 'create' ? 'Registrar Usuario' : 'Guardar Cambios'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
