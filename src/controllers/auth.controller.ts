import { Request, Response, NextFunction } from 'express';
import { db } from '../db/index.ts';
import { users, roles } from '../db/schema.ts';
import { eq } from 'drizzle-orm';
import { AuthRequest } from '../middleware/auth.ts';
import { mapRoleNameToEnum } from './users.controller.ts'; // to be extracted later

export const getMe = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    res.json({ user: req.user });
  } catch (err) {
    next(err);
  }
};

export const getDemoUsers = async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (process.env.NODE_ENV === 'production' && process.env.ENABLE_DEMO_LOGIN !== 'true') {
      return res.status(403).json({ error: 'Endpoint not available in production without feature flag' });
    }
    const rawUsers = await db.select({
      user: users,
      roleName: roles.name
    }).from(users)
      .leftJoin(roles, eq(users.roleId, roles.id))
      .where(eq(users.isActive, true))
      .orderBy(users.id);
      
    const mapped = rawUsers.map(r => ({
      ...r.user,
      role: mapRoleNameToEnum(r.roleName || '')
    }));
    res.json(mapped);
  } catch (err) {
    next(err);
  }
};
