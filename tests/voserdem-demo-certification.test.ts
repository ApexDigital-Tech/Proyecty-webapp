import 'dotenv/config';
import { db } from '../src/db/index.ts';
import {
  organizations,
  users,
  projects,
  projectMembers,
  budgetLines,
  expenses,
  documents,
  auditLogs,
  tasks,
} from '../src/db/schema.ts';
import { eq, and, inArray } from 'drizzle-orm';
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
  console.log('🧪 SUITE INTEGRAL DE CERTIFICACIÓN VOSERDEM DEMO-D1A (AUDIT-D1A-001)');
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

  // --- 3. INTEGRIDAD DE PROYECTO A Y PROYECTO B (INDEPENDENCIA) ---
  console.log('\n[3. Independencia y Aislamiento de Proyectos (Proyecto A vs Proyecto B)]');
  const [projectA] = await db.select().from(projects).where(and(eq(projects.tenantId, orgId), eq(projects.code, 'PRJ-DEMO-2026')));
  const [projectB] = await db.select().from(projects).where(and(eq(projects.tenantId, orgId), eq(projects.code, 'PRJ-DEMO-2026-B')));

  assert(!!projectA, 'Proyecto A (PRJ-DEMO-2026) creado');
  assert(!!projectB, 'Proyecto B (PRJ-DEMO-2026-B) creado');
  assert(projectA.id !== projectB.id, 'Proyecto A y Proyecto B poseen IDs distintos y separados');
  assert(projectA.donorId !== projectB.donorId, 'Proyecto A y Proyecto B poseen donantes/fuentes independientes');
  assert(projectA.approvedBudget === 150000, 'Proyecto A: Presupuesto total aprobado $150,000 USD');
  assert(projectB.approvedBudget === 45000, 'Proyecto B: Presupuesto total aprobado $45,000 USD');
  assert(projectA.physicalProgress === 75, 'Proyecto A: Avance físico 75%');
  assert(projectB.physicalProgress === 0, 'Proyecto B: Avance físico 0% (Planificación)');
  assert(projectA.financialProgress === 38, 'Proyecto A: Avance financiero 38% ($57,000 / $150,000)');
  assert(projectB.financialProgress === 0, 'Proyecto B: Avance financiero 0% ($0 / $45,000)');

  // 3.1 Partidas de Proyecto A vs Proyecto B
  const bLinesA = await db.select().from(budgetLines).where(eq(budgetLines.projectId, projectA.id));
  const bLinesB = await db.select().from(budgetLines).where(eq(budgetLines.projectId, projectB.id));

  assert(bLinesA.length === 4, 'Proyecto A contiene exactamente 4 partidas presupuestarias (BL-01 a BL-04)');
  assert(bLinesB.length === 2, 'Proyecto B contiene exactamente 2 partidas presupuestarias (BL-B01, BL-B02)');

  const bl01 = bLinesA.find(b => b.code === 'BL-01');
  const bl02 = bLinesA.find(b => b.code === 'BL-02');
  const bl03 = bLinesA.find(b => b.code === 'BL-03');
  const bl04 = bLinesA.find(b => b.code === 'BL-04');

  assert(bl01?.approvedAmount === 60000 && bl01?.executedAmount === 24000 && bl01?.balance === 36000, 'Proyecto A - BL-01: $60k aprobado, $24k ejecutado, $36k saldo');
  assert(bl02?.approvedAmount === 50000 && bl02?.executedAmount === 21500 && bl02?.balance === 28500, 'Proyecto A - BL-02: $50k aprobado, $21.5k ejecutado, $28.5k saldo');
  assert(bl03?.approvedAmount === 25000 && bl03?.executedAmount === 8500 && bl03?.balance === 16500, 'Proyecto A - BL-03: $25k aprobado, $8.5k ejecutado, $16.5k saldo');
  assert(bl04?.approvedAmount === 15000 && bl04?.executedAmount === 3000 && bl04?.balance === 12000, 'Proyecto A - BL-04: $15k aprobado, $3k ejecutado, $12k saldo');

  const totalExecutedA = (bl01?.executedAmount || 0) + (bl02?.executedAmount || 0) + (bl03?.executedAmount || 0) + (bl04?.executedAmount || 0);
  assert(totalExecutedA === 57000, 'Proyecto A: Suma de ejecución inicial es exactamente $57,000 USD (38%)');

  const blB01 = bLinesB.find(b => b.code === 'BL-B01');
  const blB02 = bLinesB.find(b => b.code === 'BL-B02');
  assert(blB01?.approvedAmount === 30000 && blB01?.executedAmount === 0 && blB01?.balance === 30000, 'Proyecto B - BL-B01: $30k aprobado, $0 ejecutado, $30k saldo');
  assert(blB02?.approvedAmount === 15000 && blB02?.executedAmount === 0 && blB02?.balance === 15000, 'Proyecto B - BL-B02: $15k aprobado, $0 ejecutado, $15k saldo');

  // 3.2 Aislamiento de Miembros (Responsable de Proyecto asignado exclusivamente a Proyecto A)
  console.log('\n[4. Aislamiento Operativo del Responsable de Proyecto]');
  const responsableUser = users2.find(u => u.roleKey === 'RESPONSABLE_PROYECTO')!;
  const membersA = await db.select().from(projectMembers).where(and(eq(projectMembers.projectId, projectA.id), eq(projectMembers.userId, responsableUser.dbId)));
  const membersB = await db.select().from(projectMembers).where(and(eq(projectMembers.projectId, projectB.id), eq(projectMembers.userId, responsableUser.dbId)));

  assert(membersA.length === 1, 'Responsable de Proyecto asignado legítimamente a Proyecto A');
  assert(membersB.length === 0, 'Responsable de Proyecto NO asignado a Proyecto B (Acceso denegado/aislado)');

  // 3.3 Aislamiento Documental
  const docsA = await db.select().from(documents).where(eq(documents.projectId, projectA.id));
  const docsB = await db.select().from(documents).where(eq(documents.projectId, projectB.id));
  assert(docsA.length === 2, 'Proyecto A contiene exactamente 2 documentos ficticios vinculados');
  assert(docsB.length === 0, 'Proyecto B contiene 0 documentos (Aislamiento documental estricto)');

  // --- 5. GASTO PENDIENTE Y FLUJO DE APROBACIÓN TRANSACCIONAL ---
  console.log('\n[5. Flujo Financiero y Segregación de Funciones (FIN-01)]');
  const pendingExpensesA = await db.select().from(expenses).where(and(eq(expenses.projectId, projectA.id), eq(expenses.status, 'pending')));
  const pendingExpensesB = await db.select().from(expenses).where(and(eq(expenses.projectId, projectB.id), eq(expenses.status, 'pending')));

  assert(pendingExpensesA.length === 1, 'Proyecto A contiene 1 gasto pendiente ($6,000)');
  assert(pendingExpensesB.length === 0, 'Proyecto B contiene 0 gastos pendientes');

  const targetExpense = pendingExpensesA[0];
  assert(targetExpense.amount === 6000, 'Monto del gasto pendiente: $6,000 USD');
  assert(targetExpense.registeredBy === responsableUser.dbId, 'Gasto registrado por Responsable de Proyecto');

  const directorUser = users2.find(u => u.roleKey === 'DIRECTOR')!;

  // 5.1 Control FIN-01: El Responsable NO puede auto-aprobar su propio gasto
  try {
    await approveExpense(orgId, targetExpense.id, responsableUser.dbId, 'approved');
    assert(false, 'FIN-01 Segregación: Auto-aprobación del Responsable rechazada');
  } catch (err: any) {
    assert(err.message.includes('FIN-01') || err.message.includes('Segregación'), 'FIN-01 Segregación: Auto-aprobación bloqueada correctamente');
  }

  // 5.2 Aprobación legítima por parte del Director
  const approvedResult = await approveExpense(orgId, targetExpense.id, directorUser.dbId, 'approved');
  assert(approvedResult.status === 'approved', 'Gasto aprobado exitosamente por el Director');

  // 5.3 Comprobar actualización atómica en la partida BL-02 de Proyecto A
  const [updatedBL02] = await db.select().from(budgetLines).where(eq(budgetLines.id, bl02!.id));
  assert(updatedBL02.executedAmount === 27500, `BL-02 Ejecutado actualizado: $${updatedBL02.executedAmount} (Esperado: $27,500)`);
  assert(updatedBL02.balance === 22500, `BL-02 Saldo actualizado: $${updatedBL02.balance} (Esperado: $22,500)`);

  // 5.4 Comprobar que Proyecto B permanece completamente INTACTO
  const [blB01Check] = await db.select().from(budgetLines).where(eq(budgetLines.id, blB01!.id));
  assert(blB01Check.executedAmount === 0 && blB01Check.balance === 30000, 'Aprobación en Proyecto A NO alteró partidas de Proyecto B');

  // 5.5 Comprobar registro en bitácora inmutable (AUD-01)
  const auditLogsList = await db.select().from(auditLogs).where(and(eq(auditLogs.tenantId, orgId), eq(auditLogs.action, 'EXPENSE_APPROVED')));
  assert(auditLogsList.length >= 1, 'Evento EXPENSE_APPROVED sellado en audit_logs');
  assert(auditLogsList[0].userId === directorUser.dbId, 'Actor registrado en auditoría coincide con Director');

  // --- 6. VERIFICACIÓN DE RESET DETERMINISTA ---
  console.log('\n[6. Verificación de Reset Determinista de Ambos Proyectos]');
  const resetResult = await resetDemoTenantData();
  assert(resetResult.success, 'Reset completado con éxito');

  const [projectAReset] = await db.select().from(projects).where(and(eq(projects.tenantId, orgId), eq(projects.code, 'PRJ-DEMO-2026')));
  const [projectBReset] = await db.select().from(projects).where(and(eq(projects.tenantId, orgId), eq(projects.code, 'PRJ-DEMO-2026-B')));
  assert(!!projectAReset && !!projectBReset, 'Reset preserva y restaura Proyecto A y Proyecto B');

  const bLinesResetA = await db.select().from(budgetLines).where(eq(budgetLines.projectId, projectAReset.id));
  const bl02AfterReset = bLinesResetA.find(b => b.code === 'BL-02');
  assert(bl02AfterReset?.executedAmount === 21500, `Reset BL-02 Ejecutado restaurado: $${bl02AfterReset?.executedAmount} (Esperado: $21,500)`);
  assert(bl02AfterReset?.balance === 28500, `Reset BL-02 Saldo restaurado: $${bl02AfterReset?.balance} (Esperado: $28,500)`);

  const pendingAfterReset = await db.select().from(expenses).where(and(eq(expenses.projectId, projectAReset.id), eq(expenses.status, 'pending')));
  assert(pendingAfterReset.length === 1 && pendingAfterReset[0].amount === 6000, 'Gasto de $6,000 restaurado en estado "pending"');

  // --- 7. RBAC: PERMISOS PERMITIDOS Y DENEGADOS (6 ROLES) ---
  console.log('\n[7. Matriz de Permisos RBAC por Rol]');
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

  // --- 8. DOCUMENTOS FICTICIOS ---
  console.log('\n[8. Documentos Ficticios y SHA-256]');
  const docsList = await db.select().from(documents).where(eq(documents.projectId, projectAReset.id));
  assert(docsList.length === 2, 'Proyecto A contiene exactamente 2 documentos ficticios vinculados');
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
