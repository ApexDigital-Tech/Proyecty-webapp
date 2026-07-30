import React from 'react';
import { UserRole } from '../../types';
import { Trash2, Plus, UserPlus, AlertTriangle } from 'lucide-react';

interface TabEquipoProps {
  projectId: number;
  userRole: UserRole;
  token: string;
  onLogActivity: () => void;
}

export default function TabEquipo({ projectId, userRole, token, onLogActivity }: TabEquipoProps) {
  const [members, setMembers] = React.useState<any[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  // Users lookup for assignment
  const [allUsers, setAllUsers] = React.useState<any[]>([]);
  const [selectedUserId, setSelectedUserId] = React.useState<string>('');
  const [selectedRoleInProject, setSelectedRoleInProject] = React.useState<string>('Contributor');

  const canManage = ['DIRECTOR', 'MANAGER', 'RESPONSABLE_PROYECTO'].includes(userRole);

  const loadMembers = async () => {
    try {
      const res = await fetch(`/api/projects/${projectId}/members`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (!res.ok) throw new Error('Error al cargar miembros');
      const data = await res.json();
      setMembers(data);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const loadUsers = async () => {
    try {
      // Usar endpoint de usuarios global
      const res = await fetch(`/api/users`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setAllUsers(data);
      }
    } catch (err: any) {
      console.error(err);
    }
  };

  React.useEffect(() => {
    loadMembers();
    if (canManage) {
      loadUsers();
    }
  }, [projectId]);

  const handleAssign = async () => {
    if (!selectedUserId) return;
    try {
      const res = await fetch(`/api/projects/${projectId}/members`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          userId: parseInt(selectedUserId),
          roleInProject: selectedRoleInProject
        })
      });
      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.error || 'Error al asignar');
      }
      onLogActivity();
      loadMembers();
      setSelectedUserId('');
    } catch (err: any) {
      alert(err.message);
    }
  };

  const handleRemove = async (userId: number) => {
    if (!confirm('¿Seguro que deseas remover a este usuario del proyecto?')) return;
    try {
      const res = await fetch(`/api/projects/${projectId}/members/${userId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` }
      });
      if (!res.ok) throw new Error('Error al remover');
      onLogActivity();
      loadMembers();
    } catch (err: any) {
      alert(err.message);
    }
  };

  if (loading) return <div className="p-8 text-center text-slate-500">Cargando equipo...</div>;

  return (
    <div className="space-y-6">
      {error && (
        <div className="p-4 bg-red-50 text-red-700 rounded-md flex items-center space-x-2">
          <AlertTriangle className="w-5 h-5" />
          <span>{error}</span>
        </div>
      )}

      {canManage && (
        <div className="bg-white p-6 rounded-lg shadow-sm border border-slate-200">
          <h3 className="text-lg font-bold text-slate-800 mb-4 flex items-center space-x-2">
            <UserPlus className="w-5 h-5 text-indigo-600" />
            <span>Asignar Usuario al Proyecto</span>
          </h3>
          <div className="flex flex-col md:flex-row gap-4 items-end">
            <div className="flex-1">
              <label className="block text-sm font-semibold text-slate-700 mb-1">Usuario</label>
              <select
                className="w-full p-2 border border-slate-300 rounded-md focus:ring-2 focus:ring-indigo-500"
                value={selectedUserId}
                onChange={(e) => setSelectedUserId(e.target.value)}
              >
                <option value="">Seleccione un usuario...</option>
                {allUsers.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.name} ({u.email}) - {u.role?.name || u.roleId}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex-1">
              <label className="block text-sm font-semibold text-slate-700 mb-1">Rol en el Proyecto</label>
              <select
                className="w-full p-2 border border-slate-300 rounded-md focus:ring-2 focus:ring-indigo-500"
                value={selectedRoleInProject}
                onChange={(e) => setSelectedRoleInProject(e.target.value)}
              >
                <option value="Manager">Responsable / Manager</option>
                <option value="Contributor">Técnico / Contribuidor</option>
                <option value="Viewer">Solo Lectura</option>
              </select>
            </div>
            <button
              onClick={handleAssign}
              disabled={!selectedUserId}
              className="bg-indigo-600 text-white px-4 py-2 rounded-md hover:bg-indigo-700 disabled:opacity-50 flex items-center space-x-2 transition-colors"
            >
              <Plus className="w-4 h-4" />
              <span>Asignar</span>
            </button>
          </div>
        </div>
      )}

      <div className="bg-white rounded-lg shadow-sm border border-slate-200 overflow-hidden">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="bg-slate-50 border-b border-slate-200 text-sm text-slate-600">
              <th className="p-4 font-semibold">Nombre</th>
              <th className="p-4 font-semibold">Email</th>
              <th className="p-4 font-semibold">Rol Global</th>
              <th className="p-4 font-semibold">Rol en Proyecto</th>
              {canManage && <th className="p-4 font-semibold text-right">Acciones</th>}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {members.length === 0 ? (
              <tr>
                <td colSpan={canManage ? 5 : 4} className="p-8 text-center text-slate-500 italic">
                  No hay miembros asignados explícitamente a este proyecto.
                </td>
              </tr>
            ) : (
              members.map((m) => (
                <tr key={m.id} className="hover:bg-slate-50/50 transition-colors">
                  <td className="p-4 font-medium text-slate-800">{m.name}</td>
                  <td className="p-4 text-slate-600">{m.email}</td>
                  <td className="p-4 text-slate-600 text-sm">
                    <span className="bg-slate-100 px-2 py-1 rounded border border-slate-200">
                      {m.role || 'N/A'}
                    </span>
                  </td>
                  <td className="p-4">
                    <span className="text-indigo-700 bg-indigo-50 border border-indigo-100 px-2 py-1 rounded text-sm font-medium">
                      {m.roleInProject}
                    </span>
                  </td>
                  {canManage && (
                    <td className="p-4 text-right">
                      <button
                        onClick={() => handleRemove(m.userId)}
                        className="text-red-500 hover:text-red-700 p-1 rounded-md hover:bg-red-50 transition-colors"
                        title="Remover"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </td>
                  )}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
