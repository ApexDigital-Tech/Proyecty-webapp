import { Router } from 'express';
import { handleLemonSqueezyWebhook } from '../controllers/webhooks.controller.ts';

const router = Router();

/**
 * POST /api/webhooks/lemonsqueezy
 * 
 * No auth middleware — webhooks are verified via HMAC signature.
 * The rawBody middleware must be applied BEFORE this route in server.ts
 * to preserve the raw request body for signature verification.
 */
router.post('/lemonsqueezy', handleLemonSqueezyWebhook);

export default router;
