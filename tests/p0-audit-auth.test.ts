import 'dotenv/config';
import { generateDemoToken, verifyDemoToken } from '../src/services/demoAuth.service.ts';
import { DEMO_USERS_CATALOG, getOrCreateDemoTenant, resetDemoTenantData } from '../src/services/demoTenant.service.ts';

async function runTests() {
  console.log('======================================================');
  console.log('🧪 SUITE DE PRUEBAS DE SEGURIDAD FASE 1 (AUD-PROY-001)');
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

  // --- TEST 1: Token Generation and Verification (Valid Token) ---
  console.log('[1. Tokens Criptográficos Demo - Caso Válido]');
  try {
    const validToken = generateDemoToken({
      uid: 'demo-usr-director-001',
      email: 'demo.director@proyecty.org',
      name: 'Gonzalo Alfaro (Demo)',
      role: 'DIRECTOR',
      roleName: 'Director',
      tenantId: 999,
    }, 15);

    const payload = verifyDemoToken(validToken);
    assert(payload.iss === 'proyecty-auth', 'Issuer coincide con proyecty-auth');
    assert(payload.aud === 'proyecty-app', 'Audience coincide con proyecty-app');
    assert(payload.role === 'DIRECTOR', 'Role claims es DIRECTOR');
    assert(payload.tenant_id === 999, 'Tenant ID es el del tenant demo aislado (999)');
    assert(typeof payload.session_id === 'string' && payload.session_id.length > 10, 'Session ID presente y no vacío');
    assert(payload.exp > Math.floor(Date.now() / 1000), 'Token tiene expiración futura válida');
  } catch (err: any) {
    assert(false, 'Token válido generado fue rechazado', err?.message);
  }

  // --- TEST 2: Manipulated Token Signature ---
  console.log('\n[2. Tokens Criptográficos Demo - Detección de Manipulación]');
  try {
    const validToken = generateDemoToken({
      uid: 'demo-usr-manager-002',
      email: 'demo.manager@proyecty.org',
      name: 'Rodrigo Gómez (Demo)',
      role: 'MANAGER',
      roleName: 'Coordinador de Proyecto',
      tenantId: 999,
    }, 15);

    // Tamper with signature
    const parts = validToken.split('.');
    const tamperedToken = `${parts[0]}.${parts[1]}.${parts[2].slice(0, -4)}XXXX`;

    let threw = false;
    try {
      verifyDemoToken(tamperedToken);
    } catch {
      threw = true;
    }
    assert(threw, 'Token con firma manipulada es rechazado con error criptográfico');
  } catch (err: any) {
    assert(false, 'Test de manipulación falló', err?.message);
  }

  // --- TEST 3: Manipulated Payload (Privilege Escalation attempt) ---
  console.log('\n[3. Tokens Criptográficos Demo - Intento de Escalación de Privilegios]');
  try {
    const validToken = generateDemoToken({
      uid: 'demo-usr-manager-002',
      email: 'demo.manager@proyecty.org',
      name: 'Rodrigo Gómez (Demo)',
      role: 'MANAGER',
      roleName: 'Coordinador de Proyecto',
      tenantId: 999,
    }, 15);

    // Tamper with payload (substitute MANAGER with DIRECTOR without resigning)
    const rawJwt = validToken.substring(5);
    const [header, payload, sig] = rawJwt.split('.');
    const decodedPayload = JSON.parse(Buffer.from(payload, 'base64').toString('utf-8'));
    decodedPayload.role = 'DIRECTOR';
    const forgedPayload = Buffer.from(JSON.stringify(decodedPayload)).toString('base64').replace(/=/g, '');
    const forgedToken = `demo.${header}.${forgedPayload}.${sig}`;

    let threw = false;
    try {
      verifyDemoToken(forgedToken);
    } catch {
      threw = true;
    }
    assert(threw, 'Payload alterado sin clave privada del backend es rechazado');
  } catch (err: any) {
    assert(false, 'Test de alteración de payload falló', err?.message);
  }

  // --- TEST 4: Expired Token Rejection ---
  console.log('\n[4. Tokens Criptográficos Demo - Expiración]');
  try {
    // Generate token with negative duration (-1 min)
    const expiredToken = generateDemoToken({
      uid: 'demo-usr-finance-003',
      email: 'demo.finance@proyecty.org',
      name: 'Karla Martínez (Demo)',
      role: 'FINANCE',
      roleName: 'Administrativo / Finanzas',
      tenantId: 999,
    }, -1);

    let threw = false;
    try {
      verifyDemoToken(expiredToken);
    } catch (e: any) {
      if (e.message.includes('expired')) {
        threw = true;
      }
    }
    assert(threw, 'Token expirado es rechazado inmediatamente');
  } catch (err: any) {
    assert(false, 'Test de expiración falló', err?.message);
  }

  // --- TEST 5: Legacy / Manual Token Rejection ---
  console.log('\n[5. Bloqueo de Tokens Legacy / Fabricados Manualmente]');
  try {
    const legacyTokens = [
      'demo-director',
      'demo-uid-12345',
      'demo-uid-directorgeneral@voserdem.org',
      'Bearer demo-admin',
    ];

    for (const leg of legacyTokens) {
      let threw = false;
      try {
        verifyDemoToken(leg);
      } catch {
        threw = true;
      }
      assert(threw, `Token legacy manual "${leg}" es rechazado`);
    }
  } catch (err: any) {
    assert(false, 'Test de tokens legacy falló', err?.message);
  }

  // --- TEST 6: Public Demo Endpoint Data Sanitization (DATA-01) ---
  console.log('\n[6. Sanitización del Catálogo Público Demo (DATA-01)]');
  try {
    assert(DEMO_USERS_CATALOG.length >= 4, 'Catálogo demo contiene al menos 4 roles');
    const hasRealEmails = DEMO_USERS_CATALOG.some(u => !u.email.endsWith('@proyecty.org') && !u.email.endsWith('@voserdem.test'));
    assert(!hasRealEmails, 'Todos los correos demo usan dominios ficticios controlados (@proyecty.org o @voserdem.test)');
    const hasDbNumericIds = DEMO_USERS_CATALOG.some((u: any) => typeof u.id === 'number' && u.id > 0);
    assert(!hasDbNumericIds, 'El catálogo de definición no expone IDs numéricos reales de BD');
  } catch (err: any) {
    assert(false, 'Test de catálogo demo falló', err?.message);
  }

  // --- TEST 7: Isolated Tenant DB Seeding and Reset ---
  console.log('\n[7. Aislamiento y Reseteo del Tenant Demo en Base de Datos]');
  try {
    const tenantInfo = await getOrCreateDemoTenant();
    assert(typeof tenantInfo.orgId === 'number' && tenantInfo.orgId > 0, `Tenant Demo creado/obtenido con ID ${tenantInfo.orgId}`);
    assert(tenantInfo.users.length >= 5, `${tenantInfo.users.length} usuarios demo vinculados al tenant aislado`);

    const resetResult = await resetDemoTenantData();
    assert(resetResult.success === true, 'Reseteo manual/programado de datos ejecutado con éxito');
  } catch (err: any) {
    assert(false, 'Test de tenant demo en base de datos falló', err?.message);
  }

  console.log('\n======================================================');
  console.log(`📊 RESULTADOS: ${passed} PASSED | ${failed} FAILED`);
  console.log('======================================================\n');

  if (failed > 0) {
    process.exit(1);
  } else {
    process.exit(0);
  }
}

runTests().catch(err => {
  console.error('Error fatal ejecutando suite de tests:', err);
  process.exit(1);
});
