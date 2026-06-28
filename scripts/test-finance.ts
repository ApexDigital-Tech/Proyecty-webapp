import 'dotenv/config';
import { db } from '../src/db/index.ts';
import { projects, budgetLines, organizations, users, expenses, budgetVersions } from '../src/db/schema.ts';
import { eq } from 'drizzle-orm';
import '../server.ts';

async function delay(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function runTest() {
  console.log('--- INICIANDO SERVIDOR ---');
  await delay(3000);
  console.log('--- INICIANDO PRUEBAS DE MÓDULO FINANCIERO (FASE 4) ---');

  // 1. Set up initial data
  const org = (await db.select().from(organizations).limit(1))[0];
  if (!org) throw new Error("No hay organizaciones en BD");

  let testUser = (await db.select().from(users).where(eq(users.uid, 'FIN-TEST-UID')).limit(1))[0];
  if (!testUser) {
    const { getOrCreateUser } = await import('../src/db/users.ts');
    testUser = await getOrCreateUser('FIN-TEST-UID', 'test@finance.org', 'Test User', 'MANAGER');
  }

  await db.delete(projects).where(eq(projects.code, 'FIN-TEST-1'));
  let testProject = (await db.select().from(projects).where(eq(projects.code, 'FIN-TEST-1')).limit(1))[0];
  if (!testProject) {
    [testProject] = await db.insert(projects).values({
      tenantId: testUser.tenantId,
      name: 'Test Project Finance',
      code: 'FIN-TEST-1',
      status: 'PLANIFICACIÓN',
      riskLevel: 'BAJO',
      approvedBudget: 10000,
      baseCurrency: 'USD'
    }).returning();
  }

  let testVersion = (await db.select().from(budgetVersions).where(eq(budgetVersions.projectId, testProject.id)).limit(1))[0];
  if (!testVersion) {
    [testVersion] = await db.insert(budgetVersions).values({
      projectId: testProject.id,
      tenantId: testUser.tenantId,
      versionName: 'Initial Budget',
      status: 'APPROVED',
      versionNumber: 1,
      totalAmount: 10000
    }).returning();
  }

  let testBudgetLine = (await db.select().from(budgetLines).where(eq(budgetLines.projectId, testProject.id)).limit(1))[0];
  if (!testBudgetLine) {
    [testBudgetLine] = await db.insert(budgetLines).values({
      projectId: testProject.id,
      budgetVersionId: testVersion.id,
      code: '1.1.1',
      category: 'Test Category',
      subcategory: 'Test Subcategory',
      approvedAmount: 5000,
      reformulatedAmount: 5000,
      executedAmount: 0,
      balance: 5000,
    }).returning();
  } else {
    // Reset executedAmount for clean test
    await db.update(budgetLines).set({ executedAmount: 0 }).where(eq(budgetLines.id, testBudgetLine.id));
    testBudgetLine.executedAmount = 0;
  }
  
  // Clean up any previous expenses for this project
  await db.delete(expenses).where(eq(expenses.projectId, testProject.id));

  console.log(`\n[Setup] Proyecto ID: ${testProject.id}, Partida ID: ${testBudgetLine.id} (Ejecutado inicial: 0)`);

  const API_URL = 'http://localhost:3000/api';
  const opToken = 'Bearer demo-uid-FIN-TEST-UID-role-OPERATIVO';
  const mgrToken = 'Bearer demo-uid-FIN-TEST-UID-role-MANAGER';

  // Helper to make requests
  const fetchAPI = async (method: string, path: string, token: string, body?: any) => {
    const res = await fetch(`${API_URL}${path}`, {
      method,
      headers: { 'Authorization': token, 'Content-Type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined
    });
    const data = await res.json();
    return { status: res.status, data };
  };

  try {
    // Caso 1: Gasto en misma moneda base (USD -> USD)
    console.log('\n--- CASO 1: Gasto en misma moneda base (USD) ---');
    const res1 = await fetchAPI('POST', `/projects/${testProject.id}/expenses`, opToken, {
      budgetLineId: testBudgetLine.id,
      originalAmount: 100,
      originalCurrency: 'USD',
      exchangeRate: 1,
      baseAmount: 100,
      date: '2026-06-27',
      description: 'Gasto en USD'
    });
    console.log(`Status: ${res1.status}`);
    const exp1Id = res1.data.id;
    if (res1.status === 200 && res1.data.status === 'PENDING_APPROVAL') {
      console.log('✅ Creado correctamente (Pendiente).');
    } else {
      console.error('❌ Falló la creación', res1.data);
    }

    // Caso 2: Gasto en moneda distinta (EUR -> USD)
    console.log('\n--- CASO 2: Gasto en moneda distinta con tasa ---');
    const res2 = await fetchAPI('POST', `/projects/${testProject.id}/expenses`, opToken, {
      budgetLineId: testBudgetLine.id,
      originalAmount: 100,
      originalCurrency: 'EUR',
      exchangeRate: 1.1,
      baseAmount: 110,
      exchangeRateSource: 'BCE',
      exchangeRateDate: '2026-06-26',
      date: '2026-06-27',
      description: 'Gasto en EUR'
    });
    console.log(`Status: ${res2.status}`);
    const exp2Id = res2.data.id;
    if (res2.status === 200 && res2.data.baseAmount === 110) {
      console.log('✅ Creado correctamente con conversión aplicada.');
    } else {
      console.error('❌ Falló la creación', res2.data);
    }

    // Caso 3: Restricción RBAC para aprobación (Operativo intentando aprobar)
    console.log('\n--- CASO 3: Restricción RBAC para aprobación ---');
    const res3 = await fetchAPI('PATCH', `/expenses/${exp1Id}/approve`, opToken, { status: 'APPROVED' });
    if (res3.status === 403) {
      console.log('✅ Bloqueo RBAC exitoso para rol operativo:', res3.data.error);
    } else {
      console.error('❌ Falló el bloqueo RBAC, status:', res3.status);
    }

    // Caso 4: Aprobación con impacto en la línea presupuestaria
    console.log('\n--- CASO 4: Aprobación con impacto en partida ---');
    const res4 = await fetchAPI('PATCH', `/expenses/${exp1Id}/approve`, mgrToken, { status: 'APPROVED' });
    if (res4.status === 200) {
      console.log('✅ Gasto 1 aprobado por MANAGER.');
      
      // Verificar recálculo
      const bl = (await db.select().from(budgetLines).where(eq(budgetLines.id, testBudgetLine.id)).limit(1))[0];
      if (Number(bl.executedAmount) === 100) {
         console.log('✅ executedAmount actualizado correctamente a 100.');
      } else {
         console.error('❌ executedAmount incorrecto:', bl.executedAmount);
      }
    } else {
      console.error('❌ Falló la aprobación', res4.data);
    }

    // Caso 5: Rechazo / Revocación con recálculo correcto
    console.log('\n--- CASO 5: Rechazo con recálculo (Gasto 2) ---');
    
    // Primero lo aprobamos para subir el ejecutado a 210 (100 + 110)
    await fetchAPI('PATCH', `/expenses/${exp2Id}/approve`, mgrToken, { status: 'APPROVED' });
    const blMiddle = (await db.select().from(budgetLines).where(eq(budgetLines.id, testBudgetLine.id)).limit(1))[0];
    console.log(`-> Tras aprobar gasto 2, executedAmount es: ${blMiddle.executedAmount} (Debería ser 210)`);
    
    // Ahora lo rechazamos (debe bajar a 100)
    const res5 = await fetchAPI('PATCH', `/expenses/${exp2Id}/approve`, mgrToken, { status: 'REJECTED' });
    if (res5.status === 200) {
      console.log('✅ Gasto 2 rechazado.');
      const blFinal = (await db.select().from(budgetLines).where(eq(budgetLines.id, testBudgetLine.id)).limit(1))[0];
      if (Number(blFinal.executedAmount) === 100) {
         console.log('✅ executedAmount re-calculado correctamente a 100.');
      } else {
         console.error('❌ executedAmount incorrecto tras rechazo:', blFinal.executedAmount);
      }
    }

    // Caso 6: Revisión del dashboard global
    console.log('\n--- CASO 6: Dashboard global con trazabilidad ---');
    const res6 = await fetchAPI('GET', `/expenses?projectId=${testProject.id}`, mgrToken);
    if (res6.status === 200 && res6.data.length === 2) {
       console.log('✅ GET /api/expenses devuelve la lista correctamente.');
       console.log('Gastos listados:', res6.data.map((e: any) => `[${e.status}] Monto: ${e.originalAmount} ${e.originalCurrency} -> Base: $${e.baseAmount}`));
    } else {
       console.error('❌ Falló listar gastos', res6.status, res6.data);
    }

  } catch (e) {
    console.error('Error durante la prueba:', e);
  } finally {
    process.exit(0);
  }
}

runTest();
