import { db } from '../db/index.ts';
import { 
  projects, 
  projectMembers, 
  agreements, 
  disbursements, 
  expenses, 
  budgetLines,
  donors,
  users
} from '../db/schema.ts';
import { eq, and, or, inArray, sql } from 'drizzle-orm';
import { calculatePhysicalProgress } from './schedule.service.ts';

export interface DashboardMetricsDto {
  totalBudget: number;
  totalExecuted: number;
  availableBalance: number;
  avgPhysical: number;
  avgFinancial: number;
  avgScore: number;
  highRiskProjectsCount: number;
  highRiskProjectsDetails: {
    id: number;
    code: string;
    name: string;
    riskLevel: string;
    physicalProgress: number;
    financialProgress: number;
    gap: number;
  }[];
  statusDistribution: {
    ACTIVO: number;
    EJECUCIÓN: number;
    PLANIFICACIÓN: number;
  };
  pendingDisbursementsCount: number;
  pendingDisbursementsAmount: number;
  projectsList: any[];
}

export interface DashboardFilterOptions {
  donorId?: number;
  status?: string;
  period?: string;
}

// Lightweight TTL cache for dashboard metrics (5 seconds TTL)
const metricsCache = new Map<string, { data: DashboardMetricsDto; timestamp: number }>();
const CACHE_TTL_MS = 5000;

export function invalidateDashboardCache(tenantId?: number) {
  if (tenantId) {
    for (const key of metricsCache.keys()) {
      if (key.startsWith(`${tenantId}:`)) {
        metricsCache.delete(key);
      }
    }
  } else {
    metricsCache.clear();
  }
}

/**
 * Calcula las métricas ejecutivas globales (M-02) con alcance de rol estricto y fórmulas matemáticas canónicas.
 */
