import { db } from './index.ts';
import { users, organizations, roles } from './schema.ts';
import { eq } from 'drizzle-orm';
import { sendWelcomeEmail } from '../services/email.service.ts';

export async function getOrCreateUser(uid: string, email: string, name: string, roleName: string) {
  try {
    // --- STEP 1: Check by UID first (fast path for returning users) ---
    const byUid = await db.select({
      id: users.id,
      uid: users.uid,
      email: users.email,
      name: users.name,
      tenantId: users.tenantId,
      roleId: users.roleId,
      roleName: roles.name,
      isActive: users.isActive
    }).from(users)
      .leftJoin(roles, eq(users.roleId, roles.id))
      .where(eq(users.uid, uid));

    if (byUid.length > 0) {
      const existing = byUid[0];
      // Update name/email in case they changed on the provider side
      await db.update(users)
        .set({ email, name })
        .where(eq(users.uid, uid));
      return {
        ...existing,
        role: existing.roleName || 'Project Manager'
      };
    }

    // --- STEP 2: Check by EMAIL (handles admin pre-registration with placeholder uid) ---
    const byEmail = await db.select({
      id: users.id,
      uid: users.uid,
      email: users.email,
      name: users.name,
      tenantId: users.tenantId,
      roleId: users.roleId,
      roleName: roles.name,
      isActive: users.isActive
    }).from(users)
      .leftJoin(roles, eq(users.roleId, roles.id))
      .where(eq(users.email, email));

    if (byEmail.length > 0) {
      const existing = byEmail[0];
      // Link the real Supabase UID to the pre-registered row.
      // DO NOT overwrite roleId — admin assigned it intentionally.
      await db.update(users)
        .set({ uid, name })
        .where(eq(users.id, existing.id));
      console.log(`[Auth] Linked Google UID ${uid} to pre-registered email ${email} (role preserved: ${existing.roleName})`);
      return {
        ...existing,
        uid, // return the now-linked uid
        role: existing.roleName || 'Project Manager'
      };
    }

    // --- STEP 3: Truly new user — create org, role, user row ---
    const orgName = `ORG-${email.split('@')[1] || 'DEFAULT'}`.toUpperCase();
    let orgId: number;
    const orgResult = await db.select().from(organizations).where(eq(organizations.name, orgName));
    if (orgResult.length > 0) {
      orgId = orgResult[0].id;
    } else {
      const newOrg = await db.insert(organizations).values({ name: orgName }).returning();
      orgId = newOrg[0].id;
    }

    let roleId: number;
    let mappedRoleName = roleName === 'MANAGER' ? 'Project Manager' : roleName === 'FINANCE' ? 'Administrativo / Finanzas' : roleName;
    const roleResult = await db.select().from(roles).where(eq(roles.name, mappedRoleName));
    if (roleResult.length > 0) {
      roleId = roleResult[0].id;
    } else {
      const newRole = await db.insert(roles).values({ name: mappedRoleName, isSystemRole: false }).returning();
      roleId = newRole[0].id;
    }

    const result = await db.insert(users)
      .values({
        uid,
        email,
        name,
        roleId,
        tenantId: orgId,
        avatarUrl: `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(name)}`,
        isActive: true,
      })
      .returning();

    // Fire-and-forget the welcome email for new registrations
    sendWelcomeEmail(email, name).catch(err => {
      console.error('Failed to dispatch welcome email asynchronously:', err);
    });

    return {
      ...result[0],
      role: mappedRoleName
    };
  } catch (error) {
    console.error('Error in getOrCreateUser:', error);
    throw new Error('Failed to synchronize user profile', { cause: error });
  }
}

export async function getUserByUid(uid: string) {
  try {
    const result = await db.select({
      id: users.id,
      uid: users.uid,
      email: users.email,
      name: users.name,
      tenantId: users.tenantId,
      roleId: users.roleId,
      roleName: roles.name,
      isActive: users.isActive
    }).from(users)
      .leftJoin(roles, eq(users.roleId, roles.id))
      .where(eq(users.uid, uid));
    
    if (result.length > 0) {
      return {
        ...result[0],
        role: result[0].roleName || 'Project Manager'
      };
    }
    return null;
  } catch (error) {
    console.error('Error in getUserByUid:', error);
    throw new Error('Failed to fetch user by UID', { cause: error });
  }
}
