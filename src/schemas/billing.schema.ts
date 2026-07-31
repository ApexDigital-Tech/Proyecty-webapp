import { z } from 'zod';

// --- LemonSqueezy Webhook Event Types ---
// Docs: https://docs.lemonsqueezy.com/guides/developer-guide/webhooks

/**
 * Possible subscription statuses from LemonSqueezy.
 * 'on_trial' | 'active' | 'paused' | 'past_due' | 'unpaid' | 'cancelled' | 'expired'
 */
const subscriptionStatusValues = [
  'on_trial',
  'active',
  'paused',
  'past_due',
  'unpaid',
  'cancelled',
  'expired',
] as const;

export const lemonSqueezySubscriptionStatusSchema = z.enum(subscriptionStatusValues);
export type LemonSqueezySubscriptionStatus = z.infer<typeof lemonSqueezySubscriptionStatusSchema>;

// --- Supported webhook event names ---

const supportedEventNames = [
  'subscription_created',
  'subscription_updated',
  'subscription_payment_failed',
] as const;

export const webhookEventNameSchema = z.enum(supportedEventNames);
export type WebhookEventName = z.infer<typeof webhookEventNameSchema>;

// --- Shared nested objects within webhook payloads ---

const subscriptionAttributesSchema = z.object({
  store_id: z.number(),
  customer_id: z.number(),
  order_id: z.number(),
  product_id: z.number(),
  variant_id: z.number(),
  product_name: z.string(),
  variant_name: z.string(),
  user_name: z.string(),
  user_email: z.string().email(),
  status: lemonSqueezySubscriptionStatusSchema,
  status_formatted: z.string(),
  renews_at: z.string().nullable(),
  ends_at: z.string().nullable(),
  trial_ends_at: z.string().nullable(),
  created_at: z.string(),
  updated_at: z.string(),
});

const subscriptionDataSchema = z.object({
  type: z.literal('subscriptions'),
  id: z.string(),
  attributes: subscriptionAttributesSchema,
});

const webhookMetaSchema = z.object({
  event_name: webhookEventNameSchema,
  custom_data: z.object({
    organization_id: z.string(),
  }).optional(),
});

// --- Base Webhook Schema ---

/**
 * Validates any supported LemonSqueezy webhook payload.
 * The controller routes to the correct handler based on `meta.event_name`.
 * Using a single base schema instead of discriminatedUnion because
 * the discriminator field is nested inside `meta`, not at root level.
 */
export const lemonSqueezyWebhookSchema = z.object({
  meta: webhookMetaSchema,
  data: subscriptionDataSchema,
});

export type LemonSqueezyWebhookPayload = z.infer<typeof lemonSqueezyWebhookSchema>;

// --- Convenience type aliases for controller handlers ---

export type SubscriptionCreatedPayload = LemonSqueezyWebhookPayload;
export type SubscriptionUpdatedPayload = LemonSqueezyWebhookPayload;
export type SubscriptionPaymentFailedPayload = LemonSqueezyWebhookPayload;
