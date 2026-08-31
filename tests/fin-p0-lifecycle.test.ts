/**
 * FASE FIN-P0 — Prueba Humana Financiera Completa
 * 
 * Simula el ciclo de vida completo con llamadas reales al servidor:
 * 1. Finanzas registra gasto $2,500 con validación
 * 2. Finanzas intenta aprobar → segregación FIN-01 (403)
 * 3. Director aprueba → saldo BL-03 reduce de 16,500→14,000
 * 4. Director revierte → saldo restaurado a 16,500
 * 
 * Ejecutar: npx tsx tests/fin-p0-lifecycle.test.ts
 */

const BASE = 'http://127.0.0.1:3000';

interface ApiResponse {
  success?: boolean;
  data?: any;
  error?: string;
  token?: string;
  user?: any;
  expenses?: any[];
  totals?: any;
  budgetLine?: any;
  id?: number;
}

async function api(method: string, path: string, body?: any, token?: string): Promise<{ status: number; data: ApiResponse }> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  
  const data = await res.json().catch(() => ({}));
  return { status: res.status, data };
}

function assert(condition: boolean, msg: string) {
  if (!condition) {
    console.error(`  ✗ FAIL: ${msg}`);
    process.exit(1);
  }
  console.log(`  ✓ ${msg}`);
}

