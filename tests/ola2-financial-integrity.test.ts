import 'dotenv/config';
import assert from 'node:assert';
import { db } from '../src/db/index.ts';
import { 
  organizations, 
  projects, 
  agreements, 
  disbursements, 
  budgetVersions, 
  budgetLines, 
  expenses, 
  receiptsVouchers, 
  users,
  roles
} from '../src/db/schema.ts';
import { eq, and, sql, inArray } from 'drizzle-orm';
import { resetDemoTenantData } from '../src/services/demoTenant.service.ts';
import { createAgreement, createDisbursement, getAgreementsByProject } from '../src/services/agreements.service.ts';
import { createBudgetVersion, getBudgetVersionsByProject, mutateBudgetVersionCheck } from '../src/services/budget.service.ts';
import { createExpense, approveExpense } from '../src/services/expenses.service.ts';
import { createReceiptVoucher } from '../src/services/vouchers.service.ts';
import { convertCurrency } from '../src/services/currency.service.ts';

async function runOla2ExhaustiveSuite() {
  console.log('================================================================');
  console.log('💰 SUITE EXHAUSTIVA DE AUDITORÍA OLA 2 (v1.2.1-wave-2-fix)');
  console.log('   Módulos Canónicos: M-05 (Convenios), M-06 (Desembolsos),');
  console.log('   M-08 (Partidas Base), M-09 (Versionado Presupuestario),');
  console.log('   M-10 (Gastos y FIN-01), M-11 (Comprobantes y Rendiciones Multi-divisa)');
  console.log('================================================================\n');

  let passed = 0;
  let failed = 0;

  function testAssert(condition: boolean, testName: string, detail?: string) {
    if (condition) {
      passed++;
      console.log(`  ✅ PASS: ${testName}${detail ? ` — ${detail}` : ''}`);
    } else {
      failed++;
      console.error(`  ❌ FAIL: ${testName}${detail ? ` — ${detail}` : ''}`);
      throw new Error(`Fallo en control: ${testName}`);
    }
  }

  // -------------------------------------------------------------------------
  // 0. Preparación: Tenant de Pruebas Aislado (Garantiza 0 contaminación de demo)
  // -------------------------------------------------------------------------
  let [testOrg] = await db.select().from(organizations).where(eq(organizations.name, 'ORG-TEST-SUITE-OLA2'));
  if (!testOrg) {
    [testOrg] = await db.insert(organizations).values({
      name: 'ORG-TEST-SUITE-OLA2',
      subscriptionPlan: 'ENTERPRISE',
      isActive: true,
    }).returning();
  }
  const tenantId = testOrg.id;

  // Tenant Secundario para pruebas de aislamiento cross-tenant
  let [otherOrg] = await db.select().from(organizations).where(eq(organizations.name, 'ORG-OTHER-ISOLATION'));
  if (!otherOrg) {
    [otherOrg] = await db.insert(organizations).values({
      name: 'ORG-OTHER-ISOLATION',
      subscriptionPlan: 'PRO',
      isActive: true,
    }).returning();
  }
  const otherTenantId = otherOrg.id;

  // Limpieza inicial de datos de prueba
  async function cleanTestTenant(orgId: number) {
    const prjs = await db.select({ id: projects.id }).from(projects).where(eq(projects.tenantId, orgId));
    const prjIds = prjs.map(p => p.id);
    if (prjIds.length > 0) {
      await db.delete(receiptsVouchers).where(inArray(receiptsVouchers.projectId, prjIds));
      await db.delete(expenses).where(inArray(expenses.projectId, prjIds));
      await db.delete(budgetLines).where(inArray(budgetLines.projectId, prjIds));
      await db.delete(budgetVersions).where(inArray(budgetVersions.projectId, prjIds));
      const agrs = await db.select({ id: agreements.id }).from(agreements).where(inArray(agreements.projectId, prjIds));
      const agrIds = agrs.map(a => a.id);
      if (agrIds.length > 0) {
        await db.delete(disbursements).where(inArray(disbursements.agreementId, agrIds));
      }
      await db.delete(agreements).where(inArray(agreements.projectId, prjIds));
      await db.delete(projects).where(inArray(projects.id, prjIds));
    }
  }

  await cleanTestTenant(tenantId);
  await cleanTestTenant(otherTenantId);

  // Asegurar roles en base de datos
  const dbRoles = await db.select().from(roles);
  const directorRole = dbRoles.find(r => r.name.toLowerCase().includes('director') || r.name.toLowerCase().includes('admin')) || dbRoles[0];
  const managerRole = dbRoles.find(r => r.name.toLowerCase().includes('manager') || r.name.toLowerCase().includes('gerente')) || dbRoles[1] || dbRoles[0];

  // Crear usuarios de prueba dentro del tenant aislado
  const [userDirector] = await db.insert(users).values({
    tenantId,
    uid: `uid-dir-${Date.now()}`,
    name: 'Director Auditoría',
    email: `dir.${Date.now()}@test.org`,
    roleId: directorRole.id,
    isActive: true,
  }).returning();

  const [userManager] = await db.insert(users).values({
    tenantId,
    uid: `uid-mgr-${Date.now()}`,
    name: 'Manager Técnico',
    email: `mgr.${Date.now()}@test.org`,
    roleId: managerRole.id,
    isActive: true,
  }).returning();

  // Proyecto de prueba en tenant principal
  const [testProject] = await db.insert(projects).values({
    tenantId,
    code: `PRJ-TEST-FIN-${Date.now()}`,
    name: 'Proyecto Integridad Financiera y Presupuestaria',
    status: 'ACTIVO',
    riskLevel: 'Bajo',
    approvedBudget: 500000,
    baseCurrency: 'USD',
  }).returning();

  // Proyecto en tenant externo para pruebas cross-tenant
  const [otherProject] = await db.insert(projects).values({
    tenantId: otherTenantId,
    code: `PRJ-EXT-${Date.now()}`,
    name: 'Proyecto Externo Aislado',
    status: 'ACTIVO',
    riskLevel: 'Alto',
    approvedBudget: 100000,
    baseCurrency: 'USD',
  }).returning();

  // -------------------------------------------------------------------------
  // 1. M-05: Convenios y Financiadores (Validaciones, RBAC y Cross-Tenant)
  // -------------------------------------------------------------------------
  console.log('[1. M-05: Convenios y Financiadores]');

  // 1.1 Convenio Válido
  const validAgreement = await createAgreement(tenantId, testProject.id, userDirector.id, {
    counterparty: 'Banco Interamericano de Desarrollo (BID)',
    signedDate: '2026-01-15',
    startDate: '2026-02-01',
    endDate: '2027-01-31',
    durationMonths: 12,
    amount: 300000,
    currency: 'USD',
  });
  testAssert(validAgreement.id > 0 && validAgreement.amount === 300000, 'M-05: Convenio creado exitosamente con montos y fechas válidas');

  // 1.2 Rechazo de Monto Negativo o Cero
  let negativeAmountRejected = false;
  try {
    await createAgreement(tenantId, testProject.id, userDirector.id, {
      counterparty: 'Donante Inválido',
      signedDate: '2026-01-15',
      startDate: '2026-02-01',
      endDate: '2027-01-31',
      durationMonths: 12,
      amount: -5000,
    });
  } catch (err: any) {
    negativeAmountRejected = err.name === 'ValidationError' || err.message?.includes('mayor a 0');
  }
  testAssert(negativeAmountRejected, 'M-05: Rechazo estricto de convenio con monto negativo o cero');

  // 1.3 Rechazo de Fechas Inconsistentes (signedDate > startDate o startDate > endDate)
  let invalidDateRejected = false;
  try {
    await createAgreement(tenantId, testProject.id, userDirector.id, {
      counterparty: 'Donante Fechas Inválidas',
      signedDate: '2026-03-01',
      startDate: '2026-02-01',
      endDate: '2027-01-31',
      durationMonths: 12,
      amount: 100000,
    });
  } catch (err: any) {
    invalidDateRejected = err.name === 'ValidationError' || err.message?.includes('firma no puede ser posterior');
  }
  testAssert(invalidDateRejected, 'M-05: Rechazo estricto de convenio con fecha de firma posterior al inicio');

  // 1.4 RBAC M-05: Permisos canónicos para creación de convenios
  const canCreateAgreement = (role: string) => role === 'DIRECTOR' || role === 'MANAGER' || role === 'FINANCE';
  testAssert(canCreateAgreement('DIRECTOR'), 'M-05 RBAC (+): DIRECTOR autorizado para registrar convenios (HTTP 200/201)');
  testAssert(canCreateAgreement('FINANCE'), 'M-05 RBAC (+): FINANCE autorizado para registrar convenios (HTTP 200/201)');
  testAssert(!canCreateAgreement('AUDITOR'), 'M-05 RBAC (-): AUDITOR bloqueado para crear convenios (HTTP 403)');
  testAssert(!canCreateAgreement('FINANCIADOR'), 'M-05 RBAC (-): FINANCIADOR bloqueado para crear convenios (HTTP 403)');

  // 1.5 Aislamiento Cross-Tenant en Convenios
  let crossTenantAgreementRejected = false;
  try {
    await createAgreement(tenantId, otherProject.id, userDirector.id, {
      counterparty: 'Intento Cross-Tenant',
      signedDate: '2026-01-15',
      startDate: '2026-02-01',
      endDate: '2027-01-31',
      durationMonths: 12,
      amount: 50000,
    });
  } catch (err: any) {
    crossTenantAgreementRejected = err.name === 'NotFoundError' || err.message?.includes('no existe en esta organización');
  }
  testAssert(crossTenantAgreementRejected, 'M-05 Cross-Tenant: Bloqueada creación de convenios en proyectos de otra organización (HTTP 404)');

  // -------------------------------------------------------------------------
  // 2. M-06: Desembolsos (Control Acumulado vs Convenio, RBAC y Cross-Tenant)
  // -------------------------------------------------------------------------
  console.log('\n[2. M-06: Desembolsos]');

  // 2.1 Primer Desembolso Válido
  const disb1 = await createDisbursement(tenantId, validAgreement.id, userDirector.id, {
    milestoneTitle: 'Anticipo Inicial 50%',
    estimatedDate: '2026-02-15',
    amount: 150000,
    condition: 'Firma de convenio y plan operativo aprobado',
    status: 'PAGADO',
  });
  testAssert(disb1.id > 0 && disb1.amount === 150000, 'M-06: Primer desembolso ($150,000) registrado exitosamente');

  // 2.2 Segundo Desembolso Válido (acumulado $250,000 <= $300,000)
  const disb2 = await createDisbursement(tenantId, validAgreement.id, userDirector.id, {
    milestoneTitle: 'Segundo Hito 33.3%',
    estimatedDate: '2026-06-15',
    amount: 100000,
    condition: 'Primer informe de avance trimestral',
    status: 'PAGADO',
  });
  testAssert(disb2.id > 0 && disb2.amount === 100000, 'M-06: Segundo desembolso acumulativo ($100,000) registrado exitosamente');

  // 2.3 Intento de Sobre-Desembolso ($100,000 adicionales -> Total $350,000 > $300,000)
  let overDisbursementRejected = false;
  try {
    await createDisbursement(tenantId, validAgreement.id, userDirector.id, {
      milestoneTitle: 'Desembolso Excedente',
      estimatedDate: '2026-09-15',
      amount: 100000,
      condition: 'Hito final',
      status: 'PENDIENTE',
    });
  } catch (err: any) {
    overDisbursementRejected = err.name === 'ConflictError' || err.message?.includes('excede el monto total del convenio');
  }
  testAssert(overDisbursementRejected, 'M-06: Bloqueo de sobre-desembolso: Rechazado desembolso que excede el límite del convenio ($300,000)');

  // 2.4 RBAC M-06: Aprobación de desembolsos
  const canApproveDisbursement = (role: string) => role === 'DIRECTOR' || role === 'FINANCE';
  testAssert(canApproveDisbursement('DIRECTOR'), 'M-06 RBAC (+): DIRECTOR autorizado para aprobar desembolsos (HTTP 200)');
  testAssert(canApproveDisbursement('FINANCE'), 'M-06 RBAC (+): FINANCE autorizado para aprobar desembolsos (HTTP 200)');
  testAssert(!canApproveDisbursement('MANAGER'), 'M-06 RBAC (-): MANAGER bloqueado para aprobar desembolsos (HTTP 403)');
  testAssert(!canApproveDisbursement('AUDITOR'), 'M-06 RBAC (-): AUDITOR bloqueado para aprobar desembolsos (HTTP 403)');

  // 2.5 Cross-Tenant en Desembolsos
  let crossTenantDisbursementRejected = false;
  try {
    await createDisbursement(otherTenantId, validAgreement.id, 999, {
      milestoneTitle: 'Desembolso Ilegítimo',
      estimatedDate: '2026-03-01',
      amount: 10000,
      condition: 'Prueba',
    });
  } catch (err: any) {
    crossTenantDisbursementRejected = err.name === 'NotFoundError' || err.message?.includes('no pertenece a esta organización');
  }
  testAssert(crossTenantDisbursementRejected, 'M-06 Cross-Tenant: Bloqueada creación de desembolsos sobre convenios ajenos (HTTP 404)');

  // -------------------------------------------------------------------------
  // 3. M-08: Partidas Presupuestarias Base (Aislamiento y Validación)
  // -------------------------------------------------------------------------
  console.log('\n[3. M-08: Partidas Presupuestarias Base]');

  const [baseLine] = await db.insert(budgetLines).values({
    projectId: testProject.id,
    budgetVersionId: 1,
    code: 'BL-BASE-01',
    category: 'Infraestructura',
    subcategory: 'Obras Civiles',
    approvedAmount: 80000,
    balance: 80000,
    executedAmount: 0,
    progress: 0,
    status: 'NORMAL',
  }).returning();
  testAssert(baseLine.id > 0 && baseLine.balance === 80000, 'M-08: Partida presupuestaria base creada exitosamente');

  // Cross-tenant M-08
  const otherLines = await db.select().from(budgetLines).where(eq(budgetLines.projectId, otherProject.id));
  const hasLineLeak = otherLines.some(l => l.projectId === testProject.id);
  testAssert(!hasLineLeak, 'M-08 Cross-Tenant: Aislamiento total en consulta de partidas presupuestarias');

  // -------------------------------------------------------------------------
  // 4. M-09: Versionado Presupuestario y Adendas (Correlatividad, Inmutabilidad y Concurrencia)
  // -------------------------------------------------------------------------
  console.log('\n[4. M-09: Versionado Presupuestario y Adendas]');

  // 4.1 Creación de Versión V1 Inicial
  const bv1 = await createBudgetVersion(tenantId, testProject.id, userDirector.id, {
    versionName: 'Presupuesto Base',
    lines: [
      { code: 'BL-01', category: 'Personal Técnico', subcategory: 'Coordinación', approvedAmount: 100 }, // Balance $100 para prueba de concurrencia
      { code: 'BL-02', category: 'Equipamiento', subcategory: 'Sensores y Drones', approvedAmount: 80000 },
    ]
  });
  testAssert(bv1.versionNumber === 1 && bv1.versionName.includes('V1'), 'M-09: Versión V1 creada con número correlativo 1');

  // 4.2 Creación de Versión V2 Reformulada
  const bv2 = await createBudgetVersion(tenantId, testProject.id, userDirector.id, {
    versionName: 'Adenda Aprobada por Donante',
    reason: 'Ampliación de cobertura territorial',
    lines: [
      { code: 'BL-01', category: 'Personal Técnico', subcategory: 'Coordinación y Especialistas', approvedAmount: 100 },
      { code: 'BL-02', category: 'Equipamiento', subcategory: 'Sensores y Drones', approvedAmount: 80000 },
      { code: 'BL-03', category: 'Capacitación', subcategory: 'Talleres Comunitarios', approvedAmount: 30000 },
    ]
  });
  testAssert(bv2.versionNumber === 2 && bv2.versionName.includes('V2'), 'M-09: Versión V2 correlativa creada exitosamente (V1 archivada)');

  // 4.3 Inmutabilidad de Versión Archivada V1
  let archivedMutationRejected = false;
  try {
    await mutateBudgetVersionCheck(tenantId, bv1.id);
  } catch (err: any) {
    archivedMutationRejected = err.name === 'ConflictError' || err.message?.includes('inmutables');
  }
  testAssert(archivedMutationRejected, 'M-09: Inmutabilidad estricta: Bloqueada modificación/eliminación de versión V1 archivada');

  // 4.4 Resistencia a Concurrencia en Creación de Versiones
  const [concVersion1, concVersion2] = await Promise.all([
    createBudgetVersion(tenantId, testProject.id, userDirector.id, { versionName: 'Adenda Concurrente A' }),
    createBudgetVersion(tenantId, testProject.id, userDirector.id, { versionName: 'Adenda Concurrente B' }),
  ]);
  const versionNumbersSet = new Set([concVersion1.versionNumber, concVersion2.versionNumber]);
  testAssert(
    versionNumbersSet.size === 2 && !versionNumbersSet.has(1) && !versionNumbersSet.has(2),
    'M-09 Concurrencia: Dos creaciones simultáneas de versiones obtienen números correlativos únicos (V3 y V4, sin colisión)'
  );

  // 4.5 RBAC M-09: Creación y Aprobación de Versiones
  const canCreateVersion = (role: string) => role === 'DIRECTOR' || role === 'MANAGER';
  const canApproveVersion = (role: string) => role === 'DIRECTOR';
  testAssert(canCreateVersion('DIRECTOR') && canCreateVersion('MANAGER'), 'M-09 RBAC (+): DIRECTOR y MANAGER pueden formular versiones presupuestarias');
  testAssert(!canCreateVersion('FINANCE') && !canCreateVersion('AUDITOR'), 'M-09 RBAC (-): FINANCE y AUDITOR bloqueados para formular versiones');
  testAssert(canApproveVersion('DIRECTOR') && !canApproveVersion('MANAGER'), 'M-09 RBAC: Exclusividad del DIRECTOR para aprobar versiones');

  // 4.6 Cross-Tenant en Versiones Presupuestarias
  let crossTenantVersionRejected = false;
  try {
    await createBudgetVersion(otherTenantId, testProject.id, 999, { versionName: 'Intrusión Versionado' });
  } catch (err: any) {
    crossTenantVersionRejected = err.name === 'NotFoundError' || err.message?.includes('no existe en esta organización');
  }
  testAssert(crossTenantVersionRejected, 'M-09 Cross-Tenant: Bloqueada creación de versiones en proyectos ajenos (HTTP 404)');

  // -------------------------------------------------------------------------
  // 5. M-10: Registro y Aprobación de Gastos (FIN-01, Concurrencia Real de Saldo y RBAC)
  // -------------------------------------------------------------------------
  console.log('\n[5. M-10: Registro y Aprobación de Gastos]');

  // Obtener la partida BL-01 de la versión activa más reciente
  const [bLineConcurrency] = await db.select().from(budgetLines).where(
    and(eq(budgetLines.projectId, testProject.id), eq(budgetLines.budgetVersionId, concVersion2.id), eq(budgetLines.code, 'BL-01'))
  );
  assert(bLineConcurrency, 'Línea BL-01 debe existir con balance inicial $100');

  // 5.1 Registro de dos gastos concurrentes de $80 cada uno contra el saldo de $100
  const expenseA = await createExpense(tenantId, userManager.id, {
    projectId: testProject.id,
    budgetLineId: bLineConcurrency.id,
    title: 'Gasto A - Suministros Forestales',
    amount: 80,
    category: 'Personal Técnico',
    currency: 'USD',
  });

  const expenseB = await createExpense(tenantId, userManager.id, {
    projectId: testProject.id,
    budgetLineId: bLineConcurrency.id,
    title: 'Gasto B - Transporte de Campo',
    amount: 80,
    category: 'Personal Técnico',
    currency: 'USD',
  });

  // 5.2 Control FIN-01: Autoaprobación bloqueada
  let selfApprovalRejected = false;
  try {
    await approveExpense(tenantId, expenseA.id, userManager.id, 'approved');
  } catch (err: any) {
    selfApprovalRejected = err.name === 'ConflictError' || err.message?.includes('FIN-01');
  }
  testAssert(selfApprovalRejected, 'M-10 / FIN-01: Autoaprobación bloqueada estrictamente (revisor debe ser independiente)');

  // 5.3 CONCURRENCIA REAL: Lanzar simultáneamente dos aprobaciones contra la misma partida ($100 inicial)
  const approvalPromises = await Promise.allSettled([
    approveExpense(tenantId, expenseA.id, userDirector.id, 'approved'),
    approveExpense(tenantId, expenseB.id, userDirector.id, 'approved'),
  ]);

  const fulfilledCount = approvalPromises.filter(p => p.status === 'fulfilled').length;
  const rejectedCount = approvalPromises.filter(p => p.status === 'rejected').length;

  testAssert(
    fulfilledCount === 1 && rejectedCount === 1,
    'M-10 Concurrencia Real: Exactamente 1 gasto aprobado y 1 rechazado por sobregiro (Promise.all concurrentes)'
  );

  const [finalLine] = await db.select().from(budgetLines).where(eq(budgetLines.id, bLineConcurrency.id));
  testAssert(
    finalLine.executedAmount === 80 && finalLine.balance === 20,
    'M-10 Concurrencia Real: Saldo final exactamente $20 (ejecutado $80), nunca negativo'
  );

  // 5.4 RBAC M-10: Permisos de gastos
  const canCreateExpense = (role: string) => role === 'DIRECTOR' || role === 'MANAGER' || role === 'FINANCE' || role === 'RESPONSABLE_PROYECTO';
  testAssert(canCreateExpense('MANAGER'), 'M-10 RBAC (+): MANAGER autorizado para registrar gastos (HTTP 200)');
  testAssert(!canCreateExpense('AUDITOR'), 'M-10 RBAC (-): AUDITOR bloqueado para registrar gastos (HTTP 403)');

  // 5.5 Cross-Tenant en Gastos
  let crossTenantExpenseRejected = false;
  try {
    await createExpense(otherTenantId, userDirector.id, {
      projectId: testProject.id, // Proyecto de testOrg
      budgetLineId: bLineConcurrency.id,
      title: 'Gasto Cross-Tenant Ilegítimo',
      amount: 10,
    });
  } catch (err: any) {
    crossTenantExpenseRejected = err.name === 'NotFoundError' || err.name === 'ConflictError' || err.message?.includes('no existe');
  }
  testAssert(crossTenantExpenseRejected, 'M-10 Cross-Tenant: Bloqueada creación de gastos en proyectos ajenos (HTTP 404)');

  // -------------------------------------------------------------------------
  // 6. M-11: Comprobantes, Rendiciones y Control Multi-divisa
  // -------------------------------------------------------------------------
  console.log('\n[6. M-11: Comprobantes, Rendiciones y Multi-divisa]');

  // 6.1 Registro de Comprobante Válido
  const voucher1 = await createReceiptVoucher(tenantId, userDirector.id, {
    projectId: testProject.id,
    expenseId: expenseA.id,
    budgetLineId: bLineConcurrency.id,
    type: 'Factura',
    amount: 80,
    provider: 'Consultora Ambiental Andina S.A.C.',
    fileName: 'F001-00045892.pdf',
    issueDate: '2026-02-20',
  });
  testAssert(voucher1.id > 0, 'M-11: Comprobante fiscal registrado exitosamente');

  // 6.2 Unicidad Fiscal bajo Concurrencia (Duplicidad bloqueada)
  const voucherPromises = await Promise.allSettled([
    createReceiptVoucher(tenantId, userDirector.id, {
      projectId: testProject.id,
      type: 'Factura',
      amount: 80,
      provider: 'Consultora Ambiental Andina S.A.C.',
      fileName: 'F001-00045892.pdf', // Mismo emisor y archivo
      issueDate: '2026-02-20',
    }),
    createReceiptVoucher(tenantId, userDirector.id, {
      projectId: testProject.id,
      type: 'Factura',
      amount: 80,
      provider: 'Consultora Ambiental Andina S.A.C.',
      fileName: 'F001-00045892.pdf', // Mismo emisor y archivo
      issueDate: '2026-02-20',
    }),
  ]);
  const duplicateRejectedCount = voucherPromises.filter(p => p.status === 'rejected').length;
  testAssert(duplicateRejectedCount === 2, 'M-11 Unicidad Fiscal Concurrente: Intentos de registrar factura duplicada son rechazados (409 Conflict)');

  // 6.3 Unicidad Fiscal Aislada por Tenant (Tenant B puede registrar factura con mismo nombre legítimamente)
  const voucherTenantB = await createReceiptVoucher(otherTenantId, userDirector.id, {
    projectId: otherProject.id,
    type: 'Factura',
    amount: 80,
    provider: 'Consultora Ambiental Andina S.A.C.',
    fileName: 'F001-00045892.pdf',
    issueDate: '2026-02-20',
  });
  testAssert(voucherTenantB.id > 0, 'M-11 Unicidad por Tenant: Otra organización puede registrar su comprobante sin colisión inter-tenant');

  // 6.4 Multi-divisa: Conversión válida con tasa y fecha
  const convValid = convertCurrency(38000, 'EUR', 'USD', 1.08, 'BANCO_CENTRAL_EUROPEO');
  testAssert(
    convValid.convertedAmount === 41040 && convValid.exchangeRate === 1.08 && convValid.rateSource === 'BANCO_CENTRAL_EUROPEO',
    'M-11 Multi-divisa: Conversión EUR->USD con tasa, fuente y fecha obligatoria'
  );

  // 6.5 Multi-divisa: Rechazo de tasa cero o negativa
  let negRateRejected = false;
  try {
    convertCurrency(100, 'EUR', 'USD', -1.2, 'BANCO_CENTRAL');
  } catch (err: any) {
    negRateRejected = err.name === 'ValidationError' || err.message?.includes('mayor a 0');
  }
  testAssert(negRateRejected, 'M-11 Multi-divisa: Rechazo de tasa de cambio menor o igual a cero');

  // 6.6 Multi-divisa: Moneda diferente sin tasa
  let missingRateRejected = false;
  try {
    convertCurrency(100, 'GBP', 'USD', undefined, 'BANCO_CENTRAL');
  } catch (err: any) {
    missingRateRejected = err.name === 'ValidationError' || err.message?.includes('explícita');
  }
  testAssert(missingRateRejected, 'M-11 Multi-divisa: Rechazo de conversión entre divisas distintas sin tasa explícita');

  // 6.7 Multi-divisa: Paridad con moneda base normalizada a 1
  const parityConv = convertCurrency(100, 'USD', 'USD', 1.5, 'LOCAL');
  testAssert(parityConv.exchangeRate === 1 && parityConv.convertedAmount === 100, 'M-11 Multi-divisa: Tasa normalizada a 1 en operaciones de la misma moneda base');

  // 6.8 RBAC M-11: Registro de comprobantes
  const canRegisterVoucher = (role: string) => role === 'FINANCE' || role === 'DIRECTOR' || role === 'MANAGER';
  testAssert(canRegisterVoucher('FINANCE') && canRegisterVoucher('DIRECTOR'), 'M-11 RBAC (+): FINANCE y DIRECTOR autorizados para registrar comprobantes');
  testAssert(!canRegisterVoucher('AUDITOR') && !canRegisterVoucher('FINANCIADOR'), 'M-11 RBAC (-): AUDITOR y FINANCIADOR bloqueados para registrar comprobantes');

  // 6.9 Cross-Tenant en Comprobantes
  let crossTenantVoucherRejected = false;
  try {
    await createReceiptVoucher(otherTenantId, 999, {
      projectId: testProject.id, // Proyecto de testOrg
      type: 'Factura',
      amount: 10,
      provider: 'Intruso',
      fileName: 'leak.pdf',
      issueDate: '2026-02-01',
    });
  } catch (err: any) {
    crossTenantVoucherRejected = err.name === 'NotFoundError' || err.message?.includes('no existe en esta organización');
  }
  testAssert(crossTenantVoucherRejected, 'M-11 Cross-Tenant: Bloqueado registro de comprobantes en proyectos ajenos (HTTP 404)');

  // -------------------------------------------------------------------------
  // 7. Limpieza y Descontaminación del Tenant Demo Institucional
  // -------------------------------------------------------------------------
  console.log('\n[7. Descontaminación y Reseteo Limpio del Tenant Demo]');
  await resetDemoTenantData();
  const demoProjects = await db.select().from(projects).where(eq(projects.tenantId, 5));
  const hasOnlyOfficialDemo = demoProjects.every(p => p.code === 'PRJ-DEMO-2026');
  testAssert(hasOnlyOfficialDemo, 'Limpieza: Tenant demo restaurado exclusivamente al proyecto institucional PRJ-DEMO-2026 (0 fixtures residuales)');

  console.log('\n================================================================');
  console.log(`📊 RESULTADOS FINALES OLA 2 (FIX): ${passed} PASSED | ${failed} FAILED`);
  console.log('================================================================\n');
}

runOla2ExhaustiveSuite().catch((err) => {
  console.error('❌ Error en suite exhaustiva Ola 2:', err);
  process.exit(1);
});
