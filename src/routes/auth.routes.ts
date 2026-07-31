import { Router } from 'express';
import { requireAuth } from '../middleware/auth.ts';
import * as AuthController from '../controllers/auth.controller.ts';

const router = Router();

router.get('/me', requireAuth, AuthController.getMe);
router.get('/demo-users', AuthController.getDemoUsers);

export default router;
