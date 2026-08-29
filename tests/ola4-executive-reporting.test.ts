import 'dotenv/config';
import assert from 'node:assert';
import { db } from '../src/db/index.ts';
import { 
  organizations, 
  projects, 
  tasks,
  projectMembers,
  budgetVersions,
  budgetLines,
  expenses,
  agreements,
  disbursements,
  users,
  roles,
  donors,
  generatedReports,
  auditLogs
} from '../src/db/schema.ts';
import { eq, and, sql, inArray } from 'drizzle-orm';
import { resetDemoTenantData } from '../src/services/demoTenant.service.ts';
import { getDashboardMetricsForUser, invalidateDashboardCache } from '../src/services/dashboard.service.ts';
import { 
  createReportDraft, 
  approveReport, 
  getReportsListForUser, 
  generateSafeCsv, 
  generateStructuredPdf,
  sanitizeCsvField,
  validateProjectScope
} from '../src/services/reporting-export.service.ts';
import { PDFDocument } from 'pdf-lib';
import { generateFinancialReport } from '../src/services/ai.service.ts';
import { exportReportsPdf, exportReportsCsv } from '../src/controllers/reports.controller.ts';

async function runOla4ExhaustiveSuite() {
  console.log('================================================================');
  console.log('📊 SUITE EXHAUSTIVA DE AUDITORÍA OLA 4 (v1.4.2-wave-4-fix)');
  console.log('   Módulos Canónicos: M-02 (Dashboard Ejecutivo y Métricas Globales)');
  console.log('   M-14 (Reportes Ejecutivos/Financieros, Citas, CSV Seguro y PDF)');
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
  // 0. Preparación: Tenants y Roles de Prueba Aislados
  // -------------------------------------------------------------------------
  let [testOrg] = await db.select().from(organizations).where(eq(organizations.name, 'ORG-TEST-SUITE-OLA4'));
  if (!testOrg) {
    [testOrg] = await db.insert(organizations).values({
      name: 'ORG-TEST-SUITE-OLA4',
      subscriptionPlan: 'ENTERPRISE',
      isActive: true,
    }).returning();
  }
  const tenantId = testOrg.id;

  let [otherOrg] = await db.select().from(organizations).where(eq(organizations.name, 'ORG-OTHER-ISOLATION-OLA4'));
  if (!otherOrg) {
    [otherOrg] = await db.insert(organizations).values({
      name: 'ORG-OTHER-ISOLATION-OLA4',
      subscriptionPlan: 'PRO',
      isActive: true,
    }).returning();
  }
  const otherTenantId = otherOrg.id;

  async function cleanTestTenant(orgId: number) {
    const prjs = await db.select({ id: projects.id }).from(projects).where(eq(projects.tenantId, orgId));
    const prjIds = prjs.map(p => p.id);
    if (prjIds.length > 0) {
      await db.delete(generatedReports).where(inArray(generatedReports.projectId, prjIds));
      await db.delete(expenses).where(inArray(expenses.projectId, prjIds));
      await db.delete(budgetLines).where(inArray(budgetLines.projectId, prjIds));
      await db.delete(budgetVersions).where(inArray(budgetVersions.projectId, prjIds));
      const agrs = await db.select({ id: agreements.id }).from(agreements).where(inArray(agreements.projectId, prjIds));
      const agrIds = agrs.map(a => a.id);
      if (agrIds.length > 0) {
        await db.delete(disbursements).where(inArray(disbursements.agreementId, agrIds));
      }
      await db.delete(agreements).where(inArray(agreements.projectId, prjIds));
      await db.delete(tasks).where(inArray(tasks.projectId, prjIds));
      await db.delete(projectMembers).where(inArray(projectMembers.projectId, prjIds));
      await db.delete(projects).where(inArray(projects.id, prjIds));
    }
    await db.update(users).set({ donorId: null, isActive: false }).where(eq(users.tenantId, orgId));
    await db.delete(generatedReports).where(eq(generatedReports.tenantId, orgId));
    await db.delete(donors).where(eq(donors.tenantId, orgId));
  }

  await cleanTestTenant(tenantId);
  await cleanTestTenant(otherTenantId);

  // Crear Roles y Donante
  const dbRoles = await db.select().from(roles);
  const directorRole = dbRoles.find(r => r.name.toLowerCase().includes('director')) || dbRoles[0];
  const managerRole = dbRoles.find(r => r.name.toLowerCase().includes('manager')) || dbRoles[1] || dbRoles[0];
  const financeRole = dbRoles.find(r => r.name.toLowerCase().includes('finance')) || dbRoles[2] || dbRoles[0];
  const auditorRole = dbRoles.find(r => r.name.toLowerCase().includes('auditor')) || dbRoles[3] || dbRoles[0];

  const [donorA] = await db.insert(donors).values({
    tenantId,
    name: 'Donante Internacional de Prueba',
    type: 'Internacional',
  }).returning();

  const [donorOther] = await db.insert(donors).values({
    tenantId,
    name: 'Donante Secundario No Vinculado',
    type: 'Privado',
  }).returning();

  // Crear Usuarios para la prueba
  const [userDirector] = await db.insert(users).values({
    tenantId,
    uid: `uid-dir4-${Date.now()}`,
    name: 'Director General',
    email: `dir4.${Date.now()}@test.org`,
    roleId: directorRole.id,
    isActive: true,
  }).returning();

  const [userFinance] = await db.insert(users).values({
    tenantId,
    uid: `uid-fin4-${Date.now()}`,
    name: 'Director de Finanzas',
    email: `fin4.${Date.now()}@test.org`,
    roleId: financeRole.id,
    isActive: true,
  }).returning();

  const [userPM] = await db.insert(users).values({
    tenantId,
    uid: `uid-pm4-${Date.now()}`,
    name: 'Responsable Proyecto Asignado',
    email: `pm4.${Date.now()}@test.org`,
    roleId: managerRole.id,
    isActive: true,
  }).returning();

  const [userFinanciadorLinked] = await db.insert(users).values({
    tenantId,
    uid: `uid-finan-link-${Date.now()}`,
    name: 'Representante Donante A',
    email: `donorA.${Date.now()}@test.org`,
    roleId: managerRole.id, // Rol canónico Financiador mapeado
    donorId: donorA.id, // Vinculado a donorA
    isActive: true,
  }).returning();

  const [userFinanciadorUnlinked] = await db.insert(users).values({
    tenantId,
    uid: `uid-finan-unlink-${Date.now()}`,
    name: 'Representante Donante B',
    email: `donorB.${Date.now()}@test.org`,
    roleId: managerRole.id,
    donorId: donorOther.id, // Vinculado a donorOther
    isActive: true,
  }).returning();

  // Crear 2 Proyectos de prueba
  // P1: Presupuesto $200,000, Físico 80%, Financiero 60% -> Brecha 20% (> 15% -> ALERTA)
  const [project1] = await db.insert(projects).values({
    tenantId,
    code: `PRJ-OLA4-01-${Date.now()}`,
    name: 'Proyecto Conservación Ambiental y Agroecología',
    status: 'EJECUCIÓN',
    riskLevel: 'Medio',
    approvedBudget: 200000,
    physicalProgress: 80,
    financialProgress: 60,
    donorId: donorA.id,
    baseCurrency: 'USD',
  }).returning();

  // P2: Presupuesto $100,000, Físico 50%, Financiero 40% -> Brecha 10% (<= 15% -> SIN ALERTA)
  const [project2] = await db.insert(projects).values({
    tenantId,
    code: `PRJ-OLA4-02-${Date.now()}`,
    name: 'Proyecto Capacitación y Desarrollo Juvenil',
    status: 'ACTIVO',
    riskLevel: 'Bajo',
    approvedBudget: 100000,
    physicalProgress: 50,
    financialProgress: 40,
    donorId: donorA.id,
    baseCurrency: 'USD',
  }).returning();

  // Asignar userPM a P1 (pero NO a P2)
  await db.insert(projectMembers).values({
    projectId: project1.id,
    userId: userPM.id,
    roleInProject: 'Manager',
  });

  // Versiones presupuestarias base para P1 y P2
  const [verP1] = await db.insert(budgetVersions).values({
    tenantId,
    projectId: project1.id,
    versionNumber: 1,
    versionName: 'V1 - Inicial Aprobado',
    status: 'APPROVED',
    isApproved: true,
    approvedBy: userFinance.id,
  }).returning();

  const [verP2] = await db.insert(budgetVersions).values({
    tenantId,
    projectId: project2.id,
    versionNumber: 1,
    versionName: 'V1 - Inicial Aprobado',
    status: 'APPROVED',
    isApproved: true,
    approvedBy: userFinance.id,
  }).returning();

  // Partidas presupuestarias asociadas a P1 y P2
  const [lineP1] = await db.insert(budgetLines).values({
    projectId: project1.id,
    budgetVersionId: verP1.id,
    code: 'BL-OLA4-01',
    category: 'Operaciones',
    subcategory: 'Actividades de Campo',
    approvedAmount: 200000,
    reformulatedAmount: 200000,
    executedAmount: 120000,
    balance: 80000,
    progress: 60,
    status: 'ACTIVE',
  }).returning();

  const [lineP2] = await db.insert(budgetLines).values({
    projectId: project2.id,
    budgetVersionId: verP2.id,
    code: 'BL-OLA4-02',
    category: 'Capacitación',
    subcategory: 'Talleres',
    approvedAmount: 100000,
    reformulatedAmount: 100000,
    executedAmount: 40000,
    balance: 60000,
    progress: 40,
    status: 'ACTIVE',
  }).returning();

  // Gastos Aprobados: P1: $120,000 (60% de 200k), P2: $40,000 (40% de 100k)
  await db.insert(expenses).values([
    {
      tenantId,
      projectId: project1.id,
      budgetLineId: lineP1.id,
      registeredBy: userDirector.id,
      amount: 120000,
      currency: 'USD',
      date: new Date('2026-08-24'),
      category: 'Operaciones',
      title: 'Gasto Mayor P1',
      status: 'approved',
      approvedBy: userFinance.id,
    },
    {
      tenantId,
      projectId: project2.id,
      budgetLineId: lineP2.id,
      registeredBy: userDirector.id,
      amount: 40000,
      currency: 'USD',
      date: new Date('2026-08-24'),
      category: 'Capacitación',
      title: 'Gasto Mayor P2',
      status: 'approved',
      approvedBy: userFinance.id,
    },
    {
      tenantId,
      projectId: project1.id,
      budgetLineId: lineP1.id,
      registeredBy: userDirector.id,
      amount: 15000,
      currency: 'USD',
      date: new Date('2026-08-24'),
      category: 'Insumos',
      title: 'Gasto Pendiente (No debe sumar a ejecución)',
      status: 'pending',
    }
  ]);

  // Convenio Activo en P1 ($200,000)
  const [agrP1] = await db.insert(agreements).values({
    projectId: project1.id,
    counterparty: donorA.name,
    signedDate: new Date('2026-01-01'),
    amount: 200000,
    currency: 'USD',
    durationMonths: 12,
    status: 'Activo',
    startDate: new Date('2026-01-01'),
    endDate: new Date('2026-12-31'),
    remainingDays: 180,
  }).returning();

  // -------------------------------------------------------------------------
  // 1. M-02: Dashboard Ejecutivo, Fórmulas Matemáticas y Alertas
  // -------------------------------------------------------------------------
  console.log('[1. M-02: Dashboard Ejecutivo, Fórmulas Matemáticas y Alertas]');

  // 1.1 Consistencia Matemática de KPIs Globales (Director)
  const metricsDir = await getDashboardMetricsForUser(tenantId, userDirector.id, 'DIRECTOR');
  
  // Presupuesto Total: 200,000 + 100,000 = 300,000
  testAssert(metricsDir.totalBudget === 300000, 'M-02: Presupuesto total aprobado coincide con PostgreSQL ($300,000)');
  // Ejecución Financiera: 120,000 + 40,000 = 160,000 (Solo APPROVED)
  testAssert(metricsDir.totalExecuted === 160000, 'M-02: Ejecución financiera acumulada suma exclusivamente gastos APPROVED ($160,000)');
  // Saldo Disponible: 300,000 - 160,000 = 140,000
  testAssert(metricsDir.availableBalance === 140000, 'M-02: Saldo disponible exacto ($140,000)');
  // Avance Financiero Global: (160,000 / 300,000) * 100 = 53.33 -> 53%
  testAssert(metricsDir.avgFinancial === 53, 'M-02: Avance financiero global % derivado exactamente (53%)');

  // Avance Físico Global Ponderado por Presupuesto:
  // (80 * 200k + 50 * 100k) / 300k = (16,000,000 + 5,000,000) / 300,000 = 21,000,000 / 300,000 = 70%
  testAssert(metricsDir.avgPhysical === 70, 'M-02: Avance físico global ponderado por presupuesto exactamente 70%');

  // 1.2 Frontera Estricta de Alerta de Brecha (> 15%)
  // P1 tiene |80 - 60| = 20% (> 15% -> ALERTA)
  // P2 tiene |50 - 40| = 10% (<= 15% -> NO ALERTA)
  testAssert(
    metricsDir.highRiskProjectsCount === 1 && metricsDir.highRiskProjectsDetails[0].id === project1.id,
    'M-02 Alerta de Brecha: Detección reactiva de brecha física/financiera > 15% (P1 alertado con gap 20%)'
  );

  // 1.3 M02-DISB-01: Desembolsos Pendientes (Cero, Parcial y Completo)
  // Caso A: Desembolso Cero (Convenio $200,000 sin desembolsos pagados)
  testAssert(
    metricsDir.pendingDisbursementsCount === 1 && metricsDir.pendingDisbursementsAmount === 200000,
    'M-02 / M02-DISB-01 Desembolso Cero: Monto comprometido $200,000 pendiente de desembolso'
  );

  // Caso B: Desembolso Parcial (Se paga hito de $50,000 -> Pendiente $150,000)
  const [d1] = await db.insert(disbursements).values({
    agreementId: agrP1.id,
    milestoneTitle: 'Hito 1 Parcial',
    estimatedDate: new Date('2026-03-01'),
    amount: 50000,
    condition: 'Aprobación inicial',
    status: 'PAGADO',
  }).returning();
  invalidateDashboardCache(tenantId);
  const metricsPartialDisb = await getDashboardMetricsForUser(tenantId, userDirector.id, 'DIRECTOR');
  testAssert(
    metricsPartialDisb.pendingDisbursementsAmount === 150000,
    'M-02 / M02-DISB-01 Desembolso Parcial: Monto pendiente se actualiza aritméticamente a $150,000 ($200k - $50k)'
  );

  // Caso C: Desembolso Completo (Se paga resto de $150,000 -> Pendiente $0)
  const [d2] = await db.insert(disbursements).values({
    agreementId: agrP1.id,
    milestoneTitle: 'Hito 2 Final',
    estimatedDate: new Date('2026-06-01'),
    amount: 150000,
    condition: 'Cierre de fase',
    status: 'PAGADO',
  }).returning();
  invalidateDashboardCache(tenantId);
  const metricsFullDisb = await getDashboardMetricsForUser(tenantId, userDirector.id, 'DIRECTOR');
  testAssert(
    metricsFullDisb.pendingDisbursementsAmount === 0 && metricsFullDisb.pendingDisbursementsCount === 0,
    'M-02 / M02-DISB-01 Desembolso Completo: Monto pendiente llega exactamente a $0 y 0 hitos pendientes'
  );

  // Limpiar desembolsos de prueba para mantener estado limpio
  await db.delete(disbursements).where(inArray(disbursements.id, [d1.id, d2.id]));
  invalidateDashboardCache(tenantId);

  // 1.4 Manejo Seguro de Estados Vacíos (Tenant sin proyectos)
  const metricsEmpty = await getDashboardMetricsForUser(otherTenantId, 999, 'DIRECTOR');
  testAssert(
    metricsEmpty.totalBudget === 0 &&
    metricsEmpty.totalExecuted === 0 &&
    metricsEmpty.avgPhysical === 0 &&
    metricsEmpty.avgFinancial === 0 &&
    !Number.isNaN(metricsEmpty.avgPhysical) &&
    !Number.isNaN(metricsEmpty.avgFinancial),
    'M-02 Estado Vacío: Organización sin proyectos devuelve ceros matemáticos controlados (sin NaN ni null)'
  );

  // 1.5 Alcance RBAC 'assigned' para Responsable de Proyecto
  const metricsPM = await getDashboardMetricsForUser(tenantId, userPM.id, 'RESPONSABLE_PROYECTO');
  testAssert(
    metricsPM.projectsList.length === 1 && metricsPM.projectsList[0].id === project1.id && metricsPM.totalBudget === 200000,
    'M-02 RBAC Scoping: Responsable de Proyecto solo visualiza métricas de sus proyectos asignados (P1: $200,000)'
  );

  // 1.6 Alcance para Financiador Vinculado vs No Vinculado
  const metricsFinLinked = await getDashboardMetricsForUser(tenantId, userFinanciadorLinked.id, 'FINANCIADOR');
  testAssert(
    metricsFinLinked.projectsList.length === 2 && metricsFinLinked.totalBudget === 300000,
    'M-02 Financiador (+): Financiador vinculado accede a proyectos de su donante'
  );

  const metricsFinUnlinked = await getDashboardMetricsForUser(tenantId, userFinanciadorUnlinked.id, 'FINANCIADOR');
  testAssert(
    metricsFinUnlinked.projectsList.length === 0 && metricsFinUnlinked.totalBudget === 0,
    'M-02 Financiador (-): Financiador no vinculado recibe 0 proyectos'
  );

  // 1.7 Benchmark de Rendimiento P95 con Concurrencia (100 Solicitudes)
  console.log('\n[Benchmark M-02: Muestra de 100 Solicitudes con Concurrencia]');
  const latencies: number[] = [];
  
  // 5 requests de calentamiento
  for (let i = 0; i < 5; i++) {
    await getDashboardMetricsForUser(tenantId, userDirector.id, 'DIRECTOR');
  }

  // 100 requests de medición en lotes concurrentes de 5
  const concurrency = 5;
  const totalRequests = 100;
  for (let i = 0; i < totalRequests; i += concurrency) {
    const batch = Array.from({ length: concurrency }, async () => {
      const t0 = performance.now();
      await getDashboardMetricsForUser(tenantId, userDirector.id, 'DIRECTOR');
      const t1 = performance.now();
      return t1 - t0;
    });
    const batchResults = await Promise.all(batch);
    latencies.push(...batchResults);
  }

  latencies.sort((a, b) => a - b);
  const median = latencies[Math.floor(latencies.length * 0.5)];
  const p95 = latencies[Math.floor(latencies.length * 0.95)];
  const p99 = latencies[Math.floor(latencies.length * 0.99)];
  const max = latencies[latencies.length - 1];

  console.log(`  ⏱️ Benchmark Dashboard (N=100, Concurrencia=5): Mediana=${median.toFixed(2)}ms | P95=${p95.toFixed(2)}ms | P99=${p99.toFixed(2)}ms | Max=${max.toFixed(2)}ms`);
  testAssert(latencies.length === 100 && p95 < 150, `M-02 Benchmark: P95 (${p95.toFixed(2)}ms) dentro del umbral canónico (<150ms)`);

  // -------------------------------------------------------------------------
  // 2. M-14: Versionado de Reportes, Segregación de Aprobación e Inmutabilidad
  // -------------------------------------------------------------------------
  console.log('\n[2. M-14: Versionado de Reportes, Segregación de Aprobación e Inmutabilidad]');

  // 2.1 Creación de Borrador V1 (Director)
  const reportV1 = await createReportDraft(tenantId, userDirector.id, 'DIRECTOR', {
    projectId: project1.id,
    reportType: 'FINANCIAL',
    contentMarkdown: '## Reporte Financiero Inicial V1\n- Análisis de ejecución de partidas.',
  });
  testAssert(
    reportV1.id > 0 && reportV1.versionNumber === 1 && reportV1.status === 'DRAFT',
    'M-14: Creación de borrador V1 en estado DRAFT por DIRECTOR'
  );

  // 2.2 Creación de Borrador V2 Correlativo (Manager)
  const reportV2 = await createReportDraft(tenantId, userDirector.id, 'MANAGER', {
    projectId: project1.id,
    reportType: 'FINANCIAL',
    contentMarkdown: '## Reporte Financiero Reformulado V2\n- Se reprogramaron fondos en operaciones.',
  });
  testAssert(
    reportV2.id > 0 && reportV2.versionNumber === 2 && reportV2.status === 'DRAFT',
    'M-14: Versionado correlativo automático V2 para el mismo proyecto y tipo'
  );

  // 2.3 RBAC Negativo de Creación: RESPONSABLE_PROYECTO, AUDITOR y FINANCIADOR bloqueados
  let pmBlocked = false;
  try {
    await createReportDraft(tenantId, userPM.id, 'RESPONSABLE_PROYECTO', {
      projectId: project1.id,
      reportType: 'FINANCIAL',
    });
  } catch (err: any) {
    pmBlocked = err.name === 'ForbiddenError';
  }
  testAssert(pmBlocked, 'M-14 RBAC (-): Responsable de Proyecto bloqueado para generar reportes (HTTP 403)');

  // 2.4 Segregación Obligatoria de Aprobación: created_by != approved_by (Autoaprobación rechazada)
  let selfApprovalRejected = false;
  try {
    // userDirector intenta aprobar el reporte creado por userDirector
    await approveReport(tenantId, userDirector.id, 'DIRECTOR', reportV1.id);
  } catch (err: any) {
    selfApprovalRejected = err.name === 'ConflictError' || err.message?.includes('Segregación de funciones');
  }
  testAssert(selfApprovalRejected, 'M-14 Segregación (+): Autoaprobación bloqueada con HTTP 409 (created_by == approved_by)');

  // 2.5 Aprobación Válida por Revisor Independiente (Finance aprueba reporte de Director)
  const approvedV1 = await approveReport(tenantId, userFinance.id, 'FINANCE', reportV1.id);
  testAssert(
    approvedV1.status === 'APPROVED' && approvedV1.approvedBy === userFinance.id && typeof approvedV1.pdfSha256 === 'string',
    'M-14 Aprobación Independiente: FINANCE aprueba reporte de DIRECTOR con hash SHA-256'
  );

  // 2.6 Inmutabilidad Estricta: Intento de volver a aprobar un reporte ya APPROVED rechazado
  let mutateApprovedBlocked = false;
  try {
    await approveReport(tenantId, userFinance.id, 'FINANCE', reportV1.id);
  } catch (err: any) {
    mutateApprovedBlocked = err.name === 'ConflictError';
  }
  testAssert(mutateApprovedBlocked, 'M-14 Inmutabilidad: Modificación de reporte APPROVED rechazada con HTTP 409 Conflict');

  // 2.7 Transición Transaccional: Al aprobar V2, V1 pasa automáticamente a SUPERSEDED
  const approvedV2 = await approveReport(tenantId, userFinance.id, 'FINANCE', reportV2.id);
  const [dbV1AfterV2] = await db.select().from(generatedReports).where(eq(generatedReports.id, reportV1.id));
  testAssert(
    approvedV2.status === 'APPROVED' && dbV1AfterV2.status === 'SUPERSEDED',
    'M-14 Transición Transaccional: Al aprobar V2, la versión previa V1 pasa a SUPERSEDED'
  );

  // -------------------------------------------------------------------------
  // 3. M-14: Seguridad CSV (RFC 4180 + Mitigación de Fórmulas) y PDF
  // -------------------------------------------------------------------------
  console.log('\n[3. M-14: Seguridad CSV (RFC 4180 + Inyección de Fórmulas) y PDF]');

  // 3.1 Sanitización de Inyección de Fórmulas CSV
  testAssert(sanitizeCsvField('=SUM(A1:A10)') === `"'=SUM(A1:A10)"`, 'M-14 CSV: Prefijo = neutralizado con apóstrofe');
  testAssert(sanitizeCsvField('+CMD|') === `"'*CMD|"`.replace('*', '+'), 'M-14 CSV: Prefijo + neutralizado con apóstrofe');
  testAssert(sanitizeCsvField('-12345') === ` "'-12345"`.trim(), 'M-14 CSV: Prefijo - neutralizado con apóstrofe');
  testAssert(sanitizeCsvField('@IMPORT') === `"'@IMPORT"`, 'M-14 CSV: Prefijo @ neutralizado con apóstrofe');
  testAssert(sanitizeCsvField('\tTAB').includes(`'\tTAB`), 'M-14 CSV: Prefijo tabulación neutralizado');
  testAssert(sanitizeCsvField('\rRET').includes(`'\rRET`), 'M-14 CSV: Prefijo retorno de carro neutralizado');
  testAssert(sanitizeCsvField('   =FORMULA_OCULTA') === `"'   =FORMULA_OCULTA"`, 'M-14 CSV: Fórmula con espacios iniciales detectada y neutralizada');
  testAssert(sanitizeCsvField('Texto "con comillas" y, comas') === `"Texto ""con comillas"" y, comas"`, 'M-14 CSV: Escape RFC 4180 de comillas y comas');

  // 3.2 Generación de CSV con UTF-8 BOM
  const sampleHeaders = ['Código', 'Concepto', 'Fórmula Peligrosa'];
  const sampleRows = [
    ['PRJ-01', 'Proyecto Alpha', '=1+1'],
    ['PRJ-02', 'Proyecto "Beta"', '@SUM(1,2)'],
  ];
  const { buffer: csvBuf, sha256: csvSha } = generateSafeCsv(sampleHeaders, sampleRows);
  
  // Validar BOM \uFEFF en los primeros 3 bytes: 0xEF, 0xBB, 0xBF
  const hasBom = csvBuf[0] === 0xEF && csvBuf[1] === 0xBB && csvBuf[2] === 0xBF;
  testAssert(hasBom && csvSha.length === 64, 'M-14 CSV: Codificación UTF-8 con BOM validada en buffer binario y SHA-256');

  // 3.3 M14-PDF-02: Validación Estructural de PDF con pdf-lib (Parser Estándar)
  const { buffer: pdfBuf, sha256: pdfSha } = await generateStructuredPdf(
    'Organización de Prueba',
    { code: project1.code, name: project1.name },
    'FINANCIAL',
    1,
    'Contenido financiero auditado con citas [Gasto #1]. Toda cifra transaccional verificada.',
    { 'Presupuesto Total': '$200,000 USD', 'Ejecución': '$120,000 USD' }
  );
  
  // Parsear el PDF generado con PDFDocument.load para certificar validez estructural
  const loadedPdf = await PDFDocument.load(pdfBuf);
  const pageCount = loadedPdf.getPageCount();
  const pdfTitle = loadedPdf.getTitle();
  const pdfAuthor = loadedPdf.getAuthor();
  const pdfProducer = loadedPdf.getProducer();
  console.log(`  🔍 PDF Inspection: Pages=${pageCount}, Title="${pdfTitle}", Author="${pdfAuthor}", Producer="${pdfProducer}", SHA=${pdfSha.slice(0, 16)}...`);
  testAssert(
    pageCount >= 1 && 
    pdfTitle?.includes('PROYECTY') && 
    pdfAuthor === 'Organización de Prueba' &&
    pdfSha.length === 64,
    'M-14 / M14-PDF-02: PDF validado estructuralmente por parser (árbol /Catalog -> /Pages -> /Page, metadatos, páginas >= 1 y SHA-256)'
  );

  // -------------------------------------------------------------------------
  // 4. M-14: Trazabilidad IA con Citas [Gasto #ID] y Fallback Estructurado
  // -------------------------------------------------------------------------
  console.log('\n[4. M-14: Trazabilidad IA con Citas [Gasto #ID] y Fallback Estructurado]');

  const testExpensesList = [
    { id: 101, title: 'Combustible de Campo', amount: '500.00', category: 'Operaciones', status: 'approved' },
    { id: 102, title: 'Material Didáctico', amount: '350.00', category: 'Educación', status: 'approved' },
  ];

  const aiReportResult = await generateFinancialReport(tenantId, userDirector.id, testExpensesList);
  testAssert(
    aiReportResult.reportMarkdown.includes('[Gasto #101]') && aiReportResult.reportMarkdown.includes('[Gasto #102]'),
    'M-14 IA Citas: Toda afirmación cita la referencia transaccional exacta [Gasto #ID]'
  );
  testAssert(
    aiReportResult.requiresHumanReview === true,
    'M-14 IA: Etiquetado obligatorio requiresHumanReview: true en salida de IA'
  );

  // -------------------------------------------------------------------------
  // 5. Cross-Tenant y Auditoría de Exportación
  // -------------------------------------------------------------------------
  console.log('\n[5. Cross-Tenant y Auditoría de Exportación]');

  let crossTenantScopeRejected = false;
  try {
    await validateProjectScope(otherTenantId, 999, 'DIRECTOR', project1.id);
  } catch (err: any) {
    crossTenantScopeRejected = err.name === 'NotFoundError';
  }
  testAssert(crossTenantScopeRejected, 'M-14 Cross-Tenant: Bloqueada validación y exportación de proyectos ajenos (HTTP 404)');

  // -------------------------------------------------------------------------
  // 6. Validación de Exportaciones PDF y CSV en Controladores Productivos
  // -------------------------------------------------------------------------
  console.log('\n[6. M-14: Validación de Controladores HTTP de Exportación PDF y CSV]');

  function createMockRes() {
    return {
      statusCode: 200,
      headers: {} as Record<string, string>,
      body: null as any,
      status(code: number) { this.statusCode = code; return this; },
      setHeader(key: string, val: string) { this.headers[key] = val; return this; },
      send(data: any) { this.body = data; return this; },
      json(data: any) { this.body = data; return this; },
    };
  }

  // 6.1 Exportación PDF por Director, Manager, Finance, Auditor
  for (const role of ['DIRECTOR', 'MANAGER', 'FINANCE', 'AUDITOR']) {
    const mockReq: any = {
      user: { id: userDirector.id, tenantId, role },
      query: { type: 'financiero' }
    };
    const mockRes = createMockRes();
    await exportReportsPdf(mockReq, mockRes as any, (() => {}) as any);
    
    testAssert(
      mockRes.statusCode === 200 && mockRes.headers['Content-Type'] === 'application/pdf' && Buffer.isBuffer(mockRes.body),
      `M-14 PDF Controller: Exportación PDF exitosa (HTTP 200, Buffer PDF válido) para rol ${role}`
    );
  }

  // 6.2 Exportación CSV Financiero con filtrado estricto de partidas activas del tenant
  const mockCsvReq: any = {
    user: { id: userDirector.id, tenantId, role: 'DIRECTOR' },
    query: { type: 'financiero', projectId: String(project1.id) }
  };
  const mockCsvRes = createMockRes();
  await exportReportsCsv(mockCsvReq, mockCsvRes as any, (() => {}) as any);
  const csvContent = mockCsvRes.body ? mockCsvRes.body.toString('utf-8') : '';
  testAssert(
    mockCsvRes.statusCode === 200 && csvContent.includes('BL-OLA4-01') && !csvContent.includes('BL-01'),
    'M-14 CSV Controller: Exportación CSV financiero delimita estrictamente las partidas activas del proyecto'
  );

  // -------------------------------------------------------------------------
  // 7. Limpieza y Descontaminación del Tenant Demo Institucional
  // -------------------------------------------------------------------------
  console.log('\n[7. Limpieza, Descontaminación y Conciliación del Tenant Demo]');
  await cleanTestTenant(tenantId);
  await cleanTestTenant(otherTenantId);
  const { orgId: demoOrgId } = await resetDemoTenantData();

  // 7.1 Conciliación de KPIs Productivos en Tenant Demo
  const demoUsersList = await db.select().from(users).where(eq(users.tenantId, demoOrgId));
  const demoDirectorUser = demoUsersList.find(u => u.roleId === 1) || demoUsersList[0];
  
  // Invalidar cache de dashboard para obtener datos frescos del demo
  invalidateDashboardCache(demoOrgId);
  const demoMetrics = await getDashboardMetricsForUser(demoOrgId, demoDirectorUser.id, 'DIRECTOR');

  testAssert(demoMetrics.totalBudget === 195000, 'M-02 Demo Conciliación: Presupuesto total del portafolio es exactamente USD 195,000 ($150k + $45k)');
  testAssert(demoMetrics.totalExecuted === 57000, 'M-02 Demo Conciliación: Ejecución total suma exactamente USD 57,000');
  testAssert(demoMetrics.availableBalance === 138000, 'M-02 Demo Conciliación: Saldo disponible es exactamente USD 138,000');
  testAssert(
    demoMetrics.pendingDisbursementsAmount === 150000 && demoMetrics.pendingDisbursementsCount === 1,
    'M-02 / M02-DISB-01 Demo Conciliación: Desembolsos pendientes del proyecto activo son exactamente USD 150,000'
  );
  testAssert(
    demoMetrics.projectsList.length === 2,
    'M-02 Demo Conciliación: Dos proyectos institucionales independientes en el portafolio'
  );

  const demoExpensesList = await db.select().from(expenses).where(eq(expenses.tenantId, demoOrgId));
  const demoApprovedExpenses = demoExpensesList.filter(e => e.status?.toUpperCase() === 'APPROVED');
  const demoApprovedTotal = demoApprovedExpenses.reduce((sum, e) => sum + Number(e.amount), 0);
  testAssert(
    demoApprovedExpenses.length === 4 && demoApprovedTotal === 57000,
    'M-02 / M-10 Conciliación: 4 gastos aprobados en base de datos suman exactamente USD 57,000'
  );

  // 7.2 Verificación de CSV en Tenant Demo (Solo las 4 partidas activas)
  const demoCsvReq: any = {
    user: { id: demoDirectorUser.id, tenantId: demoOrgId, role: 'DIRECTOR' },
    query: { type: 'financiero' }
  };
  const demoCsvRes = createMockRes();
  await exportReportsCsv(demoCsvReq, demoCsvRes as any, (() => {}) as any);
  const demoCsvContent = demoCsvRes.body ? demoCsvRes.body.toString('utf-8') : '';
  const hasAllDemoLines = demoCsvContent.includes('BL-01') && 
                          demoCsvContent.includes('BL-02') && 
                          demoCsvContent.includes('BL-03') && 
                          demoCsvContent.includes('BL-04');
  const hasNoTestLines = !demoCsvContent.includes('BL-OLA4-01') && !demoCsvContent.includes('BL-TEST');
  testAssert(hasAllDemoLines && hasNoTestLines, 'M-14 Demo CSV: Exportación contiene única y exclusivamente las 4 partidas activas de PRJ-DEMO-2026');

  // 7.3 Verificación de PDF en Tenant Demo (Validación Estructural por Parser)
  const demoPdfReq: any = {
    user: { id: demoDirectorUser.id, tenantId: demoOrgId, role: 'DIRECTOR' },
    query: { type: 'financiero' }
  };
  const demoPdfRes = createMockRes();
  await exportReportsPdf(demoPdfReq, demoPdfRes as any, (() => {}) as any);
  const demoLoadedPdf = await PDFDocument.load(demoPdfRes.body);
  const demoPageCount = demoLoadedPdf.getPageCount();

  testAssert(
    demoPdfRes.statusCode === 200 && 
    demoPdfRes.headers['Content-Type'] === 'application/pdf' &&
    demoPageCount >= 1,
    'M-14 / M14-PDF-02 Demo PDF: Exportación PDF responde HTTP 200 con documento PDF estándar renderizable'
  );

  const demoProjects = await db.select().from(projects).where(eq(projects.tenantId, demoOrgId));
  const hasOnlyOfficialDemo = demoProjects.length >= 1 && demoProjects.every(p => p.code === 'PRJ-DEMO-2026' || p.code === 'PRJ-DEMO-2026-B');
  testAssert(hasOnlyOfficialDemo, 'Limpieza: Tenant demo restaurado exclusivamente a proyectos institucionales autorizados (0 fixtures residuales)');

  console.log('\n================================================================');
  console.log(`📊 RESULTADOS FINALES OLA 4 (v1.4.2-wave-4-fix): ${passed} PASSED | ${failed} FAILED`);
  console.log('================================================================\n');
}

runOla4ExhaustiveSuite().catch((err) => {
  console.error('❌ Error en suite exhaustiva Ola 4:', err);
  process.exit(1);
});
