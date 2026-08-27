import { Request, Response, NextFunction } from 'express';
import { supabaseBackend as supabase } from '../lib/supabase-backend.ts';
import { getOrCreateUser } from '../db/users.ts';
import { verifyDemoToken } from '../services/demoAuth.service.ts';

export interface AuthRequest extends Request {
  user?: {
    uid: string;
    email: string;
    name: string;
    role: string;
    tenantId: number;
    id?: number;
    roleName?: string;
  };
}

export const requireAuth = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  let token: string | undefined = undefined;

  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    token = authHeader.split('Bearer ')[1]?.trim();
  }

  // Fallback a Cookies si no hay Authorization header
  if (!token && req.headers.cookie) {
    const cookies = req.headers.cookie.split(';').map(c => c.trim());
    for (const c of cookies) {
      if (c.startsWith('sb-') && c.includes('-auth-token=')) {
        try {
          const val = decodeURIComponent(c.substring(c.indexOf('=') + 1));
          const parsed = JSON.parse(val);
          if (Array.isArray(parsed) && parsed[0]) {
            token = parsed[0];
          }
        } catch (e) {}
      } else if (c.startsWith('sb-access-token=')) {
        token = c.substring(c.indexOf('=') + 1);
      }
    }
  }

  if (!token) {
    return res.status(401).json({ error: 'No autorizado: Falta el token de acceso' });
  }

  // --- CRYPTOGRAPHIC DEMO TOKENS (AUTH-01 & AUTH-02) ---
  if (token.startsWith('demo.')) {
    try {
      const payload = verifyDemoToken(token);
      req.user = {
        id: payload.user_id || payload.id || 1,
        uid: payload.sub,
        email: payload.email,
        name: payload.name,
        role: payload.role,
        roleName: payload.roleName,
        tenantId: payload.tenant_id,
      };
      return next();
    } catch (err: any) {
      console.warn(`[Auth Security] Intento de acceso con token demo inválido/expirado: ${err?.message}`);
      return res.status(401).json({
        error: 'No autorizado: Token demo inválido, expirado o manipulado',
        detail: err?.message,
      });
    }
  }

  // Bloqueo explícito de tokens demo antiguos/fabricados manualmente
  if (token.startsWith('demo-')) {
    return res.status(401).json({
      error: 'No autorizado: Formato de credencial demo obsoleto o no firmado',
      code: 'UNAUTHORIZED_DEMO_TOKEN',
    });
  }

  // --- SUPABASE PRODUCTION AUTH VERIFICATION ---
  try {
    const { data: { user }, error } = await supabase.auth.getUser(token);

    if (error || !user) {
      throw error || new Error('No user found in token');
    }

    const email = user.email || 'user@proyecty.org';
    const name = user.user_metadata?.full_name || email.split('@')[0] || 'Usuario Proyecty';
    const uid = user.id;

    // Fetch user or register if new
    const dbUser = await getOrCreateUser(uid, email, name, 'MANAGER');

    if (dbUser.isActive === false) {
      return res.status(403).json({ error: 'Usuario suspendido', code: 'USER_SUSPENDED' });
    }

    req.user = {
      uid,
      email,
      name,
      role: dbUser.role || 'MANAGER',
      roleName: dbUser.role || 'MANAGER',
      tenantId: dbUser.tenantId,
      id: dbUser.id,
    };
    next();
  } catch (error) {
    console.error('Error verifying Supabase JWT token:', error);
    return res.status(401).json({ error: 'No autorizado: Token de acceso inválido' });
  }
};
