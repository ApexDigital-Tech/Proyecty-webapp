// @ts-nocheck
import { db } from '../src/db/index.js';
import { users, projects, budgetLines, agreements, receiptsVouchers, organizations, roles } from '../src/db/schema.js';
import { eq, and, like } from 'drizzle-orm';
import 'dotenv/config';

const DEMO_PREFIX = '[DEMO VOSERDEM]';
const TENANT_NAME = 'ORG-PROYECTY.ORG';

async function runSeed() {
  console.log('Starting seed script...');
  
  // 1. Fix duplicate Rodrigo G. user
  console.log('Checking for duplicate demo users...');
  
  const allRodrigos = await db.select({
    id: users.id,
    uid: users.uid,
    roleId: users.roleId
  })
  .from(users)
  .where(eq(users.email, 'rodrigo@proyecty.org'));

  if (allRodrigos.length > 1) {
    console.log(`Found ${allRodrigos.length} users with email rodrigo@proyecty.org. Cleaning up...`);
    // Delete all except the first one
    for (let i = 1; i < allRodrigos.length; i++) {
      await db.delete(users).where(eq(users.id, allRodrigos[i].id));
      console.log(`Deleted duplicate user ID: ${allRodrigos[i].id}`);
    }
  }
  
  if (allRodrigos.length > 0) {
    // Ensure the remaining Rodrigo is a MANAGER
    const managerRole = await db.select().from(roles).where(eq(roles.name, 'Coordinador de Proyecto')).limit(1);
    if (managerRole.length > 0) {
      await db.update(users)
        .set({ roleId: managerRole[0].id })
        .where(eq(users.id, allRodrigos[0].id));
      console.log('Ensured Rodrigo G. has MANAGER role.');
    }
  }

  // 2. Prepare Demo Tenant
  console.log('Resolving tenant...');
  let tenantId;
  const org = await db.select().from(organizations).where(eq(organizations.name, TENANT_NAME)).limit(1);
  if (org.length > 0) {
    tenantId = org[0].id;
  } else {
    const newOrg = await db.insert(organizations).values({ name: TENANT_NAME }).returning();
    tenantId = newOrg[0].id;
  }

  // 3. Cleanup existing DEMO VOSERDEM data to ensure idempotency
  console.log('Cleaning up existing demo data...');
  const existingProjects = await db.select().from(projects).where(like(projects.name, `${DEMO_PREFIX}%`));
  
  for (const p of existingProjects) {
    await db.delete(receiptsVouchers).where(eq(receiptsVouchers.projectId, p.id));
    await db.delete(agreements).where(eq(agreements.projectId, p.id));
    await db.delete(budgetLines).where(eq(budgetLines.projectId, p.id));
    await db.delete(projects).where(eq(projects.id, p.id));
    console.log(`Deleted existing demo project: ${p.name}`);
  }

  // 4. Create Projects
  console.log('Creating demo projects...');
  const proj1 = await db.insert(projects).values({
    tenantId,
    code: 'PRJ-VOSER-001',
    name: `${DEMO_PREFIX} Modernización de Infraestructura`,
    description: 'Proyecto de actualización tecnológica para centros comunitarios.',
    status: 'EN EJECUCIÓN',
    riskLevel: 'MEDIO',
    approvedBudget: '150000.00',
    executedBudget: '45000.00',
    startDate: new Date('2025-01-10'),
    endDate: new Date('2026-06-30'),
    physicalProgress: 30, // 30%
    createdAt: new Date(),
    updatedAt: new Date()
  }).returning();

  const proj2 = await db.insert(projects).values({
    tenantId,
    code: 'PRJ-VOSER-002',
    name: `${DEMO_PREFIX} Capacitación Digital Rural`,
    description: 'Programa de alfabetización digital en zonas rurales.',
    status: 'EN EJECUCIÓN',
    riskLevel: 'BAJO',
    approvedBudget: '85000.00',
    executedBudget: '55250.00',
    startDate: new Date('2025-03-01'),
    endDate: new Date('2025-12-15'),
    physicalProgress: 65, // 65%
    createdAt: new Date(),
    updatedAt: new Date()
  }).returning();

  // 5. Create Agreements
  console.log('Creating agreements...');
  await db.insert(agreements).values({
    projectId: proj1[0].id,
    counterparty: 'Agencia de Desarrollo Tecnológico',
    signedDate: new Date('2025-01-05'),
    amount: '150000.00',
    durationMonths: 18,
    startDate: new Date('2025-01-10'),
    endDate: new Date('2026-06-30')
  });

  await db.insert(agreements).values({
    projectId: proj2[0].id,
    counterparty: 'Fondo de Educación Rural',
    signedDate: new Date('2025-02-20'),
    amount: '85000.00',
    durationMonths: 9,
    startDate: new Date('2025-03-01'),
    endDate: new Date('2025-12-15')
  });

  // 6. Create Budget Lines
  console.log('Creating budget lines...');
  const bl1 = await db.insert(budgetLines).values({
    projectId: proj1[0].id,
    code: 'BL-001',
    category: 'Hardware',
    subcategory: 'Equipos de Cómputo',
    approvedAmount: '100000.00',
    reformulatedAmount: '100000.00',
    executedAmount: '40000.00',
    balance: '60000.00',
    progress: 40,
    status: 'EN EJECUCIÓN'
  }).returning();

  const bl2 = await db.insert(budgetLines).values({
    projectId: proj1[0].id,
    code: 'BL-002',
    category: 'Servicios',
    subcategory: 'Instalación',
    approvedAmount: '50000.00',
    reformulatedAmount: '50000.00',
    executedAmount: '5000.00',
    balance: '45000.00',
    progress: 10,
    status: 'EN EJECUCIÓN'
  }).returning();

  // 7. Create Receipts (Comprobantes)
  console.log('Creating receipts...');
  await db.insert(receiptsVouchers).values({
    projectId: proj1[0].id,
    budgetLineId: bl1[0].id,
    type: 'FACTURA',
    amount: 20000.00,
    currency: 'USD',
    provider: 'Tech Solutions Inc',
    issueDate: new Date('2025-02-15'),
    milestone: 'Hito 1 - Compra Inicial',
    description: 'Compra de 20 laptops para el centro A',
    fileName: 'factura1.pdf',
    fileUrl: 'https://example.com/factura1.pdf',
    isVerified: true,
    createdAt: new Date()
  });

  await db.insert(receiptsVouchers).values({
    projectId: proj1[0].id,
    budgetLineId: bl1[0].id,
    type: 'FACTURA',
    amount: 20000.00,
    currency: 'USD',
    provider: 'Tech Solutions Inc',
    issueDate: new Date('2025-03-10'),
    milestone: 'Hito 2 - Compra Secundaria',
    description: 'Compra de 20 laptops para el centro B',
    fileName: 'factura2.pdf',
    fileUrl: 'https://example.com/factura2.pdf',
    isVerified: false,
    createdAt: new Date()
  });

  await db.insert(receiptsVouchers).values({
    projectId: proj1[0].id,
    budgetLineId: bl2[0].id,
    type: 'RECIBO',
    amount: 5000.00,
    currency: 'USD',
    provider: 'Servicios Globales SRL',
    issueDate: new Date('2025-03-15'),
    milestone: 'Hito 1 - Compra Inicial',
    description: 'Servicio de instalación',
    fileName: 'recibo1.pdf',
    fileUrl: 'https://example.com/recibo1.pdf',
    isVerified: true,
    createdAt: new Date()
  });

  console.log('Seed script completed successfully!');
  process.exit(0);
}

runSeed().catch(err => {
  console.error('Error during seed:', err);
  process.exit(1);
});
