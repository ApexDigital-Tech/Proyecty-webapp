import React from 'react';
import { Project, UserRole } from '../types.ts';
import { hasPermission } from '../lib/rbac.ts';
import {
  Search,
  Filter,
  Plus,
  TrendingUp,
  AlertTriangle,
  FolderKanban,
  Award,
  Wallet,
  X,
  PlusCircle,
} from 'lucide-react';
import { DashboardGridSkeleton } from './common/Skeletons.tsx';

interface PortfolioProps {
  token: string;
  userRole: UserRole;
  onSelectProject: (id: number) => void;
  onActivityLogged?: () => void;
}

export default function Portfolio({
  token,
  userRole,
  onSelectProject,
  onActivityLogged,
}: PortfolioProps) {
  const [projectsList, setProjectsList] = React.useState<Project[]>([]);
  const [isLoading, setIsLoading] = React.useState(true);
  const [pagination, setPagination] = React.useState({ currentPage: 1, totalPages: 1, totalItems: 0 });
  const [searchTerm, setSearchTerm] = React.useState('');
  const [filterStatus, setFilterStatus] = React.useState('ALL');
  const [isModalOpen, setIsModalOpen] = React.useState(false);

  // New Project Form State
  const [code, setCode] = React.useState('');
  const [name, setName] = React.useState('');
  const [donor, setDonor] = React.useState('');
  const [approvedBudget, setApprovedBudget] = React.useState('');
  const [description, setDescription] = React.useState('');
  const [formError, setFormError] = React.useState<string | null>(null);

  const fetchProjects = React.useCallback(async () => {
    setIsLoading(true);
    try {
      const query = new URLSearchParams({
        page: pagination.currentPage.toString(),
        limit: '10',
      });
      if (searchTerm) query.append('search', searchTerm);
      if (filterStatus !== 'ALL') query.append('status', filterStatus);

      const res = await fetch(`/api/projects?${query.toString()}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const json = await res.json();
        // Fallback for non-paginated old endpoint format during transition
        if (Array.isArray(json)) {
           setProjectsList(json);
        } else {
           setProjectsList(json.data);
           setPagination(json.pagination);
        }
      }
    } catch (error) {
      console.error('Error fetching portfolio:', error);
    } finally {
      setIsLoading(false);
    }
  }, [token, pagination.currentPage, searchTerm, filterStatus]);

  React.useEffect(() => {
    // Basic debounce for search
    const timer = setTimeout(() => {
      fetchProjects();
    }, 300);
    return () => clearTimeout(timer);
  }, [fetchProjects]);

  // Derived variable for easy mapping below (no more client-side filtering needed)
  const filteredProjects = projectsList;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    if (!code || !name || !donor || !approvedBudget) {
      setFormError('Todos los campos con (*) son requeridos.');
      return;
    }

    const budgetVal = parseFloat(approvedBudget);
    if (isNaN(budgetVal) || budgetVal <= 0) {
      setFormError('El presupuesto aprobado debe ser un número positivo.');
      return;
    }

    try {
      const res = await fetch('/api/projects', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          code,
          name,
          donor,
          approvedBudget: budgetVal,
          description,
          physicalProgress: 0,
          financialProgress: 0,
          score: 100,
        }),
      });

      if (res.ok) {
        setIsModalOpen(false);
        setCode('');
        setName('');
        setDonor('');
        setApprovedBudget('');
        setDescription('');
        if (onActivityLogged) onActivityLogged();
        // Reset to page 1 and fetch
        setPagination(p => ({ ...p, currentPage: 1 }));
        fetchProjects();
      } else {
        const errData = await res.json();
        setFormError(errData.error || 'Error al crear el proyecto.');
      }
    } catch (err) {
       setFormError('Error de red al crear el proyecto.');
    }
  };

  const canAddProject = hasPermission(userRole, 'canAddProject');

  return (
    <div id="portfolio-tab" className="p-6 space-y-5 max-w-7xl mx-auto select-none">
      {/* Header and Add Action */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-base font-sans font-bold text-slate-900">
            Portafolio de Cooperación Internacional
          </h2>
          <p className="text-[11px] text-slate-400 font-sans">
            Portafolio integrado de subvenciones para fiscalización operativa de ONGs.
          </p>
        </div>

        {canAddProject && (
          <button
            id="open-add-project-modal"
            onClick={() => setIsModalOpen(true)}
            className="bg-[#2563EB] hover:bg-blue-700 text-white text-xs font-semibold px-3.5 py-2 rounded-md flex items-center space-x-1.5 shadow transition-colors cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Nuevo Proyecto</span>
          </button>
        )}
      </div>

      {/* Filter and Search Bar */}
      <div className="bg-white p-3 rounded-lg border border-slate-200 shadow-sm flex flex-col md:flex-row gap-3 items-center justify-between">
        <div className="relative w-full md:w-80">
          <Search className="absolute left-3 top-2 w-3.5 h-3.5 text-slate-400" />
          <input
            id="portfolio-search"
            type="text"
            placeholder="Buscar por nombre, código o donante..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-8.5 pr-4 py-1.5 bg-slate-50 border border-slate-200 rounded-md font-sans text-xs focus:ring-1 focus:ring-blue-500 focus:border-blue-500 focus:bg-white transition-all outline-none"
          />
        </div>

        <div className="flex items-center space-x-2 w-full md:w-auto justify-end">
          <Filter className="w-3.5 h-3.5 text-slate-400" />
          <select
            id="portfolio-filter-status"
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value)}
            className="bg-slate-50 border border-slate-200 rounded-md py-1.5 px-2.5 font-sans text-xs text-slate-800 font-medium outline-none focus:ring-1 focus:ring-blue-500 cursor-pointer"
          >
            <option value="ALL">Todos los Estados</option>
            <option value="EJECUCIÓN">En Ejecución</option>
            <option value="ACTIVO">Activos</option>
            <option value="PLANIFICACIÓN">Planificación</option>
          </select>
        </div>
      </div>

      {/* Grid of Projects */}
      {isLoading ? (
        <DashboardGridSkeleton />
      ) : filteredProjects.length === 0 ? (
        <div className="text-center py-20 bg-white rounded-2xl border border-dashed border-slate-200">
          <FolderKanban className="w-12 h-12 text-slate-300 mx-auto mb-2" />
          <p className="text-slate-400 font-sans text-xs">
            No se encontraron proyectos para el criterio seleccionado.
          </p>
        </div>
      ) : (
        <>
          <div
            id="portfolio-grid"
            className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5"
          >
            {filteredProjects.map((p) => {
            const hasRiskGap = p.physicalProgress - p.financialProgress > 15;
            return (
              <div
                key={p.id}
                id={`project-card-${p.id}`}
                onClick={() => onSelectProject(p.id)}
                className="bg-white rounded-lg p-4 border border-slate-200 hover:border-slate-300 shadow-sm hover:shadow transition-all cursor-pointer flex flex-col justify-between space-y-3 group"
              >
                {/* Upper row */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-[9px] font-mono font-bold bg-blue-50 text-blue-700 border border-blue-100/50 px-1.5 py-0.2 rounded">
                      {p.code}
                    </span>
                    <span
                      className={`text-[9px] font-sans font-semibold px-2 py-0.2 rounded-full border ${
                        p.status === 'EJECUCIÓN'
                          ? 'bg-emerald-50 text-emerald-700 border-emerald-100/50'
                          : p.status === 'ACTIVO'
                          ? 'bg-emerald-50 text-emerald-700 border-emerald-100/50'
                          : p.status === 'PLANIFICACIÓN'
                          ? 'bg-blue-50 text-blue-700 border-blue-100/50'
                          : 'bg-slate-100 text-slate-600 border-slate-200/50'
                      }`}
                    >
                      {p.status}
                    </span>
                  </div>

                  <h3 className="font-sans font-bold text-slate-900 text-xs group-hover:text-blue-600 transition-colors leading-snug line-clamp-2">
                    {p.name}
                  </h3>

                  <p className="text-[10px] font-sans text-slate-400">
                    Donante: <span className="font-semibold text-slate-700">{p.donor || 'N/A'}</span>
                  </p>
                </div>

                {/* Progress Indicators */}
                <div className="space-y-2 pt-2 border-t border-slate-100">
                  <div className="space-y-1">
                    <div className="flex justify-between text-[9px] font-mono">
                      <span className="text-slate-400">Progreso Físico</span>
                      <span className="font-bold text-slate-800">{p.physicalProgress}%</span>
                    </div>
                    <div className="w-full h-1 bg-slate-100 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-blue-600 rounded-full"
                        style={{ width: `${p.physicalProgress}%` }}
                      ></div>
                    </div>
                  </div>

                  <div className="space-y-1">
                    <div className="flex justify-between text-[9px] font-mono">
                      <span className="text-slate-400">Progreso Financiero</span>
                      <span className="font-bold text-slate-800">{p.financialProgress}%</span>
                    </div>
                    <div className="w-full h-1 bg-slate-100 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-indigo-600 rounded-full"
                        style={{ width: `${p.financialProgress}%` }}
                      ></div>
                    </div>
                  </div>
                </div>

                {/* Lower Row Budget & Score */}
                <div className="flex items-center justify-between pt-2 border-t border-slate-100">
                  <div className="space-y-0.5">
                    <span className="text-[8px] font-mono uppercase text-slate-400 tracking-wider leading-none">
                      Presupuesto Aprobado
                    </span>
                    <div className="text-xs font-mono font-bold text-slate-900 leading-none">
                      ${Number(p.approvedBudget).toLocaleString('es-ES', { minimumFractionDigits: 2 })}
                    </div>
                  </div>

                  {hasRiskGap ? (
                    <div
                      className="flex items-center space-x-1 bg-rose-50 text-rose-700 px-2 py-0.5 rounded border border-rose-100/60"
                      title="Brecha crítica entre avance físico y ejecución financiera"
                    >
                      <AlertTriangle className="w-3 h-3 text-rose-500" />
                      <span className="text-[8px] font-sans font-semibold">Riesgo Brecha</span>
                    </div>
                  ) : (
                    <div className="flex items-center space-x-1 text-emerald-600 bg-emerald-50/50 px-1.5 py-0.5 rounded border border-emerald-100/50">
                      <Award className="w-3 h-3 text-emerald-500" />
                      <span className="text-[9px] font-mono font-semibold">Score {p.score}</span>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
        
        {/* Pagination Controls */}
        {pagination.totalPages > 1 && (
          <div className="flex justify-center items-center space-x-2 mt-6">
            <button 
              disabled={pagination.currentPage === 1}
              onClick={() => setPagination(p => ({ ...p, currentPage: p.currentPage - 1 }))}
              className="px-3 py-1 bg-white border border-slate-200 rounded text-xs font-medium text-slate-600 disabled:opacity-50"
            >
              Anterior
            </button>
            <span className="text-xs font-sans text-slate-500">
              Página {pagination.currentPage} de {pagination.totalPages}
            </span>
            <button 
              disabled={pagination.currentPage === pagination.totalPages}
              onClick={() => setPagination(p => ({ ...p, currentPage: p.currentPage + 1 }))}
              className="px-3 py-1 bg-white border border-slate-200 rounded text-xs font-medium text-slate-600 disabled:opacity-50"
            >
              Siguiente
            </button>
          </div>
        )}
      </>
      )}

      {/* Add Project Sliding Sidebar Panel (Modal) */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-black/50 z-50 flex justify-end">
          <div
            id="add-project-modal"
            className="w-full max-w-md bg-white h-full p-6 shadow-2xl flex flex-col justify-between overflow-y-auto space-y-4"
          >
            <div className="space-y-4">
              <div className="flex justify-between items-center pb-3 border-b border-slate-200">
                <div>
                  <h3 className="font-sans font-bold text-base text-slate-900">
                    Registrar Nuevo Proyecto
                  </h3>
                  <p className="text-[11px] text-slate-400 font-sans">
                    Agrega un nuevo proyecto de cooperación a la plataforma.
                  </p>
                </div>
                <button
                  onClick={() => setIsModalOpen(false)}
                  className="p-1 text-slate-400 hover:text-slate-600 rounded-lg cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {formError && (
                <div className="p-2.5 bg-rose-50 border border-rose-100 rounded text-rose-700 text-xs font-sans">
                  {formError}
                </div>
              )}

              <form onSubmit={handleSubmit} className="space-y-3.5 text-xs font-sans">
                <div className="space-y-1">
                  <label className="block font-semibold text-slate-700">
                    Código del Proyecto (*)
                  </label>
                  <input
                    type="text"
                    placeholder="Ej. PRJ-2024-089"
                    value={code}
                    onChange={(e) => setCode(e.target.value)}
                    className="w-full p-2 bg-slate-50 border border-slate-200 rounded-md outline-none focus:ring-1 focus:ring-blue-500"
                  />
                </div>

                <div className="space-y-1">
                  <label className="block font-semibold text-slate-700">
                    Nombre Comercial (*)
                  </label>
                  <input
                    type="text"
                    placeholder="Ej. Construcción de Pozos de Agua de Lluvia"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="w-full p-2 bg-slate-50 border border-slate-200 rounded-md outline-none focus:ring-1 focus:ring-blue-500"
                  />
                </div>

                <div className="space-y-1">
                  <label className="block font-semibold text-slate-700">
                    Donante de Cooperación (*)
                  </label>
                  <input
                    type="text"
                    placeholder="Ej. USAID, UNICEF, Cooperación Española"
                    value={donor}
                    onChange={(e) => setDonor(e.target.value)}
                    className="w-full p-2 bg-slate-50 border border-slate-200 rounded-md outline-none focus:ring-1 focus:ring-blue-500"
                  />
                </div>

                <div className="space-y-1">
                  <label className="block font-semibold text-slate-700">
                    Presupuesto Asegurado ($ USD) (*)
                  </label>
                  <input
                    type="number"
                    placeholder="Ej. 150000"
                    value={approvedBudget}
                    onChange={(e) => setApprovedBudget(e.target.value)}
                    className="w-full p-2 bg-slate-50 border border-slate-200 rounded-md outline-none focus:ring-1 focus:ring-blue-500"
                  />
                </div>

                <div className="space-y-1">
                  <label className="block font-semibold text-slate-700">
                    Descripción Operativa (Opcional)
                  </label>
                  <textarea
                    rows={3}
                    placeholder="Describa el alcance de la subvención y beneficiarios..."
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    className="w-full p-2 bg-slate-50 border border-slate-200 rounded-md outline-none focus:ring-1 focus:ring-blue-500"
                  />
                </div>

                <button
                  type="submit"
                  disabled={isLoading}
                  className="w-full py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-md mt-3 cursor-pointer transition-colors"
                >
                  {isLoading ? 'Registrando...' : 'Registrar Proyecto'}
                </button>
              </form>
            </div>
            <div className="text-[9px] font-mono text-slate-400 text-center pt-3 border-t border-slate-200">
              Ubicación del servidor: europe-west1
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
