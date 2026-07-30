import { db } from '../src/db/index.ts';
import { users } from '../src/db/schema.ts';
import { ilike } from 'drizzle-orm';

async function main() {
  const allUsers = await db.select().from(users);
  console.log('All Users:');
  console.table(allUsers.map(u => ({ id: u.id, name: u.name, email: u.email, roleId: u.roleId, isActive: u.isActive })));
  process.exit(0);
}

main().catch(console.error);
