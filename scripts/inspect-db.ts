import 'dotenv/config';
import { db } from '../src/db/index.ts';
import { users, organizations, roles } from '../src/db/schema.ts';

async function inspect() {
  const orgs = await db.select().from(organizations);
  const rls = await db.select().from(roles);
  const usrs = await db.select().from(users);
  console.log('--- ORGANIZATIONS ---');
  console.log(JSON.stringify(orgs, null, 2));
  console.log('--- ROLES ---');
  console.log(JSON.stringify(rls, null, 2));
  console.log('--- USERS ---');
  console.log(JSON.stringify(usrs, null, 2));
  process.exit(0);
}
inspect().catch(e => { console.error(e); process.exit(1); });
