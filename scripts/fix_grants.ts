import 'dotenv/config';
import { Pool } from 'pg';

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function fixGrants() {
  const client = await pool.connect();
  try {
    console.log('--- FIXING GRANTS ---');
    // Revoke ALL
    await client.query(`REVOKE ALL PRIVILEGES ON ALL TABLES IN SCHEMA public FROM authenticated;`);
    // Grant specific verbs without TRUNCATE
    await client.query(`GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO authenticated;`);
    
    // Fix default privileges as well
    await client.query(`ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES FROM authenticated;`);
    await client.query(`ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO authenticated;`);
    console.log('GRANTs updated (NO TRUNCATE).');
  } catch (err) {
    console.error('Error fixing GRANTS:', err);
  } finally {
    client.release();
    pool.end();
  }
}

fixGrants();
