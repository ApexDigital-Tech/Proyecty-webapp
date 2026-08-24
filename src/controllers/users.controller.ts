import { Response, NextFunction } from 'express';
import { db } from '../db/index.ts';
import { users, roles, auditLogs } from '../db/schema.ts';
import { eq, desc, and } from 'drizzle-orm';
import { AuthRequest } from '../middleware/auth.ts';
import { logActivity } from '../db/audit.ts'; // We will extract these later or keep importing for now
import { CacheService } from '../services/CacheService.ts';

export const listUsers = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const { role } = req.user!;
    if (role !== 'DIRECTOR' && role !== 'MANAGER' && role !== 'RESPONSABLE_PROYECTO') {
      return res.status(403).json({ error: 'Acceso denegado: Se requiere el rol de Director, Manager o Responsable para ver usuarios.' });
    }

    const allUsers = await db.select({
      user: users,
      roleName: roles.name
    }).from(users)
      .leftJoin(roles, eq(users.roleId, roles.id))
      .where(eq(users.tenantId, req.user!.tenantId))
      .orderBy(desc(users.createdAt));
      
    const allLogs = await db.select().from(auditLogs).where(eq(auditLogs.tenantId, req.user!.tenantId)).orderBy(desc(auditLogs.createdAt));

    const enriched = allUsers.map(r => {
      const u = r.user;
      const userLogs = allLogs.filter(l => l.userId === u.id);
      return {
        ...u,
        activityCount: userLogs.length,
        lastActive: userLogs.length > 0 ? userLogs[0].createdAt : u.createdAt,
        recentActions: userLogs.slice(0, 5).map(l => ({
          id: l.id,
          actionDescription: l.action,
          createdAt: l.createdAt
        })),
        role: r.roleName // Direct role string
      };
    });

    res.json(enriched);
  } catch (err) {
    next(err); // Sentry catches this via errorHandler
  }
};

export const createUser = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const { role: requesterRole, name: userName, tenantId } = req.user!;
    if (requesterRole !== 'DIRECTOR') {
      return res.status(403).json({ error: 'Acceso denegado: Se requiere el rol de Director.' });
    }

    const { name, email, role } = req.body;
    
    // Check if role exists directly by string name
    let roleObj = await db.select().from(roles).where(eq(roles.name, role));
    if (roleObj.length === 0) {
      return res.status(400).json({ error: 'Rol inválido o inexistente en el sistema.' });
    }

    const uid = `pending_${Date.now()}_${Math.random().toString(36).substring(7)}`;

    const newUser = await db.insert(users)
      .values({
        tenantId,
        uid,
        name,
        email,
        roleId: roleObj[0].id,
        avatarUrl: `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(name)}`,
        isActive: true,
      })
      .returning();

    await logActivity(null, userName, `Creó el nuevo usuario "${name}" con rol ${role}`);
    // tenantId not passed to logActivity in this old implementation, it relies on global context or we fix it later.

    res.status(201).json(newUser[0]);
  } catch (err) {
    next(err);
  }
};

export const updateUser = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const { role: requesterRole, name: userName, uid: requesterUid } = req.user!;
    if (requesterRole !== 'DIRECTOR') {
      return res.status(403).json({ error: 'Acceso denegado: Se requiere el rol de Director.' });
    }

    const userId = parseInt(req.params.id);
    const { name, email, role, isActive } = req.body;

    const userToUpdate = await db.select().from(users).where(
      and(eq(users.id, userId), eq(users.tenantId, req.user!.tenantId))
    );
    if (userToUpdate.length === 0) {
      return res.status(404).json({ error: 'Usuario no encontrado en esta organización.' });
    }

    if (isActive === false && userToUpdate[0].uid === requesterUid) {
      return res.status(400).json({ error: 'No puedes desactivar tu propia cuenta.' });
    }

    const updates: any = {};
    if (name !== undefined) updates.name = name;
    if (email !== undefined) updates.email = email;
    if (isActive !== undefined) updates.isActive = isActive;

    if (role !== undefined) {
      const newRoleObj = await db.select().from(roles).where(eq(roles.name, role));
      if (newRoleObj.length === 0) return res.status(400).json({ error: 'Rol inválido o inexistente en el sistema.' });
      updates.roleId = newRoleObj[0].id;
    }

    if (Object.keys(updates).length === 0) {
      return res.status(400).json({ error: 'No se enviaron campos.' });
    }

    const updated = await db.update(users)
      .set(updates)
      .where(and(eq(users.id, userId), eq(users.tenantId, req.user!.tenantId)))
      .returning();

    let actionMsg = `Modificó los datos del usuario "${userToUpdate[0].name}"`;
    if (isActive !== undefined && isActive !== userToUpdate[0].isActive) {
      actionMsg = isActive ? `Reactivó al usuario "${userToUpdate[0].name}"` : `Suspendió al usuario "${userToUpdate[0].name}"`;
    }
    
    // Invalidar caché de permisos para forzar recarga en la siguiente petición
    CacheService.invalidate(userId);
    
    await logActivity(null, userName, actionMsg);
    res.json(updated[0]);
  } catch (err) {
    next(err);
  }
};

export const deleteUser = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const { role: requesterRole, name: userName } = req.user!;
    if (requesterRole !== 'DIRECTOR') {
      return res.status(403).json({ error: 'Acceso denegado: Se requiere el rol de Director.' });
    }

    const userId = parseInt(req.params.id);
    const userToDelete = await db.select().from(users).where(
      and(eq(users.id, userId), eq(users.tenantId, req.user!.tenantId))
    );
    if (userToDelete.length === 0) {
      return res.status(404).json({ error: 'Usuario no encontrado en esta organización.' });
    }

    if (userToDelete[0].uid === req.user!.uid) {
      return res.status(400).json({ error: 'No puedes eliminar tu propio usuario.' });
    }

    await db.delete(users).where(
      and(eq(users.id, userId), eq(users.tenantId, req.user!.tenantId))
    );
    
    // Limpiar de caché al ser eliminado
    CacheService.invalidate(userId);
    
    await logActivity(null, userName, `Eliminó permanentemente el usuario "${userToDelete[0].name}"`);
    res.json({ success: true, message: 'Usuario eliminado.' });
  } catch (err) {
    next(err);
  }
};

// Legacy mappers removed
