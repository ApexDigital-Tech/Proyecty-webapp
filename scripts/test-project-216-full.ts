import 'dotenv/config';
import { db } from '../src/db/index.ts';
import { users, projects, organizations, agreements, budgetVersions, budgetLines, documents, receiptsVouchers, auditLogs, tasks, donors, disbursements, clauses } from '../src/db/schema.ts';
import { eq, and, desc } from 'drizzle-orm';
import { calculatePhysicalProgress } from '../src/services/schedule.service.ts';

async function main() {
  console.log('--- TEST GET PROJECT 216 FULL ---');
  const projectId = 216;

  // 1. Project & Donor
  const projectResult = await db.select({
    project: projects,
    donorName: donors.name
  }).from(projects)
    .leftJoin(donors, eq(projects.donorId, donors.id))
    .where(and(eq(projects.id, projectId), eq(projects.tenantId, 13)));
  
  if (projectResult.length === 0) {
    console.error('Proyecto no encontrado');
    return;
  }

  // 2. Tasks
  const projectTaskList = await db.select({
    weight: tasks.weight,
    progress: tasks.progress,
    status: tasks.status,
  }).from(tasks).where(eq(tasks.projectId, projectId));

  const realPhysicalProgress = projectTaskList.length > 0
    ? calculatePhysicalProgress(projectTaskList)
    : (projectResult[0].project.physicalProgress ?? 0);

  const project = {
    ...projectResult[0].project,
    physicalProgress: realPhysicalProgress,
    donor: projectResult[0].donorName
  };

  // 3. Agreements
  const projectAgreements = await db.select().from(agreements).where(eq(agreements.projectId, projectId));

  // 4. Budget versions
  const versions = await db.select().from(budgetVersions)
    .where(eq(budgetVersions.projectId, projectId))
    .orderBy(desc(budgetVersions.versionNumber));
  
  const activeVersion = versions.find(v => v.status === 'APPROVED' || v.isApproved) || versions[0];

  // 5. Budget lines
  const projectBudgetItems = activeVersion
    ? await db.select().from(budgetLines).where(eq(budgetLines.budgetVersionId, activeVersion.id))
    : await db.select().from(budgetLines).where(eq(budgetLines.projectId, projectId));

  // 6. Documents, Vouchers, Logs
  const projectDocuments = await db.select().from(documents).where(eq(documents.projectId, projectId));
  const projectVouchers = await db.select().from(receiptsVouchers).where(eq(receiptsVouchers.projectId, projectId));
  const projectLogs = await db.select().from(auditLogs).where(and(eq(auditLogs.entityId, String(projectId)), eq(auditLogs.entity, 'Project'))).orderBy(desc(auditLogs.createdAt));

  // 7. Enriched agreements
  const enrichedAgreements = [];
  for (const ag of projectAgreements) {
    const dbDisbursements = await db.select().from(disbursements).where(eq(disbursements.agreementId, ag.id));
    const dbClauses = await db.select().from(clauses).where(eq(clauses.agreementId, ag.id));
    enrichedAgreements.push({
      ...ag,
      disbursements: dbDisbursements,
      clauses: dbClauses
    });
  }

  const payload = {
    success: true,
    data: {
      ...project,
      agreements: enrichedAgreements,
      budgetVersions: versions,
      activeBudgetVersion: activeVersion || null,
      budgetLines: projectBudgetItems,
      documents: projectDocuments,
      receiptsVouchers: projectVouchers,
      auditLogs: projectLogs
    }
  };

  console.log('🎉 PAYLOAD OBTENIDO CON ÉXITO:');
  console.log('Project ID:', payload.data.id, 'Code:', payload.data.code, 'Name:', payload.data.name);
  console.log('Agreements:', payload.data.agreements.length);
  console.log('Budget Versions:', payload.data.budgetVersions.length);
  console.log('Budget Lines:', payload.data.budgetLines.length);
  console.log('Documents:', payload.data.documents.length);
  console.log('Vouchers:', payload.data.receiptsVouchers.length);
  console.log('Audit Logs:', payload.data.auditLogs.length);
}

main().catch(console.error).finally(() => process.exit(0));
