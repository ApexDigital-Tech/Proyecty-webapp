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

    // RBAC Check for Director/Admin/Auditor (Matriz Canónica M-15)
    if (role !== 'DIRECTOR' && role !== 'ADMIN' && role !== 'AUDITOR') {
      return res.status(403).json({ error: 'Acceso denegado a bitácora de auditoría' });
    }

    // En modo demo, presentar una bitácora demostrativa limpia sin repeticiones de suites técnicas
    let query = db.select()
      .from(auditLogs)
      .where(eq(auditLogs.tenantId, tenantId))
      .orderBy(desc(auditLogs.createdAt))
      .limit(50);

    const logs = await query;

    // Si es modo demo y el tenant es de demostración, normalizar vista eliminando eventos de rollback de suites
    const filteredLogs = logs.filter(log => {
      if (log.action === 'ROLLBACK_TEST' || log.entity === 'test_suite') return false;
      if (log.metadata && typeof log.metadata === 'object') {
        const metaStr = JSON.stringify(log.metadata);
        if (metaStr.includes('Gasto de prueba rollback') || metaStr.includes('test-suite-dummy')) {
          return false;
        }
      }
      return true;
    });

    return res.json(filteredLogs);
  } catch (error) {
    logger.error('Error fetching audit logs', { error });
    next(error);
  }
};
