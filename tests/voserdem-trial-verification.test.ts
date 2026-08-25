import 'dotenv/config';
import { db } from '../src/db/index.ts';
import { organizations, users, projects, tasks, budgetLines, expenses, documents, auditLogs } from '../src/db/schema.ts';
import { eq, and } from 'drizzle-orm';
import { generateDemoToken, verifyDemoToken } from '../src/services/demoAuth.service.ts';
import { setupVoserdemTrialTenant, VOSERDEM_ORG_NAME, VOSERDEM_DIRECTOR_EMAIL } from '../src/services/voserdemTrial.service.ts';
import { resetDemoTenantData } from '../src/services/demoTenant.service.ts';
import { approveExpense, createExpense } from '../src/services/expenses.service.ts';
import { updateDocumentScanStatus, getDocumentForDownload, SCANNER_INTERNAL_SVC_SECRET } from '../src/services/documents.service.ts';
import { calculatePhysicalProgress } from '../src/services/schedule.service.ts';

async function runVoserdemTestSuite() {
  console.log('========================================================================');
  console.log('🧪 SUITE DE PRUEBAS DE VALIDACIÓN VOSERDEM & TRIAL PRIVADO (AUD-VOS-001)');
  console.log('========================================================================\n');

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

  // --- 1. SETUP Y VERIFICACIÓN DE TENANT AISLADO ---
  console.log('[1. Verificación del Tenant Privado ORG-TRIAL-VOSERDEM]');
  const voserdemData = await setupVoserdemTrialTenant();
  assert(voserdemData.orgId > 0, 'Tenant VOSERDEM creado/identificado con ID válido');
  assert(voserdemData.user.email === 'mirosromeroc@gmail.com', 'Usuario Miroslava Romero pre-registrado correctamente');
  assert(voserdemData.user.role === 'DIRECTOR', 'Rol inicial asignado es DIRECTOR institucional');

  const [orgRecord] = await db.select().from(organizations).where(eq(organizations.id, voserdemData.orgId));
  assert(orgRecord.name === 'ORG-TRIAL-VOSERDEM', 'Código de organización es exactamente ORG-TRIAL-VOSERDEM');
  assert(orgRecord.subscriptionPlan === 'TRIAL_PRIVATE', 'Plan de suscripción es TRIAL_PRIVATE');
  assert(orgRecord.isActive === true, 'Tenant está activo');

  // --- 2. VERIFICACIÓN DE IDENTIDAD Y SEGURIDAD DE DATOS (PII / TELÉFONO PRIVADO) ---
  console.log('\n[2. Seguridad de Perfil y Privacidad de Teléfono]');
  const [dbMiroslava] = await db.select().from(users).where(eq(users.email, 'mirosromeroc@gmail.com'));
  assert(dbMiroslava.isActive === true, 'Miroslava Romero está activa');
  assert(dbMiroslava.tenantId === voserdemData.orgId, 'Miroslava está vinculada exclusivamente a VOSERDEM');
  assert(!('phone' in dbMiroslava) || (dbMiroslava as any).phone === undefined, 'El teléfono no está expuesto en el catálogo estándar de usuarios');

  // --- 3. COHERENCIA MATEMÁTICA DEL AVANCE FÍSICO Y FINANCIERO ---
  console.log('\n[3. Coherencia Matemática de Métricas]');
  const [examplePrj] = await db.select().from(projects).where(eq(projects.id, voserdemData.projectId));
  assert(examplePrj.code === 'PRJ-VOS-EJEMPLO', 'Proyecto ejemplo PRJ-VOS-EJEMPLO existe');
  assert(examplePrj.approvedBudget === 45000, 'Presupuesto aprobado es de $45,000 USD');
  assert(examplePrj.financialProgress === 0, 'Ejecución financiera inicial es exactamente 0%');

  const taskList = await db.select().from(tasks).where(eq(tasks.projectId, voserdemData.projectId));
  assert(taskList.length === 2, 'Proyecto contiene exactamente 2 tareas planificadas');

  const weightedProgress = calculatePhysicalProgress(taskList.map(t => ({ weight: t.weight, progress: t.progress, status: t.status })));
  assert(weightedProgress === 80, `Cálculo de avance físico ponderado da exactamente 80% (calculado: ${weightedProgress}%)`);
  assert(examplePrj.physicalProgress === 80, `PostgreSQL physical_progress coincide con 80%`);

  // --- 4. SEGREGACIÓN DE FUNCIONES FINANCIERAS (FIN-01) ---
  console.log('\n[4. Segregación Financiera FIN-01: Creador !== Aprobador]');
  const [bLine] = await db.select().from(budgetLines).where(eq(budgetLines.projectId, voserdemData.projectId));
  
  // Miroslava registra un gasto
  const testExpense = await createExpense(voserdemData.orgId, voserdemData.user.id, {
    title: 'Adquisición de Insumos de Capacitación (Prueba Segregación)',
    amount: 500.0,
    category: 'Capacitación y Asistencia',
    projectId: voserdemData.projectId,
    budgetLineId: bLine.id,
  });

  assert(testExpense.status === 'pending', 'Gasto creado queda en estado pending');
  assert(testExpense.registeredBy === voserdemData.user.id, 'Gasto registrado a nombre de Miroslava');

  // Intento de autoaprobación por Miroslava debe fallar con ConflictError (HTTP 409)
  let selfApprovalBlocked = false;
  try {
    await approveExpense(voserdemData.orgId, testExpense.id, voserdemData.user.id, 'approved');
  } catch (err: any) {
    if (err.statusCode === 409 || err.message?.includes('Segregación de funciones (FIN-01)')) {
      selfApprovalBlocked = true;
    }
  }
  assert(selfApprovalBlocked, 'FIN-01: Autoaprobación bloqueada con ConflictError (HTTP 409) para el creador');

  // --- 5. GOBIERNO DOCUMENTAL (PENDING_SCAN -> SCANNING -> CLEAN & FAIL-CLOSED) ---
  console.log('\n[5. Gobierno Documental y Escaneo Antivirus]');
  const [docRecord] = await db.select().from(documents).where(eq(documents.projectId, voserdemData.projectId));
  assert(docRecord.name === 'Guia_Evaluacion_VOSERDEM.pdf', 'Documento Guia_Evaluacion_VOSERDEM.pdf presente');
  assert((docRecord.metadata as any)?.scanStatus === 'CLEAN', 'Documento alcanzó estado CLEAN tras escaneo verificado');

  // Verificación de descarga permitida en CLEAN
  const downloadResult = await getDocumentForDownload(voserdemData.orgId, docRecord.id);
  assert(downloadResult.name === 'Guia_Evaluacion_VOSERDEM.pdf', 'Descarga de documento CLEAN exitosa');

  // Verificación fail-closed si se simula un archivo INFECTED
  const [infectedDoc] = await db.insert(documents).values({
    projectId: voserdemData.projectId,
    tenantId: voserdemData.orgId,
    name: 'archivo_sospechoso.pdf',
    size: '10 KB',
    type: 'Documento',
    uploadedBy: voserdemData.user.id,
    metadata: {
      scanStatus: 'INFECTED',
      isQuarantined: true,
    } as any,
  }).returning();

  let downloadBlocked = false;
  try {
    await getDocumentForDownload(voserdemData.orgId, infectedDoc.id);
  } catch (err: any) {
    if (err.statusCode === 423 || err.message?.includes('Bloqueo de seguridad')) {
      downloadBlocked = true;
    }
  }
  assert(downloadBlocked, 'DOC-01: Descarga bloqueada con HTTP 423 (Locked) para documentos no CLEAN / en cuarentena');

  // --- 6. AISLAMIENTO CROSS-TENANT (VOSERDEM VS DEMO) ---
  console.log('\n[6. Aislamiento Estricto Cross-Tenant]');
  const demoResetRes = await resetDemoTenantData();
  assert(demoResetRes.success === true, 'Reseteo demo ejecutado con éxito');

  // Verificar que el proyecto de VOSERDEM sigue intacto
  const [vosAfterReset] = await db.select().from(projects).where(eq(projects.id, voserdemData.projectId));
  assert(vosAfterReset !== undefined, 'RESET-VO-01: El reseteo del tenant demo NO afectó al tenant VOSERDEM');

  // Intentar consultar proyecto VOSERDEM con tenant demo
  const crossTenantQuery = await db.select().from(projects).where(
    and(eq(projects.id, voserdemData.projectId), eq(projects.tenantId, demoResetRes.orgId))
  );
  assert(crossTenantQuery.length === 0, 'ISOL-VO-01: Consulta cross-tenant devuelve exactamente 0 filas');

  // --- 7. REGLAS DE TRIAL: LÍMITE DE 6 PROYECTOS Y EXPIRACIÓN ---
  console.log('\n[7. Control de Cuotas de Trial (Máximo 6 Proyectos)]');
  const vosProjectsCount = await db.select().from(projects).where(eq(projects.tenantId, voserdemData.orgId));
  assert(vosProjectsCount.length >= 1 && vosProjectsCount.length <= 6, `Proyectos actuales en VOSERDEM: ${vosProjectsCount.length} (dentro del límite de 6)`);

  console.log('\n========================================================================');
  console.log(`📊 RESULTADOS: ${passed} PASSED | ${failed} FAILED (Total: ${passed + failed})`);
  console.log('========================================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
  process.exit(0);
}

runVoserdemTestSuite().catch(err => {
  console.error('Error ejecutando suite de validación VOSERDEM:', err);
  process.exit(1);
});
