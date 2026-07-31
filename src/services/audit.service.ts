import { db } from '../db/index.ts';
import { auditLogs } from '../db/schema.ts';
import { CreateAuditLogDto } from '../schemas/audit.schema.ts';
import { logger } from '../lib/logger.ts';

export const logAuditEvent = async (data: CreateAuditLogDto) => {
  try {
    await db.insert(auditLogs).values({
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
    // Fail silently so as not to interrupt core business logic (e.g. webhook processing)
    logger.error('Failed to insert audit log', { error, data });
  }
};
