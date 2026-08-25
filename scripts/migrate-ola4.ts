import 'dotenv/config';
import { db } from '../src/db/index.ts';
import { sql } from 'drizzle-orm';

async function migrateOla4() {
  console.log('[Migración Ola 4] Aplicando DDL aditivo para generated_reports y users.donor_id...');

  // 1. users.donor_id
  await db.execute(sql`
    ALTER TABLE users ADD COLUMN IF NOT EXISTS donor_id INTEGER REFERENCES donors(id);
  `);
  console.log('  ✅ users.donor_id verificado.');

  // 2. generated_reports table
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS generated_reports (
      id SERIAL PRIMARY KEY,
      tenant_id INTEGER NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      project_id INTEGER REFERENCES projects(id) ON DELETE CASCADE,
      report_type VARCHAR(50) NOT NULL,
      version_number INTEGER NOT NULL DEFAULT 1,
      status VARCHAR(30) NOT NULL DEFAULT 'DRAFT',
      parameters JSONB NOT NULL DEFAULT '{}'::jsonb,
      snapshot_data JSONB NOT NULL DEFAULT '{}'::jsonb,
      content_markdown TEXT NOT NULL,
      pdf_sha256 VARCHAR(64),
      csv_sha256 VARCHAR(64),
      analysis_mode VARCHAR(50) DEFAULT 'PRIMARY_AI_PROVIDER',
      requires_human_review BOOLEAN NOT NULL DEFAULT true,
      created_by INTEGER NOT NULL REFERENCES users(id),
      approved_by INTEGER REFERENCES users(id),
      approved_at TIMESTAMP WITH TIME ZONE,
      created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
      CONSTRAINT chk_version_positive CHECK (version_number > 0),
      CONSTRAINT chk_report_status CHECK (status IN ('DRAFT', 'PENDING_REVIEW', 'APPROVED', 'SUPERSEDED')),
      CONSTRAINT chk_report_type CHECK (report_type IN ('FINANCIAL', 'EXECUTIVE', 'COMPLIANCE'))
    );
  `);
  console.log('  ✅ Tabla generated_reports creada con CHECK constraints.');

  // 3. Partial unique indexes and performance indexes
  await db.execute(sql`
    CREATE UNIQUE INDEX IF NOT EXISTS uq_gen_reports_proj 
    ON generated_reports (tenant_id, project_id, report_type, version_number) 
    WHERE project_id IS NOT NULL;
  `);

  await db.execute(sql`
    CREATE UNIQUE INDEX IF NOT EXISTS uq_gen_reports_tenant 
    ON generated_reports (tenant_id, report_type, version_number) 
    WHERE project_id IS NULL;
  `);

  await db.execute(sql`
    CREATE INDEX IF NOT EXISTS idx_gen_reports_tenant_status 
    ON generated_reports (tenant_id, status);
  `);

  await db.execute(sql`
    CREATE INDEX IF NOT EXISTS idx_gen_reports_created 
    ON generated_reports (created_at);
  `);
  console.log('  ✅ Índices parciales únicos y de búsqueda creados.');

  console.log('[Migración Ola 4] Migración completada exitosamente.');
  process.exit(0);
}

migrateOla4().catch((err) => {
  console.error('❌ Error en migración Ola 4:', err);
  process.exit(1);
});
