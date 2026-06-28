import { Request, Response, NextFunction } from 'express';
import { supabase } from '../lib/supabase.ts';
import { getOrCreateUser } from '../db/users.ts';

export interface AuthRequest extends Request {
  user?: {
    uid: string;
    email: string;
    name: string;
    role: string;
    tenantId: number;
    id?: number;
  };
}

export const requireAuth = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'No autorizado: Falta el token de acceso' });
  }

  const token = authHeader.split('Bearer ')[1];
  
  // Safe temporal logging para debug (sin exponer el JWT completo)
  if (!token || token === 'null' || token === 'undefined') {
    console.warn(`[Auth Debug] Token recibido está vacío o inválido: "${token}"`);
  } else {
    const segments = token.split('.');
    console.log(`[Auth Debug] Token recibido con prefijo Bearer. Segmentos: ${segments.length} (formato esperado: 3). Empieza con: ${token.substring(0, 5)}...`);
  }

  // Support for all Demo Roles
  if (token.startsWith('demo-')) {
    if (token.startsWith('demo-uid-')) {
      const parts = token.split('-role-');
      const uidPart = parts[0].replace('demo-uid-', '');
      const simulatedRole = parts.length > 1 ? parts[1].toUpperCase() : null;

      try {
        const { getUserByUid } = await import('../db/users.ts');
        const dbUser = await getUserByUid(uidPart);
        
        if (!dbUser) {
          return res.status(401).json({ error: 'Usuario demo no encontrado' });
        }
        
        if (dbUser.isActive === false) {
          return res.status(403).json({ error: 'Usuario suspendido', code: 'USER_SUSPENDED' });
        }

        const mapRoleToEnum = (r: string) => {
          const upper = r.toUpperCase();
          if (upper.includes('DIRECTOR') || upper.includes('ADMIN')) return 'DIRECTOR';
          if (upper.includes('MANAGER') || upper.includes('COORDINADOR')) return 'MANAGER';
          if (upper.includes('FINAN') || upper.includes('ADMINISTRATIVO')) return 'FINANCE';
          if (upper.includes('AUDITOR') || upper.includes('MONITOREO')) return 'AUDITOR';
          if (upper.includes('FINANCIADOR') || upper.includes('DONANTE')) return 'FINANCIADOR';
          return 'MANAGER';
        };

        req.user = {
          uid: dbUser.uid,
          email: dbUser.email,
          name: dbUser.name,
          role: simulatedRole || mapRoleToEnum(dbUser.roleName || ''),
          tenantId: dbUser.tenantId,
          id: dbUser.id,
        };
        return next();
      } catch (err) {
        console.error('Error fetching demo user:', err);
        return res.status(500).json({ error: 'Error al sincronizar usuario de prueba' });
      }
    } else {
      // Handle simple demo tokens like demo-director
      const simulatedRole = token.replace('demo-', '').toUpperCase();
      req.user = {
        uid: `demo-${simulatedRole.toLowerCase()}`,
        email: `demo@proyecty.org`,
        name: `Demo ${simulatedRole}`,
        role: simulatedRole,
        tenantId: 1, // Default tenant
      };
      return next();
    }
  }

  // Real Supabase Auth verification
  try {
    const { data: { user }, error } = await supabase.auth.getUser(token);
    
    if (error || !user) {
      throw error || new Error('No user found in token');
    }

    const email = user.email || 'user@proyecty.org';
    const name = user.user_metadata?.full_name || email.split('@')[0] || 'Usuario Proyecty';
    const uid = user.id;
    
    // Assign a default role if not registered yet.
    const dbUser = await getOrCreateUser(uid, email, name, 'MANAGER');
    
    if (dbUser.isActive === false) {
      return res.status(403).json({ error: 'Usuario suspendido', code: 'USER_SUSPENDED' });
    }

    const mapRoleToEnum = (r: string) => {
      const upper = r.toUpperCase();
      if (upper.includes('DIRECTOR') || upper.includes('ADMIN')) return 'DIRECTOR';
      if (upper.includes('MANAGER') || upper.includes('COORDINADOR')) return 'MANAGER';
      if (upper.includes('FINAN') || upper.includes('ADMINISTRATIVO')) return 'FINANCE';
      if (upper.includes('AUDITOR') || upper.includes('MONITOREO')) return 'AUDITOR';
      if (upper.includes('FINANCIADOR') || upper.includes('DONANTE')) return 'FINANCIADOR';
      return 'MANAGER';
    };

    req.user = {
      uid,
      email,
      name,
      role: mapRoleToEnum(dbUser.role || 'Project Manager'),
      tenantId: dbUser.tenantId,
      id: dbUser.id,
    };
    next();
  } catch (error) {
    console.error('Error verifying Supabase JWT token:', error);
    return res.status(401).json({ error: 'No autorizado: Token de acceso inválido' });
  }
};
