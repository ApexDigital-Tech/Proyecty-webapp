import { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';
import { lemonSqueezyWebhookSchema } from '../schemas/billing.schema.ts';
import { syncSubscriptionToOrganization } from '../services/billing.service.ts';
import { sendSubscriptionActivatedEmail, sendPaymentFailedEmail } from '../services/email.service.ts';
import { logAuditEvent } from '../services/audit.service.ts';
import { db } from '../db/index.ts';
import { organizations } from '../db/schema.ts';
import { eq } from 'drizzle-orm';
import { logger } from '../lib/logger.ts';

const WEBHOOK_SECRET = process.env.LEMONSQUEEZY_WEBHOOK_SECRET;

// --- HMAC Signature Verification ---

/**
 * Verifies the X-Signature header from LemonSqueezy using HMAC-SHA256.
 * Rejects the request with 401 if the signature is missing or invalid.
 * CRITICAL: This must run BEFORE any JSON parsing middleware on this route,
 * or the raw body must be preserved for signature verification.
 */
function verifyWebhookSignature(rawBody: string, signatureHeader: string | undefined): boolean {
  if (!WEBHOOK_SECRET) {
    logger.error('LEMONSQUEEZY_WEBHOOK_SECRET is not configured — rejecting all webhooks');
    return false;
  }

  if (!signatureHeader) {
    return false;
  }

  const hmac = crypto.createHmac('sha256', WEBHOOK_SECRET);
  const digest = hmac.update(rawBody).digest('hex');

  return crypto.timingSafeEqual(
    Buffer.from(digest, 'hex'),
    Buffer.from(signatureHeader, 'hex'),
  );
}

// --- Webhook Handler ---

/**
 * POST /api/webhooks/lemonsqueezy
 * 
 * Flow:
 * 1. Verify HMAC signature (defense against spoofed requests)
 * 2. Parse + validate payload with Zod schema
 * 3. Extract organization_id from custom_data
 * 4. Route to handler based on meta.event_name
 * 5. Sync subscription state to DB
 */
export const handleLemonSqueezyWebhook = async (req: Request, res: Response, next: NextFunction) => {
  try {
    // Step 1: Signature verification
    const rawBody = (req as Request & { rawBody?: string }).rawBody;
    if (!rawBody) {
      logger.warn('Webhook received without raw body — ensure raw body middleware is configured');
      return res.status(400).json({ error: 'Raw body not available for signature verification' });
    }

    const signature = req.headers['x-signature'] as string | undefined;
    if (!verifyWebhookSignature(rawBody, signature)) {
      logger.warn('Webhook signature verification failed', {
        ip: req.ip,
        hasSignature: !!signature,
      });
      return res.status(401).json({ error: 'Invalid webhook signature' });
    }

    // Step 2: Validate payload with Zod
    const parseResult = lemonSqueezyWebhookSchema.safeParse(req.body);
    if (!parseResult.success) {
      logger.warn('Webhook payload validation failed', {
        errors: parseResult.error.errors,
      });
      return res.status(400).json({ error: 'Invalid webhook payload' });
    }

    const payload = parseResult.data;
    const eventName = payload.meta.event_name;
    const attributes = payload.data.attributes;

    // Step 3: Extract organization_id from custom_data
    const organizationIdRaw = payload.meta.custom_data?.organization_id;
    if (!organizationIdRaw) {
      logger.error('Webhook missing organization_id in custom_data', { eventName });
      // Still return 200 to prevent LemonSqueezy from retrying indefinitely
      return res.status(200).json({ received: true, warning: 'Missing organization_id' });
    }

    const organizationId = parseInt(organizationIdRaw, 10);
    if (isNaN(organizationId)) {
      logger.error('Webhook organization_id is not a valid number', { organizationIdRaw, eventName });
      return res.status(200).json({ received: true, warning: 'Invalid organization_id format' });
    }

    // Step 4: Route based on event and sync to DB
    logger.info('Processing LemonSqueezy webhook', { eventName, organizationId, subscriptionId: payload.data.id });

    switch (eventName) {
      case 'subscription_created': {
        await syncSubscriptionToOrganization({
          organizationId,
          lemonSqueezyCustomerId: String(attributes.customer_id),
          subscriptionId: payload.data.id,
          subscriptionStatus: attributes.status,
          variantId: String(attributes.variant_id),
          renewsAt: attributes.renews_at,
        });

        logAuditEvent({
          tenantId: organizationId,
          action: 'SUBSCRIPTION_CREATED',
          entity: 'organization',
          entityId: organizationId,
          metadata: { variantId: attributes.variant_id, subscriptionId: payload.data.id }
        });
        
        sendSubscriptionActivatedEmail(attributes.user_email, attributes.product_name).catch(err => {
          logger.error('Failed to send subscription activated email async', { error: err });
        });
        break;
      }
      
      case 'subscription_updated': {
        await syncSubscriptionToOrganization({
          organizationId,
          lemonSqueezyCustomerId: String(attributes.customer_id),
          subscriptionId: payload.data.id,
          subscriptionStatus: attributes.status,
          variantId: String(attributes.variant_id),
          renewsAt: attributes.renews_at,
        });
        break;
      }

      case 'subscription_payment_failed': {
        await syncSubscriptionToOrganization({
          organizationId,
          lemonSqueezyCustomerId: String(attributes.customer_id),
          subscriptionId: payload.data.id,
          subscriptionStatus: 'past_due',
          variantId: String(attributes.variant_id),
          renewsAt: attributes.renews_at,
        });

        const orgResult = await db.select({ name: organizations.name })
          .from(organizations)
          .where(eq(organizations.id, organizationId))
          .limit(1);
        const orgName = orgResult.length > 0 ? orgResult[0].name : 'Tu Organización';

        sendPaymentFailedEmail(attributes.user_email, orgName).catch(err => {
          logger.error('Failed to send payment failed email async', { error: err });
        });

        logger.warn('Subscription payment failed', {
          organizationId,
          subscriptionId: payload.data.id,
          userEmail: attributes.user_email,
        });
        break;
      }
    }

    // Step 5: Always return 200 to acknowledge receipt
    return res.status(200).json({ received: true, event: eventName });
  } catch (err) {
    next(err);
  }
};
