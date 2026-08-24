import 'dotenv/config';
import { Pool } from 'pg';

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function analyze() {
  const client = await pool.connect();
  try {
    console.log('--- EXPLAIN ANALYZE 2-HOP (disbursements with filter) ---');
    await client.query(`BEGIN`);
    await client.query(`SET LOCAL ROLE 'authenticated'`);
    await client.query(`SELECT set_config('app.current_tenant', '1', true)`);
    
    const res = await client.query(`EXPLAIN ANALYZE SELECT * FROM disbursements WHERE agreement_id = 36`);
    console.log(res.rows.map(r => r['QUERY PLAN']).join('\\n'));
    
    await client.query(`COMMIT`);
  } catch (err) {
    console.error('Error analyzing:', err);
  } finally {
    client.release();
    pool.end();
  }
}

analyze();
