import 'dotenv/config';
import { db } from './src/db/index.ts';
import { sql } from 'drizzle-orm';

async function updateRole() {
  try {
    await db.execute(sql`UPDATE users SET role_id = 1 WHERE email = 'apexdigital70@gmail.com'`);
    console.log('Role updated successfully');
  } catch (err) {
    console.error(err);
  } finally {
    process.exit(0);
  }
}
updateRole();
