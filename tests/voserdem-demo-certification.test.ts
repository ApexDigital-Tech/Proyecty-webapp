import 'dotenv/config';
import { db } from '../src/db/index.ts';
import {
  organizations,
  users,
  projects,
  budgetLines,
  expenses,
  documents,
  auditLogs,
  tasks,
} from '../src/db/schema.ts';
import { eq, and } from 'drizzle-orm';
import {
  DEMO_ORG_NAME,
  DEMO_USERS_CATALOG,
  getOrCreateDemoTenant,
  resetDemoTenantData,
} from '../src/services/demoTenant.service.ts';
import { generateDemoToken, verifyDemoToken } from '../src/services/demoAuth.service.ts';
import { approveExpense, createExpense } from '../src/services/expenses.service.ts';
import { hasPermission } from '../src/lib/rbac.ts';
import { UserRole } from '../src/types.ts';

async function runDemoCertificationSuite() {
  console.log('========================================================================');
  console.log('🧪 SUITE INTEGRAL DE CERTIFICACIÓN VOSERDEM DEMO-D1 (AUDIT-D1-001)');
  console.log('========================================================================\n');

  let passed = 0;
  let failed = 0;

  function assert(condition: boolean, testName: string, detail?: string) {
    if (condition) {
      console.log(`  ✅ [PASS] ${testName}`);
      passed++;
    } else {
      console.error(`  ❌ [FAIL] ${testName}${detail ? ` - ${detail}` : ''}`);
      failed++;
    }
  }

  // --- 1. SETUP E IDEMPOTENCIA DEL SEED ---
  console.log('[1. Idempotencia y Setup del Seed VOSERDEM]');
  const seed1 = await resetDemoTenantData();
  assert(seed1.success && seed1.orgId > 0, 'Seed 1 completado exitosamente con ID válido');

  const { orgId, users: users1 } = await getOrCreateDemoTenant();
  assert(users1.length === 6, 'Catálogo inicial contiene exactamente 6 identidades demo');

  // Ejecutar seed por segunda vez para verificar idempotencia
  const { users: users2 } = await getOrCreateDemoTenant();
  assert(users2.length === 6, 'Seed 2 ejecutado: Sin duplicados (total exacto 6 identidades)');

  const [orgRecord] = await db.select().from(organizations).where(eq(organizations.id, orgId));
  assert(orgRecord.name === DEMO_ORG_NAME, `Nombre visible de la organización: "${DEMO_ORG_NAME}"`);

  // --- 2. IDENTIDADES Y ROLES CANÓNICOS (6/6) ---
  console.log('\n[2. Validación de los 6 Usuarios y Roles Canónicos]');
  for (const expectedUser of DEMO_USERS_CATALOG) {
    const userInDb = users2.find(u => u.roleKey === expectedUser.roleKey);
    assert(!!userInDb, `Identidad ${expectedUser.roleKey}: ${expectedUser.name} (${expectedUser.email})`);
    assert(userInDb?.email === expectedUser.email, `Email canónico correcto para ${expectedUser.roleKey}`);
    assert(userInDb?.uid === expectedUser.uid, `UID aislado correcto para ${expectedUser.roleKey}`);
  }

  // --- 3. PROYECTO DEMO Y PRESUPUESTO INICIAL ---
  console.log('\n[3. Integridad del Proyecto y Desglose Presupuestario]');
  const [project] = await db.select().from(projects).where(and(eq(projects.tenantId, orgId), eq(projects.code, 'PRJ-DEMO-2026')));
  assert(!!project, 'Proyecto PRJ-DEMO-2026 creado');
  assert(project.approvedBudget === 150000, 'Presupuesto total aprobado: $150,000 USD');
  assert(project.physicalProgress === 75, 'Avance físico ponderado inicial: 75%');
  assert(project.financialProgress === 38, 'Avance financiero inicial: 38% ($57,000 / $150,000)');

  const bLines = await db.select().from(budgetLines).where(eq(budgetLines.projectId, project.id));
  assert(bLines.length === 4, 'Existen exactamente 4 partidas presupuestarias (BL-01 a BL-04)');

  const bl01 = bLines.find(b => b.code === 'BL-01');
  const bl02 = bLines.find(b => b.code === 'BL-02');
  const bl03 = bLines.find(b => b.code === 'BL-03');
  const bl04 = bLines.find(b => b.code === 'BL-04');

  assert(bl01?.approvedAmount === 60000 && bl01?.executedAmount === 24000 && bl01?.balance === 36000, 'BL-01 Talento Humano: $60k aprobado, $24k ejecutado, $36k saldo');
  assert(bl02?.approvedAmount === 50000 && bl02?.executedAmount === 21500 && bl02?.balance === 28500, 'BL-02 Infraestructura: $50k aprobado, $21.5k ejecutado, $28.5k saldo');
  assert(bl03?.approvedAmount === 25000 && bl03?.executedAmount === 8500 && bl03?.balance === 16500, 'BL-03 Capacitación: $25k aprobado, $8.5k ejecutado, $16.5k saldo');
  assert(bl04?.approvedAmount === 15000 && bl04?.executedAmount === 3000 && bl04?.balance === 12000, 'BL-04 Monitoreo: $15k aprobado, $3k ejecutado, $12k saldo');

  const totalExecuted = (bl01?.executedAmount || 0) + (bl02?.executedAmount || 0) + (bl03?.executedAmount || 0) + (bl04?.executedAmount || 0);
  assert(totalExecuted === 57000, 'Suma matemática de ejecución inicial es exactamente $57,000 USD (38%)');

  // --- 4. GASTO PENDIENTE Y APROBACIÓN TRANSACCIONAL ---
  console.log('\n[4. Flujo de Aprobación de Gasto y Consistencia Atómica]');
  const pendingExpenses = await db.select().from(expenses).where(and(eq(expenses.projectId, project.id), eq(expenses.status, 'pending')));
  assert(pendingExpenses.length === 1, 'Existe exactamente 1 gasto pendiente de aprobación');
  
  const targetExpense = pendingExpenses[0];
  assert(targetExpense.amount === 6000, 'Monto del gasto pendiente: $6,000 USD');
  assert(targetExpense.budgetLineId === bl02?.id, 'Gasto imputado a la partida BL-02');

  const directorUser = users2.find(u => u.roleKey === 'DIRECTOR')!;
  const managerUser = users2.find(u => u.roleKey === 'MANAGER')!;

  // 4.1 Probar Segregación de Funciones (FIN-01): El creador NO puede auto-aprobar
  try {
    await approveExpense(orgId, targetExpense.id, managerUser.dbId, 'approved');
    assert(false, 'FIN-01 Segregación: Auto-aprobación rechazada');
  } catch (err: any) {
    assert(err.message.includes('FIN-01') || err.message.includes('Segregación'), 'FIN-01 Segregación: Auto-aprobación bloqueada correctamente');
  }

  // 4.2 Aprobación legítima por parte del Director
  const approvedResult = await approveExpense(orgId, targetExpense.id, directorUser.dbId, 'approved');
  assert(approvedResult.status === 'approved', 'Gasto aprobado exitosamente por el Director');

  // 4.3 Comprobar actualización atómica en la partida BL-02
  const [updatedBL02] = await db.select().from(budgetLines).where(eq(budgetLines.id, bl02!.id));
  assert(updatedBL02.executedAmount === 27500, `BL-02 Ejecutado actualizado: $${updatedBL02.executedAmount} (Esperado: $27,500)`);
  assert(updatedBL02.balance === 22500, `BL-02 Saldo actualizado: $${updatedBL02.balance} (Esperado: $22,500)`);

  // 4.4 Comprobar registro en bitácora inmutable (AUD-01)
  const auditLogsList = await db.select().from(auditLogs).where(and(eq(auditLogs.tenantId, orgId), eq(auditLogs.action, 'EXPENSE_APPROVED')));
  assert(auditLogsList.length >= 1, 'Evento EXPENSE_APPROVED sellado en audit_logs');
  assert(auditLogsList[0].userId === directorUser.dbId, 'Actor registrado en auditoría coincide con Director');

  // --- 5. VERIFICACIÓN DE RESET DETERMINISTA ---
  console.log('\n[5. Verificación de Reset Determinista]');
  const resetResult = await resetDemoTenantData();
  assert(resetResult.success, 'Reset completado con éxito');

  // Obtener el proyecto recreado después del reset
  const [projectAfterReset] = await db.select().from(projects).where(and(eq(projects.tenantId, orgId), eq(projects.code, 'PRJ-DEMO-2026')));
  assert(!!projectAfterReset, 'Proyecto recuperado tras reset');

  // Comprobar que BL-02 vuelve a $21,500 ejecutados y gasto a 'pending'
  const bLinesReset = await db.select().from(budgetLines).where(eq(budgetLines.projectId, projectAfterReset.id));
  const bl02AfterReset = bLinesReset.find(b => b.code === 'BL-02');
  assert(bl02AfterReset?.executedAmount === 21500, `Reset BL-02 Ejecutado restaurado: $${bl02AfterReset?.executedAmount} (Esperado: $21,500)`);
  assert(bl02AfterReset?.balance === 28500, `Reset BL-02 Saldo restaurado: $${bl02AfterReset?.balance} (Esperado: $28,500)`);

  const pendingAfterReset = await db.select().from(expenses).where(and(eq(expenses.projectId, projectAfterReset.id), eq(expenses.status, 'pending')));
  assert(pendingAfterReset.length === 1 && pendingAfterReset[0].amount === 6000, 'Gasto de $6,000 restaurado en estado "pending"');

  // --- 6. RBAC: PERMISOS PERMITIDOS Y DENEGADOS (6 ROLES) ---
  console.log('\n[6. Matriz de Permisos RBAC por Rol]');
  // DIRECTOR
  assert(hasPermission('DIRECTOR', 'canViewDashboard') === true, 'DIRECTOR: canViewDashboard = true');
  assert(hasPermission('DIRECTOR', 'canApproveExpenses') === true, 'DIRECTOR: canApproveExpenses = true');
  assert(hasPermission('DIRECTOR', 'canViewUsers') === true, 'DIRECTOR: canViewUsers = true');

  // MANAGER
  assert(hasPermission('MANAGER', 'canViewDashboard') === true, 'MANAGER: canViewDashboard = true');
  assert(hasPermission('MANAGER', 'canEditProject') === true, 'MANAGER: canEditProject = true');
  assert(hasPermission('MANAGER', 'canViewUsers') === false, 'MANAGER: canViewUsers = false (Denegado)');

  // FINANCE
  assert(hasPermission('FINANCE', 'canApproveVouchers') === true, 'FINANCE: canApproveVouchers = true');
  assert(hasPermission('FINANCE', 'canEditProject') === false, 'FINANCE: canEditProject = false (Denegado)');

  // AUDITOR
  assert(hasPermission('AUDITOR', 'canViewAudit') === true, 'AUDITOR: canViewAudit = true');
  assert(hasPermission('AUDITOR', 'canApproveExpenses') === false, 'AUDITOR: canApproveExpenses = false (Denegado)');
  assert(hasPermission('AUDITOR', 'canEditBudget') === false, 'AUDITOR: canEditBudget = false (Denegado)');

  // RESPONSABLE_PROYECTO
  assert(hasPermission('RESPONSABLE_PROYECTO', 'canEditProject') === true, 'RESPONSABLE_PROYECTO: canEditProject = true');
  assert(hasPermission('RESPONSABLE_PROYECTO', 'canApproveExpenses') === false, 'RESPONSABLE_PROYECTO: canApproveExpenses = false (Denegado)');

  // FINANCIADOR
  assert(hasPermission('FINANCIADOR', 'canViewReports') === true, 'FINANCIADOR: canViewReports = true');
  assert(hasPermission('FINANCIADOR', 'canEditProject') === false, 'FINANCIADOR: canEditProject = false (Denegado)');
  assert(hasPermission('FINANCIADOR', 'canEditBudget') === false, 'FINANCIADOR: canEditBudget = false (Denegado)');

  // --- 7. DOCUMENTOS FICTICIOS ---
  console.log('\n[7. Documentos Ficticios y Tareas]');
  const docsList = await db.select().from(documents).where(eq(documents.projectId, projectAfterReset.id));
  assert(docsList.length === 2, 'Proyecto contiene exactamente 2 documentos ficticios vinculados');
  assert(docsList.some(d => d.name.includes('Comprobante') && d.originalName === 'comprobante_filtracion_demo.pdf'), 'Documento 1: Comprobante filtración demo vinculado');
  assert(docsList.some(d => d.name.includes('Informe') && d.originalName === 'informe_tecnico_instalacion_demo.pdf'), 'Documento 2: Informe técnico demo vinculado');

  console.log('\n========================================================================');
  console.log(`🎯 TOTAL PRUEBAS: ${passed + failed} | APROBADAS: ${passed} | FALLIDAS: ${failed}`);
  console.log('========================================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

runDemoCertificationSuite().catch(err => {
  console.error('Error no capturado en suite:', err);
  process.exit(1);
});
