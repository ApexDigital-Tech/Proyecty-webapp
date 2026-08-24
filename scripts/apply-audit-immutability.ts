import 'dotenv/config';
import { db } from '../src/db/index.ts';
import { sql } from 'drizzle-orm';

export async function applyAuditLogsImmutability() {
  console.log('🔒 Aplicando reglas de inmutabilidad estricta a audit_logs en PostgreSQL...');
  
  await db.execute(sql`
    CREATE OR REPLACE FUNCTION prevent_audit_logs_mutation()
    RETURNS TRIGGER AS $$
    BEGIN
      RAISE EXCEPTION 'permission denied: audit_logs table is immutable and cannot be updated, deleted or truncated';
    END;
    $$ LANGUAGE plpgsql;
  `);

  await db.execute(sql`
    DROP TRIGGER IF EXISTS trg_audit_logs_immutable_update ON audit_logs;
    CREATE TRIGGER trg_audit_logs_immutable_update
    BEFORE UPDATE OR DELETE ON audit_logs
    FOR EACH ROW
    EXECUTE FUNCTION prevent_audit_logs_mutation();
  `);

  await db.execute(sql`
    DROP TRIGGER IF EXISTS trg_audit_logs_immutable_truncate ON audit_logs;
    CREATE TRIGGER trg_audit_logs_immutable_truncate
    BEFORE TRUNCATE ON audit_logs
    FOR EACH STATEMENT
    EXECUTE FUNCTION prevent_audit_logs_mutation();
  `);

  console.log('✅ Triggers de inmutabilidad activados en PostgreSQL.');
}

if (process.argv[1]?.includes('apply-audit-immutability')) {
  applyAuditLogsImmutability()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error('Error aplicando inmutabilidad:', err);
      process.exit(1);
    });
}
