import 'dotenv/config';
import { db } from '../src/db/index.ts';
import { users, organizations, roles } from '../src/db/schema.ts';
import { eq } from 'drizzle-orm';

async function generateUserAuditReconciliation() {
  const allUsers = await db.select({
    id: users.id,
    uid: users.uid,
    name: users.name,
    email: users.email,
    tenantId: users.tenantId,
    roleId: users.roleId,
    roleName: roles.name,
    orgName: organizations.name,
    isActive: users.isActive,
    createdAt: users.createdAt,
  })
  .from(users)
  .leftJoin(roles, eq(users.roleId, roles.id))
  .leftJoin(organizations, eq(users.tenantId, organizations.id));

  console.log(`Total usuarios en base de datos: ${allUsers.length}`);

  // Categorization
  const activeLegitimate: any[] = [];
  const suspendedFixtures: any[] = [];
  const demoUsers: any[] = [];
  const pendingValidationApex: any[] = [];
  const lauraMendezRecords: any[] = [];
  const voserdemUser: any[] = [];
  const others: any[] = [];

  for (const u of allUsers) {
    const email = (u.email || '').toLowerCase();
    
    if (email === 'mirosromeroc@gmail.com') {
      voserdemUser.push(u);
    } else if (email === 'laura.mendez@example.com' || (u.name && u.name.toLowerCase().includes('laura méndez'))) {
      lauraMendezRecords.push(u);
    } else if (email.endsWith('@proyecty.org')) {
      demoUsers.push(u);
    } else if (['rolangutiali.rg@gmail.com', 'aliendredilan@gmail.com', 'ecotraffic.bo@gmail.com'].includes(email)) {
      pendingValidationApex.push(u);
    } else if (u.isActive === false) {
      suspendedFixtures.push(u);
    } else if (u.isActive === true) {
      activeLegitimate.push(u);
    } else {
      others.push(u);
    }
  }

  console.log('\n--- CONCILIACIÓN DETALLADA ---');
  console.log(`1. VOSERDEM Directivo (Miroslava Romero): ${voserdemUser.length}`);
  console.log(`2. Usuarios Demo Institucionales (@proyecty.org): ${demoUsers.length}`);
  console.log(`3. Registros de Laura Méndez (Intactos sin consolidar): ${lauraMendezRecords.length}`);
  console.log(`4. Apex Digital / Cuentas Técnicas (Pendientes de Validación): ${pendingValidationApex.length}`);
  console.log(`5. Fixtures de Prueba Suspendidos (isActive: false): ${suspendedFixtures.length}`);
  console.log(`6. Otros Usuarios Activos: ${activeLegitimate.length}`);
  console.log(`Total Suma: ${voserdemUser.length + demoUsers.length + lauraMendezRecords.length + pendingValidationApex.length + suspendedFixtures.length + activeLegitimate.length + others.length}`);

  console.log('\n--- DETALLE DE USUARIOS ACTIVOS ---');
  for (const u of [...voserdemUser, ...demoUsers, ...lauraMendezRecords, ...pendingValidationApex, ...activeLegitimate]) {
    console.log(`ID: ${u.id} | Email: ${u.email} | Name: ${u.name} | Role: ${u.roleName} | Tenant: ${u.orgName} (ID: ${u.tenantId}) | Active: ${u.isActive}`);
  }

  console.log(`\n--- DETALLE DE SUSPENDIDOS (MUESTRA 10 DE ${suspendedFixtures.length}) ---`);
  for (const u of suspendedFixtures.slice(0, 10)) {
    console.log(`ID: ${u.id} | Email: ${u.email} | Name: ${u.name} | Role: ${u.roleName} | Tenant: ${u.orgName} | Active: ${u.isActive}`);
  }

  process.exit(0);
}

generateUserAuditReconciliation().catch(err => {
  console.error(err);
  process.exit(1);
});
