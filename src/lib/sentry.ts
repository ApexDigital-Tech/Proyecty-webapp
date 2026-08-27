import * as Sentry from '@sentry/node';

export async function initSentry() {
  const integrations: any[] = [];

  if (
    process.env.SENTRY_DSN &&
    process.env.SENTRY_PROFILING_ENABLED === "true" &&
    process.env.NODE_ENV === "production"
  ) {
    try {
      const profilingModule = await import('@sentry/profiling-node');
      integrations.push(profilingModule.nodeProfilingIntegration());
    } catch (err) {
      console.warn('[Observability] Native profiling module could not be loaded. Continuing with base Sentry.');
    }
  }

  Sentry.init({
    dsn: process.env.SENTRY_DSN || '',
    integrations,
    // Tracing
    tracesSampleRate: 1.0, // Capture 100% of the transactions
    // Set sampling rate for profiling - this is relative to tracesSampleRate
    profilesSampleRate: 1.0,
    environment: process.env.NODE_ENV || 'development',
  });
}

export { Sentry };
