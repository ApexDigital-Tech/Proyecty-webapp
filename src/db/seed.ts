import { db } from './index.ts';
import { 
  organizations, roles, permissions, users, donors, projects, 
  agreements, disbursements, clauses, budgetVersions, budgetLines, 
  expenses, receiptsVouchers, documents, auditLogs 
} from './schema.ts';
import { count } from 'drizzle-orm';

export async function seedDatabase() {
  try {
    const orgCountResult = await db.select({ val: count() }).from(organizations);
    const hasOrgs = orgCountResult[0]?.val > 0;

    if (hasOrgs) {
      console.log('Database already has data. Skipping seed.');
      return;
    }

    console.log('Seeding database with initial Proyecty SaaS data...');

    // 1. Seed Organizations
    const insertedOrgs = await db.insert(organizations).values([
      { name: 'Fundación ECOTRAFFIC', subscriptionPlan: 'ENTERPRISE' }
    ]).returning();
    const org = insertedOrgs[0];

    // 2. Seed Roles
    const insertedRoles = await db.insert(roles).values([
      { name: 'SuperAdmin Tech', description: 'Acceso global técnico', isSystemRole: true },
      { name: 'Admin de Organización', description: 'Acceso global organización', isSystemRole: true },
      { name: 'Director', description: 'Lectura y aprobación estratégica', isSystemRole: true },
      { name: 'Administrativo / Finanzas', description: 'Presupuesto y ejecución financiera', isSystemRole: true },
      { name: 'Coordinador de Proyecto', description: 'Operación directa de proyectos', isSystemRole: true },
      { name: 'Auditor', description: 'Revisión y trazabilidad', isSystemRole: true }
    ]).returning();
    const adminRole = insertedRoles[1];
    const finRole = insertedRoles[3];

    // 3. Seed Users
    const insertedUsers = await db.insert(users).values([
      { tenantId: org.id, uid: 'seed-admin-123', email: 'admin@ecotraffic.org', name: 'Rodrigo G.', roleId: adminRole.id },
      { tenantId: org.id, uid: 'seed-fin-123', email: 'finanzas@ecotraffic.org', name: 'Karla Martínez', roleId: finRole.id }
    ]).returning();
    const adminUser = insertedUsers[0];
    const finUser = insertedUsers[1];

    // 4. Seed Donors
    const insertedDonors = await db.insert(donors).values([
      { tenantId: org.id, name: 'USAID', type: 'Gubernamental' },
      { tenantId: org.id, name: 'UNICEF LATAM', type: 'Internacional' }
    ]).returning();

    // 5. Seed Projects
    const insertedProjects = await db.insert(projects).values([
      {
        tenantId: org.id,
        code: 'PRJ-2024-089',
        name: 'Construcción de Pozos de Agua de Lluvia',
        donorId: insertedDonors[0].id,
        status: 'EJECUCIÓN',
        riskLevel: 'Bajo',
        approvedBudget: 150000,
        physicalProgress: 65,
        financialProgress: 58,
        nextMilestoneDate: '15 JUL',
        nextMilestoneTitle: 'Entrega Fase 2',
        score: 98,
        description: 'Sistemas de captación de agua pluvial en comunidades vulnerables.'
      }
    ]).returning();
    const p1 = insertedProjects[0];

    // 6. Seed Agreements
    const insertedAgreements = await db.insert(agreements).values([
      {
        projectId: p1.id,
        counterparty: 'USAID (Agencia de Cooperación)',
        signedDate: new Date('2024-01-15'),
        amount: 150000,
        durationMonths: 24,
        startDate: new Date('2024-02-01'),
        endDate: new Date('2026-01-31'),
        status: 'Activo'
      }
    ]).returning();
    const a1 = insertedAgreements[0];

    // 7. Seed Disbursements
    await db.insert(disbursements).values([
      {
        agreementId: a1.id,
        milestoneTitle: 'Anticipo Inicial (10%)',
        estimatedDate: new Date('2024-02-01'),
        amount: 15000,
        condition: 'Firma de convenio y aprobación de plan operativo (POA)',
        status: 'PAGADO'
      }
    ]);

    // 8. Seed Clauses
    await db.insert(clauses).values([
      {
        agreementId: a1.id,
        title: 'Cláusula de Auditoría Externa',
        description: 'Auditoría externa anual.',
        priority: 'ALTA PRIORIDAD',
        category: 'ANUAL'
      }
    ]);

    // 9. Seed Budget Versions and Lines
    const insertedVersions = await db.insert(budgetVersions).values([
      { projectId: p1.id, versionName: 'V1 - Inicial', isApproved: true, approvedBy: adminUser.id }
    ]).returning();
    
    const insertedLines = await db.insert(budgetLines).values([
      {
        projectId: p1.id,
        budgetVersionId: insertedVersions[0].id,
        code: '1000',
        category: 'Servicios de Ingeniería',
        subcategory: 'Estudios de Suelo y Geotecnia',
        approvedAmount: 20000,
        reformulatedAmount: 22000,
        executedAmount: 21500
      }
    ]).returning();
    const bl1 = insertedLines[0];

    // 10. Seed Expenses & Vouchers
    const insertedExpenses = await db.insert(expenses).values([
      {
        projectId: p1.id,
        budgetLineId: bl1.id,
        amount: 12500,
        date: new Date('2024-03-10'),
        description: 'Servicio Geotecnia',
        status: 'APPROVED',
        approvedBy: finUser.id
      }
    ]).returning();

    await db.insert(receiptsVouchers).values([
      {
        expenseId: insertedExpenses[0].id,
        projectId: p1.id,
        type: 'Factura',
        amount: 12500,
        provider: 'Geotécnica y Suelos S.A.',
        issueDate: new Date('2024-03-10'),
        fileName: 'FAC_GEOT_3910.pdf',
        fileUrl: '/uploads/FAC_GEOT_3910.pdf',
        isVerified: true,
        verifiedBy: finUser.id
      }
    ]);

    // 11. Seed Documents
    await db.insert(documents).values([
      {
        projectId: p1.id,
        uploadedBy: adminUser.id,
        name: 'Convenio de Subvención.pdf',
        size: '12.4 MB',
        type: 'pdf',
        fileUrl: '/uploads/Convenio.pdf'
      }
    ]);

    // 12. Seed Audit Logs
    await db.insert(auditLogs).values([
      {
        tenantId: org.id,
        userId: adminUser.id,
        action: 'CREATE',
        entityType: 'Project',
        entityId: p1.id
      }
    ]);

    console.log('Database seeded successfully!');
  } catch (error) {
    console.error('Error seeding database:', error);
  }
}
