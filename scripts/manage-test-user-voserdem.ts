import 'dotenv/config';
import { db } from '../src/db/index.ts';
import { users, roles, organizations, projectMembers, auditLogs } from '../src/db/schema.ts';
import { eq, and } from 'drizzle-orm';

const TARGET_EMAIL = 'rolangutiali.rg@gmail.com';
const VOSERDEM_TENANT_NAME = 'ORG-TRIAL-VOSERDEM';

async function main() {
  const isRollback = process.argv.includes('--rollback');
  const isStatus = process.argv.includes('--status');

  // 1. Fetch current user state
  const [currentUser] = await db.select({
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
  .leftJoin(organizations, eq(users.tenantId, organizations.id))
  .where(eq(users.email, TARGET_EMAIL));

  if (!currentUser) {
    console.error(`User ${TARGET_EMAIL} not found in database!`);
    process.exit(1);
  }

  const memberships = await db.select().from(projectMembers).where(eq(projectMembers.userId, currentUser.id));

  console.log('================================================================');
  console.log(`👤 ESTADO DE USUARIO: ${TARGET_EMAIL}`);
  console.log('================================================================');
  console.log(`ID:              ${currentUser.id}`);
  console.log(`UID:             ${currentUser.uid || 'No vinculado (se vinculará en Google OAuth)'}`);
  console.log(`Nombre:          ${currentUser.name}`);
  console.log(`Email:           ${currentUser.email}`);
  console.log(`Tenant Actual:   ${currentUser.orgName} (ID: ${currentUser.tenantId})`);
  console.log(`Rol Actual:      ${currentUser.roleName} (ID: ${currentUser.roleId})`);
  console.log(`Estado:          ${currentUser.isActive ? 'ACTIVO' : 'SUSPENDIDO'}`);
  console.log(`Membresías:      ${memberships.length} proyectos`);
  console.log('================================================================\n');

  if (isStatus) {
    process.exit(0);
  }

  // Find VOSERDEM Org and Director Role
  const [voserdemOrg] = await db.select().from(organizations).where(eq(organizations.name, VOSERDEM_TENANT_NAME));
  if (!voserdemOrg) {
    console.error(`Tenant ${VOSERDEM_TENANT_NAME} not found!`);
    process.exit(1);
  }

  const [directorRole] = await db.select().from(roles).where(eq(roles.name, 'DIRECTOR'));
  if (!directorRole) {
    console.error(`Role DIRECTOR not found!`);
    process.exit(1);
  }

  if (isRollback) {
    console.log(`🔄 EJECUTANDO ROLLBACK DE ${TARGET_EMAIL} A SU TENANT Y ROL ORIGINALES...`);
    
    // Original State: Tenant ORG-GMAIL.COM (ID: 4), Rol Manager (ID from roles where name = 'MANAGER' or 'Project Manager')
    const [originalOrg] = await db.select().from(organizations).where(eq(organizations.name, 'ORG-GMAIL.COM'));
    const [managerRole] = await db.select().from(roles).where(eq(roles.name, 'MANAGER'));

    await db.update(users).set({
      tenantId: originalOrg ? originalOrg.id : 4,
      roleId: managerRole ? managerRole.id : currentUser.roleId,
      isActive: true,
    }).where(eq(users.id, currentUser.id));

    await db.insert(auditLogs).values({
      tenantId: originalOrg ? originalOrg.id : 4,
      userId: currentUser.id,
      userName: currentUser.name || 'Rolando Gutiérrez',
      action: 'USER_RESTORED_POST_TRIAL_TEST',
      entity: 'user',
      entityId: String(currentUser.id),
      metadata: {
        reason: 'Restauración de usuario a tenant y rol original tras prueba de Google OAuth',
        restoredTenantId: originalOrg ? originalOrg.id : 4,
        restoredTenantName: 'ORG-GMAIL.COM',
        restoredRole: 'MANAGER',
        timestamp: new Date().toISOString(),
      },
    });

    console.log(`✅ Rollback completado exitosamente para ${TARGET_EMAIL}.`);
    process.exit(0);
  }

  // Switch to VOSERDEM
  console.log(`🚀 HABILITANDO TEMPORALMENTE ${TARGET_EMAIL} EN ${VOSERDEM_TENANT_NAME} (ROL: DIRECTOR)...`);

  await db.update(users).set({
    tenantId: voserdemOrg.id,
    roleId: directorRole.id,
    isActive: true,
  }).where(eq(users.id, currentUser.id));

  await db.insert(auditLogs).values({
    tenantId: voserdemOrg.id,
    userId: currentUser.id,
    userName: currentUser.name || 'Rolando Gutiérrez',
    action: 'USER_TEMPORARY_ASSIGNMENT_VOSERDEM_TEST',
    entity: 'user',
    entityId: String(currentUser.id),
    metadata: {
      reason: 'Habilitación temporal controlada para prueba real de Google OAuth antes de invitar a cliente',
      previousTenantId: currentUser.tenantId,
      previousTenantName: currentUser.orgName,
      previousRoleId: currentUser.roleId,
      previousRoleName: currentUser.roleName,
      newTenantId: voserdemOrg.id,
      newTenantName: VOSERDEM_TENANT_NAME,
      newRole: 'DIRECTOR',
      timestamp: new Date().toISOString(),
    },
  });

  console.log(`✅ Habilitación temporal completada exitosamente.`);
  console.log(`🎉 El usuario ${TARGET_EMAIL} ya está configurado como DIRECTOR en ${VOSERDEM_TENANT_NAME} (Tenant ID: ${voserdemOrg.id}).`);
  process.exit(0);
}

main().catch(err => {
  console.error('Error executing script:', err);
  process.exit(1);
});
