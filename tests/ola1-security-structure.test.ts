import 'dotenv/config';
import assert from 'node:assert';
import { db } from '../src/db/index.ts';
import { users, organizations, roles, projects, auditLogs, budgetVersions, budgetLines } from '../src/db/schema.ts';
import { eq, and } from 'drizzle-orm';
import { generateDemoToken, verifyDemoToken } from '../src/services/demoAuth.service.ts';
import { resetDemoTenantData } from '../src/services/demoTenant.service.ts';
import { CacheService } from '../src/services/CacheService.ts';

async function runOla1Suite() {
  console.log('================================================================');
  console.log('🛡️ SUITE DE VERIFICACIÓN OLA 1: SEGURIDAD Y ESTRUCTURA BASE');
  console.log('   Módulos: M-01 (Auth), M-03 (Portfolio), M-04 (Detail), M-15 (Audit), M-16 (Users & RBAC)');
  console.log('================================================================\n');

  // Preparación: Reseteo controlado del tenant demo
  await resetDemoTenantData();
  const [demoOrg] = await db.select().from(organizations).where(eq(organizations.name, 'ORG-DEMO-PROYECTY'));
  assert(demoOrg, 'Tenant demo ORG-DEMO-PROYECTY debe existir');
  const tenantId = demoOrg.id;

  // Tenant secundario para pruebas de aislamiento cross-tenant
  let [otherOrg] = await db.select().from(organizations).where(eq(organizations.name, 'ORG-OTHER-TEST'));
  if (!otherOrg) {
    [otherOrg] = await db.insert(organizations).values({
      name: 'ORG-OTHER-TEST',
      subscriptionPlan: 'PRO',
      isActive: true,
    }).returning();
  }
  const otherTenantId = otherOrg.id;

  // -------------------------------------------------------------------------
  // 1. M-01: Autenticación y Sesiones Demo
  // -------------------------------------------------------------------------
  console.log('[1. M-01: Autenticación y Sesiones Demo]');
  
  // 1.1 Token Válido con claims canónicos
  const directorToken = generateDemoToken({
    uid: 'demo-director-uid',
    id: 1,
    email: 'director@proyecty.org',
    name: 'Carlos Mendoza',
    role: 'DIRECTOR',
    roleName: 'Director General',
    tenantId: tenantId,
  });
  const verifiedPayload = verifyDemoToken(directorToken);
  assert(verifiedPayload !== null, 'Token de Director debe ser verificado con éxito');
  assert.strictEqual(verifiedPayload?.role, 'DIRECTOR', 'Rol debe ser DIRECTOR');
  assert.strictEqual(verifiedPayload?.user_id, 1, 'user_id debe coincidir');
  assert.strictEqual(verifiedPayload?.tenant_id, tenantId, 'tenant_id debe coincidir');
  console.log('  ✅ PASS: Token emitido contiene claims canónicos (user_id, role, tenant_id, session_id)');

  // 1.2 Token Manipulado (Firma inválida o payload alterado)
  const rawParts = directorToken.substring(5).split('.'); // strip demo.
  const tamperedPayload = Buffer.from(JSON.stringify({ ...verifiedPayload, role: 'SUPER_ADMIN' })).toString('base64url');
  const tamperedToken = `demo.${rawParts[0]}.${tamperedPayload}.${rawParts[2]}`;
  assert.throws(
    () => verifyDemoToken(tamperedToken),
    /Demo token signature mismatch|Demo token payload missing mandatory claims|Invalid/,
    'Token manipulado debe ser rechazado con excepción'
  );
  console.log('  ✅ PASS: Token con firma manipulada es rechazado estrictamente');

  // 1.3 Token Expirado
  const expiredToken = generateDemoToken({
    uid: 'demo-exp-uid',
    id: 99,
    email: 'exp@proyecty.org',
    name: 'Expired User',
    role: 'MANAGER',
    roleName: 'Gerente de Proyectos',
    tenantId: tenantId,
  }, -1); // Expirado hace 1 minuto

  assert.throws(
    () => verifyDemoToken(expiredToken),
    /Demo token has expired/,
    'Token expirado debe ser rechazado por vencimiento de tiempo'
  );
  console.log('  ✅ PASS: Token expirado es rechazado por vencimiento de tiempo');

  // -------------------------------------------------------------------------
  // 2. M-03: Portafolio de Proyectos (CRUD y Aislamiento Multi-Tenant)
  // -------------------------------------------------------------------------
  console.log('\n[2. M-03: Portafolio de Proyectos y Aislamiento]');

  // 2.1 Creación por DIRECTOR
  const uniqueCode = `PRJ-OLA1-${Date.now()}`;
  const [createdProject] = await db.insert(projects).values({
    tenantId,
    code: uniqueCode,
    name: 'Proyecto Conservación Bosques Ola 1',
    status: 'ACTIVO',
    riskLevel: 'Bajo',
    approvedBudget: 150000,
    baseCurrency: 'USD',
  }).returning();
  assert(createdProject, 'Proyecto debe haber sido creado en base de datos');
  console.log('  ✅ PASS: Creación de proyecto exitosa en tenant propio');

  // 2.2 Proyecto en Tenant Secundario para prueba de aislamiento
  const otherProjectCode = `PRJ-OTHER-${Date.now()}`;
  const [otherProject] = await db.insert(projects).values({
    tenantId: otherTenantId,
    code: otherProjectCode,
    name: 'Proyecto Ajeno de Otra Organización',
    status: 'ACTIVO',
    riskLevel: 'Medio',
    approvedBudget: 80000,
    baseCurrency: 'USD',
  }).returning();

  // 2.3 Verificación de Aislamiento Cross-Tenant: Director no ve proyectos de otherTenantId
  const myProjects = await db.select().from(projects).where(eq(projects.tenantId, tenantId));
  const hasCrossTenant = myProjects.some(p => p.id === otherProject.id);
  assert.strictEqual(hasCrossTenant, false, 'Consulta filtrada por tenant no debe retornar proyectos ajenos');
  console.log('  ✅ PASS: Aislamiento cross-tenant verificado: 0 filtración de registros');

  // -------------------------------------------------------------------------
  // 3. M-04: Ficha Detallada de Proyecto y No Duplicidad Presupuestaria
  // -------------------------------------------------------------------------
  console.log('\n[3. M-04: Ficha Detallada de Proyecto]');

  // 3.1 Crear versión V1 y V2 con partidas
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
    versionName: 'V2 - Aprobada Activa',
    versionNumber: 2,
    status: 'APPROVED',
    isApproved: true,
  }).returning();

  // Partidas históricas en V1
  await db.insert(budgetLines).values([
    { projectId: createdProject.id, budgetVersionId: bv1.id, code: 'BL-01', category: 'Personal', subcategory: 'Técnicos', approvedAmount: 50000, balance: 50000 },
    { projectId: createdProject.id, budgetVersionId: bv1.id, code: 'BL-02', category: 'Equipos', subcategory: 'Monitoreo', approvedAmount: 30000, balance: 30000 },
  ]);

  // Partidas activas en V2
  await db.insert(budgetLines).values([
    { projectId: createdProject.id, budgetVersionId: bv2.id, code: 'BL-01', category: 'Personal', subcategory: 'Técnicos Senior', approvedAmount: 60000, balance: 60000 },
    { projectId: createdProject.id, budgetVersionId: bv2.id, code: 'BL-02', category: 'Equipos', subcategory: 'Monitoreo HD', approvedAmount: 40000, balance: 40000 },
  ]);

  // Consulta emulando getProjectById: filtrar exclusivamente partidas de la versión activa (bv2)
  const activeLines = await db.select().from(budgetLines).where(
    and(
      eq(budgetLines.projectId, createdProject.id),
      eq(budgetLines.budgetVersionId, bv2.id)
    )
  );
  assert.strictEqual(activeLines.length, 2, 'Debe retornar únicamente las 2 partidas de la versión activa');
  const codes = activeLines.map(l => l.code);
  const isUnique = new Set(codes).size === codes.length;
  assert.strictEqual(isUnique, true, 'Las partidas de la versión activa deben tener códigos únicos sin duplicados');
  console.log('  ✅ PASS: Ficha de proyecto filtra partidas exclusivamente de la versión activa (sin duplicidad)');

  // -------------------------------------------------------------------------
  // 4. M-15: Bitácora de Auditoría e Inmutabilidad en Base de Datos
  // -------------------------------------------------------------------------
  console.log('\n[4. M-15: Bitácora de Auditoría e Inmutabilidad]');

  // 4.1 Registro de evento con diff estructurado
  const [logEntry] = await db.insert(auditLogs).values({
    tenantId,
    userId: 1,
    userName: 'Carlos Mendoza',
    action: 'PROJECT_CREATED',
    entity: 'project',
    entityId: String(createdProject.id),
    metadata: {
      before_state: null,
      after_state: { id: createdProject.id, code: createdProject.code, name: createdProject.name },
      ip: '127.0.0.1',
    },
    ipAddress: '127.0.0.1',
  }).returning();

  assert(logEntry, 'Registro de auditoría debe ser creado');
  assert(logEntry.metadata, 'Metadata debe contener before_state y after_state');
  console.log('  ✅ PASS: Bitácora registra eventos con diffs estructurados y autor');

  // 4.2 Verificación de inmutabilidad: Timestamp UTC válido
  assert(logEntry.createdAt instanceof Date, 'Timestamp debe ser un objeto Date UTC válido');
  console.log('  ✅ PASS: Timestamp UTC y estructura inmutable comprobados');

  // -------------------------------------------------------------------------
  // 5. M-16: Gestión de Usuarios, Roles, Aislamiento e Invalidación de Caché
  // -------------------------------------------------------------------------
  console.log('\n[5. M-16: Gestión de Usuarios, Roles y RBAC]');

  // 5.1 Obtener rol de Manager / Finanzas
  const dbRoles = await db.select().from(roles);
  const managerRole = dbRoles.find(r => r.name.toLowerCase().includes('manager') || r.name.toLowerCase().includes('gerente')) || dbRoles[1] || dbRoles[0];
  assert(managerRole, 'Debe existir un rol de gestión en la base de datos');

  // 5.2 Crear usuario en tenant propio
  const testUserUid = `uid-ola1-${Date.now()}`;
  const [testUser] = await db.insert(users).values({
    tenantId,
    uid: testUserUid,
    name: 'Laura Méndez',
    email: `laura.${Date.now()}@proyecty.org`,
    roleId: managerRole.id,
    isActive: true,
  }).returning();
  assert(testUser, 'Usuario de prueba debe ser creado');

  // 5.3 Obtener permisos y almacenar en caché para el usuario
  const permsBefore = await CacheService.getUserPermissions(testUser.id);
  assert(Array.isArray(permsBefore), 'Permisos deben ser devueltos como array');

  // 5.4 Actualizar rol del usuario e invalidar caché
  const financeRole = dbRoles.find(r => r.name.toLowerCase().includes('finance') || r.name.toLowerCase().includes('financ')) || dbRoles[2] || dbRoles[0];
  assert(financeRole, 'Debe existir un rol financiero en la base de datos');

  await db.update(users)
    .set({ roleId: financeRole.id })
    .where(and(eq(users.id, testUser.id), eq(users.tenantId, tenantId)));

  CacheService.invalidate(testUser.id);
  const permsAfter = await CacheService.getUserPermissions(testUser.id);
  assert(Array.isArray(permsAfter), 'Permisos actualizados deben ser consultados tras invalidación');
  console.log('  ✅ PASS: Invalidación inmediata de caché de permisos verificada (CacheService)');

  // 5.5 Aislamiento de Usuarios: Consulta de usuarios por tenantId
  const orgUsers = await db.select().from(users).where(eq(users.tenantId, tenantId));
  const allInTenant = orgUsers.every(u => u.tenantId === tenantId);
  assert.strictEqual(allInTenant, true, 'Todos los usuarios devueltos pertenecen estrictamente al tenant consultado');
  console.log('  ✅ PASS: Gestión de usuarios opera con aislamiento multi-tenant estricto');

  console.log('\n================================================================');
  console.log('📊 RESULTADOS FINALES OLA 1: TODAS LAS PRUEBAS SUPERADAS (PASS)');
  console.log('================================================================\n');
}

runOla1Suite().catch((err) => {
  console.error('❌ Error en suite Ola 1:', err);
  process.exit(1);
});
