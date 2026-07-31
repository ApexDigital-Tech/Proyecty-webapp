import { Request, Response, NextFunction } from 'express';
import { ZodSchema, ZodError } from 'zod';
import { logger } from '../lib/logger.ts';

export function validateSchema(schema: ZodSchema) {
  return (req: Request, res: Response, next: NextFunction) => {
    try {
      schema.parse(req.body);
      next();
    } catch (error) {
      if (error instanceof ZodError) {
        logger.warn('Schema validation failed', { errors: error.errors, path: req.path });
        return res.status(400).json({
          error: 'Datos inválidos',
          details: error.errors.map(e => ({ path: e.path.join('.'), message: e.message }))
        });
      }
      next(error);
    }
  };
}
