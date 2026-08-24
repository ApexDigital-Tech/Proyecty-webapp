import 'dotenv/config';
import { Pool } from 'pg';

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function bench() {
  const client = await pool.connect();
  try {
    console.log('--- PERFORMANCE BENCHMARK ---');
    // Pre-RLS (Superuser query)
    let start = performance.now();
    await client.query(`SELECT * FROM projects WHERE id = 1 AND tenant_id = 1`);
    let end = performance.now();
    console.log(`Pre-RLS Latency (Superuser, manual filter): ${(end - start).toFixed(2)} ms`);

    // Post-RLS (Authenticated Role)
    await client.query(`BEGIN`);
    await client.query(`DO $$ BEGIN IF NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = 'authenticated') THEN CREATE ROLE authenticated; END IF; END $$;`);
    await client.query(`SET LOCAL ROLE 'authenticated'`);
    await client.query(`SELECT set_config('app.current_tenant', '1', true)`);
    
    start = performance.now();
    await client.query(`SELECT * FROM projects WHERE id = 1`);
    end = performance.now();
    
    await client.query(`COMMIT`);
    console.log(`Post-RLS Latency (Authenticated Role): ${(end - start).toFixed(2)} ms`);
    
    // Test a more complex query (Expenses with budget lines)
    start = performance.now();
    await client.query(`SELECT * FROM expenses WHERE project_id = 1 AND tenant_id = 1`);
    end = performance.now();
    console.log(`Pre-RLS Expenses Latency: ${(end - start).toFixed(2)} ms`);

    await client.query(`BEGIN`);
    await client.query(`SET LOCAL ROLE 'authenticated'`);
    await client.query(`SELECT set_config('app.current_tenant', '1', true)`);
    start = performance.now();
    await client.query(`SELECT * FROM expenses WHERE project_id = 1`);
    end = performance.now();
    await client.query(`COMMIT`);
    console.log(`Post-RLS Expenses Latency: ${(end - start).toFixed(2)} ms`);

  } catch (err) {
    console.error('Benchmark Error:', err);
  } finally {
    client.release();
    pool.end();
  }
}

bench();
