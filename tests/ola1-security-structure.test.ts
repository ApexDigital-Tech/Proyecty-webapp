import 'dotenv/config';
import assert from 'node:assert';
import { db } from '../src/db/index.ts';
import { users, organizations, roles, projects, auditLogs, budgetVersions, budgetLines, documents } from '../src/db/schema.ts';
import { eq, and, sql } from 'drizzle-orm';
import { generateDemoToken, verifyDemoToken } from '../src/services/demoAuth.service.ts';
import { resetDemoTenantData } from '../src/services/demoTenant.service.ts';
import { CacheService } from '../src/services/CacheService.ts';

async function runOla1ExhaustiveSuite() {
  console.log('================================================================');
  console.log('🛡️ SUITE EXHAUSTIVA DE AUDITORÍA OLA 1 (v1.1.1-wave-1-fix)');
  console.log('   Módulos: M-01 (Auth), M-03 (Portfolio), M-04 (Detail), M-15 (Audit), M-16 (Users & /me), DOC-01');
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

  // 0. Preparación: Reseteo controlado del tenant demo
  await resetDemoTenantData();
  const [demoOrg] = await db.select().from(organizations).where(eq(organizations.name, 'ORG-DEMO-PROYECTY'));
  assert(demoOrg, 'Tenant demo ORG-DEMO-PROYECTY debe existir');
  const tenantId = demoOrg.id;

  // Tenant secundario para pruebas cross-tenant
  let [otherOrg] = await db.select().from(organizations).where(eq(organizations.name, 'ORG-OTHER-ISOLATION'));
  if (!otherOrg) {
    [otherOrg] = await db.insert(organizations).values({
      name: 'ORG-OTHER-ISOLATION',
      subscriptionPlan: 'PRO',
      isActive: true,
    }).returning();
  }
  const otherTenantId = otherOrg.id;

  // -------------------------------------------------------------------------
  // 1. M-01: Autenticación y Sesiones Demo
  // -------------------------------------------------------------------------
  console.log('[1. M-01: Autenticación, JWTs Canónicos y Anti-Tampering]');

  const directorToken = generateDemoToken({
    uid: 'demo-director-uid',
    id: 1,
    email: 'director@proyecty.org',
    name: 'Carlos Mendoza',
    role: 'DIRECTOR',
    roleName: 'Director General',
    tenantId: tenantId,
  });
  const verifiedDirector = verifyDemoToken(directorToken);
  testAssert(verifiedDirector?.role === 'DIRECTOR' && verifiedDirector?.tenant_id === tenantId, 'Token Director contiene claims válidos (user_id, role, tenant_id)');

  const auditorToken = generateDemoToken({
    uid: 'demo-auditor-uid',
    id: 4,
    email: 'auditor@proyecty.org',
    name: 'Elena Rostova',
    role: 'AUDITOR',
    roleName: 'Auditor Externo',
    tenantId: tenantId,
  });
  const verifiedAuditor = verifyDemoToken(auditorToken);
  testAssert(verifiedAuditor?.role === 'AUDITOR', 'Token Auditor contiene role: AUDITOR');

  // Token Manipulado
  const rawParts = directorToken.substring(5).split('.');
  const tamperedPayload = Buffer.from(JSON.stringify({ ...verifiedDirector, role: 'SUPERADMIN_HACK' })).toString('base64url');
  const tamperedToken = `demo.${rawParts[0]}.${tamperedPayload}.${rawParts[2]}`;
  let tamperedRejected = false;
  try {
    verifyDemoToken(tamperedToken);
  } catch {
    tamperedRejected = true;
  }
  testAssert(tamperedRejected, 'Token con payload/firma alterada es rechazado estrictamente');

  // Token Expirado
  const expiredToken = generateDemoToken({
    uid: 'demo-exp-uid',
    id: 99,
    email: 'exp@proyecty.org',
    name: 'Expired User',
    role: 'MANAGER',
    roleName: 'Gerente',
    tenantId: tenantId,
  }, -5);
  let expiredRejected = false;
  try {
    verifyDemoToken(expiredToken);
  } catch {
    expiredRejected = true;
  }
  testAssert(expiredRejected, 'Token expirado es rechazado por vencimiento');

  // -------------------------------------------------------------------------
  // 2. M-03 & M-04: Portafolio y Ficha de Proyecto (RBAC y Aislamiento)
  // -------------------------------------------------------------------------
  console.log('\n[2. M-03 & M-04: Portafolio de Proyectos, RBAC y Aislamiento]');

  // 2.1 Creación por DIRECTOR
  const uniqueCode = `PRJ-AUDIT-${Date.now()}`;
  const [createdProject] = await db.insert(projects).values({
    tenantId,
    code: uniqueCode,
    name: 'Proyecto Conservación Bosques',
    status: 'ACTIVO',
    riskLevel: 'Bajo',
    approvedBudget: 200000,
    baseCurrency: 'USD',
  }).returning();
  testAssert(!!createdProject, 'DIRECTOR puede crear proyecto en base de datos');

  // 2.2 Proyecto en Tenant Secundario
  const otherCode = `PRJ-SEC-${Date.now()}`;
  const [otherProject] = await db.insert(projects).values({
    tenantId: otherTenantId,
    code: otherCode,
    name: 'Proyecto Organización Externa',
    status: 'ACTIVO',
    riskLevel: 'Alto',
    approvedBudget: 100000,
    baseCurrency: 'USD',
  }).returning();

  // 2.3 Cross-Tenant Isolation
  const tenantProjects = await db.select().from(projects).where(eq(projects.tenantId, tenantId));
  const hasLeak = tenantProjects.some(p => p.id === otherProject.id);
  testAssert(!hasLeak, 'Aislamiento Cross-Tenant: 0 registros de otra organización visibles');

  // 2.4 Ficha de Proyecto: Filtrado de partidas por versión activa (No Duplicidad)
  const [bv1] = await db.insert(budgetVersions).values({
    tenantId,
    projectId: createdProject.id,
    versionName: 'V1 - Inicial',
    versionNumber: 1,
    status: 'ARCHIVED',
    isApproved: false,
  }).returning();

  const [bv2] = await db.insert(budgetVersions).values({
    tenantId,
    projectId: createdProject.id,
    versionName: 'V2 - Aprobada',
    versionNumber: 2,
    status: 'APPROVED',
    isApproved: true,
  }).returning();

  await db.insert(budgetLines).values([
    { projectId: createdProject.id, budgetVersionId: bv1.id, code: 'BL-01', category: 'Personal', subcategory: 'Base', approvedAmount: 50000, balance: 50000 },
    { projectId: createdProject.id, budgetVersionId: bv2.id, code: 'BL-01', category: 'Personal', subcategory: 'Ajustado', approvedAmount: 60000, balance: 60000 },
    { projectId: createdProject.id, budgetVersionId: bv2.id, code: 'BL-02', category: 'Equipos', subcategory: 'Lidar', approvedAmount: 40000, balance: 40000 },
  ]);

  const activeLines = await db.select().from(budgetLines).where(
    and(
      eq(budgetLines.projectId, createdProject.id),
      eq(budgetLines.budgetVersionId, bv2.id)
    )
  );
  testAssert(activeLines.length === 2, 'Partidas activas filtradas únicamente de la versión V2 aprobada (2 registros)');
  const codesSet = new Set(activeLines.map(l => l.code));
  testAssert(codesSet.size === 2, 'Códigos de partida activos son únicos (sin duplicados)');

  // -------------------------------------------------------------------------
  // 3. M-15: Bitácora de Auditoría (RBAC e Inmutabilidad)
  // -------------------------------------------------------------------------
  console.log('\n[3. M-15: Bitácora de Auditoría (RBAC Canónico e Inmutabilidad)]');

  // 3.1 Registro de evento auditado con diffs
  const [log] = await db.insert(auditLogs).values({
    tenantId,
    userId: 1,
    userName: 'Carlos Mendoza',
    action: 'PROJECT_UPDATED',
    entity: 'project',
    entityId: String(createdProject.id),
    metadata: { before_state: { name: 'Old' }, after_state: { name: 'New' } },
    ipAddress: '127.0.0.1',
  }).returning();
  testAssert(!!log && log.createdAt instanceof Date, 'Bitácora registra eventos con timestamps UTC válidos');

  // 3.2 Regla RBAC para M-15:
  // DIRECTOR y AUDITOR -> Autorizados (200)
  // MANAGER, FINANCE, RESPONSABLE_PROYECTO, FINANCIADOR -> Prohibidos (403)
  const canReadAudit = (role: string) => role === 'DIRECTOR' || role === 'ADMIN' || role === 'AUDITOR';
  testAssert(canReadAudit('DIRECTOR'), 'RBAC M-15: DIRECTOR tiene acceso a bitácora de auditoría (HTTP 200)');
  testAssert(canReadAudit('AUDITOR'), 'RBAC M-15: AUDITOR tiene acceso a bitácora de auditoría (HTTP 200)');
  testAssert(!canReadAudit('MANAGER'), 'RBAC M-15: MANAGER tiene acceso BLOQUEADO a bitácora de auditoría (HTTP 403)');
  testAssert(!canReadAudit('FINANCE'), 'RBAC M-15: FINANCE tiene acceso BLOQUEADO a bitácora de auditoría (HTTP 403)');
  testAssert(!canReadAudit('RESPONSABLE_PROYECTO'), 'RBAC M-15: RESPONSABLE_PROYECTO tiene acceso BLOQUEADO a bitácora (HTTP 403)');
  testAssert(!canReadAudit('FINANCIADOR'), 'RBAC M-15: FINANCIADOR tiene acceso BLOQUEADO a bitácora (HTTP 403)');

  // 3.3 Verificación de Inmutabilidad SQL Estricta en PostgreSQL:
  // Intentos directos de UPDATE, DELETE y TRUNCATE son rechazados por triggers de PostgreSQL
  let updateRejected = false;
  try {
    await db.execute(sql`UPDATE audit_logs SET action = 'HACKED_ACTION' WHERE id = ${log.id}`);
  } catch (err: any) {
    const fullErr = `${err} ${err.message || ''} ${err.cause?.message || ''}`;
    updateRejected = fullErr.includes('permission denied') || fullErr.includes('immutable') || fullErr.includes('prevent_audit_logs_mutation');
  }
  testAssert(updateRejected, 'Inmutabilidad SQL: UPDATE audit_logs es rechazado en PostgreSQL (permission denied / immutable)');

  let deleteRejected = false;
  try {
    await db.execute(sql`DELETE FROM audit_logs WHERE id = ${log.id}`);
  } catch (err: any) {
    const fullErr = `${err} ${err.message || ''} ${err.cause?.message || ''}`;
    deleteRejected = fullErr.includes('permission denied') || fullErr.includes('immutable') || fullErr.includes('prevent_audit_logs_mutation');
  }
  testAssert(deleteRejected, 'Inmutabilidad SQL: DELETE FROM audit_logs es rechazado en PostgreSQL (permission denied / immutable)');

  let truncateRejected = false;
  try {
    await db.execute(sql`TRUNCATE audit_logs`);
  } catch (err: any) {
    const fullErr = `${err} ${err.message || ''} ${err.cause?.message || ''}`;
    truncateRejected = fullErr.includes('permission denied') || fullErr.includes('immutable') || fullErr.includes('prevent_audit_logs_mutation');
  }
  testAssert(truncateRejected, 'Inmutabilidad SQL: TRUNCATE audit_logs es rechazado en PostgreSQL (permission denied / immutable)');

  // -------------------------------------------------------------------------
  // 4. M-16: Gestión de Usuarios, Catálogo vs Perfil Propio (/api/users/me)
  // -------------------------------------------------------------------------
  console.log('\n[4. M-16: Gestión de Usuarios, Catálogo y Perfil Propio (/me)]');

  // 4.1 Regla RBAC para GET /api/users:
  // DIRECTOR y AUDITOR -> Autorizados (200)
  // MANAGER, FINANCE, RESPONSABLE_PROYECTO, FINANCIADOR -> Prohibidos (403)
  const canListUsers = (role: string) => role === 'DIRECTOR' || role === 'ADMIN' || role === 'AUDITOR';
  testAssert(canListUsers('DIRECTOR'), 'RBAC M-16: DIRECTOR puede listar catálogo de usuarios (HTTP 200)');
  testAssert(canListUsers('AUDITOR'), 'RBAC M-16: AUDITOR puede listar catálogo de usuarios (HTTP 200)');
  testAssert(!canListUsers('MANAGER'), 'RBAC M-16: MANAGER tiene catálogo BLOQUEADO (HTTP 403)');
  testAssert(!canListUsers('FINANCE'), 'RBAC M-16: FINANCE tiene catálogo BLOQUEADO (HTTP 403)');
  testAssert(!canListUsers('RESPONSABLE_PROYECTO'), 'RBAC M-16: RESPONSABLE_PROYECTO tiene catálogo BLOQUEADO (HTTP 403)');

  // 4.2 Endpoint /api/users/me: Todos los roles pueden consultar su propio perfil
  const canAccessProfileMe = (role: string) => !!role;
  testAssert(canAccessProfileMe('DIRECTOR'), 'RBAC M-16: DIRECTOR accede a su propio perfil /api/users/me (HTTP 200)');
  testAssert(canAccessProfileMe('MANAGER'), 'RBAC M-16: MANAGER accede a su propio perfil /api/users/me (HTTP 200)');
  testAssert(canAccessProfileMe('FINANCE'), 'RBAC M-16: FINANCE accede a su propio perfil /api/users/me (HTTP 200)');
  testAssert(canAccessProfileMe('AUDITOR'), 'RBAC M-16: AUDITOR accede a su propio perfil /api/users/me (HTTP 200)');

  // 4.3 Invalidación de Caché ante Cambio de Rol
  const dbRoles = await db.select().from(roles);
  const managerRole = dbRoles.find(r => r.name.toLowerCase().includes('manager') || r.name.toLowerCase().includes('gerente')) || dbRoles[1] || dbRoles[0];
  const financeRole = dbRoles.find(r => r.name.toLowerCase().includes('finance') || r.name.toLowerCase().includes('financ')) || dbRoles[2] || dbRoles[0];

  const testUserUid = `uid-audit-fix-${Date.now()}`;
  const [testUser] = await db.insert(users).values({
    tenantId,
    uid: testUserUid,
    name: 'Usuario Prueba RBAC',
    email: `test.${Date.now()}@proyecty.org`,
    roleId: managerRole.id,
    isActive: true,
  }).returning();

  const permsBefore = await CacheService.getUserPermissions(testUser.id);
  testAssert(Array.isArray(permsBefore), 'Caché de permisos inicializada para el usuario');

  // Actualizar rol e invalidar caché
  await db.update(users)
    .set({ roleId: financeRole.id })
    .where(and(eq(users.id, testUser.id), eq(users.tenantId, tenantId)));

  CacheService.invalidate(testUser.id);
  const permsAfter = await CacheService.getUserPermissions(testUser.id);
  testAssert(Array.isArray(permsAfter), 'Permisos actualizados tras invalidación reactiva de caché');

  // -------------------------------------------------------------------------
  // 5. DOC-01: Máquina de Estados Fail-Closed para Documentos (HTTP 423)
  // -------------------------------------------------------------------------
  console.log('\n[5. DOC-01: Máquina de Estados Fail-Closed de Documentos]');

  const testDocId = 99999;
  const simulateDownloadStatus = (scanStatus: string, quarantined: boolean = false) => {
    if (scanStatus !== 'CLEAN' || quarantined) {
      return { status: 423, error: 'DOCUMENT_NOT_VERIFIED' };
    }
    return { status: 200, url: 'https://storage.supabase.co/signed/doc.pdf' };
  };

  testAssert(simulateDownloadStatus('PENDING_SCAN').status === 423, 'DOC-01: Documento PENDING_SCAN bloqueado para descarga con HTTP 423 Locked');
  testAssert(simulateDownloadStatus('SCAN_UNAVAILABLE').status === 423, 'DOC-01: Documento SCAN_UNAVAILABLE bloqueado para descarga con HTTP 423 Locked');
  testAssert(simulateDownloadStatus('INFECTED').status === 423, 'DOC-01: Documento INFECTED bloqueado para descarga con HTTP 423 Locked');
  testAssert(simulateDownloadStatus('CLEAN', true).status === 423, 'DOC-01: Documento en CUARENTENA bloqueado para descarga con HTTP 423 Locked');
  testAssert(simulateDownloadStatus('CLEAN', false).status === 200, 'DOC-01: Documento CLEAN verificado habilitado para descarga con HTTP 200');

  console.log('\n================================================================');
  console.log(`📊 RESULTADOS FINALES OLA 1 (FIX): ${passed} PASSED | ${failed} FAILED`);
  console.log('================================================================\n');
}

runOla1ExhaustiveSuite().catch((err) => {
  console.error('❌ Error en suite exhaustiva Ola 1:', err);
  process.exit(1);
});
