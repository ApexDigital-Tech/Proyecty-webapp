import { Request, Response, NextFunction } from 'express';
import { AuthRequest } from '../middleware/auth.ts';
import { createCheckoutUrl, getCustomerPortalUrl } from '../services/billing.service.ts';
import { logger } from '../lib/logger.ts';

/**
 * GET /api/billing/checkout-session
 * 
 * Generates a LemonSqueezy checkout URL for the authenticated user's organization.
 * The frontend redirects the user to this URL to complete payment.
 */
export const getCheckoutSession = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const tenantId = req.user?.tenantId;
    if (!tenantId) {
      return res.status(401).json({ error: 'No autorizado: Falta información del tenant' });
    }

    if (req.user?.role !== 'DIRECTOR') {
      return res.status(403).json({ error: 'Acceso denegado: Solo el rol DIRECTOR puede gestionar facturación y planes' });
    }

    const checkoutUrl = await createCheckoutUrl(tenantId);
    return res.json({ checkoutUrl });
  } catch (err) {
    logger.error('Failed to generate checkout session', { error: err, tenantId: req.user?.tenantId });
    next(err);
  }
};

/**
 * GET /api/billing/portal
 * 
 * Retrieves the LemonSqueezy Customer Portal URL and redirects the user.
 * The portal allows managing subscription, updating payment method, and viewing invoices.
 */
export const getCustomerPortal = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const tenantId = req.user?.tenantId;
    if (!tenantId) {
      return res.status(401).json({ error: 'No autorizado: Falta información del tenant' });
    }

    if (req.user?.role !== 'DIRECTOR') {
      return res.status(403).json({ error: 'Acceso denegado: Solo el rol DIRECTOR puede gestionar facturación y planes' });
    }

    const portalUrl = await getCustomerPortalUrl(tenantId);
    return res.json({ portalUrl });
  } catch (err) {
    logger.error('Failed to get customer portal URL', { error: err, tenantId: req.user?.tenantId });
    next(err);
  }
};
