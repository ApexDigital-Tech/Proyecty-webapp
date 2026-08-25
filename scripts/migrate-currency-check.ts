/**
 * Migración: CHECK constraint monetaria en PostgreSQL
 * Observación Auditoría v1.5.1 — Whitelist BOB/USD/EUR a nivel de base de datos
 * 
 * Aplica CHECK constraints no destructivas a todos los campos de divisa:
 *   - projects.base_currency
 *   - agreements.currency
 *   - expenses.currency
 *   - expenses.original_currency (nullable, permite NULL)
 *   - receipts_vouchers.currency
 * 
 * Ejecución: npx tsx scripts/migrate-currency-check.ts
 */
import 'dotenv/config';
import { db } from '../src/db/index.ts';
import { sql } from 'drizzle-orm';

const ALLOWED = `'BOB','USD','EUR'`;

interface ConstraintDef {
  table: string;
  column: string;
  nullable: boolean;
}

const TARGETS: ConstraintDef[] = [
  { table: 'projects',          column: 'base_currency',    nullable: false },
  { table: 'agreements',        column: 'currency',         nullable: false },
  { table: 'expenses',          column: 'currency',         nullable: false },
  { table: 'expenses',          column: 'original_currency', nullable: true },
  { table: 'receipts_vouchers', column: 'currency',         nullable: false },
];

async function migrateCurrencyChecks(): Promise<void> {
  console.log('=== Migración: CHECK constraints monetarias ===\n');

  // 1. Pre-vuelo: detectar datos existentes que violarían la restricción
  let violations = 0;
  for (const t of TARGETS) {
    const condition = t.nullable
      ? `${t.column} IS NOT NULL AND ${t.column} NOT IN (${ALLOWED})`
      : `${t.column} NOT IN (${ALLOWED})`;

    const result = await db.execute(
      sql.raw(`SELECT COUNT(*) AS cnt FROM ${t.table} WHERE ${condition}`)
    );
    const count = Number((result as any).rows?.[0]?.cnt ?? (result as any)[0]?.cnt ?? 0);
    if (count > 0) {
      console.error(`❌ ${t.table}.${t.column}: ${count} filas con divisas fuera de whitelist`);
      violations += count;
    } else {
      console.log(`✅ ${t.table}.${t.column}: sin violaciones`);
    }
  }

  if (violations > 0) {
    console.error(`\n⛔ ${violations} violaciones detectadas. Corrija los datos antes de aplicar constraints.`);
    process.exit(1);
  }

  // 2. Aplicar constraints de forma idempotente (DROP IF EXISTS + ADD)
  console.log('\nAplicando CHECK constraints...\n');

  for (const t of TARGETS) {
    const constraintName = `chk_${t.table}_${t.column}_whitelist`;
    const checkExpr = t.nullable
      ? `${t.column} IS NULL OR ${t.column} IN (${ALLOWED})`
      : `${t.column} IN (${ALLOWED})`;

    // DROP idempotente
    await db.execute(
      sql.raw(`ALTER TABLE ${t.table} DROP CONSTRAINT IF EXISTS ${constraintName}`)
    );

    // ADD
    await db.execute(
      sql.raw(`ALTER TABLE ${t.table} ADD CONSTRAINT ${constraintName} CHECK (${checkExpr})`)
    );

    console.log(`✅ ${t.table}.${t.column} → ${constraintName}`);
  }

  // 3. Verificación: intentar INSERT con divisa inválida en tabla temporal
  console.log('\nVerificación funcional...');
  try {
    await db.execute(sql.raw(`
      INSERT INTO projects (tenant_id, name, base_currency)
      VALUES (1, '__CHECK_TEST__', 'MXN')
    `));
    // Si llega aquí, la constraint no funcionó
    await db.execute(sql.raw(`DELETE FROM projects WHERE name = '__CHECK_TEST__'`));
    console.error('❌ La constraint no rechazó MXN — revisar manualmente');
    process.exit(1);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes('chk_projects_base_currency_whitelist')) {
      console.log('✅ PostgreSQL rechazó correctamente INSERT con MXN');
    } else {
      // Puede fallar por otra razón (FK, NOT NULL, etc.)
      console.log(`⚠️ INSERT rechazado por otra razón: ${msg.substring(0, 120)}`);
      console.log('   Verifique manualmente que la constraint existe.');
    }
  }

  console.log('\n=== Migración completada ===');
}

migrateCurrencyChecks().catch((err) => {
  console.error('Error fatal en migración:', err);
  process.exit(1);
});
