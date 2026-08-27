import 'dotenv/config';
import { db } from '../src/db/index.ts';
import { users, roles, organizations, auditLogs } from '../src/db/schema.ts';
import { eq } from 'drizzle-orm';

const TARGET_EMAIL = 'rolangutiali.rg@gmail.com';
const VOSERDEM_TENANT_NAME = 'ORG-TRIAL-VOSERDEM';

export async function performControlledOAuthReset(targetEmail: string = TARGET_EMAIL) {
  console.log('================================================================');
  console.log(`🔄 REINICIO CONTROLADO DE IDENTIDAD OAUTH: ${targetEmail}`);
  console.log('================================================================');

  // 1. Snapshot Before State
  const [u] = await db.select({
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
  .where(eq(users.email, targetEmail));

  if (!u) {
    throw new Error(`Usuario ${targetEmail} no encontrado.`);
  }

  const beforeState = {
    user_id: u.id,
    previous_google_uid: u.uid,
    name: u.name,
    email: u.email,
    tenant_id: u.tenantId,
    tenant_name: u.orgName,
    role_id: u.roleId,
    role_name: u.roleName,
    is_active: u.isActive,
    timestamp: new Date().toISOString(),
  };

  console.log('📋 Snapshot BEFORE_STATE registrado:');
  console.log(JSON.stringify(beforeState, null, 2));

  // 2. Unlink Google UID and keep preauthorization in VOSERDEM
  const [voserdemOrg] = await db.select().from(organizations).where(eq(organizations.name, VOSERDEM_TENANT_NAME));
  const [directorRole] = await db.select().from(roles).where(eq(roles.name, 'DIRECTOR'));

  const targetTenantId = voserdemOrg ? voserdemOrg.id : (u.tenantId || 13);
  const targetRoleId = directorRole ? directorRole.id : (u.roleId || 1);

  const placeholderUid = `preauth-${targetEmail}`;
  await db.update(users).set({
    uid: placeholderUid, // Reset to preauth placeholder so next Google OAuth links fresh
    tenantId: targetTenantId,
    roleId: targetRoleId,
    isActive: true,
  }).where(eq(users.id, u.id));

  // 3. Register Audit Log
  const [insertedLog] = await db.insert(auditLogs).values({
    tenantId: targetTenantId,
    userId: u.id,
    userName: u.name || 'Rolando Gutiérrez',
    action: 'OAUTH_IDENTITY_CONTROLLED_RESET',
    entity: 'user',
    entityId: String(u.id),
    metadata: {
      reason: 'Reinicio controlado de identidad OAuth para prueba limpia en incógnito',
      cleared_uid: u.uid,
      kept_preauthorized_email: targetEmail,
      tenant_id: targetTenantId,
      tenant_name: VOSERDEM_TENANT_NAME,
      role: 'DIRECTOR',
      before_state: beforeState,
      timestamp: new Date().toISOString(),
    },
  }).returning();

  console.log('\n✅ Identidad Google/Supabase desvinculada exitosamente (uid puesto en NULL).');
  console.log(`✅ Correo ${targetEmail} conservado como preautorizado en ${VOSERDEM_TENANT_NAME} con rol DIRECTOR.`);
  console.log('✅ Evento registrado en audit_logs.');
  console.log('================================================================\n');

  return { success: true, user: u, auditLog: insertedLog };
}

// Ejecutar si se invoca directamente desde CLI
import path from 'path';
import { fileURLToPath } from 'url';

const isEntrypoint = () => {
  if (!process.argv[1]) return false;
  try {
    const currentFilePath = path.resolve(fileURLToPath(import.meta.url));
    const entrypointPath = path.resolve(process.argv[1]);
    return currentFilePath === entrypointPath;
  } catch {
    return false;
  }
};

if (isEntrypoint()) {
  performControlledOAuthReset().catch(err => {
    console.error('Error during OAuth reset:', err);
    process.exit(1);
  });
}
