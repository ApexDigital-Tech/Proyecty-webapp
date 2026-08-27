import * as Sentry from '@sentry/node';

export function initSentry() {
  const integrations: any[] = [];
  try {
    // Dynamically load profiling if native binary exists for Node runtime
    const profiling = require('@sentry/profiling-node');
    if (profiling?.nodeProfilingIntegration) {
      integrations.push(profiling.nodeProfilingIntegration());
    }
  } catch {
    // Profiling binary optional or unsupported on current Node version
  }

  Sentry.init({
    dsn: process.env.SENTRY_DSN || '',
    integrations,
    tracesSampleRate: 1.0,
    profilesSampleRate: 1.0,
    environment: process.env.NODE_ENV || 'development',
  });
}

export { Sentry };
