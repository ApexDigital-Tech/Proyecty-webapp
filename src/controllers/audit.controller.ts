import { Request, Response, NextFunction } from 'express';
import { AuthRequest } from '../middleware/auth.ts';
import { db } from '../db/index.ts';
import { auditLogs } from '../db/schema.ts';
import { eq, desc } from 'drizzle-orm';
import { logger } from '../lib/logger.ts';

export const getAuditLogsHandler = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const tenantId = req.user?.tenantId;
    const role = req.user?.role;
    
    if (!tenantId) return res.status(401).json({ error: 'No autorizado' });

    // RBAC Check for Admin/Director only
    if (role !== 'DIRECTOR' && role !== 'ADMIN') {
      return res.status(403).json({ error: 'Acceso denegado a bitácora de auditoría' });
    }

    const logs = await db.select()
      .from(auditLogs)
      .where(eq(auditLogs.tenantId, tenantId))
      .orderBy(desc(auditLogs.createdAt))
      .limit(100);

    return res.json(logs);
  } catch (error) {
    logger.error('Error fetching audit logs', { error });
    next(error);
  }
};
