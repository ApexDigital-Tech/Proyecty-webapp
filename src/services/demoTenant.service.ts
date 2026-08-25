import { db } from '../db/index.ts';
import {
  organizations,
  roles,
  users,
  donors,
  projects,
  agreements,
  budgetVersions,
  budgetLines,
  tasks,
  taskDependencies,
  expenses,
  receiptsVouchers,
  documents,
  auditLogs,
} from '../db/schema.ts';
import { eq, inArray } from 'drizzle-orm';

export const DEMO_ORG_NAME = 'ORG-DEMO-PROYECTY';

export interface DemoUserDefinition {
  roleKey: 'DIRECTOR' | 'MANAGER' | 'FINANCE' | 'AUDITOR' | 'FINANCIADOR';
  roleName: string;
  name: string;
  email: string;
  uid: string;
  title: string;
}

export const DEMO_USERS_CATALOG: DemoUserDefinition[] = [
  {
    roleKey: 'DIRECTOR',
    roleName: 'Director',
    name: 'Gonzalo Alfaro (Demo)',
    email: 'demo.director@proyecty.org',
    uid: 'demo-usr-director-isolated-001',
    title: 'Director General',
  },
  {
    roleKey: 'MANAGER',
    roleName: 'Coordinador de Proyecto',
    name: 'Rodrigo Gómez (Demo)',
    email: 'demo.manager@proyecty.org',
    uid: 'demo-usr-manager-isolated-002',
    title: 'Coordinador de Proyecto',
  },
  {
    roleKey: 'FINANCE',
    roleName: 'Administrativo / Finanzas',
    name: 'Karla Martínez (Demo)',
    email: 'demo.finance@proyecty.org',
    uid: 'demo-usr-finance-isolated-003',
    title: 'Responsable de Finanzas',
  },
  {
    roleKey: 'AUDITOR',
    roleName: 'Auditor',
    name: 'Andrés Peña (Demo)',
    email: 'demo.auditor@proyecty.org',
    uid: 'demo-usr-auditor-isolated-004',
    title: 'Auditor Externo',
  },
  {
    roleKey: 'FINANCIADOR',
    roleName: 'Donante / Financiador',
    name: 'Representante USAID (Demo)',
    email: 'demo.financiador@proyecty.org',
    uid: 'demo-usr-financiador-isolated-005',
    title: 'Oficial de Cooperación',
  },
];

export async function getOrCreateDemoTenant(): Promise<{ orgId: number; users: (DemoUserDefinition & { dbId: number })[] }> {
  // 1. Get or create Demo Org
  let demoOrg = await db.select().from(organizations).where(eq(organizations.name, DEMO_ORG_NAME)).limit(1);
  let orgId: number;

  if (demoOrg.length === 0) {
    const inserted = await db.insert(organizations).values({
      name: DEMO_ORG_NAME,
      subscriptionPlan: 'ENTERPRISE_DEMO',
      isActive: true,
      subscriptionStatus: 'active',
    }).returning();
    orgId = inserted[0].id;
  } else {
    orgId = demoOrg[0].id;
  }

  // 2. Fetch available roles
  const dbRoles = await db.select().from(roles);
  const findRoleId = (roleName: string) => {
    const matched = dbRoles.find(r => r.name.toLowerCase() === roleName.toLowerCase() || r.name.toLowerCase().includes(roleName.toLowerCase()));
    return matched ? matched.id : dbRoles[0]?.id || 1;
  };

  // 3. Upsert Demo Users
  const resolvedUsers: (DemoUserDefinition & { dbId: number })[] = [];

  for (const def of DEMO_USERS_CATALOG) {
    const roleId = findRoleId(def.roleName);
    const existing = await db.select().from(users).where(eq(users.uid, def.uid)).limit(1);

    if (existing.length > 0) {
      await db.update(users)
        .set({
          tenantId: orgId,
          email: def.email,
          name: def.name,
          roleId,
          isActive: true,
        })
        .where(eq(users.id, existing[0].id));
      resolvedUsers.push({ ...def, dbId: existing[0].id });
    } else {
      const inserted = await db.insert(users).values({
        tenantId: orgId,
        uid: def.uid,
        email: def.email,
        name: def.name,
        roleId,
        avatarUrl: `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(def.name)}`,
        isActive: true,
      }).returning();
      resolvedUsers.push({ ...def, dbId: inserted[0].id });
    }
  }

  return { orgId, users: resolvedUsers };
}

