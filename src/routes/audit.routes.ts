import { Router } from 'express';
import { requireAuth } from '../middleware/auth.ts';
import { getAuditLogsHandler } from '../controllers/audit.controller.ts';

const router = Router();

router.get('/', requireAuth, getAuditLogsHandler);

export default router;
