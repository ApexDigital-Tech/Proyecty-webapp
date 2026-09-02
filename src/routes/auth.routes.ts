import { Router } from 'express';
import { requireAuth } from '../middleware/auth.ts';
import { requireDemoModeEnabled } from '../middleware/demoGuard.ts';
import * as AuthController from '../controllers/auth.controller.ts';

const router = Router();

router.get('/me', requireAuth, AuthController.getMe);
router.post('/direct-login', AuthController.directLogin);
router.get('/demo-users', requireDemoModeEnabled, AuthController.getDemoUsers);
router.post('/demo-session', requireDemoModeEnabled, AuthController.createDemoSession);
router.post('/demo-reset', requireDemoModeEnabled, AuthController.handleResetDemo);

export default router;
