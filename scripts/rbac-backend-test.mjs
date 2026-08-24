/**
 * Sprint 2 RBAC Backend Verification Script
 * 
 * Prueba que el middleware RBAC del backend bloquea correctamente
 * las acciones de escritura para un usuario con rol AUDITOR,
 * usando su token demo real (no simulación de frontend).
 * 
 * Ejecuta: node scripts/rbac-backend-test.mjs
 */

const BASE = 'http://localhost:3000';

// Token del usuario AUDITOR real en BD (id=18, uid=demo-auditor, roleId=5, tenantId=2)
const AUDITOR_TOKEN = 'demo-uid-demo-auditor';

// Token del usuario MANAGER real en BD (id=16, uid=demo-manager, roleId=7, tenantId=2)
const MANAGER_TOKEN = 'demo-uid-demo-manager';

// Token del usuario DIRECTOR real en BD (id=22, roleId=1, tenantId=4)
const DIRECTOR_TOKEN = 'demo-uid-6f9a223f-ac1f-4277-9e83-c2107b0a8407';

const headers = (token) => ({
  'Authorization': `Bearer ${token}`,
  'Content-Type': 'application/json',
});

async function test(label, method, url, token, body = null) {
  const opts = { method, headers: headers(token) };
  if (body) opts.body = JSON.stringify(body);
  
  const res = await fetch(`${BASE}${url}`, opts);
  const status = res.status;
  let responseBody;
  try { responseBody = await res.json(); } catch { responseBody = await res.text(); }
  
  console.log(`\n[${ status >= 400 ? '🔒 BLOCKED' : '✅ ALLOWED' }] ${label}`);
  console.log(`  Method: ${method} ${url}`);
  console.log(`  Token:  ${token.substring(0, 25)}...`);
  console.log(`  Status: ${status}`);
  console.log(`  Body:   ${JSON.stringify(responseBody).substring(0, 200)}`);
  return status;
}

async function run() {
  console.log('='.repeat(70));
  console.log('Sprint 2 RBAC Backend Verification');
  console.log('='.repeat(70));

  // --- AUDITOR TESTS ---
  const t1 = await test(
    'AUDITOR → POST /api/projects (crear proyecto)',
    'POST',
    '/api/projects',
    AUDITOR_TOKEN,
    { name: 'Proyecto de Prueba RBAC', donorId: 1 }
  );

  const t2 = await test(
    'AUDITOR → PATCH /api/expenses/1/approve (aprobar gasto)',
    'PATCH',
    '/api/expenses/1/approve',
    AUDITOR_TOKEN
  );

  const t3 = await test(
    'AUDITOR → POST /api/expenses (crear gasto)',
    'POST',
    '/api/expenses',
    AUDITOR_TOKEN,
    { concept: 'Test RBAC', amount: 100, projectId: 1, category: 'materiales' }
  );

  const t4 = await test(
    'AUDITOR → GET /api/projects (lectura, permitida)',
    'GET',
    '/api/projects',
    AUDITOR_TOKEN
  );

  // --- MANAGER TESTS ---
  const m1 = await test(
    'MANAGER → PATCH /api/expenses/1/approve (aprobar gasto, permitida)',
    'PATCH',
    '/api/expenses/1/approve',
    MANAGER_TOKEN,
    { status: 'approved' }
  );

  const m2 = await test(
    'MANAGER → POST /api/projects/1/members (gestionar miembros, bloqueada)',
    'POST',
    '/api/projects/1/members',
    MANAGER_TOKEN,
    { email: 'test@example.com', role: 'viewer' }
  );

  // --- DIRECTOR TESTS ---
  const t5 = await test(
    'DIRECTOR → POST /api/projects (control positivo, no-403)',
    'POST',
    '/api/projects',
    DIRECTOR_TOKEN,
    { code: 'RBAC-TEST', name: 'Proyecto Control Positivo', donorId: 1, approvedBudget: 1000 }
  );

  console.log('\n' + '='.repeat(70));
  console.log('RESUMEN');
  console.log('='.repeat(70));
  
  const results = [
    { label: 'AUDITOR crea proyecto', status: t1, expected: [403] },
    { label: 'AUDITOR aprueba gasto', status: t2, expected: [403] },
    { label: 'AUDITOR crea gasto', status: t3, expected: [403] },
    { label: 'AUDITOR lee proyectos', status: t4, expected: [200] },
    { label: 'MANAGER aprueba gasto (permitida)', status: m1, expected: [404, 400, 200] }, // 404/400 because expense 1 might not exist, but NOT 403
    { label: 'MANAGER añade miembro (bloqueada)', status: m2, expected: [403] }, // Missing projects:manage
    { label: 'DIRECTOR crea proyecto (no 403)', status: t5, expected: [200, 201, 400, 409] },
  ];

  let allPassed = true;
  for (const r of results) {
    const expectedArr = Array.isArray(r.expected) ? r.expected : [r.expected];
    const pass = expectedArr.includes(r.status);
    if (!pass) allPassed = false;
    console.log(`  ${pass ? '✅' : '❌'} ${r.label}: got ${r.status}, expected ${r.expected}`);
  }

  console.log(`\n${ allPassed ? '✅ ALL TESTS PASSED' : '❌ SOME TESTS FAILED' }`);
  process.exit(allPassed ? 0 : 1);
}

run().catch(e => { console.error(e); process.exit(1); });
