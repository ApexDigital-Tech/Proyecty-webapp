import { db } from '../db/index.ts';
import {
  organizations,
  users,
  roles,
  projects,
  projectMembers,
  agreements,
  disbursements,
  budgetLines,
  budgetVersions,
  expenses,
  documents,
  tasks,
  taskDependencies,
  receiptsVouchers,
  auditLogs,
  donors,
} from '../db/schema.ts';
import { eq, and, or, sql, inArray } from 'drizzle-orm';
import { UserRole } from '../types.ts';
import { invalidateDashboardCache } from './dashboard.service.ts';
import { recalculateFinancialState } from './expenses.service.ts';
import { calculatePhysicalProgress } from './schedule.service.ts';

export const DEMO_ORG_NAME = 'VOSERDEM — Entorno demostrativo';

export interface DemoUserDef {
  roleKey: UserRole;
  email: string;
  name: string;
  title: string;
  roleName: string;
  uid: string;
}

export const DEMO_USERS_CATALOG: DemoUserDef[] = [
  {
    roleKey: 'DIRECTOR',
    email: 'director.demo@voserdem.test',
    name: 'Director Demo VOSERDEM',
    title: 'Director General',
    roleName: 'Director',
    uid: 'demo-usr-director-isolated-001',
  },
  {
    roleKey: 'MANAGER',
    email: 'coordinador.demo@voserdem.test',
    name: 'Coordinador Demo VOSERDEM',
    title: 'Coordinador de Proyecto',
    roleName: 'Manager',
    uid: 'demo-usr-manager-isolated-002',
  },
  {
    roleKey: 'FINANCE',
    email: 'finanzas.demo@voserdem.test',
    name: 'Finanzas Demo VOSERDEM',
    title: 'Responsable de Finanzas',
    roleName: 'Finanzas',
    uid: 'demo-usr-finance-isolated-003',
  },
  {
    roleKey: 'AUDITOR',
    email: 'auditor.demo@voserdem.test',
    name: 'Auditor Demo VOSERDEM',
    title: 'Auditor Externo',
    roleName: 'Auditor',
    uid: 'demo-usr-auditor-isolated-004',
  },
  {
    roleKey: 'RESPONSABLE_PROYECTO',
    email: 'responsable.demo@voserdem.test',
    name: 'Responsable Proyecto Demo VOSERDEM',
    title: 'Responsable de Proyecto',
    roleName: 'Responsable de Proyecto',
    uid: 'demo-usr-responsable-isolated-005',
  },
  {
    roleKey: 'FINANCIADOR',
    email: 'financiador.demo@voserdem.test',
    name: 'Financiador Demo',
    title: 'Oficial de Cooperación',
    roleName: 'Financiador',
    uid: 'demo-usr-financiador-isolated-006',
  },
];

