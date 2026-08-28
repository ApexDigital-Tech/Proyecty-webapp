import 'dotenv/config';
import { db } from '../src/db/index.ts';
import {
  organizations,
  users,
  roles,
  projects,
  agreements,
  budgetLines,
  expenses,
  documents,
  auditLogs,
} from '../src/db/schema.ts';
import { eq, and, sql } from 'drizzle-orm';
import { DEMO_ORG_NAME, DEMO_USERS_CATALOG, getOrCreateDemoTenant, resetDemoTenantData } from '../src/services/demoTenant.service.ts';
import { generateDemoToken, verifyDemoToken } from '../src/services/demoAuth.service.ts';
import fs from 'fs';
import path from 'path';

interface PreflightCheckResult {
  name: string;
  passed: boolean;
  details: string;
}

export async function runDemoPreflight(): Promise<{ success: boolean; checks: PreflightCheckResult[] }> {
  console.log('========================================================================');
  console.log('🔍 PROYECTY — PREFLIGHT DE CERTIFICACIÓN LOCAL VOSERDEM (DEMO-D1)');
  console.log('========================================================================\n');

  const checks: PreflightCheckResult[] = [];

  function recordCheck(name: string, condition: boolean, details: string) {
    checks.push({ name, passed: condition, details });
    if (condition) {
      console.log(`  ✅ [PASS] ${name}: ${details}`);
    } else {
      console.error(`  ❌ [FAIL] ${name}: ${details}`);
    }
  }

  // 1. Environment & Node checks
  const nodeVersion = process.version;
  recordCheck('Node Runtime', nodeVersion.startsWith('v20'), `Versión actual ${nodeVersion}`);

  // 2. Strict Host & Security Guard
  const dbUrl = process.env.DATABASE_URL || '';
  const supaUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '';

  const isExternalDb = dbUrl.includes('supabase.co') || dbUrl.includes('pooler.supabase.com') || (!dbUrl.includes('127.0.0.1') && !dbUrl.includes('localhost') && dbUrl.length > 0);
  const isExternalSupa = supaUrl.includes('supabase.co') && !supaUrl.includes('127.0.0.1');

  recordCheck('Aislamiento Host Base de Datos', !isExternalDb, isExternalDb ? 'Detectada conexión a host externo' : 'Conexión local 127.0.0.1/localhost verificada');
  recordCheck('Aislamiento Host Supabase', !isExternalSupa, isExternalSupa ? 'Detectada conexión a Supabase externo' : 'Sin conexión productiva externa');

  if (isExternalDb || isExternalSupa) {
    console.error('\n🚨 [ABORT] Preflight cancelado: Detectadas conexiones a infraestructura externa de producción.');
    return { success: false, checks };
  }

  // 3. PostgreSQL Version & Connection Check
  try {
    const pgVerResult = await db.execute(sql`SELECT version()`);
    const pgVerStr = String(pgVerResult.rows[0]?.version || '');
    recordCheck('PostgreSQL Conectividad', true, pgVerStr.split(',')[0]);
  } catch (err: any) {
    recordCheck('PostgreSQL Conectividad', false, `Error de conexión: ${err.message}`);
    return { success: false, checks };
  }

  // 4. Tenant VOSERDEM Verification
  const { orgId, users: demoUsers } = await getOrCreateDemoTenant();
  const [orgRecord] = await db.select().from(organizations).where(eq(organizations.id, orgId));
  recordCheck('Tenant Demo VOSERDEM', orgRecord && orgRecord.name === DEMO_ORG_NAME, `Org ID ${orgId}: "${orgRecord?.name}"`);

  // 5. Six Demo Identities
  recordCheck('Catálogo de 6 Usuarios Demo', demoUsers.length === 6, `Total identidades registradas: ${demoUsers.length}/6`);
  for (const expectedUser of DEMO_USERS_CATALOG) {
    const found = demoUsers.find(u => u.roleKey === expectedUser.roleKey && u.email === expectedUser.email);
    recordCheck(`Usuario ${expectedUser.roleKey}`, !!found, `${expectedUser.name} (${expectedUser.email})`);
  }

  // 6. Project PRJ-DEMO-2026 Verification
  const [demoProject] = await db.select().from(projects).where(and(eq(projects.tenantId, orgId), eq(projects.code, 'PRJ-DEMO-2026')));
  recordCheck('Proyecto PRJ-DEMO-2026', !!demoProject, demoProject ? `"${demoProject.name}" (Avance Físico: ${demoProject.physicalProgress}%, Financiero: ${demoProject.financialProgress}%)` : 'Proyecto no encontrado');

  if (demoProject) {
    recordCheck('Presupuesto Aprobado USD 150.000', demoProject.approvedBudget === 150000, `Monto: $${demoProject.approvedBudget}`);
    recordCheck('Avance Físico 75%', demoProject.physicalProgress === 75, `Avance Físico: ${demoProject.physicalProgress}%`);
    recordCheck('Avance Financiero 38%', demoProject.financialProgress === 38, `Avance Financiero: ${demoProject.financialProgress}%`);

    // 7. Budget Lines BL-01 .. BL-04
    const bLines = await db.select().from(budgetLines).where(eq(budgetLines.projectId, demoProject.id));
    recordCheck('Partidas Presupuestarias (4/4)', bLines.length === 4, `Partidas: ${bLines.map(b => b.code).join(', ')}`);

    const bl02 = bLines.find(b => b.code === 'BL-02');
    recordCheck('Partida BL-02 (Infraestructura)', !!bl02 && bl02.approvedAmount === 50000 && bl02.executedAmount === 21500, bl02 ? `Aprobado: $${bl02.approvedAmount}, Ejecutado: $${bl02.executedAmount}, Saldo: $${bl02.balance}` : 'No encontrada');

    // 8. Pending Expense ($6,000)
    const pendingExp = await db.select().from(expenses).where(and(eq(expenses.projectId, demoProject.id), eq(expenses.status, 'pending')));
    recordCheck('Gasto Pendiente de Aprobación USD 6.000', pendingExp.length === 1 && pendingExp[0].amount === 6000, pendingExp.length > 0 ? `"${pendingExp[0].title}" ($${pendingExp[0].amount})` : 'Gasto pendiente no encontrado');

    // 9. Demo Document Fixtures
    const docs = await db.select().from(documents).where(eq(documents.projectId, demoProject.id));
    recordCheck('Documentos Ficticios en Base de Datos (2/2)', docs.length >= 2, `Total documentos vinculados: ${docs.length}`);

    const fix1 = path.resolve('tests/fixtures/demo/comprobante_filtracion_demo.pdf');
    const fix2 = path.resolve('tests/fixtures/demo/informe_tecnico_instalacion_demo.pdf');
    recordCheck('Fixtures en Disco', fs.existsSync(fix1) && fs.existsSync(fix2), 'comprobante_filtracion_demo.pdf e informe_tecnico_instalacion_demo.pdf');
  }

  // 10. JWT Token Generation & Verification for all 6 roles
  let tokensValid = true;
  for (const userDef of DEMO_USERS_CATALOG) {
    try {
      const token = generateDemoToken({
        uid: userDef.uid,
        email: userDef.email,
        name: userDef.name,
        role: userDef.roleKey,
        roleName: userDef.roleName,
        tenantId: orgId,
      });
      const verified = verifyDemoToken(token);
      if (verified.role !== userDef.roleKey || verified.tenant_id !== orgId) {
        tokensValid = false;
      }
    } catch {
      tokensValid = false;
    }
  }
  recordCheck('Autenticación y Criptografía JWT (6 Roles)', tokensValid, 'Tokens HMAC-SHA256 generados y verificados con claims estrictos');

  // 11. Audit Trail Availability
  const auditEntries = await db.select().from(auditLogs).where(eq(auditLogs.tenantId, orgId));
  recordCheck('Bitácora de Auditoría Disponible', auditEntries.length > 0, `Eventos auditables registrados: ${auditEntries.length}`);

  const allPassed = checks.every(c => c.passed);
  console.log('\n------------------------------------------------------------------------');
  if (allPassed) {
    console.log('🎯 RESULTADO PREFLIGHT: ✅ APTO PARA DEMOSTRACIÓN VOSERDEM (GO)');
  } else {
    console.log('🚨 RESULTADO PREFLIGHT: ❌ NO APTO (NO-GO)');
  }
  console.log('========================================================================\n');

  return { success: allPassed, checks };
}

// Direct entrypoint execution
if (process.argv[1] && process.argv[1].includes('demo-preflight')) {
  runDemoPreflight()
    .then(res => {
      process.exit(res.success ? 0 : 1);
    })
    .catch(err => {
      console.error('Error no capturado en preflight:', err);
      process.exit(1);
    });
}