export async function getDashboardMetricsForUser(
  tenantId: number,
  userId: number,
  userRole: string,
  filters: DashboardFilterOptions = {}
): Promise<DashboardMetricsDto> {
  const cacheKey = `${tenantId}:${userId}:${userRole}:${JSON.stringify(filters)}`;
  const cached = metricsCache.get(cacheKey);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
    return cached.data;
  }
  // 1. Determinar condiciones de alcance de proyectos según rol
  let conditions = [eq(projects.tenantId, tenantId)];

  if (userRole === 'RESPONSABLE_PROYECTO' || userRole === 'TECNICO_PROYECTO') {
    const assigned = await db.select({ projectId: projectMembers.projectId })
      .from(projectMembers)
      .where(eq(projectMembers.userId, userId));
    
    const assignedIds = assigned.map(a => a.projectId);
    if (assignedIds.length > 0) {
      conditions.push(inArray(projects.id, assignedIds));
    } else {
      conditions.push(eq(projects.id, -1)); // Sin proyectos asignados
    }
  } else if (userRole === 'FINANCIADOR') {
    const assigned = await db.select({ projectId: projectMembers.projectId })
      .from(projectMembers)
      .where(eq(projectMembers.userId, userId));
    const assignedIds = assigned.map(a => a.projectId);

    const [userRecord] = await db.select({ donorId: users.donorId }).from(users).where(eq(users.id, userId));
    
    if (assignedIds.length > 0 && userRecord?.donorId) {
      conditions.push(or(inArray(projects.id, assignedIds), eq(projects.donorId, userRecord.donorId)));
    } else if (assignedIds.length > 0) {
      conditions.push(inArray(projects.id, assignedIds));
    } else if (userRecord?.donorId) {
      conditions.push(eq(projects.donorId, userRecord.donorId));
    } else {
      conditions.push(eq(projects.id, -1));
    }
  }

  // Filtros opcionales
  if (filters.donorId) conditions.push(eq(projects.donorId, filters.donorId));
  if (filters.status) conditions.push(eq(projects.status, filters.status));

  // 2. Consultar proyectos del alcance
  const rawProjects = await db.select({
    project: projects,
    donorName: donors.name
  }).from(projects)
    .leftJoin(donors, eq(projects.donorId, donors.id))
    .where(and(...conditions));

  const projectIds = rawProjects.map(r => r.project.id);

  // Si no hay proyectos, retornar estado vacío seguro sin NaN
  if (rawProjects.length === 0) {
    return {
      totalBudget: 0,
      totalExecuted: 0,
      availableBalance: 0,
      avgPhysical: 0,
      avgFinancial: 0,
      avgScore: 0,
      highRiskProjectsCount: 0,
      highRiskProjectsDetails: [],
      statusDistribution: { ACTIVO: 0, EJECUCIÓN: 0, PLANIFICACIÓN: 0 },
      pendingDisbursementsCount: 0,
      pendingDisbursementsAmount: 0,
      projectsList: []
    };
  }

  // 3. Consultar gastos APPROVED y convenios/desembolsos concurrentemente
  const [approvedExpenses, activeAgreements] = await Promise.all([
    db.select({ projectId: expenses.projectId, amount: expenses.amount }).from(expenses).where(
      and(
        eq(expenses.tenantId, tenantId),
        inArray(expenses.projectId, projectIds),
        or(eq(expenses.status, 'approved'), eq(expenses.status, 'APPROVED'))
      )
    ),
    db.select({ id: agreements.id, amount: agreements.amount, projectId: agreements.projectId })
      .from(agreements)
      .where(and(inArray(agreements.projectId, projectIds), eq(agreements.status, 'Activo')))
  ]);

  const expensesByProject = new Map<number, number>();
  for (const exp of approvedExpenses) {
    if (exp.projectId) {
      expensesByProject.set(exp.projectId, (expensesByProject.get(exp.projectId) || 0) + Number(exp.amount));
    }
  }

  const totalExecuted = approvedExpenses.reduce((sum, e) => sum + Number(e.amount), 0);

  // 4. Cálculos agregados por proyecto
  let totalApprovedBudget = 0;
  let weightedPhysicalSum = 0;
  let totalScoreSum = 0;
  let highRiskCount = 0;
  const highRiskDetails: DashboardMetricsDto['highRiskProjectsDetails'] = [];

  const statusDist = {
    ACTIVO: 0,
    EJECUCIÓN: 0,
    PLANIFICACIÓN: 0
  };

  const formattedProjects = rawProjects.map(r => {
    const p = r.project;
    const budget = Number(p.approvedBudget) || 0;
    const phys = Number(p.physicalProgress) || 0;
    const pExp = expensesByProject.get(p.id);
    const fin = pExp !== undefined && budget > 0
      ? Math.round((pExp / budget) * 100)
      : (Number(p.financialProgress) || 0);
    const sc = Number(p.score) || 0;

    totalApprovedBudget += budget;
    weightedPhysicalSum += (phys * budget);
    totalScoreSum += sc;

    if (p.status in statusDist) {
      statusDist[p.status as keyof typeof statusDist]++;
    }

    // Alerta de brecha operativa estricta: |físico - financiero| > 15%
    const gap = Math.abs(phys - fin);
    const hasRiskGap = gap > 15; // Estrictamente mayor a 15%

    if (p.riskLevel === 'Alto' || hasRiskGap) {
      highRiskCount++;
      highRiskDetails.push({
        id: p.id,
        code: p.code,
        name: p.name,
        riskLevel: p.riskLevel,
        physicalProgress: phys,
        financialProgress: fin,
        gap
      });
    }

    return {
      ...p,
      financialProgress: fin,
      donor: r.donorName
    };
  });

  const pCount = rawProjects.length;

  // Avance físico global ponderado por presupuesto
  const avgPhysical = totalApprovedBudget > 0
    ? Math.round(weightedPhysicalSum / totalApprovedBudget)
    : (pCount > 0 ? Math.round(rawProjects.reduce((s, r) => s + (r.project.physicalProgress || 0), 0) / pCount) : 0);

  // Ejecución financiera global %
  const avgFinancial = totalApprovedBudget > 0
    ? Math.round((totalExecuted / totalApprovedBudget) * 100)
    : 0;

  const avgScore = pCount > 0 ? Math.round(totalScoreSum / pCount) : 0;
  const availableBalance = Math.max(0, totalApprovedBudget - totalExecuted);

  // 5. Desembolsos pendientes (M02-DISB-01)
  // Fórmula canónica: Monto comprometido en convenios activos menos desembolsos efectivamente pagados (PAGADO)
  let pendingDisbursementsCount = 0;
  let pendingDisbursementsAmount = 0;

  const agrIds = activeAgreements.map(a => a.id);
  if (agrIds.length > 0) {
    const allDisbs = await db.select({
      id: disbursements.id,
      agreementId: disbursements.agreementId,
      amount: disbursements.amount,
      status: disbursements.status
    }).from(disbursements).where(inArray(disbursements.agreementId, agrIds));

    const totalCommittedAgreements = activeAgreements.reduce((sum, a) => sum + Number(a.amount || 0), 0);
    const totalPaidDisbursed = allDisbs
      .filter(d => d.status === 'PAGADO' || d.status === 'pagado')
      .reduce((sum, d) => sum + Number(d.amount || 0), 0);

    pendingDisbursementsAmount = Math.max(0, totalCommittedAgreements - totalPaidDisbursed);

    const pendingDisbRows = allDisbs.filter(d => d.status === 'PENDIENTE' || d.status === 'ATRASADO');
    if (pendingDisbRows.length > 0) {
      pendingDisbursementsCount = pendingDisbRows.length;
    } else if (pendingDisbursementsAmount > 0) {
      pendingDisbursementsCount = activeAgreements.filter(a => Number(a.amount) > 0).length;
    } else {
      pendingDisbursementsCount = 0;
    }
  }

  const result: DashboardMetricsDto = {
    totalBudget: totalApprovedBudget,
    totalExecuted,
    availableBalance,
    avgPhysical,
    avgFinancial,
    avgScore,
    highRiskProjectsCount: highRiskCount,
    highRiskProjectsDetails: highRiskDetails,
    statusDistribution: statusDist,
    pendingDisbursementsCount,
    pendingDisbursementsAmount,
    projectsList: formattedProjects
  };

  metricsCache.set(cacheKey, { data: result, timestamp: Date.now() });
  return result;
}
