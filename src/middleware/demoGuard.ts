import { Request, Response, NextFunction } from 'express';

/**
 * Middleware para bloquear el acceso anónimo o público a endpoints demo en entornos de producción.
 * Cumple con la directriz de seguridad de auditoría AUTH-DEMO-02.
 */
export const requireDemoModeEnabled = (req: Request, res: Response, next: NextFunction) => {
  const isDemoExplicitlyEnabled = process.env.ENABLE_INTERNAL_DEMO === 'true';
  const isProduction = process.env.NODE_ENV === 'production';

  if (isProduction && !isDemoExplicitlyEnabled) {
    return res.status(404).json({
      error: 'Recurso no encontrado o deshabilitado en este entorno',
      code: 'DEMO_MODE_DISABLED',
    });
  }

  // En caso de que no esté explícitamente habilitado, denegar siempre
  if (!isDemoExplicitlyEnabled && process.env.NODE_ENV !== 'test' && process.env.NODE_ENV !== 'development') {
    return res.status(404).json({
      error: 'Recurso no encontrado o deshabilitado en este entorno',
      code: 'DEMO_MODE_DISABLED',
    });
  }

  next();
};
