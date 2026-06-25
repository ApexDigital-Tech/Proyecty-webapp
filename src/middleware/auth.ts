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

  // Support for Demo Roles in AI Studio preview to allow fully testing RBAC and CRUD
  if (token.startsWith('demo-')) {
    const roleType = token.replace('demo-', '').toUpperCase(); // 'DIRECTOR', 'MANAGER', 'FINANCE'
    let name = 'Director Operativo';
    let email = 'director@proyecty.org';
    let uid = 'demo_director_uid';

    if (roleType === 'MANAGER') {
      name = 'Rodrigo G. (Manager)';
      email = 'rodrigo@proyecty.org';
      uid = 'demo_manager_uid';
    } else if (roleType === 'FINANCE') {
      name = 'Karla Martínez (Finanzas)';
      email = 'karla.finanzas@proyecty.org';
      uid = 'demo_finance_uid';
    }

    try {
      const dbUser = await getOrCreateUser(uid, email, name, roleType);
      req.user = {
        uid,
        email,
        name,
        role: roleType,
        tenantId: dbUser.tenantId,
        id: dbUser.id,
      };
      return next();
    } catch (err) {
      console.error('Error synchronizing demo user:', err);
      return res.status(500).json({ error: 'Error al sincronizar usuario de prueba' });
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
    
    req.user = {
      uid,
      email,
      name,
      role: dbUser.role || 'Project Manager',
      tenantId: dbUser.tenantId,
      id: dbUser.id,
    };
    next();
  } catch (error) {
    console.error('Error verifying Supabase JWT token:', error);
    return res.status(401).json({ error: 'No autorizado: Token de acceso inválido' });
  }
};
