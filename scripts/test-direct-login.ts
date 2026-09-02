import 'dotenv/config';
import { db } from '../src/db/index.ts';
import { users, roles } from '../src/db/schema.ts';
import { eq } from 'drizzle-orm';
import { generateDemoToken } from '../src/services/demoAuth.service.ts';

async function testDirectLoginLogic(email: string) {
  console.log(`\nProbando login directo para: ${email}`);
  const normalizedEmail = email.trim().toLowerCase();

  const userResult = await db.select({
    user: users,
    roleName: roles.name
  }).from(users)
    .leftJoin(roles, eq(users.roleId, roles.id))
    .where(eq(users.email, normalizedEmail))
    .limit(1);

  if (userResult.length === 0) {
    console.error(`❌ Usuario ${normalizedEmail} NO encontrado en BD`);
    return;
  }

  const dbUser = userResult[0].user;
  let mappedRole = (userResult[0].roleName || 'Viewer').toUpperCase();
  if (mappedRole.includes('DIRECTOR') || mappedRole.includes('SUPERADMIN') || mappedRole.includes('ADMIN')) {
    mappedRole = 'DIRECTOR';
  } else if (mappedRole.includes('FINAN')) {
    mappedRole = 'FINANCE';
  } else if (mappedRole.includes('MANAGER')) {
    mappedRole = 'MANAGER';
  }

  const token = generateDemoToken({
    uid: dbUser.uid,
    userId: dbUser.id,
    id: dbUser.id,
    email: dbUser.email,
    name: dbUser.name,
    role: mappedRole,
    roleName: userResult[0].roleName || mappedRole,
    tenantId: dbUser.tenantId
  }, 60 * 24 * 7);

  console.log('✅ ÉXITO:', {
    id: dbUser.id,
    email: dbUser.email,
    name: dbUser.name,
    role: mappedRole,
    tenantId: dbUser.tenantId,
    tokenPrefix: token.substring(0, 25) + '...'
  });
}

async function main() {
  console.log('--- PROBANDO CONTROLADOR DE LOGIN DIRECTO ---');
  await testDirectLoginLogic('rolangutiali.rg@gmail.com');
  await testDirectLoginLogic('ecotraffic.bo@gmail.com');
}

main().catch(console.error).finally(() => process.exit(0));
