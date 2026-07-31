import { lemonSqueezySetup, createCheckout, getSubscription } from '@lemonsqueezy/lemonsqueezy.js';
import { db } from '../db/index.ts';
import { organizations } from '../db/schema.ts';
import { eq } from 'drizzle-orm';
import { logger } from '../lib/logger.ts';

// --- SDK Initialization ---

const LEMONSQUEEZY_API_KEY = process.env.LEMONSQUEEZY_API_KEY;
const LEMONSQUEEZY_STORE_ID = process.env.LEMONSQUEEZY_STORE_ID;
const LEMONSQUEEZY_VARIANT_ID = process.env.LEMONSQUEEZY_VARIANT_ID;

function ensureSdkInitialized(): void {
  if (!LEMONSQUEEZY_API_KEY) {
    throw new Error('LEMONSQUEEZY_API_KEY is not configured');
  }
  lemonSqueezySetup({ apiKey: LEMONSQUEEZY_API_KEY });
}

// --- Checkout URL Generation ---

/**
 * Creates a LemonSqueezy checkout URL for a given organization.
 * Passes organizationId as custom_data so the webhook can link
 * the subscription back to the correct tenant.
 */
export async function createCheckoutUrl(organizationId: number): Promise<string> {
  ensureSdkInitialized();

  if (!LEMONSQUEEZY_STORE_ID || !LEMONSQUEEZY_VARIANT_ID) {
    throw new Error('LEMONSQUEEZY_STORE_ID and LEMONSQUEEZY_VARIANT_ID must be configured');
  }

  const org = await db.select({ id: organizations.id, name: organizations.name })
    .from(organizations)
    .where(eq(organizations.id, organizationId))
    .limit(1);

  if (org.length === 0) {
    throw new Error(`Organization ${organizationId} not found`);
  }

  const { data, error } = await createCheckout(LEMONSQUEEZY_STORE_ID, LEMONSQUEEZY_VARIANT_ID, {
    checkoutData: {
      custom: {
        organization_id: String(organizationId),
      },
    },
    productOptions: {
      redirectUrl: `${process.env.APP_URL || 'http://localhost:3000'}/settings/billing?success=true`,
    },
  });

  if (error) {
    logger.error('LemonSqueezy checkout creation failed', { error, organizationId });
    throw new Error(`Failed to create checkout: ${error.message}`);
  }

  const checkoutUrl = data?.data?.attributes?.url;
  if (!checkoutUrl) {
    throw new Error('Checkout URL not found in LemonSqueezy response');
  }

  logger.info('Checkout URL created', { organizationId, checkoutUrl });
  return checkoutUrl;
}

// --- Customer Portal URL ---

/**
 * Retrieves the LemonSqueezy Customer Portal URL for an organization.
 * Requires the organization to have an active subscriptionId.
 */
export async function getCustomerPortalUrl(organizationId: number): Promise<string> {
  ensureSdkInitialized();

  const org = await db.select({
    subscriptionId: organizations.subscriptionId,
    lemonSqueezyCustomerId: organizations.lemonSqueezyCustomerId,
  })
    .from(organizations)
    .where(eq(organizations.id, organizationId))
    .limit(1);

  if (org.length === 0) {
    throw new Error(`Organization ${organizationId} not found`);
  }

  const { subscriptionId } = org[0];

  if (!subscriptionId) {
    throw new Error('Organization does not have an active subscription');
  }

  const { data, error } = await getSubscription(subscriptionId);

  if (error) {
    logger.error('Failed to fetch subscription from LemonSqueezy', { error, organizationId, subscriptionId });
    throw new Error(`Failed to fetch subscription: ${error.message}`);
  }

  const portalUrl = data?.data?.attributes?.urls?.customer_portal;
  if (!portalUrl) {
    throw new Error('Customer portal URL not found in subscription data');
  }

  logger.info('Customer portal URL retrieved', { organizationId });
  return portalUrl;
}

// --- Subscription Status Sync ---

interface SyncSubscriptionParams {
  organizationId: number;
  lemonSqueezyCustomerId: string;
  subscriptionId: string;
  subscriptionStatus: string;
  variantId: string;
  renewsAt: string | null;
}

/**
 * Syncs LemonSqueezy subscription data to the organization record.
 * Called by the webhook controller after signature + schema validation.
 */
export async function syncSubscriptionToOrganization(params: SyncSubscriptionParams): Promise<void> {
  const {
    organizationId,
    lemonSqueezyCustomerId,
    subscriptionId,
    subscriptionStatus,
    variantId,
    renewsAt,
  } = params;

  await db.update(organizations)
    .set({
      lemonSqueezyCustomerId,
      subscriptionId,
      subscriptionStatus,
      variantId,
      renewsAt: renewsAt ? new Date(renewsAt) : null,
    })
    .where(eq(organizations.id, organizationId));

  logger.info('Organization subscription synced', {
    organizationId,
    subscriptionId,
    subscriptionStatus,
    variantId,
  });
}