async function main() {
  console.log('\n══════════════════════════════════════════════════════');
  console.log('  FASE FIN-P0 — PRUEBA FINANCIERA COMPLETA');
  console.log('══════════════════════════════════════════════════════\n');

  // ──────────────────────────────────────────────
  // 0. VERIFICAR SERVIDOR
  // ──────────────────────────────────────────────
  console.log('PASO 0: Verificar servidor...');
  const health = await api('GET', '/api/health');
  assert(health.status === 200, `Servidor healthy (status=${health.status})`);

  // ──────────────────────────────────────────────
  // 1. LOGIN COMO FINANZAS
  // ──────────────────────────────────────────────
  console.log('\nPASO 1: Login como FINANCE...');
  const finLogin = await api('POST', '/api/auth/demo-session', { role: 'FINANCE' });
  assert(finLogin.status === 200 && Boolean(finLogin.data.token), 'Login Finance OK');
  const finToken = finLogin.data.token!;
  console.log(`  → User: ${finLogin.data.user?.name} (${finLogin.data.user?.role})`);

  // ──────────────────────────────────────────────
  // 2. OBTENER PROYECTO A Y PARTIDA BL-03
  // ──────────────────────────────────────────────
  console.log('\nPASO 2: Obtener Proyecto A y BL-03...');
  const projList = await api('GET', '/api/projects', undefined, finToken);
  assert(projList.status === 200, 'Lista de proyectos OK');
  
  const projectA = projList.data.data?.find((p: any) => p.code === 'PRJ-DEMO-2026');
  assert(!!projectA, `Proyecto A encontrado (id=${projectA?.id})`);

  const projDetail = await api('GET', `/api/projects/${projectA.id}`, undefined, finToken);
  assert(projDetail.status === 200, 'Detalle Proyecto A OK');
  
  const bl03 = projDetail.data.data?.budgetLines?.find((b: any) => b.code === 'BL-03');
  assert(!!bl03, `BL-03 encontrado (id=${bl03?.id})`);
  assert(bl03.executedAmount === 8500, `BL-03 ejecutado inicial = $${bl03.executedAmount} (esperado: $8,500)`);
  assert(bl03.balance === 16500, `BL-03 saldo inicial = $${bl03.balance} (esperado: $16,500)`);
  console.log(`  → BL-03: ejecutado=$${bl03.executedAmount}, saldo=$${bl03.balance}`);

  // ──────────────────────────────────────────────
  // 3. FINANZAS REGISTRA GASTO $2,500
  // ──────────────────────────────────────────────
  console.log('\nPASO 3: Finanzas registra gasto $2,500 en BL-03...');
  const newExpense = await api('POST', `/api/projects/${projectA.id}/expenses`, {
    projectId: projectA.id,
    budgetLineId: bl03.id,
    title: 'Materiales Didácticos para Taller de Liderazgo',
    amount: 2500,
    currency: 'USD',
    exchangeRate: 1,
    category: 'Capacitación',
    date: '2026-08-30',
    description: 'Adquisición de materiales para taller comunitario de liderazgo',
  }, finToken);
  
  assert(newExpense.status === 201, `Gasto creado (status=${newExpense.status})`);
  const expenseId = newExpense.data.id;
  assert(!!expenseId, `Expense ID: ${expenseId}`);
  console.log(`  → Gasto #${expenseId} registrado en estado 'pending'`);

  // Verificar que el saldo NO cambió (gasto pendiente no afecta ejecución)
  const afterRegister = await api('GET', `/api/budget-lines/${bl03.id}/expenses`, undefined, finToken);
  assert(afterRegister.data.budgetLine?.executedAmount === 8500, 
    `Ejecutado post-registro = $${afterRegister.data.budgetLine?.executedAmount} (sin cambio, gasto pendiente)`);
  assert(afterRegister.data.budgetLine?.balance === 16500,
    `Saldo post-registro = $${afterRegister.data.budgetLine?.balance} (sin cambio)`);

  // ──────────────────────────────────────────────
  // 4. FINANZAS INTENTA APROBAR → SEGREGACIÓN FIN-01
  // ──────────────────────────────────────────────
  console.log('\nPASO 4: Finanzas intenta aprobar → segregación FIN-01...');
  const finApprove = await api('PATCH', `/api/expenses/${expenseId}/approve`, {}, finToken);
  assert(finApprove.status === 403, `Aprobación denegada a Finance (status=${finApprove.status})`);
  console.log(`  → Error: ${finApprove.data.error || 'Acceso denegado'}`);

  // ──────────────────────────────────────────────
  // 5. LOGIN COMO DIRECTOR
  // ──────────────────────────────────────────────
  console.log('\nPASO 5: Login como DIRECTOR...');
  const dirLogin = await api('POST', '/api/auth/demo-session', { role: 'DIRECTOR' });
  assert(dirLogin.status === 200 && Boolean(dirLogin.data.token), 'Login Director OK');
  const dirToken = dirLogin.data.token!;

  // ──────────────────────────────────────────────
  // 6. DIRECTOR APRUEBA GASTO → SALDO REDUCE
  // ──────────────────────────────────────────────
  console.log('\nPASO 6: Director aprueba gasto $2,500...');
  const dirApprove = await api('PATCH', `/api/expenses/${expenseId}/approve`, { status: 'approved' }, dirToken);
  assert(dirApprove.status === 200, `Aprobación exitosa (status=${dirApprove.status})`);

  // Verificar saldos post-aprobación
  const afterApprove = await api('GET', `/api/budget-lines/${bl03.id}/expenses`, undefined, dirToken);
  const execAfter = afterApprove.data.budgetLine?.executedAmount;
  const balAfter = afterApprove.data.budgetLine?.balance;
  assert(execAfter === 11000, `Ejecutado post-aprobación = $${execAfter} (esperado: $11,000 = 8,500 + 2,500)`);
  assert(balAfter === 14000, `Saldo post-aprobación = $${balAfter} (esperado: $14,000 = 25,000 - 11,000)`);
  console.log(`  → BL-03: ejecutado=$${execAfter}, saldo=$${balAfter}`);

  // ──────────────────────────────────────────────
  // 7. DIRECTOR REVIERTE GASTO → SALDO RESTAURADO
  // ──────────────────────────────────────────────
  console.log('\nPASO 7: Director revierte gasto (auditoría)...');
  const dirReverse = await api('PATCH', `/api/expenses/${expenseId}/reverse`, {
    reason: 'Reversión de auditoría: documentación incompleta del proveedor',
  }, dirToken);
  assert(dirReverse.status === 200, `Reversión exitosa (status=${dirReverse.status})`);

  // Verificar saldos post-reversión
  const afterReverse = await api('GET', `/api/budget-lines/${bl03.id}/expenses`, undefined, dirToken);
  const execReversed = afterReverse.data.budgetLine?.executedAmount;
  const balReversed = afterReverse.data.budgetLine?.balance;
  assert(execReversed === 8500, `Ejecutado post-reversión = $${execReversed} (restaurado: $8,500)`);
  assert(balReversed === 16500, `Saldo post-reversión = $${balReversed} (restaurado: $16,500)`);
  console.log(`  → BL-03: ejecutado=$${execReversed}, saldo=$${balReversed}`);

  // ──────────────────────────────────────────────
  // 8. VERIFICAR ESTADO FINAL DEL GASTO
  // ──────────────────────────────────────────────
  console.log('\nPASO 8: Verificar estado final del gasto revertido...');
  const finalExpenses = afterReverse.data.expenses || [];
  const reversedExp = finalExpenses.find((e: any) => e.id === expenseId);
  assert(reversedExp?.status === 'reversed', `Estado final del gasto = '${reversedExp?.status}' (esperado: 'reversed')`);

  // ──────────────────────────────────────────────
  // 9. VERIFICAR AVANCE FINANCIERO DEL PROYECTO
  // ──────────────────────────────────────────────
  console.log('\nPASO 9: Verificar avance financiero global...');
  const finalProject = await api('GET', `/api/projects/${projectA.id}`, undefined, dirToken);
  const finProgress = finalProject.data.data?.financialProgress;
  console.log(`  → financialProgress = ${finProgress}%`);
  // Debe ser 38% (57,000/150,000) pues el gasto de $2,500 fue revertido
  assert(finProgress === 38, `Avance financiero restaurado = ${finProgress}% (esperado: 38%)`);

  // ──────────────────────────────────────────────
  // RESULTADO
  // ──────────────────────────────────────────────
  console.log('\n══════════════════════════════════════════════════════');
  console.log('  ✅ PRUEBA FINANCIERA FIN-P0 COMPLETADA CON ÉXITO');
  console.log('══════════════════════════════════════════════════════');
  console.log('\nResumen:');
  console.log('  • Finanzas registra gasto $2,500 en BL-03 → OK (estado pending)');
  console.log('  • Finanzas intenta aprobar → DENEGADO (segregación FIN-01)');
  console.log('  • Director aprueba → ejecutado 8.5k→11k, saldo 16.5k→14k');
  console.log('  • Director revierte → ejecutado 11k→8.5k, saldo 14k→16.5k');
  console.log('  • Estado restaurado exactamente al baseline');
  console.log('  • Avance financiero = 38% (sin cambio neto)\n');
  
  process.exit(0);
}

main().catch((err) => {
  console.error('FATAL:', err);
  process.exit(1);
});
