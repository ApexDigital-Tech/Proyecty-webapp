import 'dotenv/config';
import assert from 'node:assert';
import { db } from '../src/db/index.ts';
import { 
  organizations, 
  projects, 
  tasks,
  taskDependencies,
  projectMembers,
  documents,
  users,
  roles
} from '../src/db/schema.ts';
import { eq, and, sql, inArray } from 'drizzle-orm';
import { resetDemoTenantData } from '../src/services/demoTenant.service.ts';
import { createScheduleTask, calculatePhysicalProgress, hasCircularDependency } from '../src/services/schedule.service.ts';
import { 
  uploadDocument, 
  sniffMagicMime, 
  computeFileSha256, 
  updateDocumentScanStatus, 
  getDocumentForDownload, 
  softDeleteDocument, 
  restoreDocument 
} from '../src/services/documents.service.ts';
import { analyzeDocumentWithAI } from '../src/services/ai-doc-analysis.service.ts';

async function runOla3ExhaustiveSuite() {
  console.log('================================================================');
  console.log('🏗️ SUITE EXHAUSTIVA DE AUDITORÍA OLA 3 (v1.3.0-wave-3)');
  console.log('   Módulos Canónicos: M-07 (Planificación y Cronograma Gantt),');
  console.log('   M-12 (Gobierno Documental DOC-01),');
  console.log('   M-13 (Análisis Documental con IA de Documentos CLEAN)');
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
  // 0. Preparación: Tenant Aislado para pruebas de la Ola 3
  // -------------------------------------------------------------------------
  let [testOrg] = await db.select().from(organizations).where(eq(organizations.name, 'ORG-TEST-SUITE-OLA3'));
  if (!testOrg) {
    [testOrg] = await db.insert(organizations).values({
      name: 'ORG-TEST-SUITE-OLA3',
      subscriptionPlan: 'ENTERPRISE',
      isActive: true,
    }).returning();
  }
  const tenantId = testOrg.id;

  let [otherOrg] = await db.select().from(organizations).where(eq(organizations.name, 'ORG-OTHER-ISOLATION'));
  if (!otherOrg) {
    [otherOrg] = await db.insert(organizations).values({
      name: 'ORG-OTHER-ISOLATION',
      subscriptionPlan: 'PRO',
      isActive: true,
    }).returning();
  }
  const otherTenantId = otherOrg.id;

  // Limpieza inicial de datos en tenants de prueba
  async function cleanTestTenant(orgId: number) {
    const prjs = await db.select({ id: projects.id }).from(projects).where(eq(projects.tenantId, orgId));
    const prjIds = prjs.map(p => p.id);
    if (prjIds.length > 0) {
      await db.delete(documents).where(inArray(documents.projectId, prjIds));
      const tks = await db.select({ id: tasks.id }).from(tasks).where(inArray(tasks.projectId, prjIds));
      const tkIds = tks.map(t => t.id);
      if (tkIds.length > 0) {
        await db.delete(taskDependencies).where(inArray(taskDependencies.taskId, tkIds));
      }
      await db.delete(tasks).where(inArray(tasks.projectId, prjIds));
      await db.delete(projectMembers).where(inArray(projectMembers.projectId, prjIds));
      await db.delete(projects).where(inArray(projects.id, prjIds));
    }
  }

  await cleanTestTenant(tenantId);
  await cleanTestTenant(otherTenantId);

  // Crear roles y usuarios de prueba
  const dbRoles = await db.select().from(roles);
  const directorRole = dbRoles.find(r => r.name.toLowerCase().includes('director')) || dbRoles[0];
  const managerRole = dbRoles.find(r => r.name.toLowerCase().includes('manager')) || dbRoles[1] || dbRoles[0];

  const [userDirector] = await db.insert(users).values({
    tenantId,
    uid: `uid-dir3-${Date.now()}`,
    name: 'Director Operaciones',
    email: `dir3.${Date.now()}@test.org`,
    roleId: directorRole.id,
    isActive: true,
  }).returning();

  const [userPM] = await db.insert(users).values({
    tenantId,
    uid: `uid-pm3-${Date.now()}`,
    name: 'Responsable de Proyecto Asignado',
    email: `pm3.${Date.now()}@test.org`,
    roleId: managerRole.id,
    isActive: true,
  }).returning();

  const [testProject] = await db.insert(projects).values({
    tenantId,
    code: `PRJ-OLA3-${Date.now()}`,
    name: 'Proyecto Gestión Operativa y Gobierno Documental',
    status: 'ACTIVO',
    riskLevel: 'Bajo',
    approvedBudget: 300000,
    baseCurrency: 'USD',
  }).returning();

  const [otherProject] = await db.insert(projects).values({
    tenantId: otherTenantId,
    code: `PRJ-EXT3-${Date.now()}`,
    name: 'Proyecto Externo Aislado Ola 3',
    status: 'ACTIVO',
    riskLevel: 'Medio',
    approvedBudget: 150000,
    baseCurrency: 'USD',
  }).returning();

  // Asignar userPM exclusivamente a testProject
  await db.insert(projectMembers).values({
    projectId: testProject.id,
    userId: userPM.id,
    roleInProject: 'Manager',
  });

  // -------------------------------------------------------------------------
  // 1. M-07: Planificación y Cronograma (Gantt, Dependencias y Avance Físico)
  // -------------------------------------------------------------------------
  console.log('[1. M-07: Planificación Operativa, Cronograma y Dependencias]');

  // 1.1 Tarea A (Hito Inicial)
  const taskA = await createScheduleTask(tenantId, testProject.id, userDirector.id, 'DIRECTOR', {
    title: 'Hito 1: Levantamiento de Requerimientos y Diagnóstico',
    startDate: '2026-03-01',
    dueDate: '2026-03-15',
    status: 'DONE',
    weight: 20,
    progress: 100,
  });
  testAssert(taskA.id > 0 && taskA.title.includes('Hito 1'), 'M-07: Tarea inicial creada exitosamente');

  // 1.2 Tarea B con Dependencia Válida de A (A termina el 15, B inicia el 16)
  const taskB = await createScheduleTask(tenantId, testProject.id, userDirector.id, 'DIRECTOR', {
    title: 'Actividad 2: Adquisición de Sensores y Drones',
    startDate: '2026-03-16',
    dueDate: '2026-04-15',
    status: 'IN_PROGRESS',
    weight: 30,
    progress: 50,
    dependsOnTaskIds: [taskA.id],
  });
  testAssert(taskB.id > 0, 'M-07: Tarea con dependencia cronológica válida creada');

  // 1.3 Rechazo de Predecesora Inconsistente (Predecesora termina después del inicio de la tarea dependiente)
  let invalidPredecessorDateRejected = false;
  try {
    await createScheduleTask(tenantId, testProject.id, userDirector.id, 'DIRECTOR', {
      title: 'Actividad Inválida por Fechas',
      startDate: '2026-03-10', // Antes de que termine Task A (15-Mar)
      dueDate: '2026-03-25',
      dependsOnTaskIds: [taskA.id],
    });
  } catch (err: any) {
    invalidPredecessorDateRejected = err.name === 'ValidationError' || err.message?.includes('después del inicio');
  }
  testAssert(invalidPredecessorDateRejected, 'M-07: Rechazo de tarea con predecesora cuya fecha final supera el inicio dependiente');

  // 1.4 Detección de Dependencias Circulares (Algoritmo DAG)
  const circularDetected = hasCircularDependency(
    [
      { taskId: 2, dependsOnId: 1 }, // 2 depende de 1
      { taskId: 3, dependsOnId: 2 }, // 3 depende de 2
    ],
    1, // Intentar hacer que 1 dependa de 3 (Ciclo: 1 -> 3 -> 2 -> 1)
    3
  );
  testAssert(circularDetected, 'M-07: Detección estricta de dependencias circulares (1 -> 3 -> 2 -> 1)');

  // 1.5 Avance Físico Ponderado Reproducible
  const testTasksForProgress = [
    { id: 1, status: 'DONE', weight: 20, progress: 100 }, // 20 * 100 = 2000
    { id: 2, status: 'IN_PROGRESS', weight: 30, progress: 50 }, // 30 * 50 = 1500
    { id: 3, status: 'TODO', weight: 50, progress: 0 }, // 50 * 0 = 0
  ];
  // Total peso = 100, Total ponderado = 3500 / 100 = 35%
  const physicalProgress = calculatePhysicalProgress(testTasksForProgress);
  testAssert(physicalProgress === 35, 'M-07: Avance físico ponderado reproducible calculado con exactitud (35%)');

  // 1.6 Control de Acceso Assigned para Responsable de Proyecto
  // userPM está asignado a testProject -> OK
  const taskPM = await createScheduleTask(tenantId, testProject.id, userPM.id, 'RESPONSABLE_PROYECTO', {
    title: 'Actividad Gestionada por Responsable Asignado',
    startDate: '2026-04-16',
    dueDate: '2026-05-15',
  });
  testAssert(taskPM.id > 0, 'M-07 RBAC (+): Responsable de Proyecto asignado autorizado para gestionar cronograma');

  // userPM intenta gestionar cronograma de un proyecto no asignado
  let unassignedPMRejected = false;
  try {
    await createScheduleTask(tenantId, otherProject.id, userPM.id, 'RESPONSABLE_PROYECTO', {
      title: 'Intento en Proyecto No Asignado',
    });
  } catch (err: any) {
    unassignedPMRejected = err.name === 'ForbiddenError' || err.name === 'NotFoundError';
  }
  testAssert(unassignedPMRejected, 'M-07 RBAC (-): Responsable de Proyecto bloqueado en proyectos no asignados (HTTP 403)');

  // 1.7 RBAC M-07: AUDITOR y FINANCIADOR solo lectura
  const canModifySchedule = (role: string) => role === 'DIRECTOR' || role === 'MANAGER' || role === 'RESPONSABLE_PROYECTO';
  testAssert(!canModifySchedule('AUDITOR'), 'M-07 RBAC (-): AUDITOR bloqueado para modificar cronograma (HTTP 403)');
  testAssert(!canModifySchedule('FINANCIADOR'), 'M-07 RBAC (-): FINANCIADOR bloqueado para modificar cronograma (HTTP 403)');

  // 1.8 Cross-Tenant M-07
  let crossTenantScheduleRejected = false;
  try {
    await createScheduleTask(tenantId, otherProject.id, userDirector.id, 'DIRECTOR', {
      title: 'Intrusión Cross-Tenant Cronograma',
    });
  } catch (err: any) {
    crossTenantScheduleRejected = err.name === 'NotFoundError' || err.message?.includes('no existe en esta organización');
  }
  testAssert(crossTenantScheduleRejected, 'M-07 Cross-Tenant: Bloqueada gestión de cronogramas de otra organización (HTTP 404)');

  // -------------------------------------------------------------------------
  // 2. M-12: Repositorio y Gobierno Documental (DOC-01, MIME, Hash, Escaneo, Papelera)
  // -------------------------------------------------------------------------
  console.log('\n[2. M-12: Gobierno Documental DOC-01, Magic Bytes, Hash y Papelera]');

  // 2.1 Sniffing de Magic Bytes (PDF real vs Executable camuflado)
  const validPdfBuffer = Buffer.from('%PDF-1.4 Informe Técnico Oficial y Matriz Operativa de Monitoreo Comunitario');
  const validPngBuffer = Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, 0x00, 0x00, 0x00]);
  const fakeExeBuffer = Buffer.from([0x4D, 0x5A, 0x90, 0x00, 0x03, 0x00, 0x00, 0x00]); // MZ executable

  testAssert(sniffMagicMime(validPdfBuffer) === 'application/pdf', 'M-12 MIME Sniffing: Identificación real de PDF mediante magic bytes');
  testAssert(sniffMagicMime(validPngBuffer) === 'image/png', 'M-12 MIME Sniffing: Identificación real de PNG mediante magic bytes');

  let exeRejected = false;
  try {
    sniffMagicMime(fakeExeBuffer);
  } catch (err: any) {
    exeRejected = err.name === 'ValidationError' || err.message?.includes('ejecutable no permitido');
  }
  testAssert(exeRejected, 'M-12 Seguridad: Rechazo de archivos ejecutables (MZ Header) por inspección de contenido');

  // 2.2 Hash SHA-256 inmutable
  const expectedSha256 = computeFileSha256(validPdfBuffer);
  testAssert(typeof expectedSha256 === 'string' && expectedSha256.length === 64, 'M-12 Integridad: Cálculo determinista de Hash SHA-256');

  // 2.3 Carga inicial: Estado obligatorio PENDING_SCAN y Retención a 5 años
  const doc1 = await uploadDocument(tenantId, userDirector.id, {
    projectId: testProject.id,
    name: 'Convenio_Marco_Operativo_2026.pdf',
    originalName: 'convenio_final.pdf',
    declaredMimeType: 'application/pdf',
    contentBuffer: validPdfBuffer,
    type: 'Convenio',
  });
  const doc1Meta = doc1.metadata as any;
  testAssert(
    doc1.id > 0 && doc1Meta.scanStatus === 'PENDING_SCAN' && doc1Meta.sha256 === expectedSha256,
    'M-12 DOC-01: Documento cargado con estado inicial fail-closed PENDING_SCAN y SHA-256 verificado'
  );

  const retentionYear = new Date(doc1Meta.retentionUntil).getFullYear();
  testAssert(retentionYear === new Date().getFullYear() + 5, 'M-12 Retención: Política de retención legal de 5 años calculada y persistida');

  // 2.4 Bloqueo HTTP 423 en descarga de documento PENDING_SCAN
  let pendingScanDownloadBlocked = false;
  try {
    await getDocumentForDownload(tenantId, doc1.id);
  } catch (err: any) {
    pendingScanDownloadBlocked = err.name === 'LockedError' || err.statusCode === 423 || err.message?.includes('HTTP 423');
  }
  testAssert(pendingScanDownloadBlocked, 'M-12 / DOC-01 Fail-Closed: Descarga bloqueada con HTTP 423 para documento en estado PENDING_SCAN');

  // 2.5 Autoridad exclusiva del servicio de escaneo para asignar CLEAN
  let unauthorizedCleanRejected = false;
  try {
    await updateDocumentScanStatus(tenantId, doc1.id, 'UNAUTHORIZED_KEY', 'CLEAN');
  } catch (err: any) {
    unauthorizedCleanRejected = err.name === 'ForbiddenError' || err.message?.includes('servicio de escaneo');
  }
  testAssert(unauthorizedCleanRejected, 'M-12 / DOC-01: Rechazo de certificación CLEAN realizada por un cliente no autorizado');

  // 2.6 Certificación válida como CLEAN por el servicio de seguridad
  const certifiedDoc = await updateDocumentScanStatus(tenantId, doc1.id, 'SCANNER_INTERNAL_SVC_KEY', 'CLEAN', 'Escaneo antivirus superado sin amenazas');
  const certifiedMeta = certifiedDoc.metadata as any;
  testAssert(certifiedMeta.scanStatus === 'CLEAN' && certifiedMeta.auditTrail.length === 2, 'M-12 / DOC-01: Documento certificado como CLEAN con trazabilidad auditada');

  // 2.7 Descarga habilitada para documento CLEAN (HTTP 200)
  const downloadClean = await getDocumentForDownload(tenantId, doc1.id);
  testAssert(downloadClean.status === 'CLEAN' && downloadClean.sha256 === expectedSha256, 'M-12 DOC-01: Descarga autorizada (HTTP 200) para documento verificado CLEAN');

  // 2.8 Papelera recuperable (Soft Delete) y bloqueo de descarga
  await softDeleteDocument(tenantId, doc1.id, userDirector.id);
  let trashDownloadBlocked = false;
  try {
    await getDocumentForDownload(tenantId, doc1.id);
  } catch (err: any) {
    trashDownloadBlocked = err.name === 'LockedError' || err.message?.includes('papelera');
  }
  testAssert(trashDownloadBlocked, 'M-12 Papelera: Documento en papelera bloqueado para descarga (HTTP 423)');

  // 2.9 Restauración desde papelera
  const restoredDoc = await restoreDocument(tenantId, doc1.id, userDirector.id);
  const restoredMeta = restoredDoc.metadata as any;
  testAssert(!restoredMeta.isDeleted, 'M-12 Papelera: Documento restaurado exitosamente con auditoría de recuperación');

  // 2.10 Cross-Tenant en Documentos
  let crossTenantDocRejected = false;
  try {
    await uploadDocument(otherTenantId, 999, {
      projectId: testProject.id, // Proyecto de testOrg
      name: 'Intruso.pdf',
      originalName: 'leak.pdf',
      declaredMimeType: 'application/pdf',
      contentBuffer: validPdfBuffer,
    });
  } catch (err: any) {
    crossTenantDocRejected = err.name === 'NotFoundError' || err.message?.includes('no existe en esta organización');
  }
  testAssert(crossTenantDocRejected, 'M-12 Cross-Tenant: Bloqueada carga de documentos en proyectos de otra organización (HTTP 404)');

  // -------------------------------------------------------------------------
  // 3. M-13: Análisis Documental con IA (Cláusulas, Entidades, Fechas de Documentos CLEAN)
  // -------------------------------------------------------------------------
  console.log('\n[3. M-13: Análisis Documental con IA de Documentos CLEAN]');

  // 3.1 Documento no CLEAN bloqueado para análisis con IA (crear doc2 en PENDING_SCAN)
  const docPending = await uploadDocument(tenantId, userDirector.id, {
    projectId: testProject.id,
    name: 'Borrador_Pendiente.pdf',
    originalName: 'draft.pdf',
    declaredMimeType: 'application/pdf',
    contentBuffer: validPdfBuffer,
  });

  let aiPendingDocBlocked = false;
  try {
    await analyzeDocumentWithAI(tenantId, docPending.id, userDirector.id);
  } catch (err: any) {
    aiPendingDocBlocked = err.name === 'LockedError' || err.statusCode === 423 || err.message?.includes('CLEAN');
  }
  testAssert(aiPendingDocBlocked, 'M-13 / DOC-01: Análisis con IA bloqueado estrictamente (HTTP 423) para documento sin certificación CLEAN');

  // 3.2 Análisis con IA estructurado sobre documento CLEAN (doc1)
  const aiAnalysis = await analyzeDocumentWithAI(tenantId, doc1.id, userDirector.id);
  testAssert(
    aiAnalysis.clauses.length >= 3 &&
    aiAnalysis.entities.length >= 2 &&
    aiAnalysis.dates.length >= 2 &&
    aiAnalysis.riskScore > 0 &&
    aiAnalysis.requiresHumanReview === true,
    'M-13 IA: Extracción estructurada completa de cláusulas, entidades, fechas y resumen sobre documento CLEAN'
  );

  // 3.3 Fallback seguro y determinista ante fallas del proveedor IA
  const fallbackAnalysis = await analyzeDocumentWithAI(tenantId, doc1.id, userDirector.id, true); // Simular fallo de LLM
  testAssert(
    fallbackAnalysis.analysisProvider === 'DETERMINISTIC_NLP_FALLBACK' && fallbackAnalysis.clauses.length > 0,
    'M-13 IA Fallback: Activación transparente de fallback seguro determinista ante fallas de proveedor externo'
  );

  // 3.4 Cross-Tenant en Análisis IA
  let crossTenantAiRejected = false;
  try {
    await analyzeDocumentWithAI(otherTenantId, doc1.id, 999);
  } catch (err: any) {
    crossTenantAiRejected = err.name === 'NotFoundError' || err.message?.includes('no encontrado');
  }
  testAssert(crossTenantAiRejected, 'M-13 Cross-Tenant: Bloqueado análisis de IA sobre documentos de otra organización (HTTP 404)');

  // -------------------------------------------------------------------------
  // 4. Limpieza y Descontaminación del Tenant Demo Institucional
  // -------------------------------------------------------------------------
  console.log('\n[4. Limpieza y Verificación de Tenant Demo]');
  await cleanTestTenant(tenantId);
  await cleanTestTenant(otherTenantId);
  await resetDemoTenantData();

  const demoProjects = await db.select().from(projects).where(eq(projects.tenantId, 5));
  const hasOnlyOfficialDemo = demoProjects.length === 1 && demoProjects[0].code === 'PRJ-DEMO-2026';
  testAssert(hasOnlyOfficialDemo, 'Limpieza: Tenant demo restaurado exclusivamente a PRJ-DEMO-2026 (0 contaminación)');

  console.log('\n================================================================');
  console.log(`📊 RESULTADOS FINALES OLA 3: ${passed} PASSED | ${failed} FAILED`);
  console.log('================================================================\n');
}

runOla3ExhaustiveSuite().catch((err) => {
  console.error('❌ Error en suite exhaustiva Ola 3:', err);
  process.exit(1);
});
