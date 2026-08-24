import 'dotenv/config';
import { db } from '../src/db/index.ts';
import { sql } from 'drizzle-orm';

async function run() {
  await db.execute(sql`
    INSERT INTO permissions (role_id, module, action)
    VALUES 
      (7, 'expenses', 'approve'),
      (7, 'projects', 'create'),
      (7, 'projects', 'read'),
      (7, 'expenses', 'read'),
      (7, 'projects', 'update')
    ON CONFLICT DO NOTHING
  `);
  console.log('Inserted permissions for role 7 (MANAGER)');
}

run().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
