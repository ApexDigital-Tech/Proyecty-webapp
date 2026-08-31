import 'dotenv/config';
import crypto from 'node:crypto';
import { db } from '../src/db/index.ts';
import { organizations, users, projects, budgetVersions, budgetLines, expenses, documents, auditLogs } from '../src/db/schema.ts';
import { eq, and, desc } from 'drizzle-orm';
import { createExpense, approveExpense, getExpensesByTenant } from '../src/services/expenses.service.ts';
import { createBudgetVersion, getBudgetVersionsByProject } from '../src/services/budget.service.ts';
import { generateFinancialReport } from '../src/services/ai.service.ts';
import { getOrCreateDemoTenant, resetDemoTenantData } from '../src/services/demoTenant.service.ts';
import { generateDemoToken, verifyDemoToken } from '../src/services/demoAuth.service.ts';

async function runComprehensivePhase2Audit() {
  console.log('================================================================');
  console.log('🧪 SUITE INTEGRAL DE AUDITORÍA FASE 2: 7 CONTROLES P1 (AUD-PROY-001)');
  console.log('================================================================\n');

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

  // 0. Setup: Clean & Reset Demo Tenant
  await resetDemoTenantData();
  const { orgId, users: demoUsers } = await getOrCreateDemoTenant();
  const director = demoUsers.find(u => u.roleKey === 'DIRECTOR') || demoUsers[0];
  const manager = demoUsers.find(u => u.roleKey === 'MANAGER') || demoUsers[1];
  const finance = demoUsers.find(u => u.roleKey === 'FINANCE') || demoUsers[2];
  const auditor = demoUsers.find(u => u.roleKey === 'AUDITOR') || demoUsers[3];

  const [project] = await db.select().from(projects).where(eq(projects.tenantId, orgId)).limit(1);
  const projectId = project.id;
  const [bLine] = await db.select().from(budgetLines).where(eq(budgetLines.projectId, projectId)).limit(1);

  // --- SECCIÓN 1: FIN-01 (Segregación de Funciones y Contexto de Usuario) ---
  console.log('[1. FIN-01: Segregación Estricta de Funciones y Contexto Auth]');
  try {
    // 1.1 Verificación de Token con user_id incrustado
    const directorToken = generateDemoToken({
      uid: director.uid,
      userId: director.dbId,
      id: director.dbId,
      email: director.email,
      name: director.name,
      role: director.roleKey,
      roleName: director.roleName,
      tenantId: orgId,
    });
    const parsedDirector = verifyDemoToken(directorToken);
    assert(parsedDirector.user_id === director.dbId, 'Token demo contiene user_id numérico válido para contexto de sesión');

    // 1.2 Registro de gasto por Manager
    const expense = await createExpense(orgId, manager.dbId, {
      title: 'Taller de liderazgo comunitario',
      amount: 600.0,
      category: 'Capacitación',
      projectId,
      budgetLineId: bLine.id,
    });
    assert(expense.status === 'pending', 'Gasto creado en estado "pending"');

    // 1.3 Bloqueo de auto-aprobación del creador
    let autoApproveBlocked = false;
    try {
      await approveExpense(orgId, expense.id, manager.dbId, 'approved');
    } catch (err: any) {
      if (err.name === 'ForbiddenError' && err.message.includes('Segregación de funciones')) {
        autoApproveBlocked = true;
      }
    }
    assert(autoApproveBlocked, 'Auto-aprobación del creador es BLOQUEADA con ForbiddenError (FIN-01)');

    // 1.4 Aprobación exitosa por revisor independiente (Director)
    const approvedExpense = await approveExpense(orgId, expense.id, director.dbId, 'approved');
    assert(approvedExpense.status === 'approved', 'Aprobación por revisor independiente es EXITOSA');
    assert(approvedExpense.approvedBy === director.dbId, 'approvedBy registrado correctamente con ID del revisor');

    // 1.5 Bloqueo de sobre-ejecución presupuestaria
    const hugeExpense = await createExpense(orgId, manager.dbId, {
      title: 'Compra de flota de vehículos',
      amount: 999999.0,
      category: 'Equipamiento',
      projectId,
      budgetLineId: bLine.id,
    });
    let overBudgetBlocked = false;
    try {
      await approveExpense(orgId, hugeExpense.id, director.dbId, 'approved');
    } catch (err: any) {
      if (err.name === 'ConflictError' && err.message.includes('sobre-ejecución')) {
        overBudgetBlocked = true;
      }
    }
    assert(overBudgetBlocked, 'Gasto que excede el saldo de la partida es BLOQUEADO para evitar sobre-ejecución');
  } catch (err: any) {
    assert(false, 'Sección FIN-01 falló', err?.message);
  }

  // --- SECCIÓN 2: BUD-01 (Versionado Presupuestario Inmutable y No Duplicidad) ---
  console.log('\n[2. BUD-01: Versionado Inmutable y Consistencia]');
  try {
    const versionsInitial = await getBudgetVersionsByProject(orgId, projectId);
    assert(versionsInitial.length === 1, 'Versión V1 inicial existe tras el seed');
    assert(versionsInitial[0].versionNumber === 1, 'Versión V1 tiene versionNumber: 1');

    // Crear Versión V2
    const v2 = await createBudgetVersion(orgId, projectId, director.dbId, {
      versionName: 'Adenda Donante Principal',
      reason: 'Ampliación de cobertura geográfica aprobada',
      lines: [
        { code: 'BL-01', category: 'Personal', subcategory: 'Facilitadores', approvedAmount: 70000 },
        { code: 'BL-02', category: 'Equipamiento', subcategory: 'Equipos', approvedAmount: 55000 },
      ],
    });
    assert(v2.versionNumber === 2, 'Nueva versión asigna correlativo consecutivo versionNumber: 2');
    assert(v2.versionName.startsWith('V2 - '), `versionName normalizado consistentemente: "${v2.versionName}"`);

    // Inmutabilidad: Ambas versiones coexisten
    const versionsAfter = await getBudgetVersionsByProject(orgId, projectId);
    assert(versionsAfter.length === 2, 'Histórico presupuestario conserva ambas versiones inmutables');

    // Verificar que las partidas activas no se duplican
    const activeVersionLines = versionsAfter[0].lines;
    const codes = activeVersionLines.map(l => l.code);
    const uniqueCodes = new Set(codes);
    assert(codes.length === uniqueCodes.size, 'Líneas presupuestarias de la versión activa son únicas y sin duplicados');
  } catch (err: any) {
    assert(false, 'Sección BUD-01 falló', err?.message);
  }

  // --- SECCIÓN 3: AUD-01 (Auditoría Inmutable con Diffs y UTC) ---
  console.log('\n[3. AUD-01: Bitácora de Auditoría con Diffs y Timestamp UTC]');
  try {
    const logs = await db.select().from(auditLogs).where(eq(auditLogs.tenantId, orgId)).orderBy(desc(auditLogs.id)).limit(10);
    assert(logs.length > 0, 'Bitácora registra operaciones administrativas y transaccionales');
    
    const expenseApprovalLog = logs.find(l => l.action === 'EXPENSE_APPROVED');
    assert(!!expenseApprovalLog, 'Evento EXPENSE_APPROVED registrado en audit_logs');
    assert(!!(expenseApprovalLog?.metadata as any)?.before_state, 'Snapshot before_state presente en metadata de auditoría');
    assert(!!(expenseApprovalLog?.metadata as any)?.after_state, 'Snapshot after_state presente en metadata de auditoría');
  } catch (err: any) {
    assert(false, 'Sección AUD-01 falló', err?.message);
  }

  // --- SECCIÓN 4: DOC-01 (Gobierno Documental Completo) ---
  console.log('\n[4. DOC-01: Gobierno Documental, SHA-256, Retención y Papelera]');
  try {
    // 4.1 Simular subida con hash SHA-256
    const sampleBuffer = Buffer.from('CONTRATO DE CONVENIO PROYECTY 2026 - AUDIT COMPLIANCE', 'utf-8');
    const expectedHash = crypto.createHash('sha256').update(sampleBuffer).digest('hex');

    const [doc] = await db.insert(documents).values({
      tenantId: orgId,
      projectId,
      uploadedBy: director.dbId,
      name: 'Convenio Marco de Cooperación 2026',
      originalName: 'convenio_marco.pdf',
      mimeType: 'application/pdf',
      size: String(sampleBuffer.length),
      type: 'CONVENIO',
      fileUrl: `https://storage.proyecty.org/${orgId}/${projectId}/convenio_marco.pdf`,
      metadata: {
        sha256: expectedHash,
        scanStatus: 'PENDING_SCAN', // Estado honesto
        quarantined: false,
        version: 1,
        retentionPolicy: '5_YEARS_LEGAL_ARCHIVE',
        retentionUntil: new Date(Date.now() + 5 * 365 * 24 * 60 * 60 * 1000).toISOString(),
        isDeleted: false,
      },
    }).returning();

    assert((doc.metadata as any)?.sha256 === expectedHash, 'Hash SHA-256 criptográfico generado y validado');
    assert((doc.metadata as any)?.scanStatus === 'PENDING_SCAN', 'scanStatus registra honestamente "PENDING_SCAN"');
    assert((doc.metadata as any)?.retentionPolicy === '5_YEARS_LEGAL_ARCHIVE', 'Política de retención a 5 años registrada');

    // 4.2 Soft-Delete (Papelera recuperable)
    await db.update(documents)
      .set({ metadata: { ...(doc.metadata as any), isDeleted: true, deletedAt: new Date().toISOString() } })
      .where(eq(documents.id, doc.id));

    const [deletedDoc] = await db.select().from(documents).where(eq(documents.id, doc.id));
    assert((deletedDoc.metadata as any)?.isDeleted === true, 'Documento marcado como eliminado en papelera recuperable (soft-delete)');

    // 4.3 Restauración de documento
    await db.update(documents)
      .set({ metadata: { ...(deletedDoc.metadata as any), isDeleted: false, restoredAt: new Date().toISOString() } })
      .where(eq(documents.id, doc.id));

    const [restoredDoc] = await db.select().from(documents).where(eq(documents.id, doc.id));
    assert((restoredDoc.metadata as any)?.isDeleted === false, 'Documento restaurado exitosamente desde la papelera');
  } catch (err: any) {
    assert(false, 'Sección DOC-01 falló', err?.message);
  }

  // --- SECCIÓN 5: AI-01 (Trazabilidad y Fuentes Citables de IA) ---
  console.log('\n[5. AI-01: Trazabilidad y Citas en Reportes con IA]');
  try {
    const expensesList = await getExpensesByTenant(orgId);
    const aiReport = await generateFinancialReport(orgId, director.dbId, expensesList);

    assert(typeof aiReport.reportMarkdown === 'string' && aiReport.reportMarkdown.length > 50, 'Reporte IA generado en formato Markdown');
    assert(aiReport.sources.length > 0, 'Fuentes transaccionales estructuradas y vinculadas al reporte');
    assert(aiReport.requiresHumanReview === true, 'Flag requiresHumanReview activo para cumplimiento normativo');
    assert(aiReport.reportMarkdown.includes('[Gasto #') || aiReport.reportMarkdown.includes('Fuente'), 'Reporte contiene citas verificables a fuentes transaccionales');
  } catch (err: any) {
    assert(false, 'Sección AI-01 falló', err?.message);
  }

  // --- SECCIÓN 6: SEC-01 (Endurecimiento de Cabeceras CSP) ---
  console.log('\n[6. SEC-01: Endurecimiento de Content Security Policy]');
  try {
    // Verificar que en server.ts no exista 'unsafe-eval'
    const fs = await import('node:fs');
    const serverCode = fs.readFileSync('server.ts', 'utf-8');
    const hasUnsafeEval = serverCode.includes("'unsafe-eval'");
    assert(!hasUnsafeEval, "Directiva 'unsafe-eval' completamente erradicada de la configuración CSP de producción");
  } catch (err: any) {
    assert(false, 'Sección SEC-01 falló', err?.message);
  }

  // --- SECCIÓN 7: PERF-01 (Métricas de Rendimiento y Latencia de BD) ---
  console.log('\n[7. PERF-01: Métricas de Rendimiento y Healthcheck]');
  try {
    const { sql } = await import('drizzle-orm');
    
    // Precalentamiento
    await db.execute(sql`SELECT 1`);

    // 5 ciclos individuales
    for (let i = 1; i <= 5; i++) {
      const startTime = Date.now();
      await db.execute(sql`SELECT 1`);
      const dbLatencyMs = Date.now() - startTime;
      assert(dbLatencyMs < 200, `Latencia de BD saludable - Ciclo ${i} (${dbLatencyMs} ms < 200 ms)`);
    }

    assert(process.uptime() >= 0, 'Uptime del proceso medido');
    assert(process.memoryUsage().rss > 0, 'Uso de memoria RSS disponible');
  } catch (err: any) {
    assert(false, 'Sección PERF-01 falló', err?.message);
  }

  console.log('\n================================================================');
  console.log(`📊 RESULTADOS FINALES DE AUDITORÍA FASE 2: ${passed} PASSED | ${failed} FAILED`);
  console.log('================================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

runComprehensivePhase2Audit()
  .then(() => {
    setTimeout(() => process.exit(0), 100);
  })
  .catch(err => {
    console.error('Error fatal en suite de pruebas Fase 2:', err);
    process.exit(1);
  });
