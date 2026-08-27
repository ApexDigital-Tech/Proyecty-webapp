import 'dotenv/config';
import { db } from '../src/db/index.ts';
import { roles, users } from '../src/db/schema.ts';
import { eq } from 'drizzle-orm';

async function main() {
  if (process.env.ALLOW_DIRECT_ROLE_UPDATE !== 'true') {
    console.warn('⛔ Ejecución bloqueada por seguridad: configure ALLOW_DIRECT_ROLE_UPDATE=true en su entorno para ejecutar esta utilidad.');
    process.exit(0);
  }

  const allRoles = await db.select().from(roles);
  console.log("Roles en DB:", allRoles);

  const dirRole = allRoles.find(r => r.name.toLowerCase() === 'director' || r.name === 'admin' || r.name === 'administrator');
  if (dirRole) {
    const updated = await db.update(users).set({ roleId: dirRole.id }).where(eq(users.email, 'apexdigital70@gmail.com')).returning();
    console.log("Usuario actualizado:", updated);
  } else {
    const newDir = await db.insert(roles).values({ name: 'DIRECTOR', description: 'Rol Director (All Access)' }).returning();
    const updated = await db.update(users).set({ roleId: newDir[0].id }).where(eq(users.email, 'apexdigital70@gmail.com')).returning();
    console.log("Usuario actualizado con rol nuevo:", updated);
  }
  
  process.exit(0);
}
main();
