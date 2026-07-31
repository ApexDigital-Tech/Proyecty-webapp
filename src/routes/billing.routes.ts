import { Router } from 'express';
import { requireAuth } from '../middleware/auth.ts';
import * as BillingController from '../controllers/billing.controller.ts';

const router = Router();

/**
 * GET /api/billing/checkout-session
 * Authenticated — generates a checkout link for the user's organization.
 */
router.get('/checkout-session', requireAuth, BillingController.getCheckoutSession);

/**
 * GET /api/billing/portal
 * Authenticated — returns the customer portal URL for subscription management.
 */
router.get('/portal', requireAuth, BillingController.getCustomerPortal);

export default router;
