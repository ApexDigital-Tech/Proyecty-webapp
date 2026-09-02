import 'dotenv/config';
import { db } from '../src/db/index.ts';
import { users, roles } from '../src/db/schema.ts';
import { eq } from 'drizzle-orm';

async function main() {
  console.log('Asignando roles a usuarios específicos...');

  const directorRole = await db.select().from(roles).where(eq(roles.name, 'SUPERADMIN')).limit(1);
  const fallbackDirectorRole = await db.select().from(roles).where(eq(roles.name, 'DIRECTOR')).limit(1);
  const financeRole = await db.select().from(roles).where(eq(roles.name, 'FINANCE')).limit(1);
  
  const superAdminRoleToUse = directorRole.length > 0 ? directorRole[0].id : (fallbackDirectorRole.length > 0 ? fallbackDirectorRole[0].id : null);
  const financeRoleToUse = financeRole.length > 0 ? financeRole[0].id : null;

  if (superAdminRoleToUse) {
    const res1 = await db.update(users).set({ roleId: superAdminRoleToUse, isActive: true }).where(eq(users.email, 'rolangutiali.rg@gmail.com')).returning();
    if (res1.length > 0) {
      console.log(`✅ rolangutiali.rg@gmail.com asignado como SuperAdmin/Director.`);
    } else {
      console.log(`❌ rolangutiali.rg@gmail.com NO ENCONTRADO en la base de datos.`);
    }
  }

  if (financeRoleToUse) {
    const res2 = await db.update(users).set({ roleId: financeRoleToUse, isActive: true }).where(eq(users.email, 'ecotraffic.bo@gmail.com')).returning();
    if (res2.length > 0) {
      console.log(`✅ ecotraffic.bo@gmail.com asignado como FINANZAS.`);
    } else {
      console.log(`❌ ecotraffic.bo@gmail.com NO ENCONTRADO en la base de datos.`);
    }
  }

  process.exit(0);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
