import { db } from '../db/index.ts';
import { auditLogs } from '../db/schema.ts';
import { CreateAuditLogDto } from '../schemas/audit.schema.ts';
import { logger } from '../lib/logger.ts';
import type { Tx } from '../utils/dbWrapper.ts';

export const logAuditEvent = async (
  data: CreateAuditLogDto, 
  executor?: Tx | typeof db, 
  options: { required?: boolean } = {}
) => {
  const dbClient = executor || db;
  try {
    await dbClient.insert(auditLogs).values({
      tenantId: data.tenantId,
      userId: data.userId,
      userName: data.userName,
      action: data.action,
      entity: data.entity,
      entityId: data.entityId,
      metadata: data.metadata,
      ipAddress: data.ipAddress,
      createdAt: new Date(),
    });
  } catch (error) {
    if (options.required) {
      logger.error('CRITICAL: Failed to insert required audit log. Aborting transaction.', { error, data });
      throw new Error(`Audit Log Failure: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } else {
      // Fail silently so as not to interrupt core business logic (e.g. webhook processing)
      logger.error('Failed to insert audit log (non-critical)', { error, data });
    }
  }
};
