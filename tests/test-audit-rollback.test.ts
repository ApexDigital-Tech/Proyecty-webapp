import 'dotenv/config';
import { db } from '../src/db/index.ts';
import { sql } from 'drizzle-orm';
import { createExpense, approveExpense } from '../src/services/expenses.service.ts';
import { getOrCreateDemoTenant, resetDemoTenantData } from '../src/services/demoTenant.service.ts';
import { budgetLines, expenses, auditLogs } from '../src/db/schema.ts';
import { eq } from 'drizzle-orm';

async function testRollback() {
  console.log('🧪 Iniciando prueba de Rollback Financiero (P1)');
  
  await resetDemoTenantData();
  const { orgId, users } = await getOrCreateDemoTenant();
  const manager = users.find(u => u.roleKey === 'MANAGER') || users[1];
  const director = users.find(u => u.roleKey === 'DIRECTOR') || users[0];

  const { projects } = await import('../src/db/schema.ts');
  const [project] = await db.select().from(projects).where(eq(projects.tenantId, orgId)).limit(1);
  const initialBudgetLine = await db.select().from(budgetLines).where(eq(budgetLines.projectId, project.id)).limit(1);
  const bLine = initialBudgetLine[0];

  // 1. Estado inicial
  const expense = await createExpense(orgId, manager.dbId, {
    title: 'Gasto de prueba rollback',
    amount: 100.0,
    category: 'Pruebas',
    projectId: bLine.projectId!,
    budgetLineId: bLine.id,
  });

  const [budgetBefore] = await db.select().from(budgetLines).where(eq(budgetLines.id, bLine.id));

  // 2. Inyectar trigger malicioso en audit_logs
  await db.execute(sql`
    CREATE OR REPLACE FUNCTION trigger_fail_audit() RETURNS trigger AS $$
    BEGIN
      IF NEW.action = 'EXPENSE_APPROVED' THEN
        RAISE EXCEPTION 'Simulated Audit Failure';
      END IF;
      RETURN NEW;
    END;
    $$ LANGUAGE plpgsql;

    CREATE TRIGGER fail_audit_trigger
    BEFORE INSERT ON audit_logs
    FOR EACH ROW EXECUTE FUNCTION trigger_fail_audit();
  `);

  let errorThrown = false;
  try {
    // 3. Intentar aprobar (esto debería insertar un log y detonar el trigger, causando ROLLBACK)
    await approveExpense(orgId, expense.id, director.dbId, 'approved');
  } catch (err: any) {
    console.log('✅ Operación devolvió error:', err.message);
    errorThrown = true;
  } finally {
    // 5. Retirar trigger
    await db.execute(sql`
      DROP TRIGGER IF EXISTS fail_audit_trigger ON audit_logs;
      DROP FUNCTION IF EXISTS trigger_fail_audit();
    `);
  }

  // 4. Comprobaciones
  if (!errorThrown) {
    console.error('❌ La operación no devolvió error.');
    process.exit(1);
  } else {
    console.log('✅ Fallo de audit_logs provocado');
  }

  const [expenseAfter] = await db.select().from(expenses).where(eq(expenses.id, expense.id));
  if (expenseAfter.status !== 'pending') {
    console.error('❌ El gasto no conservó su estado anterior (pending). Estado actual:', expenseAfter.status);
    process.exit(1);
  }
  console.log(`Estado del gasto antes/después: pending / ${expenseAfter.status}`);

  const [budgetAfter] = await db.select().from(budgetLines).where(eq(budgetLines.id, bLine.id));
  if (budgetAfter.executedAmount.toString() !== budgetBefore.executedAmount.toString()) {
    const spentDiff = budgetAfter.executedAmount - budgetBefore.executedAmount;
    console.log(`❌ Rollback Failed - executedAmount antes/después: ${budgetBefore.executedAmount} / ${budgetAfter.executedAmount}`);
    process.exit(1);
  }
  console.log(`executedAmount antes/después: ${budgetBefore.executedAmount} / ${budgetAfter.executedAmount}`);

  const logs = await db.select().from(auditLogs).where(eq(auditLogs.entityId, expense.id.toString()));
  const hasApproveLog = logs.some(l => l.action === 'EXPENSE_APPROVED');
  if (hasApproveLog) {
    console.error('❌ Existe log parcial de EXPENSE_APPROVED a pesar del rollback.');
    process.exit(1);
  }
  
  console.log('✅ Rollback confirmado: la transacción se revirtió atómicamente al fallar el log de auditoría.');
  console.log('Código de salida: 0');
}

testRollback().then(() => process.exit(0)).catch((err) => {
  console.error('Fatal error', err);
  process.exit(1);
});