export async function getOrCreateDemoTenant(): Promise<{ orgId: number; users: Array<DemoUserDef & { dbId: number }> }> {
  // 1. Ensure Demo Organization exists
  let org = await db.select().from(organizations).where(eq(organizations.name, DEMO_ORG_NAME)).limit(1);
  let orgId: number;

  if (org.length === 0) {
    const inserted = await db.insert(organizations).values({
      name: DEMO_ORG_NAME,
      subscriptionPlan: 'ENTERPRISE_DEMO',
      subscriptionStatus: 'ACTIVE',
    }).returning();
    orgId = inserted[0].id;
  } else {
    orgId = org[0].id;
  }

  // 2. Fetch system roles
  const systemRoles = await db.select().from(roles);
  const roleMap = new Map<string, number>();
  for (const r of systemRoles) {
    roleMap.set(r.name, r.id);
  }

  // 3. Ensure the 6 demo users exist with exact canonical emails, UIDs and isolated scopes
  const resolvedUsers: Array<DemoUserDef & { dbId: number }> = [];

  for (const def of DEMO_USERS_CATALOG) {
    const roleId = roleMap.get(def.roleKey) || 1;
    const existing = await db.select().from(users).where(
      or(
        eq(users.uid, def.uid),
        and(eq(users.tenantId, orgId), eq(users.email, def.email))
      )
    ).limit(1);

    if (existing.length > 0) {
      await db.update(users)
        .set({
          tenantId: orgId,
          uid: def.uid,
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
  console.log('[Demo Service] Iniciando reseteo controlado del tenant demo VOSERDEM...');
  const { orgId, users: demoUsersList } = await getOrCreateDemoTenant();

  const directorUser = demoUsersList.find(u => u.roleKey === 'DIRECTOR') || demoUsersList[0];
  const managerUser = demoUsersList.find(u => u.roleKey === 'MANAGER') || demoUsersList[0];
  const financeUser = demoUsersList.find(u => u.roleKey === 'FINANCE') || demoUsersList[2];
  const responsableUser = demoUsersList.find(u => u.roleKey === 'RESPONSABLE_PROYECTO') || demoUsersList[4];

  // 1. Clean existing demo data exclusively for this tenant or demo codes
  const existingProjects = await db.select({ id: projects.id }).from(projects).where(
    or(
      eq(projects.tenantId, orgId),
      inArray(projects.code, ['PRJ-DEMO-2026', 'PRJ-DEMO-2026-B'])
    )
  );
  const projectIds = existingProjects.map(p => p.id);

  if (projectIds.length > 0) {
    await db.delete(projectMembers).where(inArray(projectMembers.projectId, projectIds)).catch(() => {});
    await db.delete(taskDependencies).where(sql`task_id IN (SELECT id FROM tasks WHERE project_id IN (${sql.join(projectIds, sql`, `)}))`).catch(() => {});
    await db.delete(tasks).where(inArray(tasks.projectId, projectIds));
    await db.delete(disbursements).where(sql`agreement_id IN (SELECT id FROM agreements WHERE project_id IN (${sql.join(projectIds, sql`, `)}))`).catch(() => {});
    await db.delete(agreements).where(inArray(agreements.projectId, projectIds));
    await db.delete(receiptsVouchers).where(inArray(receiptsVouchers.projectId, projectIds));
    await db.delete(expenses).where(inArray(expenses.projectId, projectIds));
    await db.delete(documents).where(inArray(documents.projectId, projectIds));
    await db.delete(budgetLines).where(inArray(budgetLines.projectId, projectIds));
    await db.delete(budgetVersions).where(inArray(budgetVersions.projectId, projectIds));
    await db.delete(projects).where(inArray(projects.id, projectIds));
  }

  // Limpiar gastos del tenant demo (incluso huérfanos sin proyecto)
  await db.delete(expenses).where(eq(expenses.tenantId, orgId)).catch(() => {});
  await db.delete(documents).where(eq(documents.tenantId, orgId)).catch(() => {});
  await db.delete(donors).where(eq(donors.tenantId, orgId)).catch(() => {});

  // 2. Seed Fictional Donors (2 donantes independientes)
  const insertedDonorA = await db.insert(donors).values({
    tenantId: orgId,
    name: 'Agencia Internacional de Cooperación — Entidad ficticia',
    type: 'Internacional',
    contactEmail: 'cooperacion.demo@voserdem.test',
  }).returning();
  const donorIdA = insertedDonorA[0].id;

  const insertedDonorB = await db.insert(donors).values({
    tenantId: orgId,
    name: 'Fondo de Desarrollo Sostenible — Entidad ficticia',
    type: 'Internacional',
    contactEmail: 'fondodesarrollo.demo@voserdem.test',
  }).returning();
  const donorIdB = insertedDonorB[0].id;

  // =========================================================================
  // 3. PROYECTO A: PRJ-DEMO-2026 (Flujo Principal VOSERDEM)
  // =========================================================================
  const insertedProjectA = await db.insert(projects).values({
    tenantId: orgId,
    code: 'PRJ-DEMO-2026',
    name: 'Proyecto Piloto de Fortalecimiento Comunitario, Agua y Sostenibilidad',
    donorId: donorIdA,
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
  const projectIdA = insertedProjectA[0].id;

  const financiadorUser = demoUsersList.find(u => u.roleKey === 'FINANCIADOR');

  // 3.1 Project Members for Project A (Asignado expresamente al Responsable de Proyecto y Financiador)
  const membersA = [
    {
      projectId: projectIdA,
      userId: responsableUser.dbId,
      roleInProject: 'Manager',
    },
    {
      projectId: projectIdA,
      userId: managerUser.dbId,
      roleInProject: 'Manager',
    },
    {
      projectId: projectIdA,
      userId: directorUser.dbId,
      roleInProject: 'Manager',
    },
  ];

  if (financiadorUser) {
    membersA.push({
      projectId: projectIdA,
      userId: financiadorUser.dbId,
      roleInProject: 'Financiador',
    });
  }

  await db.insert(projectMembers).values(membersA);

  // 3.2 Agreement & Initial Disbursement for Project A
  const insertedAgreementsA = await db.insert(agreements).values({
    projectId: projectIdA,
    counterparty: 'Agencia Internacional de Cooperación — Entidad ficticia',
    signedDate: new Date('2026-01-15T00:00:00Z'),
    amount: 150000.0,
    durationMonths: 12,
    startDate: new Date('2026-01-15T00:00:00Z'),
    endDate: new Date('2027-01-14T23:59:59Z'),
    remainingDays: 139,
    status: 'Activo',
  }).returning();
  const agreementIdA = insertedAgreementsA[0].id;

  await db.insert(disbursements).values({
    agreementId: agreementIdA,
    milestoneTitle: 'Firma de Convenio y Desembolso Inicial (40%)',
    estimatedDate: new Date('2026-01-20T00:00:00Z'),
    amount: 60000.0,
    condition: 'Aprobación del Plan Operativo Anual y firma de convenio',
    status: 'Desembolsado',
  });

  // 3.3 Budget Version & 4 Budget Lines for Project A (Inicialmente executedAmount = 0)
  const insertedBudgetVersionA = await db.insert(budgetVersions).values({
    tenantId: orgId,
    projectId: projectIdA,
    versionName: 'Presupuesto Operativo Inicial Aprobado 2026',
    versionNumber: 1,
    status: 'APPROVED',
    isApproved: true,
    approvedBy: directorUser.dbId,
  }).returning();
  const budgetVersionIdA = insertedBudgetVersionA[0].id;

  const insertedBudgetLinesA = await db.insert(budgetLines).values([
    {
      projectId: projectIdA,
      budgetVersionId: budgetVersionIdA,
      code: 'BL-01',
      category: 'Talento Humano',
      subcategory: 'Consultoría y Personal Técnico',
      approvedAmount: 60000.0,
      reformulatedAmount: 60000.0,
      executedAmount: 0.0,
      balance: 60000.0,
      progress: 0,
      status: 'NORMAL',
    },
    {
      projectId: projectIdA,
      budgetVersionId: budgetVersionIdA,
      code: 'BL-02',
      category: 'Infraestructura y Equipamiento',
      subcategory: 'Sistemas de Filtración y Obras',
      approvedAmount: 50000.0,
      reformulatedAmount: 50000.0,
      executedAmount: 0.0,
      balance: 50000.0,
      progress: 0,
      status: 'NORMAL',
    },
    {
      projectId: projectIdA,
      budgetVersionId: budgetVersionIdA,
      code: 'BL-03',
      category: 'Capacitación y Talleres',
      subcategory: 'Talleres Comunitarios y Materiales',
      approvedAmount: 25000.0,
      reformulatedAmount: 25000.0,
      executedAmount: 0.0,
      balance: 25000.0,
      progress: 0,
      status: 'NORMAL',
    },
    {
      projectId: projectIdA,
      budgetVersionId: budgetVersionIdA,
      code: 'BL-04',
      category: 'Monitoreo y Auditoría',
      subcategory: 'Auditoría Externa e Informes',
      approvedAmount: 15000.0,
      reformulatedAmount: 15000.0,
      executedAmount: 0.0,
      balance: 15000.0,
      progress: 0,
      status: 'NORMAL',
    },
  ]).returning();

  // 3.4 Seed Initial Approved Expenses + 1 Pending Expense con baseAmount y exchangeRate
  const insertedExpensesA = await db.insert(expenses).values([
    {
      tenantId: orgId,
      projectId: projectIdA,
      budgetLineId: insertedBudgetLinesA[0].id,
      title: 'Honorarios Técnicos Especialista Social — Trimestre 1',
      amount: 24000.0,
      currency: 'USD',
      exchangeRate: 1.0,
      baseAmount: 24000.0,
      category: 'Talento Humano',
      date: new Date('2026-02-15T00:00:00Z'),
      status: 'approved',
      registeredBy: managerUser.dbId,
      approvedBy: directorUser.dbId,
    },
    {
      tenantId: orgId,
      projectId: projectIdA,
      budgetLineId: insertedBudgetLinesA[1].id,
      title: 'Adquisición de Lote 1 — Sistemas de Filtración Comunitarios',
      amount: 21500.0,
      currency: 'USD',
      exchangeRate: 1.0,
      baseAmount: 21500.0,
      category: 'Infraestructura y Equipamiento',
      date: new Date('2026-03-01T00:00:00Z'),
      status: 'approved',
      registeredBy: managerUser.dbId,
      approvedBy: directorUser.dbId,
    },
    {
      tenantId: orgId,
      projectId: projectIdA,
      budgetLineId: insertedBudgetLinesA[2].id,
      title: 'Desarrollo de Talleres Participativos y Material Didáctico',
      amount: 8500.0,
      currency: 'USD',
      exchangeRate: 1.0,
      baseAmount: 8500.0,
      category: 'Capacitación y Talleres',
      date: new Date('2026-03-10T00:00:00Z'),
      status: 'approved',
      registeredBy: managerUser.dbId,
      approvedBy: directorUser.dbId,
    },
    {
      tenantId: orgId,
      projectId: projectIdA,
      budgetLineId: insertedBudgetLinesA[3].id,
      title: 'Auditoría Financiera de Medio Término',
      amount: 3000.0,
      currency: 'USD',
      exchangeRate: 1.0,
      baseAmount: 3000.0,
      category: 'Monitoreo y Auditoría',
      date: new Date('2026-03-20T00:00:00Z'),
      status: 'approved',
      registeredBy: managerUser.dbId,
      approvedBy: directorUser.dbId,
    },
    // Gasto pendiente de USD 6.000 en BL-02 (NO se suma a la ejecución)
    {
      tenantId: orgId,
      projectId: projectIdA,
      budgetLineId: insertedBudgetLinesA[1].id,
      title: 'Adquisición de Lote 2 — Sistemas de Filtración Comunitarios',
      amount: 6000.0,
      currency: 'USD',
      exchangeRate: 1.0,
      baseAmount: 6000.0,
      category: 'Infraestructura y Equipamiento',
      date: new Date('2026-06-15T00:00:00Z'),
      status: 'pending',
      registeredBy: responsableUser.dbId,
      approvedBy: null,
    },
  ]).returning();

  // 3.5 Inserción de Comprobantes reales en receipts_vouchers vinculados a cada gasto
  await db.insert(receiptsVouchers).values([
    {
      projectId: projectIdA,
      expenseId: insertedExpensesA[0].id,
      budgetLineId: insertedBudgetLinesA[0].id,
      type: 'Factura',
      amount: 24000.0,
      currency: 'USD',
      provider: 'Consultora Social & Desarrollo S.R.L.',
      issueDate: new Date('2026-02-15T00:00:00Z'),
      fileName: 'factura_honorarios_trimestre1.pdf',
      fileUrl: '/fixtures/demo/comprobante_filtracion_demo.pdf',
      isVerified: true,
      verifiedBy: directorUser.dbId,
      description: 'Factura de honorarios técnicos profesionales debidamente validada',
    },
    {
      projectId: projectIdA,
      expenseId: insertedExpensesA[1].id,
      budgetLineId: insertedBudgetLinesA[1].id,
      type: 'Factura',
      amount: 21500.0,
      currency: 'USD',
      provider: 'EcoTecnologías Hidráulicas S.A.',
      issueDate: new Date('2026-03-01T00:00:00Z'),
      fileName: 'factura_filtracion_lote1.pdf',
      fileUrl: '/fixtures/demo/comprobante_filtracion_demo.pdf',
      isVerified: true,
      verifiedBy: directorUser.dbId,
      description: 'Factura comercial de compra e instalación de equipos de filtración',
    },
    {
      projectId: projectIdA,
      expenseId: insertedExpensesA[2].id,
      budgetLineId: insertedBudgetLinesA[2].id,
      type: 'Factura',
      amount: 8500.0,
      currency: 'USD',
      provider: 'Instituto de Formación Comunitaria',
      issueDate: new Date('2026-03-10T00:00:00Z'),
      fileName: 'factura_talleres_comunitarios.pdf',
      fileUrl: '/fixtures/demo/comprobante_filtracion_demo.pdf',
      isVerified: true,
      verifiedBy: directorUser.dbId,
      description: 'Factura de materiales y facilitación pedagógica para talleres',
    },
    {
      projectId: projectIdA,
      expenseId: insertedExpensesA[3].id,
      budgetLineId: insertedBudgetLinesA[3].id,
      type: 'Factura',
      amount: 3000.0,
      currency: 'USD',
      provider: 'Auditoría & Control Contable S.A.',
      issueDate: new Date('2026-03-20T00:00:00Z'),
      fileName: 'factura_auditoria_externa.pdf',
      fileUrl: '/fixtures/demo/comprobante_filtracion_demo.pdf',
      isVerified: true,
      verifiedBy: directorUser.dbId,
      description: 'Dictamen y factura de auditoría financiera de medio término',
    },
    {
      projectId: projectIdA,
      expenseId: insertedExpensesA[4].id,
      budgetLineId: insertedBudgetLinesA[1].id,
      type: 'Factura',
      amount: 6000.0,
      currency: 'USD',
      provider: 'EcoTecnologías Hidráulicas S.A.',
      issueDate: new Date('2026-06-15T00:00:00Z'),
      fileName: 'factura_filtracion_lote2_pendiente.pdf',
      fileUrl: '/fixtures/demo/comprobante_filtracion_demo.pdf',
      isVerified: false,
      description: 'Factura de respaldo pendiente para adquisición de Lote 2',
    },
  ]);

  // 3.6 Recálculo Canónico Derivado (Única Fuente de Verdad para ejecución y saldos)
  for (const bLine of insertedBudgetLinesA) {
    await recalculateFinancialState(orgId, projectIdA, bLine.id, db);
  }

  // 3.7 Tasks & Dependencies for Project A (75% avance físico derivado)
  const insertedTasksA = await db.insert(tasks).values([
    {
      tenantId: orgId,
      projectId: projectIdA,
      title: 'Diagnóstico participativo en comunidades beneficiarias',
      description: 'Levantamiento de necesidades prioritarias con líderes comunitarios.',
      status: 'DONE',
      priority: 'HIGH',
      assigneeId: responsableUser.dbId,
      createdBy: directorUser.dbId,
      startDate: new Date('2026-02-01T00:00:00Z'),
      dueDate: new Date('2026-03-15T00:00:00Z'),
      weight: 50,
      progress: 100,
      position: 0,
    },
    {
      tenantId: orgId,
      projectId: projectIdA,
      title: 'Instalación y ensamblaje de módulos técnicos',
      description: 'Proceso de licitación, adquisición y montaje de insumos técnicos.',
      status: 'IN_PROGRESS',
      priority: 'MEDIUM',
      assigneeId: responsableUser.dbId,
      createdBy: directorUser.dbId,
      startDate: new Date('2026-04-01T00:00:00Z'),
      dueDate: new Date('2026-09-30T00:00:00Z'),
      weight: 50,
      progress: 50,
      position: 1,
    },
  ]).returning();

  if (insertedTasksA.length >= 2) {
    await db.insert(taskDependencies).values({
      taskId: insertedTasksA[1].id,
      dependsOnId: insertedTasksA[0].id,
    });
  }

  // Derivar avance físico del proyecto
  const projectTasks = await db.select({
    weight: tasks.weight,
    progress: tasks.progress,
    status: tasks.status,
  }).from(tasks).where(eq(tasks.projectId, projectIdA));
  const calculatedPhysical = calculatePhysicalProgress(projectTasks);
  await db.update(projects).set({ physicalProgress: calculatedPhysical }).where(eq(projects.id, projectIdA));

  // 3.8 Documents for Project A
  await db.insert(documents).values([
    {
      tenantId: orgId,
      projectId: projectIdA,
      uploadedBy: responsableUser.dbId,
      name: 'Comprobante Adquisición Lote 2 - Filtración',
      originalName: 'comprobante_filtracion_demo.pdf',
      mimeType: 'application/pdf',
      size: '707',
      type: 'Comprobante',
      uploadDate: '2026-06-15',
      fileUrl: '/fixtures/demo/comprobante_filtracion_demo.pdf',
      metadata: {
        sha256: 'f9680d1e45289e4f1262acab8a4207aa0913846037e08b126581f220acc84f8e',
        scanStatus: 'CLEAN',
        retentionPolicy: '5_YEARS_AUDIT',
      },
    },
    {
      tenantId: orgId,
      projectId: projectIdA,
      uploadedBy: responsableUser.dbId,
      name: 'Informe Técnico Avance Instalación Módulos',
      originalName: 'informe_tecnico_instalacion_demo.pdf',
      mimeType: 'application/pdf',
      size: '706',
      type: 'Informe Técnico',
      uploadDate: '2026-06-20',
      fileUrl: '/fixtures/demo/informe_tecnico_instalacion_demo.pdf',
      metadata: {
        sha256: 'f92ec138b34ec13394b746b5e521d0162ec966f02b6070812b6ca9cf39eff623',
        scanStatus: 'CLEAN',
        retentionPolicy: '5_YEARS_AUDIT',
      },
    },
  ]);

  // =========================================================================
  // 4. PROYECTO B: PRJ-DEMO-2026-B (Control de Aislamiento e Independencia)
  // =========================================================================
  const insertedProjectB = await db.insert(projects).values({
    tenantId: orgId,
    code: 'PRJ-DEMO-2026-B',
    name: 'Capacitación y fortalecimiento productivo comunitario',
    donorId: donorIdB,
    status: 'PLANIFICACIÓN',
    riskLevel: 'Bajo',
    approvedBudget: 45000.0,
    physicalProgress: 0,
    financialProgress: 0,
    nextMilestoneDate: '2026-11-30',
    nextMilestoneTitle: 'Aprobación del Plan Operativo Anual de Capacitación',
    description: 'Segundo proyecto demostrativo para validación de aislamiento operativo, presupuestario y de visibilidad.',
    baseCurrency: 'USD',
  }).returning();
  const projectIdB = insertedProjectB[0].id;

  // 4.1 Project Members for Project B (NO asignado a Responsable de Proyecto)
  await db.insert(projectMembers).values([
    {
      projectId: projectIdB,
      userId: managerUser.dbId,
      roleInProject: 'Manager',
    },
    {
      projectId: projectIdB,
      userId: directorUser.dbId,
      roleInProject: 'Manager',
    },
  ]);

  // 4.2 Agreement for Project B ($45,000 USD, 0 desembolsos iniciales)
  const insertedAgreementsB = await db.insert(agreements).values({
    projectId: projectIdB,
    counterparty: 'Fondo de Desarrollo Sostenible — Entidad ficticia',
    signedDate: new Date('2026-05-01T00:00:00Z'),
    amount: 45000.0,
    durationMonths: 12,
    startDate: new Date('2026-05-01T00:00:00Z'),
    endDate: new Date('2027-04-30T23:59:59Z'),
    remainingDays: 245,
    status: 'Planificación',
  }).returning();

  // 4.3 Budget Version & 2 Budget Lines for Project B ($45k total, $0 ejecutado)
  const insertedBudgetVersionB = await db.insert(budgetVersions).values({
    tenantId: orgId,
    projectId: projectIdB,
    versionName: 'Presupuesto Inicial en Formulación 2026',
    versionNumber: 1,
    status: 'DRAFT',
    isApproved: false,
    approvedBy: null,
  }).returning();
  const budgetVersionIdB = insertedBudgetVersionB[0].id;

  await db.insert(budgetLines).values([
    {
      projectId: projectIdB,
      budgetVersionId: budgetVersionIdB,
      code: 'BL-B01',
      category: 'Capacitación y Talleres',
      subcategory: 'Módulos Formativos',
      approvedAmount: 30000.0,
      reformulatedAmount: 30000.0,
      executedAmount: 0.0,
      balance: 30000.0,
      progress: 0,
      status: 'NORMAL',
    },
    {
      projectId: projectIdB,
      budgetVersionId: budgetVersionIdB,
      code: 'BL-B02',
      category: 'Material Didáctico y Logística',
      subcategory: 'Guías y Materiales',
      approvedAmount: 15000.0,
      reformulatedAmount: 15000.0,
      executedAmount: 0.0,
      balance: 15000.0,
      progress: 0,
      status: 'NORMAL',
    },
  ]);

  // 4.4 Tasks for Project B (0% avance)
  await db.insert(tasks).values([
    {
      tenantId: orgId,
      projectId: projectIdB,
      title: 'Diseño Curricular y Selección de Facilitadores Comunitarios',
      description: 'Estructuración del programa formativo y cronograma de talleres.',
      status: 'TODO',
      priority: 'MEDIUM',
      assigneeId: managerUser.dbId,
      createdBy: directorUser.dbId,
      startDate: new Date('2026-09-01T00:00:00Z'),
      dueDate: new Date('2026-10-31T00:00:00Z'),
      weight: 100,
      progress: 0,
      position: 0,
    },
  ]);

  // =========================================================================
  // 5. BITÁCORA DE AUDITORÍA (AUD-01)
  // =========================================================================
  // Registra el hito del reset en la base inmutable
  await db.insert(auditLogs).values({
    tenantId: orgId,
    userId: directorUser.dbId,
    userName: directorUser.name,
    action: 'DEMO_DATA_RESET',
    entity: 'organization',
    entityId: String(orgId),
    metadata: {
      details: 'Reinicio programado/manual de datos del tenant demo VOSERDEM a estado base determinista con Proyecto A y Proyecto B aislados.',
      scenarios: ['PRJ-DEMO-2026 (Principal)', 'PRJ-DEMO-2026-B (Aislamiento)'],
      resetAtUtc: new Date().toISOString(),
    },
  });

  // Secuencia canónica determinista de auditoría vinculada a los objetos actuales del escenario demo
  await db.insert(auditLogs).values([
    {
      tenantId: orgId,
      userId: directorUser.dbId,
      userName: directorUser.name,
      action: 'PROJECT_CREATED',
      entity: 'project',
      entityId: String(projectIdA),
      metadata: {
        scenario: 'Escenario demostrativo VOSERDEM',
        code: 'PRJ-DEMO-2026',
        name: 'Proyecto Piloto de Fortalecimiento Comunitario',
        approvedBudget: 150000,
        currency: 'USD',
      },
    },
    {
      tenantId: orgId,
      userId: financeUser.dbId,
      userName: financeUser.name,
      action: 'BUDGET_APPROVED',
      entity: 'budget',
      entityId: String(projectIdA),
      metadata: {
        scenario: 'Escenario demostrativo VOSERDEM',
        projectCode: 'PRJ-DEMO-2026',
        totalBudget: 150000,
        budgetLinesCount: 4,
      },
    },
    {
      tenantId: orgId,
      userId: responsableUser.dbId,
      userName: responsableUser.name,
      action: 'EXPENSE_RECORDED',
      entity: 'expense',
      entityId: String(projectIdA),
      metadata: {
        scenario: 'Escenario demostrativo VOSERDEM',
        voucherNumber: 'FAC-LOTE2-2026-009',
        amount: 6000,
        status: 'PENDING_APPROVAL',
        supplier: 'AquaPur Sistemas Integrales S.A.',
      },
    },
    {
      tenantId: orgId,
      userId: financeUser.dbId,
      userName: financeUser.name,
      action: 'DOCUMENT_UPLOADED',
      entity: 'document',
      entityId: String(projectIdA),
      metadata: {
        scenario: 'Escenario demostrativo VOSERDEM',
        name: 'Comprobante Adquisición Lote 2 - Filtración',
        sha256: 'f9680d1e45289e4f1262acab8a4207aa0913846037e08b126581f220acc84f8e',
        mimeType: 'application/pdf',
      },
    },
    {
      tenantId: orgId,
      userId: directorUser.dbId,
      userName: directorUser.name,
      action: 'PROJECT_MEMBER_ASSIGNED',
      entity: 'project_member',
      entityId: String(projectIdA),
      metadata: {
        scenario: 'Escenario demostrativo VOSERDEM',
        projectCode: 'PRJ-DEMO-2026',
        assignedRoles: ['RESPONSABLE_PROYECTO', 'FINANCIADOR'],
      },
    },
  ]);

  invalidateDashboardCache(orgId);
  console.log('[Demo Service] Reseteo del tenant demo VOSERDEM completado exitosamente.');
  return { success: true, message: 'Datos del tenant demo VOSERDEM reiniciados correctamente.', orgId };
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
