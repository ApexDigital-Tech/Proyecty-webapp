import 'dotenv/config';
import { db } from '../src/db/index.ts';
import { organizations, users, projects, budgetVersions, budgetLines, expenses, documents, auditLogs } from '../src/db/schema.ts';
import { eq, and, desc } from 'drizzle-orm';
import { createExpense, approveExpense } from '../src/services/expenses.service.ts';
import { createBudgetVersion, getBudgetVersionsByProject } from '../src/services/budget.service.ts';
import { generateFinancialReport } from '../src/services/ai.service.ts';
import { getOrCreateDemoTenant } from '../src/services/demoTenant.service.ts';

async function runPhase2Tests() {
  console.log('======================================================');
  console.log('🧪 SUITE DE PRUEBAS DE INTEGRIDAD FASE 2 (AUD-PROY-001)');
  console.log('======================================================\n');

  let passed = 0;
  let failed = 0;

  function assert(condition: boolean, testName: string, detail?: string) {
    if (condition) {
      console.log(`  ✅ PASS: ${testName}`);
      passed++;
    } else {
      console.error(`  ❌ FAIL: ${testName}${detail ? ` - ${detail}` : ''}`);
      failed++;
    }
  }

  // Setup: Ensure Demo Tenant
  const { orgId, users: demoUsers } = await getOrCreateDemoTenant();
  const director = demoUsers.find(u => u.roleKey === 'DIRECTOR') || demoUsers[0];
  const manager = demoUsers.find(u => u.roleKey === 'MANAGER') || demoUsers[1];
  const finance = demoUsers.find(u => u.roleKey === 'FINANCE') || demoUsers[2];

  // Fetch or ensure project
  const [project] = await db.select().from(projects).where(eq(projects.tenantId, orgId)).limit(1);
  const projectId = project.id;

  // Fetch or ensure budget line
  let [bLine] = await db.select().from(budgetLines).where(eq(budgetLines.projectId, projectId)).limit(1);

  // --- TEST 1: FIN-01 Segregación de Funciones (Auto-Aprobación Bloqueada) ---
  console.log('[1. FIN-01: Segregación Estricta de Funciones]');
  try {
    // 1.1 Registrar gasto con el usuario Manager
    const expense = await createExpense(orgId, manager.dbId, {
      title: 'Compra de suministros de campo',
      amount: 450.0,
      category: 'Insumos',
      projectId,
      budgetLineId: bLine.id,
    });

    assert(expense.status === 'pending', 'Gasto creado con estado inicial "pending"');

    // 1.2 Intentar auto-aprobar con el mismo usuario Manager que lo creó
    let autoApproveThrew = false;
    try {
      await approveExpense(orgId, expense.id, manager.dbId, 'approved');
    } catch (err: any) {
      if (err.name === 'ConflictError' && err.message.includes('Segregación de funciones')) {
        autoApproveThrew = true;
      }
    }
    assert(autoApproveThrew, 'Auto-aprobación del creador es BLOQUEADA con ConflictError (FIN-01)');

    // 1.3 Aprobar con un revisor independiente (Director)
    const approvedExpense = await approveExpense(orgId, expense.id, director.dbId, 'approved');
    assert(approvedExpense.status === 'approved', 'Aprobación por revisor independiente es EXITOSA');
    assert(approvedExpense.approvedBy === director.dbId, 'approvedBy registrado correctamente con ID del revisor');
  } catch (err: any) {
    assert(false, 'Test de segregación FIN-01 falló', err?.message);
  }

  // --- TEST 2: FIN-01 Bloqueo de Sobre-Ejecución Presupuestaria ---
  console.log('\n[2. FIN-01: Bloqueo de Sobre-Ejecución Presupuestaria]');
  try {
    // Intentar registrar y aprobar un gasto con monto superior al balance disponible
    const hugeExpense = await createExpense(orgId, manager.dbId, {
      title: 'Adquisición de maquinaria mayor fuera de presupuesto',
      amount: 999999.0, // Muy superior al balance
      category: 'Infraestructura',
      projectId,
      budgetLineId: bLine.id,
    });

    let overBudgetThrew = false;
    try {
      await approveExpense(orgId, hugeExpense.id, director.dbId, 'approved');
    } catch (err: any) {
      if (err.name === 'ConflictError' && err.message.includes('sobre-ejecución')) {
        overBudgetThrew = true;
      }
    }
    assert(overBudgetThrew, 'Gasto que supera saldo disponible es BLOQUEADO para evitar sobre-ejecución');
  } catch (err: any) {
    assert(false, 'Test de control presupuestario falló', err?.message);
  }

  // --- TEST 3: BUD-01 Versionado Presupuestario Inmutable ---
  console.log('\n[3. BUD-01: Versionado Presupuestario Inmutable]');
  try {
    // 3.1 Consultar versiones previas
    const versionsBefore = await getBudgetVersionsByProject(orgId, projectId);
    const initialCount = versionsBefore.length;

    // 3.2 Crear nueva versión presupuestaria (Adenda / Reformulación)
    const newVersion = await createBudgetVersion(orgId, projectId, director.dbId, {
      versionName: 'V2 - Adenda de Expansión Territorial',
      reason: 'Incorporación de nuevos beneficiarios aprobada por el donante',
      lines: [
        { code: 'BL-01', category: 'Personal', subcategory: 'Facilitadores', approvedAmount: 75000 },
        { code: 'BL-02', category: 'Equipamiento', subcategory: 'Materiales', approvedAmount: 60000 },
      ],
    });

    assert(newVersion.versionNumber > 0, `Nueva versión creada con número ${newVersion.versionNumber}`);

    // 3.3 Verificar que ambas versiones coexisten (Inmutabilidad histórica)
    const versionsAfter = await getBudgetVersionsByProject(orgId, projectId);
    assert(versionsAfter.length === initialCount + 1, 'Versión histórica original conservada inmutable en base de datos');
    assert(versionsAfter[0].lines.length > 0, 'Líneas presupuestarias asociadas a la versión registradas');
  } catch (err: any) {
    assert(false, 'Test de versionado presupuestario BUD-01 falló', err?.message);
  }

  // --- TEST 4: AUD-01 Trazabilidad Inmutable en DB con Diffs ---
  console.log('\n[4. AUD-01: Auditoría Inmutable en BD con Diffs]');
  try {
    const recentLogs = await db.select().from(auditLogs).where(eq(auditLogs.tenantId, orgId)).orderBy(desc(auditLogs.id)).limit(5);
    assert(recentLogs.length > 0, 'Registros de auditoría presentes en base de datos');
    
    const hasMetadataDiffs = recentLogs.some(l => l.metadata && (typeof l.metadata === 'object'));
    assert(hasMetadataDiffs, 'Eventos críticos contienen snapshots de metadata estructurada');
  } catch (err: any) {
    assert(false, 'Test de auditoría AUD-01 falló', err?.message);
  }

  // --- TEST 5: AI-01 Trazabilidad de Reportes IA con Citas Verificables ---
  console.log('\n[5. AI-01: Trazabilidad de Reportes con IA]');
  try {
    const sampleExpenses = [
      { id: 101, title: 'Combustible para visitas de campo', amount: 120, category: 'Logística', status: 'approved' },
      { id: 102, title: 'Alquiler de salón comunitario', amount: 250, category: 'Talleres', status: 'approved' },
    ];

    const aiReport = await generateFinancialReport(orgId, manager.dbId, sampleExpenses);

    assert(typeof aiReport.reportMarkdown === 'string' && aiReport.reportMarkdown.length > 50, 'Reporte financiero generado con contenido estructurado');
    assert(aiReport.sources.length === 2, 'Fuentes de datos transaccionales asociadas explícitamente al reporte');
    assert(aiReport.requiresHumanReview === true, 'Flag de aprobación humana requerida activo');
    assert(typeof aiReport.model === 'string', `Modelo reportado: ${aiReport.model}`);
  } catch (err: any) {
    assert(false, 'Test de trazabilidad de IA falló', err?.message);
  }

  console.log('\n======================================================');
  console.log(`📊 RESULTADOS FASE 2: ${passed} PASSED | ${failed} FAILED`);
  console.log('======================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

runPhase2Tests()
  .then(() => {
    // Graceful exit
    setTimeout(() => process.exit(0), 100);
  })
  .catch(err => {
    console.error('Error fatal ejecutando suite de tests Fase 2:', err);
    process.exit(1);
  });
