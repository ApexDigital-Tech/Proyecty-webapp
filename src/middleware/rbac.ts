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

      // Director / Administrador general tiene acceso completo a los módulos
      if (user.role === 'DIRECTOR' || user.role === 'ADMIN' || user.role === 'SUPERADMIN') {
        return next();
      }

      const permissions = await CacheService.getUserPermissions(user.id);
      
      const hasPermission = permissions.some(
        p => p.module === module && p.actions.includes(action)
      );

      // Fallback para roles estándar si no están en la tabla permissions
      const roleUpper = (user.role || '').toUpperCase();
      const isAuthorizedRole = (
        (module === 'expenses' && action !== 'approve' && (roleUpper === 'MANAGER' || roleUpper === 'FINANCE' || roleUpper === 'RESPONSABLE_PROYECTO')) ||
        (module === 'budgets' && (roleUpper === 'MANAGER' || roleUpper === 'FINANCE' || roleUpper === 'AUDITOR')) ||
        (module === 'projects' && (roleUpper === 'MANAGER' || roleUpper === 'RESPONSABLE_PROYECTO' || roleUpper === 'AUDITOR' || roleUpper === 'FINANCIADOR'))
      );

      if (!hasPermission && !isAuthorizedRole) {
        console.warn(`[RBAC] Acceso denegado: Usuario ${user.id} (${user.email}) rol ${user.role} intentó '${action}' en '${module}'`);
        return res.status(403).json({ error: 'Prohibido: No tienes permisos suficientes para realizar esta acción' });
      }

      next();
    } catch (err) {
      console.error('[RBAC Middleware Error]:', err);
      return res.status(500).json({ error: 'Error interno validando permisos' });
    }
  };
};
