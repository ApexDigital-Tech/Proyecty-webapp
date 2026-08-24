import { Response, NextFunction } from 'express';
import { AuthRequest } from './auth.ts';
import { CacheService } from '../services/CacheService.ts';
import { Module, Action } from '../types/rbac.ts';

/**
 * Middleware para validar permisos basados en RBAC usando caché.
 * Debe ser ejecutado DESPUÉS de `requireAuth`.
 * 
 * @param module Módulo al que se intenta acceder (ej. 'budgets')
 * @param action Acción que se intenta realizar (ej. 'approve')
 */
export const requirePermission = (module: Module, action: Action) => {
  return async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const user = req.user;
      
      if (!user || !user.id) {
        return res.status(401).json({ error: 'No autorizado: Falta contexto de usuario' });
      }

      // Hardcode SuperAdmin bypass for now if role is DIRECTOR/SuperAdmin, 
      // but strictly we should check permissions
      // To strictly follow RBAC:
      const permissions = await CacheService.getUserPermissions(user.id);
      
      const hasPermission = permissions.some(
        p => p.module === module && p.actions.includes(action)
      );

      if (!hasPermission) {
        console.warn(`[RBAC] Acceso denegado: Usuario ${user.id} (${user.email}) intentó '${action}' en '${module}'`);
        return res.status(403).json({ error: 'Prohibido: No tienes permisos suficientes para realizar esta acción' });
      }

      next();
    } catch (err) {
      console.error('[RBAC Middleware Error]:', err);
      return res.status(500).json({ error: 'Error interno validando permisos' });
    }
  };
};
