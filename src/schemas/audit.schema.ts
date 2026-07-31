import { z } from 'zod';

export const createAuditLogSchema = z.object({
  tenantId: z.number().int(),
  userId: z.number().int().optional(),
  userName: z.string().optional(),
  action: z.string().min(1),
  entity: z.string().min(1),
  entityId: z.string().optional(),
  metadata: z.record(z.any()).optional(),
  ipAddress: z.string().optional(),
});

export type CreateAuditLogDto = z.infer<typeof createAuditLogSchema>;
