import 'dotenv/config';
import { db } from '../src/db/index.ts';
import { 
  organizations, projects, users, donors, tasks, budgetVersions, budgetLines, 
  agreements, disbursements, expenses, receiptsVouchers, auditLogs
} from '../src/db/schema.ts';
import { eq } from 'drizzle-orm';

async function seed() {
  try {
    console.log('Seeding Las abuelitas de VOSERDEM...');
    
    // 1. Get or create org
    let org = await db.select().from(organizations).limit(1);
    let tenantId = org[0]?.id;
    if (!tenantId) {
      const newOrg = await db.insert(organizations).values({ name: 'Default Org' }).returning();
      tenantId = newOrg[0].id;
    }

    // 2. Get user
    const userRes = await db.select().from(users).where(eq(users.email, 'apexdigital70@gmail.com')).limit(1);
    let userId = userRes[0]?.id;
    if (!userId) {
      console.log('User not found, using ID 1');
      userId = 1;
    }

    // 3. Create or find Donor
    const donorRes = await db.select().from(donors).where(eq(donors.name, 'VOSERDEM')).limit(1);
    let donorId = donorRes[0]?.id;
    if (!donorId) {
      const newDonor = await db.insert(donors).values({ tenantId, name: 'VOSERDEM', type: 'Internacional' }).returning();
      donorId = newDonor[0].id;
    }

    // 4. Create Project
    await db.delete(projects).where(eq(projects.code, 'PY-VS001'));
    
    const projectRes = await db.insert(projects).values({
      tenantId,
      code: 'PY-VS001',
      name: 'Las abuelitas de VOSERDEM',
      donorId,
      status: 'EJECUCIÓN',
      riskLevel: 'Bajo',
      approvedBudget: 56250,
      physicalProgress: 65,
      financialProgress: 50,
      score: 100,
      description: 'Proyecto de apoyo a adultos mayores en riesgo social.',
    }).returning();
    const projectId = projectRes[0].id;

    // 5. Create Tasks
    await db.insert(tasks).values([
      { tenantId, projectId, title: 'Firma del Convenio', status: 'DONE', priority: 'HIGH', createdBy: userId },
      { tenantId, projectId, title: 'Adquisición de Equipamiento', status: 'IN_PROGRESS', priority: 'MEDIUM', createdBy: userId },
      { tenantId, projectId, title: 'Capacitación a voluntarios', status: 'TODO', priority: 'MEDIUM', createdBy: userId },
      { tenantId, projectId, title: 'Monitoreo de campo 1', status: 'TODO', priority: 'LOW', createdBy: userId },
    ]);

    // 6. Create Budget
    const bvRes = await db.insert(budgetVersions).values({
      tenantId, projectId, versionName: 'V1 - Inicial', status: 'APPROVED', isApproved: true, approvedBy: userId
    }).returning();
    const budgetVersionId = bvRes[0].id;

    const bLines = await db.insert(budgetLines).values([
      { projectId, budgetVersionId, code: 'EQ-01', category: 'Equipamiento', subcategory: 'Equipos médicos', approvedAmount: 20000, executedAmount: 10000 },
      { projectId, budgetVersionId, code: 'PER-01', category: 'Personal', subcategory: 'Honorarios', approvedAmount: 15000, executedAmount: 7500 },
      { projectId, budgetVersionId, code: 'OP-01', category: 'Operaciones', subcategory: 'Logística', approvedAmount: 11250, executedAmount: 5000 },
      { projectId, budgetVersionId, code: 'CAP-01', category: 'Capacitación', subcategory: 'Talleres', approvedAmount: 10000, executedAmount: 5625 },
    ]).returning();

    // 7. Agreement
    const aggRes = await db.insert(agreements).values({
      projectId, counterparty: 'VOSERDEM', signedDate: new Date('2024-01-15'), amount: 56250,
      durationMonths: 12, startDate: new Date('2024-02-01'), endDate: new Date('2025-01-31'), status: 'Activo'
    }).returning();
    const agreementId = aggRes[0].id;

    // 8. Disbursements
    await db.insert(disbursements).values([
      { agreementId, milestoneTitle: 'Desembolso Inicial', estimatedDate: new Date('2024-02-15'), amount: 28125, condition: 'Firma de convenio', status: 'PAGADO' },
      { agreementId, milestoneTitle: 'Segundo Desembolso', estimatedDate: new Date('2024-08-15'), amount: 28125, condition: 'Informe Medio Término', status: 'PENDIENTE' }
    ]);

    // 9. Expenses and Receipts
    const expRes = await db.insert(expenses).values([
      { tenantId, projectId, budgetLineId: bLines[0].id, amount: 10000, date: new Date('2024-03-10'), title: 'Compra de sillas de ruedas', status: 'approved', registeredBy: userId },
      { tenantId, projectId, budgetLineId: bLines[1].id, amount: 7500, date: new Date('2024-04-05'), title: 'Pago Q1 Honorarios', status: 'approved', registeredBy: userId },
      { tenantId, projectId, budgetLineId: bLines[3].id, amount: 5625, date: new Date('2024-05-20'), title: 'Taller de cuidados', status: 'approved', registeredBy: userId },
    ]).returning();

    await db.insert(receiptsVouchers).values([
      { expenseId: expRes[0].id, projectId, budgetLineId: bLines[0].id, type: 'Factura', amount: 10000, provider: 'Medical Supplies S.A.', issueDate: new Date('2024-03-10'), fileName: 'fac-001.pdf', isVerified: true },
      { expenseId: expRes[1].id, projectId, budgetLineId: bLines[1].id, type: 'Recibo de Honorarios', amount: 7500, provider: 'Dr. Perez', issueDate: new Date('2024-04-05'), fileName: 'rec-002.pdf', isVerified: true },
      { expenseId: expRes[2].id, projectId, budgetLineId: bLines[3].id, type: 'Factura', amount: 5625, provider: 'Centro de Capacitación', issueDate: new Date('2024-05-20'), fileName: 'fac-003.pdf', isVerified: true },
    ]);

    // 10. Audit Logs
    await db.insert(auditLogs).values([
      { tenantId, userId, userName: 'Apex Digital', action: 'PROJECT_CREATED', entity: 'Project', entityId: String(projectId) },
      { tenantId, userId, userName: 'Apex Digital', action: 'BUDGET_APPROVED', entity: 'Budget', entityId: String(budgetVersionId) },
      { tenantId, userId, userName: 'Apex Digital', action: 'AGREEMENT_SIGNED', entity: 'Agreement', entityId: String(agreementId) },
      { tenantId, userId, userName: 'Apex Digital', action: 'EXPENSE_APPROVED', entity: 'Expense', entityId: String(expRes[0].id) },
    ]);

    console.log('Seed completed successfully!');
  } catch (error) {
    console.error('Seed failed:', error);
  } finally {
    process.exit(0);
  }
}

seed();
