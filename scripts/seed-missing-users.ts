import 'dotenv/config';
import { db } from '../src/db/index.ts';
import { organizations, roles, users } from '../src/db/schema.ts';
import { eq } from 'drizzle-orm';

async function run() {
  console.log('Seeding missing demo users...');
  
  // 1. Get Organization
  const orgResult = await db.select().from(organizations).where(eq(organizations.name, 'ORG-PROYECTY.ORG')).limit(1);
  if (orgResult.length === 0) {
    console.error('Organization not found, database might be empty.');
    process.exit(1);
  }
  const org = orgResult[0];

  // 2. Make sure Roles exist
  // We need 'Director', 'Coordinador de Proyecto', 'Administrativo / Finanzas', 'Auditor', 'Donante / Financiador'
  const currentRoles = await db.select().from(roles);
  
  let auditorRole = currentRoles.find(r => r.name === 'Auditor');
  if (!auditorRole) {
    const inserted = await db.insert(roles).values([{ name: 'Auditor', description: 'Revisión y trazabilidad', isSystemRole: true }]).returning();
    auditorRole = inserted[0];
  }

  let donanteRole = currentRoles.find(r => r.name === 'Donante / Financiador');
  if (!donanteRole) {
    const inserted = await db.insert(roles).values([{ name: 'Donante / Financiador', description: 'Acceso de solo lectura de donantes', isSystemRole: true }]).returning();
    donanteRole = inserted[0];
  }

  let managerRole = currentRoles.find(r => r.name === 'Coordinador de Proyecto');
  if (!managerRole) {
    const inserted = await db.insert(roles).values([{ name: 'Coordinador de Proyecto', description: 'Operación directa de proyectos', isSystemRole: true }]).returning();
    managerRole = inserted[0];
  }

  let directorRole = currentRoles.find(r => r.name === 'Director');
  if (!directorRole) {
    const inserted = await db.insert(roles).values([{ name: 'Director', description: 'Lectura y aprobación', isSystemRole: true }]).returning();
    directorRole = inserted[0];
  }

  // 3. Seed users if missing
  const allUsers = await db.select().from(users);
  
  // Check Luis Morales
  if (!allUsers.find(u => u.email === 'director@proyecty.org')) {
    await db.insert(users).values({
      tenantId: org.id,
      uid: 'demo-director',
      email: 'director@proyecty.org',
      name: 'Luis Morales',
      roleId: directorRole.id
    });
    console.log('Added Luis Morales');
  }

  // Check Andres Peña
  if (!allUsers.find(u => u.email === 'andres.auditor@proyecty.org')) {
    await db.insert(users).values({
      tenantId: org.id,
      uid: 'demo-auditor',
      email: 'andres.auditor@proyecty.org',
      name: 'Andrés Peña',
      roleId: auditorRole.id
    });
    console.log('Added Andrés Peña');
  }

  // Check USAID Rep
  if (!allUsers.find(u => u.email === 'donante.usaid@proyecty.org')) {
    await db.insert(users).values({
      tenantId: org.id,
      uid: 'demo-financiador',
      email: 'donante.usaid@proyecty.org',
      name: 'USAID Rep.',
      roleId: donanteRole.id
    });
    console.log('Added USAID Rep.');
  }

  // Also update Rodrigo G. to Coordinador de Proyecto if needed
  const rodrigo = allUsers.find(u => u.email === 'rodrigo@proyecty.org' || u.name === 'Rodrigo G.');
  if (rodrigo && rodrigo.roleId !== managerRole.id) {
    await db.update(users).set({ roleId: managerRole.id, email: 'rodrigo@proyecty.org', uid: 'demo-manager' }).where(eq(users.id, rodrigo.id));
    console.log('Updated Rodrigo G. to Coordinador de Proyecto');
  }

  const karla = allUsers.find(u => u.email === 'finanzas@ecotraffic.org' || u.name === 'Karla Martínez');
  if (karla) {
    await db.update(users).set({ email: 'karla.finanzas@proyecty.org', uid: 'demo-finance' }).where(eq(users.id, karla.id));
    console.log('Updated Karla email');
  }


  console.log('Done!');
  process.exit(0);
}

run().catch(err => {
  console.error(err);
  process.exit(1);
});
