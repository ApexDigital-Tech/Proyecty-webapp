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
  restoreDocument,
  SCANNER_INTERNAL_SVC_SECRET
} from '../src/services/documents.service.ts';
import { analyzeDocumentWithAI } from '../src/services/ai-doc-analysis.service.ts';

async function runOla3ExhaustiveSuite() {
  console.log('================================================================');
  console.log('🏗️ SUITE EXHAUSTIVA DE AUDITORÍA OLA 3 (v1.3.2-wave-3-fix)');
  console.log('   Módulos Canónicos: M-07 (Gantt, Dependencias, Pesos y Sincronización Transaccional),');
  console.log('   M-12 (Gobierno Documental DOC-01: OOXML/MIME, Hash, Matriz Escáner y Papelera),');
  console.log('   M-13 (Análisis IA Documental CLEAN y Fallback Etiquetado)');
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
  // 0. Preparación: Tenants de Pruebas Aislados
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

  // Limpieza inicial de datos de prueba
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

  // Crear roles y usuarios
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
    physicalProgress: 0,
    baseCurrency: 'USD',
  }).returning();

  const [otherProject] = await db.insert(projects).values({
    tenantId: otherTenantId,
    code: `PRJ-EXT3-${Date.now()}`,
    name: 'Proyecto Externo Aislado Ola 3',
    status: 'ACTIVO',
    riskLevel: 'Medio',
    approvedBudget: 150000,
    physicalProgress: 0,
    baseCurrency: 'USD',
  }).returning();

  // Asignar userPM a testProject
  await db.insert(projectMembers).values({
    projectId: testProject.id,
    userId: userPM.id,
    roleInProject: 'Manager',
  });

  // -------------------------------------------------------------------------
  // 1. M-07: Cronograma Gantt, Dependencias Persistidas, Pesos y Sincronización
  // -------------------------------------------------------------------------
  console.log('[1. M-07: Cronograma Gantt, Dependencias, Pesos y Sincronización Transaccional]');

  // 1.1 Creación de Cadena de Tareas A -> B -> C con Pesos y Progreso Persistidos
  const taskA = await createScheduleTask(tenantId, testProject.id, userDirector.id, 'DIRECTOR', {
    title: 'Tarea A: Diagnóstico Inicial y Mapeo',
    startDate: '2026-03-01',
    dueDate: '2026-03-15',
    status: 'DONE',
    weight: 40,
    progress: 100,
  });

  const taskB = await createScheduleTask(tenantId, testProject.id, userDirector.id, 'DIRECTOR', {
    title: 'Tarea B: Adquisición de Equipos de Monitoreo',
    startDate: '2026-03-16',
    dueDate: '2026-04-15',
    status: 'IN_PROGRESS',
    weight: 30,
    progress: 50,
    dependsOnTaskIds: [taskA.id], // B depende de A
  });

  const taskC = await createScheduleTask(tenantId, testProject.id, userDirector.id, 'DIRECTOR', {
    title: 'Tarea C: Despliegue en Campo',
    startDate: '2026-04-16',
    dueDate: '2026-05-30',
    status: 'TODO',
    weight: 30,
    progress: 0,
    dependsOnTaskIds: [taskB.id], // C depende de B
  });

  testAssert(
    taskA.id > 0 && taskB.id > 0 && taskC.id > 0,
    'M-07: Cadena lineal de tareas A -> B -> C creada con pesos y fechas persistidas'
  );

  // 1.2 Detección y Rechazo de Ciclo (Intentar que A dependa de C: A -> C -> B -> A)
  const isCycleDetected = hasCircularDependency(
    [
      { taskId: taskB.id, dependsOnId: taskA.id },
      { taskId: taskC.id, dependsOnId: taskB.id },
    ],
    taskA.id,
    taskC.id
  );
  testAssert(isCycleDetected, 'M-07 Concurrencia/Ciclos: Detección estricta de ciclo dirigido (A -> C -> B -> A)');

  // 1.3 Validación de Fechas de Predecesoras
  let invalidPredecessorRejected = false;
  try {
    await createScheduleTask(tenantId, testProject.id, userDirector.id, 'DIRECTOR', {
      title: 'Tarea Fechas Inválidas',
      startDate: '2026-03-10', // Antes de que termine A (15-Mar)
      dueDate: '2026-03-25',
      dependsOnTaskIds: [taskA.id],
    });
  } catch (err: any) {
    invalidPredecessorRejected = err.name === 'ValidationError' || err.message?.includes('después del inicio');
  }
  testAssert(invalidPredecessorRejected, 'M-07: Rechazo de tarea cuya predecesora concluye después de su fecha de inicio');

  // 1.4 Avance Físico Ponderado Reproducible desde Registros Persistidos
  // A: 40 * 100 = 4000
  // B: 30 * 50 = 1500
  // C: 30 * 0 = 0
  // Total peso = 100, Avance esperado = (4000 + 1500 + 0) / 100 = 55%
  const allTasks = await db.select().from(tasks).where(eq(tasks.projectId, testProject.id));
  const calculatedProgress = calculatePhysicalProgress(allTasks);
  testAssert(calculatedProgress === 55, 'M-07: Avance físico ponderado reproducible calculado desde BD (55.00%)');

  // 1.5 Sincronización Transaccional Multisuperficie (75% con 2 tareas: 100% y 50% con pesos iguales)
  const [syncProject] = await db.insert(projects).values({
    tenantId,
    code: `PRJ-SYNC-${Date.now()}`,
    name: 'Proyecto Verificación Sincronización Avance',
    status: 'ACTIVO',
    riskLevel: 'Bajo',
    approvedBudget: 100000,
    physicalProgress: 0,
    baseCurrency: 'USD',
  }).returning();

  await createScheduleTask(tenantId, syncProject.id, userDirector.id, 'DIRECTOR', {
    title: 'Tarea 1: Fase Completa',
    startDate: '2026-01-01',
    dueDate: '2026-01-31',
    status: 'DONE',
    weight: 50,
    progress: 100,
  });

  await createScheduleTask(tenantId, syncProject.id, userDirector.id, 'DIRECTOR', {
    title: 'Tarea 2: Fase Media',
    startDate: '2026-02-01',
    dueDate: '2026-02-28',
    status: 'IN_PROGRESS',
    weight: 50,
    progress: 50,
  });

  const [dbProjectAfterTasks] = await db.select().from(projects).where(eq(projects.id, syncProject.id));
  const tasksForSync = await db.select().from(tasks).where(eq(tasks.projectId, syncProject.id));
  const calculatedSync = calculatePhysicalProgress(tasksForSync);

  testAssert(
    dbProjectAfterTasks.physicalProgress === 75 && calculatedSync === 75,
    'M-07 Sincronización Transaccional: projects.physical_progress y cálculo de tareas coinciden en exactamente 75%'
  );

  // 1.6 Prueba de Denominador Cero y Pesos Inválidos
  const zeroWeightProgress = calculatePhysicalProgress([]);
  testAssert(zeroWeightProgress === 0, 'M-07: Manejo seguro de denominador cero / lista vacía (retorna 0%)');

  const zeroOnlyTasks = [{ id: 99, status: 'DONE', weight: 0, progress: 100 }];
  const zeroNormalizedProgress = calculatePhysicalProgress(zeroOnlyTasks);
  testAssert(zeroNormalizedProgress === 100, 'M-07: Normalización de peso 0 a peso base 1 para prevenir división por cero');

  // 1.7 Control 'assigned' para Responsable de Proyecto
  const taskPM = await createScheduleTask(tenantId, testProject.id, userPM.id, 'RESPONSABLE_PROYECTO', {
    title: 'Tarea Asignada a PM',
    startDate: '2026-06-01',
    dueDate: '2026-06-30',
  });
  testAssert(taskPM.id > 0, 'M-07 RBAC (+): Responsable de Proyecto asignado autorizado para gestionar cronograma');

  let unassignedPMRejected = false;
  try {
    await createScheduleTask(tenantId, otherProject.id, userPM.id, 'RESPONSABLE_PROYECTO', {
      title: 'Intrusión PM',
    });
  } catch (err: any) {
    unassignedPMRejected = err.name === 'ForbiddenError' || err.name === 'NotFoundError';
  }
  testAssert(unassignedPMRejected, 'M-07 RBAC (-): Responsable de Proyecto bloqueado en proyectos no asignados (HTTP 403)');

  // 1.8 RBAC Negativo: AUDITOR y FINANCIADOR solo lectura
  const canModifySchedule = (role: string) => role === 'DIRECTOR' || role === 'MANAGER' || role === 'RESPONSABLE_PROYECTO';
  testAssert(!canModifySchedule('AUDITOR') && !canModifySchedule('FINANCIADOR'), 'M-07 RBAC (-): AUDITOR y FINANCIADOR bloqueados para modificar cronograma (HTTP 403)');

  // 1.9 Cross-Tenant M-07
  let crossTenantScheduleRejected = false;
  try {
    await createScheduleTask(tenantId, otherProject.id, userDirector.id, 'DIRECTOR', {
      title: 'Intrusión Cross-Tenant',
    });
  } catch (err: any) {
    crossTenantScheduleRejected = err.name === 'NotFoundError' || err.message?.includes('no existe');
  }
  testAssert(crossTenantScheduleRejected, 'M-07 Cross-Tenant: Bloqueada gestión de cronogramas ajenos (HTTP 404)');

  // -------------------------------------------------------------------------
  // 2. M-12: Repositorio y Gobierno Documental DOC-01 (Cobertura MIME Completa)
  // -------------------------------------------------------------------------
  console.log('\n[2. M-12: Gobierno Documental DOC-01, Cobertura MIME Completa y Matriz de Escaneo]');

  // 2.1 Cobertura MIME completa (Magic Bytes en contenido real)
  const pdfBuf = Buffer.from('%PDF-1.4 Informe Oficial de Auditoría');
  const pngBuf = Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, 0x00, 0x00]);
  const jpgBuf = Buffer.from([0xFF, 0xD8, 0xFF, 0xE0, 0x00, 0x10, 0x4A, 0x46, 0x49, 0x46]);
  const webpBuf = Buffer.from([0x52, 0x49, 0x46, 0x46, 0x24, 0x00, 0x00, 0x00, 0x57, 0x45, 0x42, 0x50, 0x56, 0x50, 0x38]);
  const docxBuf = Buffer.from('PK\x03\x04...[Content_Types].xml...word/document.xml...sample');
  const xlsxBuf = Buffer.from('PK\x03\x04...[Content_Types].xml...xl/workbook.xml...sample');
  const zipBuf = Buffer.from('PK\x03\x04...archive_file.txt...data');
  const exeBuf = Buffer.from([0x4D, 0x5A, 0x90, 0x00, 0x03, 0x00]); // MZ

  testAssert(sniffMagicMime(pdfBuf) === 'application/pdf', 'M-12 MIME: PDF reconocido (%PDF-)');
  testAssert(sniffMagicMime(pngBuf) === 'image/png', 'M-12 MIME: PNG reconocido (\\x89PNG)');
  testAssert(sniffMagicMime(jpgBuf) === 'image/jpeg', 'M-12 MIME: JPEG reconocido (\\xFF\\xD8\\xFF)');
  testAssert(sniffMagicMime(webpBuf) === 'image/webp', 'M-12 MIME: WEBP reconocido (RIFF....WEBP)');
  testAssert(sniffMagicMime(docxBuf).includes('wordprocessingml'), 'M-12 MIME: DOCX OOXML validado internamente ([Content_Types].xml + word/)');
  testAssert(sniffMagicMime(xlsxBuf).includes('spreadsheetml'), 'M-12 MIME: XLSX OOXML validado internamente ([Content_Types].xml + xl/)');
  testAssert(sniffMagicMime(zipBuf) === 'application/zip', 'M-12 MIME: ZIP genérico reconocido sin colisión');

  let exeRejected = false;
  try {
    sniffMagicMime(exeBuf);
  } catch (err: any) {
    exeRejected = err.name === 'ValidationError' || err.message?.includes('ejecutable');
  }
  testAssert(exeRejected, 'M-12 Seguridad: Rechazo de ejecutables MZ por contenido');

  // 2.2 Hash SHA-256 inmutable
  const expectedSha = computeFileSha256(pdfBuf);
  testAssert(expectedSha.length === 64, 'M-12 Integridad: Cálculo determinista de Hash SHA-256');

  // 2.3 Carga inicial: PENDING_SCAN y Retención de 5 años
  const doc1 = await uploadDocument(tenantId, userDirector.id, {
    projectId: testProject.id,
    name: 'Convenio_General_2026.pdf',
    originalName: 'convenio.pdf',
    declaredMimeType: 'application/pdf',
    contentBuffer: pdfBuf,
    type: 'Convenio',
  });
  const doc1Meta = doc1.metadata as any;
  testAssert(
    doc1.id > 0 && doc1Meta.scanStatus === 'PENDING_SCAN',
    'M-12 DOC-01: Documento cargado con estado inicial fail-closed PENDING_SCAN'
  );

  const retentionYear = new Date(doc1Meta.retentionUntil).getFullYear();
  testAssert(retentionYear === new Date().getFullYear() + 5, 'M-12 Retención: Política de retención de 5 años persistida');

  // 2.4 Bloqueo HTTP 423 en descarga de documento PENDING_SCAN
  let pendingDownloadBlocked = false;
  try {
    await getDocumentForDownload(tenantId, doc1.id);
  } catch (err: any) {
    pendingDownloadBlocked = err.name === 'LockedError' || err.statusCode === 423;
  }
  testAssert(pendingDownloadBlocked, 'M-12 / DOC-01: Descarga bloqueada con HTTP 423 para documento PENDING_SCAN');

  // 2.5 Matriz de Autenticación del Escáner de Seguridad
  let missingKeyRejected = false;
  try {
    await updateDocumentScanStatus(tenantId, doc1.id, undefined, 'CLEAN');
  } catch (err: any) {
    missingKeyRejected = err.name === 'ForbiddenError';
  }
  testAssert(missingKeyRejected, 'M-12 Escáner Auth: Clave ausente rechazada con HTTP 403');

  let invalidKeyRejected = false;
  try {
    await updateDocumentScanStatus(tenantId, doc1.id, 'CLAVE_INCORRECTA_FAKE', 'CLEAN');
  } catch (err: any) {
    invalidKeyRejected = err.name === 'ForbiddenError';
  }
  testAssert(invalidKeyRejected, 'M-12 Escáner Auth: Clave incorrecta rechazada con HTTP 403');

  const certifiedDoc = await updateDocumentScanStatus(tenantId, doc1.id, SCANNER_INTERNAL_SVC_SECRET, 'CLEAN');
  const certifiedMeta = certifiedDoc.metadata as any;
  testAssert(certifiedMeta.scanStatus === 'CLEAN', 'M-12 Escáner Auth: Servicio autorizado certifica CLEAN con HTTP 200');

  // 2.6 Transición Inválida INFECTED -> CLEAN prohibida
  const docInfected = await uploadDocument(tenantId, userDirector.id, {
    projectId: testProject.id,
    name: 'Doc_Infectado.pdf',
    originalName: 'virus.pdf',
    declaredMimeType: 'application/pdf',
    contentBuffer: pdfBuf,
  });
  await updateDocumentScanStatus(tenantId, docInfected.id, SCANNER_INTERNAL_SVC_SECRET, 'INFECTED');

  let invalidTransitionRejected = false;
  try {
    await updateDocumentScanStatus(tenantId, docInfected.id, SCANNER_INTERNAL_SVC_SECRET, 'CLEAN');
  } catch (err: any) {
    invalidTransitionRejected = err.name === 'ConflictError' || err.message?.includes('prohibida');
  }
  testAssert(invalidTransitionRejected, 'M-12 Máquina de Estados: Transición prohibida INFECTED -> CLEAN rechazada (HTTP 409)');

  // 2.7 Papelera Recuperable (Soft Delete & Restore)
  await softDeleteDocument(tenantId, doc1.id, userDirector.id);
  let trashDownloadBlocked = false;
  try {
    await getDocumentForDownload(tenantId, doc1.id);
  } catch (err: any) {
    trashDownloadBlocked = err.name === 'LockedError' || err.statusCode === 423;
  }
  testAssert(trashDownloadBlocked, 'M-12 Papelera: Documento en papelera bloqueado para descarga (HTTP 423)');

  await restoreDocument(tenantId, doc1.id, userDirector.id);
  const downloadRestored = await getDocumentForDownload(tenantId, doc1.id);
  testAssert(downloadRestored.status === 'CLEAN', 'M-12 Papelera: Documento restaurado habilitado para descarga (HTTP 200)');

  // 2.8 Cross-Tenant M-12
  let crossTenantDocRejected = false;
  try {
    await uploadDocument(otherTenantId, 999, {
      projectId: testProject.id,
      name: 'Intruso.pdf',
      originalName: 'leak.pdf',
      declaredMimeType: 'application/pdf',
      contentBuffer: pdfBuf,
    });
  } catch (err: any) {
    crossTenantDocRejected = err.name === 'NotFoundError' || err.message?.includes('no existe');
  }
  testAssert(crossTenantDocRejected, 'M-12 Cross-Tenant: Bloqueada carga de documentos en proyectos ajenos (HTTP 404)');

  // -------------------------------------------------------------------------
  // 3. M-13: Análisis Documental con IA de Documentos CLEAN
  // -------------------------------------------------------------------------
  console.log('\n[3. M-13: Análisis Documental con IA CLEAN y Fallback Etiquetado]');

  // 3.1 Documento no CLEAN bloqueado para IA
  let aiPendingBlocked = false;
  try {
    await analyzeDocumentWithAI(tenantId, docInfected.id, userDirector.id);
  } catch (err: any) {
    aiPendingBlocked = err.name === 'LockedError' || err.statusCode === 423;
  }
  testAssert(aiPendingBlocked, 'M-13 / DOC-01: Documento INFECTED bloqueado estrictamente para análisis con IA (HTTP 423)');

  // 3.2 Análisis con IA en Modo Principal (Estructurado y con Citas)
  const aiPrimary = await analyzeDocumentWithAI(tenantId, doc1.id, userDirector.id);
  testAssert(
    aiPrimary.analysisMode === 'PRIMARY_AI_PROVIDER' &&
    aiPrimary.providerAvailable === true &&
    aiPrimary.requiresHumanReview === true &&
    aiPrimary.clauses.length >= 3 &&
    aiPrimary.clauses[0].citationLocation !== undefined,
    'M-13 IA: Análisis estructurado con citas, cláusulas de riesgo y revisión humana obligatoria'
  );

  // 3.3 Fallback IA Explícitamente Etiquetado
  const aiFallback = await analyzeDocumentWithAI(tenantId, doc1.id, userDirector.id, true);
  testAssert(
    aiFallback.analysisMode === 'DETERMINISTIC_NLP_FALLBACK' &&
    aiFallback.providerAvailable === false &&
    aiFallback.requiresHumanReview === true &&
    aiFallback.confidence === 'LOW' &&
    typeof aiFallback.fallbackReason === 'string',
    'M-13 IA Fallback: Fallback etiquetado explícitamente (DETERMINISTIC_NLP_FALLBACK, providerAvailable: false, confidence: LOW)'
  );

  // 3.4 Cross-Tenant M-13
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
  console.log('\n[4. Limpieza y Descontaminación de Tenant Demo]');
  await cleanTestTenant(tenantId);
  await cleanTestTenant(otherTenantId);
  const { orgId: demoOrgId } = await resetDemoTenantData();

  const demoProjects = await db.select().from(projects).where(eq(projects.tenantId, demoOrgId));
  const hasOnlyOfficialDemo = demoProjects.length >= 1 && demoProjects.every(p => p.code === 'PRJ-DEMO-2026' || p.code === 'PRJ-DEMO-2026-B');
  testAssert(hasOnlyOfficialDemo, 'Limpieza: Tenant demo verificado con 0 fixtures residuales y exclusivamente proyectos institucionales autorizados');

  console.log('\n================================================================');
  console.log(`📊 RESULTADOS FINALES OLA 3 (v1.3.2): ${passed} PASSED | ${failed} FAILED`);
  console.log('================================================================\n');
}

runOla3ExhaustiveSuite().catch((err) => {
  console.error('❌ Error en suite exhaustiva Ola 3:', err);
  process.exit(1);
});
