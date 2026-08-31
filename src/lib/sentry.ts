import * as Sentry from '@sentry/node';

export async function initSentry() {
  const isTest = process.env.NODE_ENV === 'test';
  
  if (isTest) {
    // En entorno test, Sentry no debe realizar conexiones externas
    Sentry.init({
      dsn: '',
      enabled: false,
      environment: 'test',
    });
    return;
  }

  const integrations: any[] = [];

  if (
    process.env.SENTRY_DSN &&
    process.env.SENTRY_PROFILING_ENABLED === 'true' &&
    process.env.NODE_ENV === 'production'
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
    tracesSampleRate: process.env.NODE_ENV === 'production' ? 1.0 : 0.0,
    profilesSampleRate: process.env.NODE_ENV === 'production' ? 1.0 : 0.0,
    environment: process.env.NODE_ENV || 'development',
    enabled: process.env.NODE_ENV === 'production',
  });
}

export { Sentry };
