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
  users 
} from '../src/db/schema.ts';
import { eq, and } from 'drizzle-orm';
import { resetDemoTenantData } from '../src/services/demoTenant.service.ts';
import { createAgreement, createDisbursement, getAgreementsByProject } from '../src/services/agreements.service.ts';
import { createBudgetVersion, getBudgetVersionsByProject } from '../src/services/budget.service.ts';
import { createExpense, approveExpense } from '../src/services/expenses.service.ts';
import { createReceiptVoucher } from '../src/services/vouchers.service.ts';
import { convertCurrency } from '../src/services/currency.service.ts';

async function runOla2ExhaustiveSuite() {
  console.log('================================================================');
  console.log('💰 SUITE EXHAUSTIVA DE AUDITORÍA OLA 2 (v1.2.0-wave-2)');
  console.log('   Módulos: M-05 (Convenios), M-06 (Desembolsos), M-08 (Presupuestos),');
  console.log('            M-09 (Gastos y FIN-01), M-10 (Comprobantes), M-11 (Multi-divisa)');
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

  // 0. Preparación: Reset controlado del tenant demo
  await resetDemoTenantData();
  const [demoOrg] = await db.select().from(organizations).where(eq(organizations.name, 'ORG-DEMO-PROYECTY'));
  assert(demoOrg, 'Tenant demo ORG-DEMO-PROYECTY debe existir');
  const tenantId = demoOrg.id;

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

  // Proyecto demo de prueba
  const [testProject] = await db.insert(projects).values({
    tenantId,
    code: `PRJ-FIN-${Date.now()}`,
    name: 'Proyecto Integridad Financiera y Presupuestaria',
    status: 'ACTIVO',
    riskLevel: 'Bajo',
    approvedBudget: 500000,
    baseCurrency: 'USD',
  }).returning();

  // Proyecto en tenant externo
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
  // 1. M-05: Convenios (Montos, Fechas Válidas y Aislamiento)
  // -------------------------------------------------------------------------
  console.log('[1. M-05: Convenios de Financiación y Donaciones]');

  // 1.1 Convenio Válido
  const validAgreement = await createAgreement(tenantId, testProject.id, 1, {
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
    await createAgreement(tenantId, testProject.id, 1, {
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

  // 1.3 Rechazo de Fechas Inconsistentes (signedDate > startDate)
  let invalidDateRejected = false;
  try {
    await createAgreement(tenantId, testProject.id, 1, {
      counterparty: 'Donante Fechas Inválidas',
      signedDate: '2026-03-01',
      startDate: '2026-02-01', // start anterior a signed
      endDate: '2027-01-31',
      durationMonths: 12,
      amount: 100000,
    });
  } catch (err: any) {
    invalidDateRejected = err.name === 'ValidationError' || err.message?.includes('firma no puede ser posterior');
  }
  testAssert(invalidDateRejected, 'M-05: Rechazo estricto de convenio con fecha de firma posterior al inicio');

  // 1.4 Aislamiento Cross-Tenant en Convenios
  let crossTenantAgreementRejected = false;
  try {
    await createAgreement(tenantId, otherProject.id, 1, {
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
  testAssert(crossTenantAgreementRejected, 'M-05: Aislamiento Cross-Tenant: Bloqueada creación de convenios en proyectos de otra organización');

  // -------------------------------------------------------------------------
  // 2. M-06: Desembolsos (Control Acumulado vs Convenio y Multi-divisa)
  // -------------------------------------------------------------------------
  console.log('\n[2. M-06: Desembolsos e Ingresos Trazables]');

  // 2.1 Primer Desembolso Válido
  const disb1 = await createDisbursement(tenantId, validAgreement.id, 1, {
    milestoneTitle: 'Anticipo Inicial 50%',
    estimatedDate: '2026-02-15',
    amount: 150000,
    condition: 'Firma de convenio y plan operativo aprobado',
    status: 'PAGADO',
  });
  testAssert(disb1.id > 0 && disb1.amount === 150000, 'M-06: Primer desembolso ($150,000) registrado exitosamente');

  // 2.2 Segundo Desembolso Válido (acumulado $250,000 <= $300,000)
  const disb2 = await createDisbursement(tenantId, validAgreement.id, 1, {
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
    await createDisbursement(tenantId, validAgreement.id, 1, {
      milestoneTitle: 'Desembolso Excedente',
      estimatedDate: '2026-09-15',
      amount: 100000, // Excede el saldo restante de $50,000
      condition: 'Hito final',
      status: 'PENDIENTE',
    });
  } catch (err: any) {
    overDisbursementRejected = err.name === 'ConflictError' || err.message?.includes('excede el monto total del convenio');
  }
  testAssert(overDisbursementRejected, 'M-06: Bloqueo de sobre-desembolso: Rechazado desembolso que excede el límite del convenio ($300,000)');

  // -------------------------------------------------------------------------
  // 3. M-08: Gestión Presupuestaria, Versiones Correlativas e Inmutabilidad
  // -------------------------------------------------------------------------
  console.log('\n[3. M-08: Versiones Presupuestarias Correlativas e Inmutables]');

  // 3.1 Creación de Versión V1 Inicial
  const bv1 = await createBudgetVersion(tenantId, testProject.id, 1, {
    versionName: 'Presupuesto Base',
    lines: [
      { code: 'BL-01', category: 'Personal Técnico', subcategory: 'Coordinación', approvedAmount: 120000 },
      { code: 'BL-02', category: 'Equipamiento', subcategory: 'Sensores y Drones', approvedAmount: 80000 },
    ]
  });
  testAssert(bv1.versionNumber === 1 && bv1.versionName.includes('V1'), 'M-08: Versión V1 creada con número correlativo 1 y nombre normalizado');

  // 3.2 Creación de Versión V2 Reformulada
  const bv2 = await createBudgetVersion(tenantId, testProject.id, 1, {
    versionName: 'Adenda Aprobada por Donante',
    reason: 'Ampliación de cobertura territorial',
    lines: [
      { code: 'BL-01', category: 'Personal Técnico', subcategory: 'Coordinación y Especialistas', approvedAmount: 150000 },
      { code: 'BL-02', category: 'Equipamiento', subcategory: 'Sensores y Drones', approvedAmount: 80000 },
      { code: 'BL-03', category: 'Capacitación', subcategory: 'Talleres Comunitarios', approvedAmount: 30000 },
    ]
  });
  testAssert(bv2.versionNumber === 2 && bv2.versionName.includes('V2'), 'M-08: Versión V2 correlativa creada exitosamente (V1 archivada)');

  // 3.3 Consulta de Versiones del Proyecto
  const versionsList = await getBudgetVersionsByProject(tenantId, testProject.id);
  testAssert(versionsList.length === 2, 'M-08: Historial de versiones conserva íntegramente V1 y V2');

  // Obtener línea presupuestaria para pruebas de gastos
  const [bLine01] = await db.select().from(budgetLines).where(
    and(eq(budgetLines.projectId, testProject.id), eq(budgetLines.budgetVersionId, bv2.id), eq(budgetLines.code, 'BL-01'))
  );
  assert(bLine01, 'Línea presupuestaria BL-01 debe existir en V2');

  // -------------------------------------------------------------------------
  // 4. M-09: Registro y Aprobación de Gastos (FIN-01 y Saldo Concurrente)
  // -------------------------------------------------------------------------
  console.log('\n[4. M-09: Gastos, Segregación FIN-01 y Control de Sobregiro]');

  const tenantUsers = await db.select().from(users).where(eq(users.tenantId, tenantId));
  assert(tenantUsers.length >= 2, 'Deben existir al menos 2 usuarios en el tenant para pruebas de segregación FIN-01');
  const creatorUserId = tenantUsers[1].id; // Usuario creador
  const approverUserId = tenantUsers[0].id; // Usuario aprobador independiente

  // 4.1 Registro de Gasto Válido
  const newExpense = await createExpense(tenantId, creatorUserId, {
    projectId: testProject.id,
    budgetLineId: bLine01.id,
    title: 'Honorarios Especialista Forestal Mes 1',
    amount: 15000,
    category: 'Personal Técnico',
    currency: 'USD',
  });
  testAssert(newExpense.id > 0 && newExpense.status === 'pending', 'M-09: Gasto registrado en estado pendiente de aprobación');

  // 4.2 Control FIN-01: Prohibición de Autoaprobación
  let selfApprovalRejected = false;
  try {
    await approveExpense(tenantId, newExpense.id, creatorUserId, 'approved');
  } catch (err: any) {
    selfApprovalRejected = err.name === 'ConflictError' || err.message?.includes('FIN-01');
  }
  testAssert(selfApprovalRejected, 'M-09 / FIN-01: Autoaprobación bloqueada estrictamente (revisor debe ser independiente)');

  // 4.3 Aprobación por Revisor Independiente y Descuento Atómico de Saldo
  const approvedExp = await approveExpense(tenantId, newExpense.id, approverUserId, 'approved');
  testAssert(approvedExp.status === 'approved' && approvedExp.approvedBy === approverUserId, 'M-09 / FIN-01: Gasto aprobado por revisor independiente (Director)');

  const [updatedLine] = await db.select().from(budgetLines).where(eq(budgetLines.id, bLine01.id));
  testAssert(
    updatedLine.executedAmount === 15000 && updatedLine.balance === (150000 - 15000),
    'M-09: Saldo presupuestario actualizado atómicamente ($15,000 ejecutado, $135,000 balance)'
  );

  // 4.4 Intento de Aprobación de Gasto Superior al Saldo Disponible ($200,000 > $135,000)
  const hugeExpense = await createExpense(tenantId, creatorUserId, {
    projectId: testProject.id,
    budgetLineId: bLine01.id,
    title: 'Gasto Excesivo no Autorizable',
    amount: 200000, // Excede el saldo restante de $135,000
    category: 'Personal Técnico',
    currency: 'USD',
  });

  let overBudgetExpenseRejected = false;
  try {
    await approveExpense(tenantId, hugeExpense.id, approverUserId, 'approved');
  } catch (err: any) {
    overBudgetExpenseRejected = err.name === 'ConflictError' || err.message?.includes('excede el saldo disponible');
  }
  testAssert(overBudgetExpenseRejected, 'M-09: Bloqueo de sobregiro presupuestario: Rechazada aprobación de gasto superior al saldo disponible');

  // -------------------------------------------------------------------------
  // 5. M-10: Comprobantes y Facturas (Unicidad Fiscal)
  // -------------------------------------------------------------------------
  console.log('\n[5. M-10: Comprobantes y Facturas (Unicidad Fiscal)]');

  const voucher1 = await createReceiptVoucher(tenantId, 1, {
    projectId: testProject.id,
    expenseId: approvedExp.id,
    budgetLineId: bLine01.id,
    type: 'Factura',
    amount: 15000,
    provider: 'Consultora Ambiental Andina S.A.C.',
    fileName: 'F001-00045892.pdf',
    issueDate: '2026-02-20',
    description: 'Factura electrónica por servicios de consultoría forestal',
  });
  testAssert(voucher1.id > 0, 'M-10: Comprobante fiscal registrado exitosamente');

  // 5.2 Intento de Registro Duplicado de Factura
  let duplicateVoucherRejected = false;
  try {
    await createReceiptVoucher(tenantId, 1, {
      projectId: testProject.id,
      expenseId: approvedExp.id,
      budgetLineId: bLine01.id,
      type: 'Factura',
      amount: 15000,
      provider: 'Consultora Ambiental Andina S.A.C.',
      fileName: 'F001-00045892.pdf', // Mismo emisor y comprobante
      issueDate: '2026-02-20',
    });
  } catch (err: any) {
    duplicateVoucherRejected = err.name === 'ConflictError' || err.message?.includes('Ya existe un comprobante');
  }
  testAssert(duplicateVoucherRejected, 'M-10: Unicidad fiscal: Bloqueada inserción de comprobante/factura duplicada');

  // -------------------------------------------------------------------------
  // 6. M-11: Multi-divisa y Tasas de Cambio
  // -------------------------------------------------------------------------
  console.log('\n[6. M-11: Multi-divisa y Tasas de Cambio]');

  const conversion = convertCurrency(38000, 'EUR', 'USD', 1.08, 'BANCO_CENTRAL_EUROPEO');
  testAssert(
    conversion.convertedAmount === 41040 && conversion.exchangeRate === 1.08 && conversion.rateSource === 'BANCO_CENTRAL_EUROPEO',
    'M-11: Conversión monetaria EUR->USD con tasa y fuente registradas'
  );

  console.log('\n================================================================');
  console.log(`📊 RESULTADOS FINALES OLA 2: ${passed} PASSED | ${failed} FAILED`);
  console.log('================================================================\n');
}

runOla2ExhaustiveSuite().catch((err) => {
  console.error('❌ Error en suite exhaustiva Ola 2:', err);
  process.exit(1);
});
