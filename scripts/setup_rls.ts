import 'dotenv/config';
import { Pool } from 'pg';

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

async function run() {
  const client = await pool.connect();
  try {
    // 1. Create indexes
    console.log('1. Creating indexes...');
    const indexQueries = [
      'CREATE INDEX IF NOT EXISTS idx_agreements_project_id ON agreements(project_id);',
      'CREATE INDEX IF NOT EXISTS idx_disbursements_agreement_id ON disbursements(agreement_id);',
      'CREATE INDEX IF NOT EXISTS idx_clauses_agreement_id ON clauses(agreement_id);',
      'CREATE INDEX IF NOT EXISTS idx_budget_lines_project_id ON budget_lines(project_id);',
      'CREATE INDEX IF NOT EXISTS idx_budget_lines_budget_version_id ON budget_lines(budget_version_id);',
      'CREATE INDEX IF NOT EXISTS idx_budget_versions_project_id ON budget_versions(project_id);',
      'CREATE INDEX IF NOT EXISTS idx_expenses_project_id ON expenses(project_id);',
      'CREATE INDEX IF NOT EXISTS idx_expenses_budget_line_id ON expenses(budget_line_id);',
      'CREATE INDEX IF NOT EXISTS idx_receipts_vouchers_expense_id ON receipts_vouchers(expense_id);',
      'CREATE INDEX IF NOT EXISTS idx_receipts_vouchers_project_id ON receipts_vouchers(project_id);',
      'CREATE INDEX IF NOT EXISTS idx_documents_project_id ON documents(project_id);',
      'CREATE INDEX IF NOT EXISTS idx_reports_project_id ON reports(project_id);',
      'CREATE INDEX IF NOT EXISTS idx_indicators_project_id ON indicators(project_id);',
      'CREATE INDEX IF NOT EXISTS idx_audit_logs_tenant_id ON audit_logs(tenant_id);',
      'CREATE INDEX IF NOT EXISTS idx_task_dependencies_task_id ON task_dependencies(task_id);',
      'CREATE INDEX IF NOT EXISTS idx_task_dependencies_depends_on_id ON task_dependencies(depends_on_id);',
      'CREATE INDEX IF NOT EXISTS idx_task_comments_task_id ON task_comments(task_id);',
      'CREATE INDEX IF NOT EXISTS idx_project_logs_project_id ON project_logs(project_id);',
      'CREATE INDEX IF NOT EXISTS idx_event_attendees_event_id ON event_attendees(event_id);',
      'CREATE INDEX IF NOT EXISTS idx_document_analysis_document_id ON document_analysis(document_id);',
      'CREATE INDEX IF NOT EXISTS idx_document_analysis_tenant_id ON document_analysis(tenant_id);'
    ];
    for (const q of indexQueries) {
      await client.query(q);
    }
    console.log('Indexes created successfully.');

    // 2. Enable RLS and create policies
    console.log('2. Enabling RLS and creating policies...');
    const tablesA = ['organizations', 'users', 'donors', 'projects', 'budget_versions', 'expenses', 'documents', 'audit_logs', 'tasks', 'project_logs', 'events', 'document_analysis'];
    
    for (const t of tablesA) {
      await client.query(`ALTER TABLE ${t} ENABLE ROW LEVEL SECURITY;`);
      const col = t === 'organizations' ? 'id' : 'tenant_id';
      await client.query(`DROP POLICY IF EXISTS "tenant_isolation_1hop_${t}" ON ${t};`);
      await client.query(`
        CREATE POLICY "tenant_isolation_1hop_${t}" ON ${t}
        AS PERMISSIVE FOR ALL
        TO authenticated
        USING (
          ${col} = current_setting('app.current_tenant', true)::int
        );
      `);
    }

    const tablesB1Hop = ['project_members', 'agreements', 'budget_lines', 'receipts_vouchers', 'reports', 'indicators'];
    for (const t of tablesB1Hop) {
      await client.query(`ALTER TABLE ${t} ENABLE ROW LEVEL SECURITY;`);
      await client.query(`DROP POLICY IF EXISTS "tenant_isolation_1hop_proj_${t}" ON ${t};`);
      await client.query(`
        CREATE POLICY "tenant_isolation_1hop_proj_${t}" ON ${t}
        AS PERMISSIVE FOR ALL
        TO authenticated
        USING (
          EXISTS (
            SELECT 1 FROM projects p
            WHERE p.id = ${t}.project_id
              AND p.tenant_id = current_setting('app.current_tenant', true)::int
          )
        );
      `);
    }

    const tablesB2Hop = ['disbursements', 'clauses'];
    for (const t of tablesB2Hop) {
      await client.query(`ALTER TABLE ${t} ENABLE ROW LEVEL SECURITY;`);
      await client.query(`DROP POLICY IF EXISTS "tenant_isolation_2hop_${t}" ON ${t};`);
      await client.query(`
        CREATE POLICY "tenant_isolation_2hop_${t}" ON ${t}
        AS PERMISSIVE FOR ALL
        TO authenticated
        USING (
          EXISTS (
            SELECT 1 FROM agreements a
            INNER JOIN projects p ON a.project_id = p.id
            WHERE a.id = ${t}.agreement_id
              AND p.tenant_id = current_setting('app.current_tenant', true)::int
          )
        );
      `);
    }

    const tablesTaskCascade = ['task_dependencies', 'task_comments'];
    for (const t of tablesTaskCascade) {
      await client.query(`ALTER TABLE ${t} ENABLE ROW LEVEL SECURITY;`);
      await client.query(`DROP POLICY IF EXISTS "tenant_isolation_2hop_tasks_${t}" ON ${t};`);
      await client.query(`
        CREATE POLICY "tenant_isolation_2hop_tasks_${t}" ON ${t}
        AS PERMISSIVE FOR ALL
        TO authenticated
        USING (
          EXISTS (
            SELECT 1 FROM tasks tk
            WHERE tk.id = ${t}.task_id
              AND tk.tenant_id = current_setting('app.current_tenant', true)::int
          )
        );
      `);
    }

    const tablesEventCascade = ['event_attendees'];
    for (const t of tablesEventCascade) {
      await client.query(`ALTER TABLE ${t} ENABLE ROW LEVEL SECURITY;`);
      await client.query(`DROP POLICY IF EXISTS "tenant_isolation_2hop_events_${t}" ON ${t};`);
      await client.query(`
        CREATE POLICY "tenant_isolation_2hop_events_${t}" ON ${t}
        AS PERMISSIVE FOR ALL
        TO authenticated
        USING (
          EXISTS (
            SELECT 1 FROM events e
            WHERE e.id = ${t}.event_id
              AND e.tenant_id = current_setting('app.current_tenant', true)::int
          )
        );
      `);
    }

    console.log('Policies created successfully.');

    // 3. Fix GRANTs
    console.log('3. Fixing GRANTs for authenticated role...');
    // We check if authenticated role exists, if not create it (Supabase typically has it)
    await client.query(`DO $$ BEGIN IF NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = 'authenticated') THEN CREATE ROLE authenticated; END IF; END $$;`);
    await client.query(`GRANT USAGE ON SCHEMA public TO authenticated;`);
    await client.query(`GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO authenticated;`);
    await client.query(`GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO authenticated;`);
    await client.query(`ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO authenticated;`);
    await client.query(`ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO authenticated;`);
    console.log('GRANTs updated.');

  } catch (err) {
    console.error('Error:', err);
  } finally {
    client.release();
    pool.end();
  }
}

run();
