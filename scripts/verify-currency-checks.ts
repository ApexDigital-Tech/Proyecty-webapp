import 'dotenv/config';
import { db } from '../src/db/index.ts';
import { sql } from 'drizzle-orm';

async function verify() {
  const r = await db.execute(
    sql`SELECT conname, pg_get_constraintdef(oid) as def FROM pg_constraint WHERE conname LIKE 'chk_%_whitelist'`
  );
  console.log(JSON.stringify((r as any).rows || r, null, 2));
}
verify();
