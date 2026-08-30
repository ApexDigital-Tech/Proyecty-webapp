import { Request, Response, NextFunction } from 'express';
import { AuthRequest } from '../middleware/auth.ts';
import { db } from '../db/index.ts';
import { auditLogs, organizations } from '../db/schema.ts';
import { eq, desc, and, gt } from 'drizzle-orm';
import { logger } from '../lib/logger.ts';
import { DEMO_ORG_NAME } from '../services/demoTenant.service.ts';

export const getAuditLogsHandler = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const tenantId = req.user?.tenantId;
    const role = req.user?.role;
    
    if (!tenantId) return res.status(401).json({ error: 'No autorizado' });

    // RBAC Check for Director/Admin/Auditor (Matriz Canónica M-15)
    if (role !== 'DIRECTOR' && role !== 'ADMIN' && role !== 'AUDITOR') {
      return res.status(403).json({ error: 'Acceso denegado a bitácora de auditoría' });
    }

    // Comprobar si aplica la ventana canónica demostrativa
    let isDemoOrg = false;
    if (process.env.ENABLE_INTERNAL_DEMO === 'true') {
      const [org] = await db.select().from(organizations).where(eq(organizations.id, tenantId)).limit(1);
      if (org && org.name === DEMO_ORG_NAME) {
        isDemoOrg = true;
      }
    }

    if (isDemoOrg) {
      // 1. Obtener el ID del último evento DEMO_DATA_RESET del tenant demo
      const [lastResetLog] = await db.select()
        .from(auditLogs)
        .where(
          and(
            eq(auditLogs.tenantId, tenantId),
            eq(auditLogs.action, 'DEMO_DATA_RESET')
          )
        )
        .orderBy(desc(auditLogs.id))
        .limit(1);

      const lastResetId = lastResetLog?.id || 0;

      // 2. Mostrar solamente eventos cuyo ID sea mayor al último reset
      const logsAfterReset = await db.select()
        .from(auditLogs)
        .where(
          and(
            eq(auditLogs.tenantId, tenantId),
            gt(auditLogs.id, lastResetId)
          )
        )
        .orderBy(desc(auditLogs.id))
        .limit(50);

      // 3. Excluir de la presentación eventos técnicos de tests, rollback o resets
      const filteredDemoLogs = logsAfterReset.filter(log => {
        if (log.action === 'DEMO_DATA_RESET' || log.action === 'ROLLBACK_TEST' || log.entity === 'test_suite') return false;
        if (log.metadata && typeof log.metadata === 'object') {
          const metaStr = JSON.stringify(log.metadata);
          if (metaStr.includes('Gasto de prueba rollback') || metaStr.includes('test-suite-dummy') || metaStr.includes('ROLLBACK_TEST')) {
            return false;
          }
        }
        return true;
      });

      return res.json(filteredDemoLogs);
    }

    // Para cualquier otro tenant (organizaciones normales/productivas), la auditoría permanece 100% estándar e intacta
    const standardLogs = await db.select()
      .from(auditLogs)
      .where(eq(auditLogs.tenantId, tenantId))
      .orderBy(desc(auditLogs.createdAt))
      .limit(50);

    return res.json(standardLogs);
  } catch (error) {
    logger.error('Error fetching audit logs', { error });
    next(error);
  }
};
