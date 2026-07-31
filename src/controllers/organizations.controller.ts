import { Request, Response, NextFunction } from 'express';
import { AuthRequest } from '../middleware/auth.ts';
import { db } from '../db/index.ts';
import { organizations } from '../db/schema.ts';
import { eq } from 'drizzle-orm';
import { logger } from '../lib/logger.ts';

export const getMyOrganization = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const tenantId = req.user?.tenantId;
    if (!tenantId) {
      return res.status(401).json({ error: 'No autorizado: Usuario sin organización' });
    }

    const orgs = await db.select()
      .from(organizations)
      .where(eq(organizations.id, tenantId))
      .limit(1);

    if (orgs.length === 0) {
      return res.status(404).json({ error: 'Organización no encontrada' });
    }

    return res.json(orgs[0]);
  } catch (err) {
    logger.error('Error fetching organization', { error: err, tenantId: req.user?.tenantId });
    next(err);
  }
};
