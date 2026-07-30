import 'dotenv/config';
import { db } from '../src/db/index.ts';
import { organizations, roles, users } from '../src/db/schema.ts';
import { eq, inArray } from 'drizzle-orm';

async function run() {
  console.log('Resetting demo users for VOSERDEM...');
  
  const orgResult = await db.select().from(organizations).where(eq(organizations.name, 'Fundación ECOTRAFFIC')).limit(1);
  const fallbackOrgResult = await db.select().from(organizations).limit(1);
  const org = orgResult[0] || fallbackOrgResult[0];

  if (!org) {
    console.error('No organization found.');
    process.exit(1);
  }

  // Fetch all roles
  const currentRoles = await db.select().from(roles);
  const getRole = (name: string) => currentRoles.find(r => r.name === name)?.id;
  
  const roleIds = {
    DIRECTOR: getRole('Director') || getRole('Admin de Organización'),
    MANAGER: getRole('Coordinador de Proyecto'),
    FINANCE: getRole('Administrativo / Finanzas'),
    AUDITOR: getRole('Auditor'),
    FINANCIADOR: getRole('Donante / Financiador'),
  };

  if (Object.values(roleIds).some(r => !r)) {
    console.error('Missing one or more roles in DB. Please run normal seed first.');
    console.log(roleIds);
    process.exit(1);
  }

  const demoUsersConfig = [
    { email: 'directorgeneral@voserdem.org', name: 'Gonzalo Alfaro', uid: 'demo-director', roleId: roleIds.DIRECTOR },
    { email: 'rodrigo.manager@voserdem.org', name: 'Rodrigo Gómez', uid: 'demo-manager', roleId: roleIds.MANAGER },
    { email: 'karla.finanzas@voserdem.org', name: 'Karla Martínez', uid: 'demo-finance', roleId: roleIds.FINANCE },
    { email: 'andres.auditor@voserdem.org', name: 'Andrés Peña', uid: 'demo-auditor', roleId: roleIds.AUDITOR },
    { email: 'donante.usaid@voserdem.org', name: 'Representante USAID', uid: 'demo-financiador', roleId: roleIds.FINANCIADOR },
  ];

  const desiredEmails = demoUsersConfig.map(u => u.email);

  console.log('Deactivating all other users...');
  const allUsers = await db.select().from(users);
  const usersToDeactivate = allUsers.filter(u => !desiredEmails.includes(u.email));
  
  if (usersToDeactivate.length > 0) {
    await db.update(users)
      .set({ isActive: false })
      .where(inArray(users.id, usersToDeactivate.map(u => u.id)));
  }

  console.log('Upserting the 5 target demo users...');
  for (const uConf of demoUsersConfig) {
    const existing = await db.select().from(users).where(eq(users.email, uConf.email)).limit(1);
    if (existing.length > 0) {
      await db.update(users)
        .set({ name: uConf.name, roleId: uConf.roleId!, isActive: true, uid: uConf.uid })
        .where(eq(users.id, existing[0].id));
    } else {
      await db.insert(users).values({
        tenantId: org.id,
        email: uConf.email,
        name: uConf.name,
        roleId: uConf.roleId!,
        uid: uConf.uid,
        isActive: true,
      });
    }
  }

  console.log('Demo users reset successfully!');
  process.exit(0);
}

run().catch(err => {
  console.error(err);
  process.exit(1);
});
