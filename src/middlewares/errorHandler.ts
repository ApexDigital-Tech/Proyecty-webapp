import { Request, Response, NextFunction } from 'express';
import { Sentry } from '../lib/sentry.ts';
import { logger } from '../lib/logger.ts';

export function errorHandler(err: any, req: Request, res: Response, next: NextFunction) {
  // Pass to Sentry
  Sentry.captureException(err);

  // Log with Winston
  logger.error(err.message || 'Internal Server Error', { stack: err.stack, path: req.path, method: req.method });

  let statusCode = err.status || err.statusCode || (err.name === 'TenantIsolationError' ? 404 : 500);
  let message = err.message || 'Error interno del servidor';

  // Handle Postgres RLS/Permissions violations
  if (err.code === '42501') {
    statusCode = 403;
    message = 'Acceso denegado por políticas de seguridad (RLS). Operación no permitida.';
    
    // Log the full RLS error with context to Sentry
    Sentry.captureException(err, {
      extra: {
        postgresCode: err.code,
        postgresMessage: err.message,
        table: err.table,
        detail: err.detail,
        query: err.query
      },
      tags: { type: 'rls_violation' }
    });
    
    logger.warn('Violación RLS interceptada', { 
      error: err.message, 
      table: err.table, 
      user: (req as any).user?.id 
    });
  }
  
  if (process.env.NODE_ENV === 'development') {
    return res.status(statusCode).json({
      error: err.message,
      stack: err.stack,
    });
  }

  res.status(statusCode).json({ error: statusCode === 500 ? 'Error interno del servidor' : message });
}
