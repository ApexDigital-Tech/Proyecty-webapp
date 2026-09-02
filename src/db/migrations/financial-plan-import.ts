import { db } from '../index.ts';
import { sql } from 'drizzle-orm';

const statements = [
  `ALTER TABLE donors ADD COLUMN IF NOT EXISTS code text`,
  `CREATE TABLE IF NOT EXISTS budget_plans (
    id serial PRIMARY KEY NOT NULL,
    tenant_id integer REFERENCES organizations(id) ON DELETE cascade,
    project_id integer NOT NULL REFERENCES projects(id) ON DELETE cascade,
    title text NOT NULL,
    period text DEFAULT 'Anual' NOT NULL,
    fiscal_year integer DEFAULT 2026 NOT NULL,
    status text DEFAULT 'ACTIVE' NOT NULL,
    created_at timestamp DEFAULT now()
  )`,
  `ALTER TABLE budget_versions ADD COLUMN IF NOT EXISTS tenant_id integer REFERENCES organizations(id) ON DELETE cascade`,
  `ALTER TABLE budget_versions ADD COLUMN IF NOT EXISTS budget_plan_id integer REFERENCES budget_plans(id)`,
  `ALTER TABLE budget_versions ADD COLUMN IF NOT EXISTS version_number integer DEFAULT 1 NOT NULL`,
  `ALTER TABLE budget_versions ADD COLUMN IF NOT EXISTS status text DEFAULT 'DRAFT' NOT NULL`,
  `UPDATE budget_versions bv SET tenant_id = p.tenant_id FROM projects p WHERE bv.project_id = p.id AND bv.tenant_id IS NULL`,
  `UPDATE budget_plans bp SET tenant_id = p.tenant_id FROM projects p WHERE bp.project_id = p.id AND bp.tenant_id IS NULL`,
  `ALTER TABLE budget_plans ALTER COLUMN tenant_id SET NOT NULL`,
  `ALTER TABLE budget_versions ALTER COLUMN tenant_id SET NOT NULL`,
  `ALTER TABLE budget_lines ADD COLUMN IF NOT EXISTS description text`,
  `ALTER TABLE budget_lines ADD COLUMN IF NOT EXISTS unit text DEFAULT 'Unidad' NOT NULL`,
  `ALTER TABLE budget_lines ADD COLUMN IF NOT EXISTS quantity double precision DEFAULT 1 NOT NULL`,
  `ALTER TABLE budget_lines ADD COLUMN IF NOT EXISTS unit_cost double precision DEFAULT 0 NOT NULL`,
  `ALTER TABLE budget_lines ADD COLUMN IF NOT EXISTS currency text DEFAULT 'USD' NOT NULL`,
  `CREATE TABLE IF NOT EXISTS import_batches (
    id serial PRIMARY KEY NOT NULL,
    tenant_id integer NOT NULL REFERENCES organizations(id) ON DELETE cascade,
    project_id integer REFERENCES projects(id) ON DELETE cascade,
    type text NOT NULL,
    file_name text NOT NULL,
    file_hash text NOT NULL,
    total_rows integer DEFAULT 0 NOT NULL,
    valid_rows integer DEFAULT 0 NOT NULL,
    rejected_rows integer DEFAULT 0 NOT NULL,
    total_amount double precision DEFAULT 0 NOT NULL,
    status text DEFAULT 'PENDING' NOT NULL,
    created_version_id integer REFERENCES budget_versions(id),
    created_by integer NOT NULL REFERENCES users(id),
    created_at timestamp DEFAULT now()
  )`,
  `CREATE TABLE IF NOT EXISTS import_rows (
    id serial PRIMARY KEY NOT NULL,
    batch_id integer NOT NULL REFERENCES import_batches(id) ON DELETE cascade,
    row_number integer NOT NULL,
    status text DEFAULT 'VALID' NOT NULL,
    external_id text,
    row_data jsonb NOT NULL,
    row_hash text,
    created_at timestamp DEFAULT now()
  )`,
  `CREATE TABLE IF NOT EXISTS import_errors (
    id serial PRIMARY KEY NOT NULL,
    batch_id integer NOT NULL REFERENCES import_batches(id) ON DELETE cascade,
    row_number integer NOT NULL,
    field text NOT NULL,
    error_message text NOT NULL,
    created_at timestamp DEFAULT now()
  )`,
  `CREATE INDEX IF NOT EXISTS idx_budget_plans_project ON budget_plans(project_id)`,
  `CREATE INDEX IF NOT EXISTS idx_import_batches_project ON import_batches(project_id)`,
  `CREATE INDEX IF NOT EXISTS idx_import_batches_hash ON import_batches(file_hash)`,
  `CREATE UNIQUE INDEX IF NOT EXISTS idx_import_batches_project_hash_active ON import_batches(project_id, file_hash) WHERE status <> 'REJECTED'`,
  `CREATE INDEX IF NOT EXISTS idx_import_rows_batch ON import_rows(batch_id)`,
  `CREATE INDEX IF NOT EXISTS idx_import_errors_batch ON import_errors(batch_id)`,
  `DO $$ BEGIN IF NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = 'authenticated') THEN CREATE ROLE authenticated; END IF; END $$`,
  `GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE organizations, users, donors, projects, agreements, budget_plans, budget_versions, budget_lines, import_batches, import_rows, import_errors, audit_logs TO authenticated`,
  `GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO authenticated`,
  `ALTER TABLE budget_plans ENABLE ROW LEVEL SECURITY`,
  `ALTER TABLE import_batches ENABLE ROW LEVEL SECURITY`,
  `ALTER TABLE import_rows ENABLE ROW LEVEL SECURITY`,
  `ALTER TABLE import_errors ENABLE ROW LEVEL SECURITY`,
  `DROP POLICY IF EXISTS tenant_isolation_budget_plans ON budget_plans`,
  `CREATE POLICY tenant_isolation_budget_plans ON budget_plans FOR ALL TO authenticated USING (tenant_id = current_setting('app.current_tenant', true)::int)`,
  `DROP POLICY IF EXISTS tenant_isolation_import_batches ON import_batches`,
  `CREATE POLICY tenant_isolation_import_batches ON import_batches FOR ALL TO authenticated USING (tenant_id = current_setting('app.current_tenant', true)::int)`,
  `DROP POLICY IF EXISTS tenant_isolation_import_rows ON import_rows`,
  `CREATE POLICY tenant_isolation_import_rows ON import_rows FOR ALL TO authenticated USING (EXISTS (SELECT 1 FROM import_batches b WHERE b.id = import_rows.batch_id AND b.tenant_id = current_setting('app.current_tenant', true)::int))`,
  `DROP POLICY IF EXISTS tenant_isolation_import_errors ON import_errors`,
  `CREATE POLICY tenant_isolation_import_errors ON import_errors FOR ALL TO authenticated USING (EXISTS (SELECT 1 FROM import_batches b WHERE b.id = import_errors.batch_id AND b.tenant_id = current_setting('app.current_tenant', true)::int))`,
];

export async function applyFinancialPlanImportSchema(): Promise<void> {
  for (const statement of statements) {
    await db.execute(sql.raw(statement));
  }
}
