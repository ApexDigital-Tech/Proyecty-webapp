import { Router } from 'express';
import { requireAuth } from '../middleware/auth.ts';
import { getMyOrganization } from '../controllers/organizations.controller.ts';

const router = Router();

router.get('/me', requireAuth, getMyOrganization);

export default router;
