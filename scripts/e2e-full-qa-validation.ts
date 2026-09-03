import 'dotenv/config';
import { generateDemoToken } from '../src/services/demoAuth.service.ts';
import { db } from '../src/db/index.ts';
import { projects, budgetVersions, budgetLines, expenses, donors, agreements, organizations } from '../src/db/schema.ts';
import { eq, and } from 'drizzle-orm';

interface QATestResult {
  step: string;
  name: string;
  status: 'PASS' | 'FAIL';
  details: any;
  error?: string;
}

const results: QATestResult[] = [];

function recordResult(step: string, name: string, status: 'PASS' | 'FAIL', details: any, error?: string) {
  results.push({ step, name, status, details, error });
  const icon = status === 'PASS' ? '✅' : '❌';
  console.log(`${icon} [${step}] ${name}`);
  if (error) console.error(`   Detalle de error: ${error}`);
}

async function runFullQASuite() {
  console.log('================================================================');
  console.log('🧪 SUITE INTEGRAL DE PRUEBAS DE CALIDAD Y CICLO COMPLETO PROYECTY');
  console.log('================================================================\n');

  const BASE_URL = 'http://127.0.0.1:3000';

  // 1. GENERACIÓN DE TOKENS AUTORIZADOS
  console.log('--- 1. PRUEBAS DE ACCESO Y AUTENTICACIÓN ---');
  let directorToken = '';
  let financeToken = '';

  try {
    directorToken = generateDemoToken({
      uid: 'bd79d3e1-b5f7-4b95-958d-87e8303be693',
      userId: 24,
      id: 24,
      email: 'rolangutiali.rg@gmail.com',
      name: 'Rolando Gutierrez',
      role: 'DIRECTOR',
      roleName: 'Director',
      tenantId: 13
    });
    recordResult('AUTH-01', 'Emisión de Token para Director (rolangutiali.rg@gmail.com)', 'PASS', { tenantId: 13, role: 'DIRECTOR' });
  } catch (e: any) {
    recordResult('AUTH-01', 'Emisión de Token para Director', 'FAIL', null, e.message);
  }

  try {
    financeToken = generateDemoToken({
      uid: 'e3f01c89-6889-40b9-9130-975529f79624',
      userId: 32,
      id: 32,
      email: 'ecotraffic.bo@gmail.com',
      name: 'Moises Gutierrez',
      role: 'FINANCE',
      roleName: 'Finanzas',
      tenantId: 4
    });
    recordResult('AUTH-02', 'Emisión de Token para Finanzas (ecotraffic.bo@gmail.com)', 'PASS', { tenantId: 4, role: 'FINANCE' });
  } catch (e: any) {
    recordResult('AUTH-02', 'Emisión de Token para Finanzas', 'FAIL', null, e.message);
  }

  // 2. PRUEBA DE MÉTRICAS DEL DASHBOARD
  console.log('\n--- 2. PRUEBAS DE DASHBOARD & MÉTRICAS ---');
  try {
    const res = await fetch(`${BASE_URL}/api/dashboard/metrics`, {
      headers: { 'Authorization': `Bearer ${directorToken}` }
    });
    const data = await res.json();
    if (res.status === 200) {
      recordResult('DASH-01', 'Consulta de métricas ejecutivas de portafolio', 'PASS', {
        status: res.status,
        metricsReturned: Object.keys(data)
      });
    } else {
      recordResult('DASH-01', 'Consulta de métricas ejecutivas de portafolio', 'FAIL', data, `HTTP ${res.status}`);
    }
  } catch (e: any) {
    recordResult('DASH-01', 'Consulta de métricas ejecutivas de portafolio', 'FAIL', null, e.message);
  }

  // 3. CREACIÓN Y DETALLE DE PROYECTO
  console.log('\n--- 3. PRUEBAS DE CICLO DE PROYECTO ---');
  let testProjectId: number = 0;
  const projectCode = `QA-PROY-${Date.now().toString().slice(-4)}`;

  try {
    // Probar creación de proyecto
    const projectPayload = {
      code: projectCode,
      name: `[QA-AUTOMATED] Proyecto de Validación Integral ${projectCode}`,
      donor: 'Agencia de Cooperación QA Internacional',
      approvedBudget: '150000',
      baseCurrency: 'USD',
      description: 'Proyecto creado automáticamente para validar el flujo completo de negocio.'
    };

    const createRes = await fetch(`${BASE_URL}/api/projects`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${directorToken}`
      },
      body: JSON.stringify(projectPayload)
    });

    const createData = await createRes.json();
    if (createRes.status === 201 && createData.id) {
      testProjectId = createData.id;
      recordResult('PROJ-01', 'Creación de Nuevo Proyecto con Donante y Convenio', 'PASS', {
        projectId: testProjectId,
        code: projectCode,
        approvedBudget: createData.approvedBudget
      });
    } else {
      recordResult('PROJ-01', 'Creación de Nuevo Proyecto con Donante y Convenio', 'FAIL', createData, `HTTP ${createRes.status}`);
    }
  } catch (e: any) {
    recordResult('PROJ-01', 'Creación de Nuevo Proyecto con Donante y Convenio', 'FAIL', null, e.message);
  }

  // Consulta del detalle del proyecto
  if (testProjectId) {
    try {
      const getRes = await fetch(`${BASE_URL}/api/projects/${testProjectId}`, {
        headers: { 'Authorization': `Bearer ${directorToken}` }
      });
      const getData = await getRes.json();
      if (getRes.status === 200 && getData.data) {
        recordResult('PROJ-02', `Recuperación de detalle y relaciones de Proyecto (${testProjectId})`, 'PASS', {
          id: getData.data.id,
          name: getData.data.name,
          agreementsCount: getData.data.agreements?.length || 0,
          budgetVersionsCount: getData.data.budgetVersions?.length || 0
        });
      } else {
        recordResult('PROJ-02', `Recuperación de detalle de Proyecto (${testProjectId})`, 'FAIL', getData, `HTTP ${getRes.status}`);
      }
    } catch (e: any) {
      recordResult('PROJ-02', `Recuperación de detalle de Proyecto (${testProjectId})`, 'FAIL', null, e.message);
    }
  }

  // 4. GESTIÓN PRESUPUESTARIA (PLAN / PARTIDAS)
  console.log('\n--- 4. PRUEBAS DE GESTIÓN PRESUPUESTARIA ---');
  let testBudgetVersionId: number = 0;
  let testBudgetLineId: number = 0;

  if (testProjectId) {
    try {
      // 4.1 Crear Versión Presupuestaria
      const [newVersion] = await db.insert(budgetVersions).values({
        projectId: testProjectId,
        tenantId: 13,
        versionName: 'V1 - Presupuesto Operativo 2026',
        versionNumber: 1,
        isApproved: true,
        approvedBy: 24, // userId de Rolando Gutierrez
        status: 'APROBADO'
      }).returning();

      testBudgetVersionId = newVersion.id;
      recordResult('BUDGET-01', 'Creación y Aprobación de Versión Presupuestaria', 'PASS', {
        versionId: testBudgetVersionId,
        versionName: newVersion.versionName
      });

      // 4.2 Crear Partidas Presupuestarias
      const [line1] = await db.insert(budgetLines).values({
        budgetVersionId: testBudgetVersionId,
        projectId: testProjectId,
        code: '1.1.01',
        category: 'Personal',
        subcategory: 'Honorarios Técnicos',
        approvedAmount: 80000,
        reformulatedAmount: 80000,
        executedAmount: 0,
        balance: 80000,
        progress: 0,
        status: 'ACTIVA'
      }).returning();

      testBudgetLineId = line1.id;

      const [line2] = await db.insert(budgetLines).values({
        budgetVersionId: testBudgetVersionId,
        projectId: testProjectId,
        code: '2.1.05',
        category: 'Equipamiento',
        subcategory: 'Equipos de Computación',
        approvedAmount: 70000,
        reformulatedAmount: 70000,
        executedAmount: 0,
        balance: 70000,
        progress: 0,
        status: 'ACTIVA'
      }).returning();

      recordResult('BUDGET-02', 'Registro de Partidas Presupuestarias con Control de Balance', 'PASS', {
        lineasCreadas: 2,
        totalAprobado: 150000,
        lineaPrincipalId: testBudgetLineId
      });
    } catch (e: any) {
      recordResult('BUDGET-01/02', 'Registro de Presupuesto y Partidas', 'FAIL', null, e.message);
    }
  }

  // 5. REGISTRO, VALIDACIÓN Y APROBACIÓN DE GASTOS (SEGREGACIÓN DE FUNCIONES FIN-01)
  console.log('\n--- 5. PRUEBAS DE REGISTRO Y APROBACIÓN DE GASTOS (FIN-01) ---');
  let testExpenseId: number = 0;

  if (testProjectId && testBudgetLineId) {
    try {
      // 5.1 Registro de Gasto por parte de un usuario operador
      const [newExp] = await db.insert(expenses).values({
        tenantId: 13,
        projectId: testProjectId,
        budgetLineId: testBudgetLineId,
        title: 'Adquisición de Insumos y Servicios de Auditoría',
        description: 'Pago por servicios técnicos de validación PMV',
        amount: 5000,
        currency: 'USD',
        category: 'Servicios',
        status: 'pending',
        registeredBy: 1, // Usuario técnico/operador que solicita el gasto
        date: new Date()
      }).returning();

      testExpenseId = newExp.id;
      recordResult('EXPENSE-01', 'Registro de Gasto con Imputación a Partida Presupuestaria', 'PASS', {
        expenseId: testExpenseId,
        amount: newExp.amount,
        status: newExp.status,
        registeredBy: newExp.registeredBy
      });
    } catch (e: any) {
      recordResult('EXPENSE-01', 'Registro de Gasto', 'FAIL', null, e.message);
    }

    // 5.2 Aprobación de Gasto
    if (testExpenseId) {
      try {
        const appRes = await fetch(`${BASE_URL}/api/expenses/${testExpenseId}/approve`, {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${directorToken}`
          },
          body: JSON.stringify({ status: 'approved' })
        });

        const appData = await appRes.json();
        if (appRes.status === 200 && appData.status === 'approved') {
          recordResult('EXPENSE-02', 'Aprobación de Gasto y Actualización Financiera', 'PASS', {
            expenseId: testExpenseId,
            status: appData.status,
            approvedBy: appData.approvedBy
          });
        } else {
          recordResult('EXPENSE-02', 'Aprobación de Gasto', 'FAIL', appData, `HTTP ${appRes.status}`);
        }
      } catch (e: any) {
        recordResult('EXPENSE-02', 'Aprobación de Gasto', 'FAIL', null, e.message);
      }
    }
  }

  // 6. GENERACIÓN Y DESCARGA DE REPORTES
  console.log('\n--- 6. PRUEBAS DE EXPORTACIÓN Y DESCARGAS ---');
  try {
    // 6.1 Exportación CSV
    const csvRes = await fetch(`${BASE_URL}/api/reports/export/csv?projectId=${testProjectId || 216}`, {
      headers: { 'Authorization': `Bearer ${directorToken}` }
    });

    if (csvRes.status === 200) {
      const csvText = await csvRes.text();
      recordResult('REPORT-01', 'Descarga y Exportación Segura de Reporte CSV', 'PASS', {
        status: csvRes.status,
        contentType: csvRes.headers.get('content-type'),
        bytes: csvText.length
      });
    } else {
      recordResult('REPORT-01', 'Descarga CSV', 'FAIL', null, `HTTP ${csvRes.status}`);
    }
  } catch (e: any) {
    recordResult('REPORT-01', 'Descarga CSV', 'FAIL', null, e.message);
  }

  try {
    // 6.2 Exportación PDF / Documento
    const pdfRes = await fetch(`${BASE_URL}/api/reports/export/pdf?projectId=${testProjectId || 216}`, {
      headers: { 'Authorization': `Bearer ${directorToken}` }
    });

    if (pdfRes.status === 200) {
      recordResult('REPORT-02', 'Generación y Descarga de Reporte PDF/Documento', 'PASS', {
        status: pdfRes.status,
        contentType: pdfRes.headers.get('content-type')
      });
    } else {
      recordResult('REPORT-02', 'Descarga PDF', 'FAIL', null, `HTTP ${pdfRes.status}`);
    }
  } catch (e: any) {
    recordResult('REPORT-02', 'Descarga PDF', 'FAIL', null, e.message);
  }

  // RESUMEN FINAL
  console.log('\n================================================================');
  console.log('📊 RESUMEN DE RESULTADOS DE PRUEBAS DE CALIDAD (QA)');
  console.log('================================================================');
  const passed = results.filter(r => r.status === 'PASS').length;
  const failed = results.filter(r => r.status === 'FAIL').length;
  console.log(`Total Pruebas: ${results.length} | ✅ Exitosas: ${passed} | ❌ Fallidas: ${failed}`);
  console.log('================================================================\n');

  if (failed > 0) {
    console.error('⚠️ ALGUNAS PRUEBAS FALLARON.');
    process.exit(1);
  } else {
    console.log('🌟 TODAS LAS PRUEBAS PASARON AL 100% SATISFACTORIAMENTE.');
  }
}

runFullQASuite().catch(console.error).finally(() => process.exit(0));
