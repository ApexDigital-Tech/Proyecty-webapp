import { Request, Response, NextFunction } from 'express';
import { Sentry } from '../lib/sentry.ts';
import { logger } from '../lib/logger.ts';

export function errorHandler(err: any, req: Request, res: Response, next: NextFunction) {
  // Pass to Sentry
  Sentry.captureException(err);

  // Log with Winston
  logger.error(err.message || 'Internal Server Error', { stack: err.stack, path: req.path, method: req.method });

  const statusCode = err.status || err.statusCode || 500;
  
  if (process.env.NODE_ENV === 'development') {
    return res.status(statusCode).json({
      error: err.message,
      stack: err.stack,
    });
  }

  res.status(statusCode).json({ error: statusCode === 500 ? 'Error interno del servidor' : err.message });
}
