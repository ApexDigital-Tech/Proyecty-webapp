import { db } from './index.ts';
import { users, organizations, roles } from './schema.ts';
import { eq } from 'drizzle-orm';

export async function getOrCreateUser(uid: string, email: string, name: string, roleName: string) {
  try {
    const existingResult = await db.select({
      id: users.id,
      uid: users.uid,
      email: users.email,
      name: users.name,
      tenantId: users.tenantId,
      roleId: users.roleId,
      roleName: roles.name
    }).from(users)
      .leftJoin(roles, eq(users.roleId, roles.id))
      .where(eq(users.uid, uid));

    if (existingResult.length > 0) {
      const existing = existingResult[0];
      await db.update(users)
        .set({ email, name })
        .where(eq(users.uid, uid));
      return {
        ...existing,
        role: existing.roleName || 'Project Manager'
      };
    }

    // New user workflow
    // 1. Find or create default Organization (tenant)
    const orgName = `ORG-${email.split('@')[1] || 'DEFAULT'}`.toUpperCase();
    let orgId: number;
    const orgResult = await db.select().from(organizations).where(eq(organizations.name, orgName));
    if (orgResult.length > 0) {
      orgId = orgResult[0].id;
    } else {
      const newOrg = await db.insert(organizations).values({ name: orgName }).returning();
      orgId = newOrg[0].id;
    }

    // 2. Resolve Role
    let roleId: number;
    let mappedRoleName = roleName === 'MANAGER' ? 'Project Manager' : roleName === 'FINANCE' ? 'Administrativo / Finanzas' : roleName;
    const roleResult = await db.select().from(roles).where(eq(roles.name, mappedRoleName));
    if (roleResult.length > 0) {
      roleId = roleResult[0].id;
    } else {
      const newRole = await db.insert(roles).values({ name: mappedRoleName, isSystemRole: false }).returning();
      roleId = newRole[0].id;
    }

    // 3. Create User
    const result = await db.insert(users)
      .values({
        uid,
        email,
        name,
        roleId,
        tenantId: orgId,
        avatarUrl: `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(name)}`,
      })
      .returning();

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
      roleName: roles.name
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
