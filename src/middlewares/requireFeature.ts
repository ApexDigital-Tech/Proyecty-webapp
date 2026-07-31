import { Response, NextFunction } from 'express';
import { AuthRequest } from '../middleware/auth.ts';
import { db } from '../db/index.ts';
import { organizations } from '../db/schema.ts';
import { eq } from 'drizzle-orm';
import { logger } from '../lib/logger.ts';

// Feature names
export type Feature = 'ai_reports' | 'advanced_metrics' | 'unlimited_projects';

// Variant IDs (In a real app, these should come from DB or env variables)
const PRO_VARIANT_ID = process.env.LEMONSQUEEZY_PRO_VARIANT_ID || 'pro_variant';
const ENTERPRISE_VARIANT_ID = process.env.LEMONSQUEEZY_ENTERPRISE_VARIANT_ID || 'enterprise_variant';

const FEATURE_PLANS: Record<Feature, string[]> = {
  'ai_reports': [PRO_VARIANT_ID, ENTERPRISE_VARIANT_ID],
  'advanced_metrics': [PRO_VARIANT_ID, ENTERPRISE_VARIANT_ID],
  'unlimited_projects': [ENTERPRISE_VARIANT_ID],
};

/**
 * Middleware to restrict access based on the organization's subscription plan.
 */
export const requireFeature = (feature: Feature) => {
  return async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const tenantId = req.user?.tenantId;
      if (!tenantId) {
        return res.status(401).json({ error: 'No autorizado: Falta información del tenant' });
      }

      const org = await db.select({
        subscriptionStatus: organizations.subscriptionStatus,
        variantId: organizations.variantId,
      })
      .from(organizations)
      .where(eq(organizations.id, tenantId))
      .limit(1);

      if (org.length === 0) {
        return res.status(404).json({ error: 'Organización no encontrada' });
      }

      const { subscriptionStatus, variantId } = org[0];

      // Block if subscription is not active or on trial
      const isActiveSubscription = ['active', 'on_trial'].includes(subscriptionStatus);
      const allowedVariants = FEATURE_PLANS[feature];
      
      const hasAccess = isActiveSubscription && variantId && allowedVariants.includes(variantId);

      if (!hasAccess) {
        logger.warn(`Acceso denegado a feature: ${feature}`, { tenantId, subscriptionStatus, variantId });
        return res.status(403).json({
          error: 'Plan insuficiente',
          code: 'UPGRADE_REQUIRED',
          message: `La funcionalidad '${feature}' requiere un plan superior. Por favor, actualiza tu suscripción.`,
          requiredPlans: allowedVariants,
        });
      }

      next();
    } catch (error) {
      logger.error(`Error en requireFeature middleware para ${feature}`, { error, tenantId: req.user?.tenantId });
      next(error);
    }
  };
};

/**
 * Middleware skeleton to check limits per tenant
 */
export const checkUsageLimits = async (req: AuthRequest, res: Response, next: NextFunction) => {
  // Logic to enforce strict counts (e.g. max 5 projects on FREE) could go here
  next();
};
