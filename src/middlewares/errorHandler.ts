import { Request, Response, NextFunction } from 'express';
import { ZodError } from 'zod';
import { Sentry } from '../lib/sentry.ts';
import { logger } from '../lib/logger.ts';
import { ConflictError, NotFoundError, ForbiddenError, UnauthorizedError, ValidationError } from '../utils/errors.ts';

/**
 * Middleware Global de Manejo de Errores (API Resiliente)
 * Intercepta y formatea los errores en una estructura predecible para la UX.
 */
export function errorHandler(err: any, req: Request, res: Response, next: NextFunction) {
  // Pass to Sentry
  Sentry.captureException(err);

  // 1. Errores de Validación (Zod)
  if (err instanceof ZodError) {
    const details = err.errors.map((e) => ({
      field: e.path.join('.'),
      message: e.message,
    }));
    return res.status(400).json({
      error: true,
      code: 'VALIDATION_ERROR',
      message: 'Los datos proporcionados no son válidos.',
      details,
    });
  }

  // 2. Errores de Dominio (Custom Errors)
  if (err instanceof ConflictError) {
    return res.status(409).json({ error: true, code: 'CONFLICT', message: err.message });
  }
  if (err instanceof NotFoundError) {
    return res.status(404).json({ error: true, code: 'NOT_FOUND', message: err.message });
  }
  if (err instanceof ForbiddenError) {
    return res.status(403).json({ error: true, code: 'FORBIDDEN', message: err.message });
  }
  if (err instanceof UnauthorizedError) {
    return res.status(401).json({ error: true, code: 'UNAUTHORIZED', message: err.message });
  }
  if (err instanceof ValidationError) {
    return res.status(400).json({ error: true, code: 'VALIDATION_ERROR', message: err.message });
  }

  // 3. Errores de Base de Datos (PostgreSQL via postgres-js / Drizzle)
  if (err.code && typeof err.code === 'string') {
    if (err.code === '23505') {
      return res.status(409).json({ error: true, code: 'DUPLICATE_ENTRY', message: 'El registro ya existe o entra en conflicto.' });
    }
    if (err.code === '23503') {
      return res.status(400).json({ error: true, code: 'RELATION_ERROR', message: 'El recurso al que se intenta acceder no existe o está vinculado a otro.' });
    }
    // RLS / Permisos
    if (err.code === '42501') {
      logger.warn('Violación RLS interceptada', { error: err.message, table: err.table, user: (req as any).user?.id });
      return res.status(403).json({ error: true, code: 'RLS_FORBIDDEN', message: 'No tienes los permisos necesarios para realizar esta acción.' });
    }
  }

  // Log interno para Errores No Controlados
  logger.error(err.message || 'Internal Server Error', { stack: err.stack, path: req.path, method: req.method, postgresCode: err.code });

  const statusCode = err.status || err.statusCode || (err.name === 'TenantIsolationError' ? 404 : 500);
  const message = statusCode === 500 ? 'Ocurrió un error inesperado en el servidor. El equipo técnico ha sido notificado.' : (err.message || 'Error interno del servidor');

  if (process.env.NODE_ENV === 'development') {
    return res.status(statusCode).json({
      error: true,
      code: 'INTERNAL_SERVER_ERROR_DEV',
      message: err.message,
      stack: err.stack,
    });
  }

  return res.status(statusCode).json({
    error: true,
    code: 'INTERNAL_SERVER_ERROR',
    message,
  });
}