export async function resetDemoTenantData(): Promise<{ success: boolean; message: string; orgId: number }> {
  console.log('[Demo Service] Iniciando reseteo controlado del tenant demo...');
  const { orgId, users: demoUsersList } = await getOrCreateDemoTenant();

  const directorUser = demoUsersList.find(u => u.roleKey === 'DIRECTOR') || demoUsersList[0];
  const managerUser = demoUsersList.find(u => u.roleKey === 'MANAGER') || demoUsersList[0];

  // 1. Clean existing demo data for this tenant
  const existingProjects = await db.select({ id: projects.id }).from(projects).where(eq(projects.tenantId, orgId));
  const projectIds = existingProjects.map(p => p.id);

  if (projectIds.length > 0) {
    await db.delete(tasks).where(inArray(tasks.projectId, projectIds));
    await db.delete(agreements).where(inArray(agreements.projectId, projectIds));
    await db.delete(expenses).where(inArray(expenses.projectId, projectIds));
    await db.delete(receiptsVouchers).where(inArray(receiptsVouchers.projectId, projectIds));
    await db.delete(documents).where(inArray(documents.projectId, projectIds));
    await db.delete(budgetLines).where(inArray(budgetLines.projectId, projectIds));
    await db.delete(budgetVersions).where(inArray(budgetVersions.projectId, projectIds));
    await db.delete(projects).where(eq(projects.tenantId, orgId));
  }

  await db.delete(donors).where(eq(donors.tenantId, orgId));
  // audit_logs no se elimina: es inmutable por diseño y protegido por triggers de PostgreSQL (M-15)

  // 2. Seed Donor
  const insertedDonor = await db.insert(donors).values({
    tenantId: orgId,
    name: 'Cooperación Internacional para el Desarrollo (USAID / AECID)',
    type: 'Internacional',
    contactEmail: 'cooperacion.demo@proyecty.org',
  }).returning();
  const donorId = insertedDonor[0].id;

  // 3. Seed Demo Project
  const insertedProject = await db.insert(projects).values({
    tenantId: orgId,
    code: 'PRJ-DEMO-2026',
    name: '[DEMO] Proyecto Piloto de Desarrollo Comunitario y Sostenibilidad',
    donorId,
    status: 'EJECUCIÓN',
    riskLevel: 'Bajo',
    approvedBudget: 150000.0,
    physicalProgress: 75,
    financialProgress: 38,
    nextMilestoneDate: '2026-09-15',
    nextMilestoneTitle: 'Presentación de Informe Semestral de Ejecución',
    description: 'Proyecto demostrativo con datos ficticios para evaluación técnica y operativa de Proyecty v1.0.',
    baseCurrency: 'USD',
  }).returning();
  const projectId = insertedProject[0].id;

  // 4. Seed Agreement
  await db.insert(agreements).values({
    projectId,
    counterparty: 'Agencia Internacional de Cooperación',
    signedDate: new Date('2026-01-15T00:00:00Z'),
    amount: 150000.0,
    currency: 'USD',
    durationMonths: 12,
    startDate: new Date('2026-01-15T00:00:00Z'),
    endDate: new Date('2027-01-14T00:00:00Z'),
    remainingDays: 143,
    status: 'Activo',
  });

  // 5. Seed Budget Version & Lines
  const insertedVersion = await db.insert(budgetVersions).values({
    tenantId: orgId,
    projectId,
    versionName: 'V1 - Inicial Aprobado',
    versionNumber: 1,
    status: 'APPROVED',
    isApproved: true,
    approvedBy: directorUser.dbId,
  }).returning();
  const budgetVersionId = insertedVersion[0].id;

  const insertedBudgetLines = await db.insert(budgetLines).values([
    {
      projectId,
      budgetVersionId,
      code: 'BL-01',
      category: 'Talento Humano',
      subcategory: 'Personal Técnico de Terreno',
      approvedAmount: 60000.0,
      executedAmount: 24000.0,
      balance: 36000.0,
      progress: 40,
    },
    {
      projectId,
      budgetVersionId,
      code: 'BL-02',
      category: 'Infraestructura',
      subcategory: 'Equipamiento e Insumos Comunitarios',
      approvedAmount: 50000.0,
      executedAmount: 21500.0,
      balance: 28500.0,
      progress: 43,
    },
    {
      projectId,
      budgetVersionId,
      code: 'BL-03',
      category: 'Capacitación',
      subcategory: 'Talleres y Fortalecimiento Local',
      approvedAmount: 25000.0,
      executedAmount: 8500.0,
      balance: 16500.0,
      progress: 34,
    },
    {
      projectId,
      budgetVersionId,
      code: 'BL-04',
      category: 'Monitoreo y Auditoría',
      subcategory: 'Auditoría Externa Independiente',
      approvedAmount: 15000.0,
      executedAmount: 3000.0,
      balance: 12000.0,
      progress: 20,
    },
  ]).returning();

  // 5.1 Seed Approved Expenses for the 4 budget lines to ensure 100% data consistency
  await db.insert(expenses).values([
    {
      tenantId: orgId,
      projectId,
      budgetLineId: insertedBudgetLines[0].id,
      title: 'Honorarios Especialista Técnico en Desarrollo Comunitario (Q1-Q2)',
      amount: 24000.0,
      category: 'Talento Humano',
      currency: 'USD',
      date: new Date('2026-02-15T00:00:00Z'),
      status: 'approved',
      registeredBy: managerUser.dbId,
      approvedBy: directorUser.dbId,
    },
    {
      tenantId: orgId,
      projectId,
      budgetLineId: insertedBudgetLines[1].id,
      title: 'Adquisición de Lote 1 - Equipamiento Comunitario e Insumos',
      amount: 21500.0,
      category: 'Infraestructura',
      currency: 'USD',
      date: new Date('2026-03-01T00:00:00Z'),
      status: 'approved',
      registeredBy: managerUser.dbId,
      approvedBy: directorUser.dbId,
    },
    {
      tenantId: orgId,
      projectId,
      budgetLineId: insertedBudgetLines[2].id,
      title: 'Desarrollo de Talleres Participativos y Material Didáctico',
      amount: 8500.0,
      category: 'Capacitación',
      currency: 'USD',
      date: new Date('2026-03-10T00:00:00Z'),
      status: 'approved',
      registeredBy: managerUser.dbId,
      approvedBy: directorUser.dbId,
    },
    {
      tenantId: orgId,
      projectId,
      budgetLineId: insertedBudgetLines[3].id,
      title: 'Auditoría Financiera de Medio Término',
      amount: 3000.0,
      category: 'Monitoreo y Auditoría',
      currency: 'USD',
      date: new Date('2026-03-20T00:00:00Z'),
      status: 'approved',
      registeredBy: managerUser.dbId,
      approvedBy: directorUser.dbId,
    },
  ]);

  // 6. Seed Tasks con pesos, progreso y dependencias explícitas (M-07)
  const insertedTasks = await db.insert(tasks).values([
    {
      tenantId: orgId,
      projectId,
      title: 'Diagnóstico participativo en comunidades beneficiarias',
      description: 'Levantamiento de necesidades prioritarias con líderes comunitarios.',
      status: 'DONE',
      priority: 'HIGH',
      assigneeId: managerUser.dbId,
      createdBy: directorUser.dbId,
      startDate: new Date('2026-02-01T00:00:00Z'),
      dueDate: new Date('2026-03-15T00:00:00Z'),
      weight: 50,
      progress: 100,
      position: 0,
    },
    {
      tenantId: orgId,
      projectId,
      title: 'Adquisición de equipamiento y materiales para talleres',
      description: 'Proceso de licitación y compra de insumos técnicos.',
      status: 'IN_PROGRESS',
      priority: 'MEDIUM',
      assigneeId: managerUser.dbId,
      createdBy: directorUser.dbId,
      startDate: new Date('2026-04-01T00:00:00Z'),
      dueDate: new Date('2026-09-30T00:00:00Z'),
      weight: 50,
      progress: 50,
      position: 1,
    },
  ]).returning();

  // Dependencia: La tarea 2 depende de la tarea 1
  if (insertedTasks.length >= 2) {
    await db.insert(taskDependencies).values({
      taskId: insertedTasks[1].id,
      dependsOnId: insertedTasks[0].id,
    });
  }

  // Actualizar avance físico y financiero del proyecto demo: (50*100 + 50*50)/100 = 75% físico, 57000/150000 = 38% financiero
  await db.update(projects).set({ physicalProgress: 75, financialProgress: 38 }).where(eq(projects.id, projectId));

  // 7. Log audit event
  await db.insert(auditLogs).values({
    tenantId: orgId,
    userId: managerUser.dbId,
    userName: managerUser.name,
    action: 'DEMO_DATA_RESET',
    entity: 'organization',
    entityId: String(orgId),
    metadata: {
      details: 'Reinicio programado/manual de datos del tenant demo a estado base ficticio.',
      resetAtUtc: new Date().toISOString(),
    },
  });

  console.log('[Demo Service] Reseteo del tenant demo completado exitosamente.');
  return { success: true, message: 'Datos del tenant demo reiniciados correctamente.', orgId };
}

// Scheduled 24-hour automatic reset interval
let autoResetTimer: NodeJS.Timeout | null = null;
export function initDemoAutoResetScheduler(intervalHours: number = 24) {
  if (autoResetTimer) return;
  const intervalMs = intervalHours * 60 * 60 * 1000;
  console.log(`[Demo Service] Programador de reinicio automático activo (cada ${intervalHours} horas).`);
  
  autoResetTimer = setInterval(async () => {
    try {
      await resetDemoTenantData();
    } catch (err) {
      console.error('[Demo Service] Error en reinicio automático programado:', err);
    }
  }, intervalMs);
}
