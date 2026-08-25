import 'dotenv/config';
import { db, createPool } from '../src/db/index.ts';
import { users, organizations, roles } from '../src/db/schema.ts';
import { eq } from 'drizzle-orm';
import fs from 'fs';
import path from 'path';

async function main() {
  const allOrgs = await db.select().from(organizations);
  const allRoles = await db.select().from(roles);
  const allUsers = await db
    .select({
      id: users.id,
      uid: users.uid,
      email: users.email,
      name: users.name,
      tenantId: users.tenantId,
      tenantName: organizations.name,
      roleId: users.roleId,
      roleName: roles.name,
      isActive: users.isActive,
      createdAt: users.createdAt,
    })
    .from(users)
    .leftJoin(organizations, eq(users.tenantId, organizations.id))
    .leftJoin(roles, eq(users.roleId, roles.id));

  const inventory = {
    generatedAt: new Date().toISOString(),
    totalUsers: allUsers.length,
    organizations: allOrgs,
    roles: allRoles,
    users: allUsers,
  };

  const backupPath = path.join(process.cwd(), `respaldo_usuarios_${new Date().toISOString().replace(/[:.]/g, '-')}.json`);
  fs.writeFileSync(backupPath, JSON.stringify(inventory, null, 2), 'utf-8');

  console.log(`[Backup] Respaldo e inventario guardado en: ${backupPath}`);
  console.log('--- INVENTARIO CONSOLIDADO DE USUARIOS ---');
  console.table(allUsers.map(u => ({
    id: u.id,
    email: u.email,
    name: u.name,
    role: u.roleName,
    tenant: u.tenantName,
    active: u.isActive,
    created: u.createdAt
  })));

  process.exit(0);
}

main().catch(err => {
  console.error('Error al generar inventario:', err);
  process.exit(1);
});
