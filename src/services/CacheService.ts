import { LRUCache } from 'lru-cache';
import { db } from '../db/index.ts';
import { permissions, roles, users } from '../db/schema.ts';
import { eq } from 'drizzle-orm';
import { PermissionSet, Module, Action } from '../types/rbac.ts';

// Cache structure: Map<user_id, PermissionSet[]>
const options = {
  max: 500, // Maximum number of users in cache
  ttl: 1000 * 60 * 15, // 15 minutes TTL
};

const permissionCache = new LRUCache<number, PermissionSet[]>(options);

export class CacheService {
  /**
   * Obtiene los permisos de un usuario. Si no están en caché, los busca en la BD y los almacena.
   * @param userId ID del usuario
   * @returns Array de PermissionSet
   */
  static async getUserPermissions(userId: number): Promise<PermissionSet[]> {
    const cached = permissionCache.get(userId);
    if (cached) {
      return cached;
    }

    // Cache miss: Fetch from DB
    // First find user's role
    const userRecords = await db.select({ roleId: users.roleId })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);

    if (userRecords.length === 0) {
      return []; // User not found
    }

    const roleId = userRecords[0].roleId;

    // Fetch permissions for the role
    const perms = await db.select({
      module: permissions.module,
      action: permissions.action,
    })
    .from(permissions)
    .where(eq(permissions.roleId, roleId));

    // Group by module
    const permMap = new Map<Module, Set<Action>>();
    for (const p of perms) {
      const mod = p.module as Module;
      const act = p.action as Action;
      if (!permMap.has(mod)) {
        permMap.set(mod, new Set());
      }
      permMap.get(mod)!.add(act);
    }

    const permissionSets: PermissionSet[] = Array.from(permMap.entries()).map(([mod, acts]) => ({
      module: mod,
      actions: Array.from(acts),
    }));

    // Save to cache
    permissionCache.set(userId, permissionSets);

    return permissionSets;
  }

  /**
   * Invalida activamente el caché para un usuario (ej. cuando se le cambia el rol).
   * @param userId ID del usuario
   */
  static invalidate(userId: number) {
    permissionCache.delete(userId);
  }
  
  /**
   * Limpia todo el caché.
   */
  static clearAll() {
    permissionCache.clear();
  }
}
