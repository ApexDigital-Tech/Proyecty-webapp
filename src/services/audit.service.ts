import { db } from '../db/index.ts';
import { auditLogs } from '../db/schema.ts';
import { CreateAuditLogDto } from '../schemas/audit.schema.ts';
import { logger } from '../lib/logger.ts';

export const logAuditEvent = async (data: CreateAuditLogDto, tx?: any) => {
  const dbClient = tx || db;
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
};
