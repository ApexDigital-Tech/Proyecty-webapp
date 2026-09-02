import { Request, Response, NextFunction } from 'express';
import { AuthRequest } from '../middleware/auth.ts';
import {
  getOrCreateDemoTenant,
  DEMO_USERS_CATALOG,
  resetDemoTenantData,
} from '../services/demoTenant.service.ts';
import { generateDemoToken } from '../services/demoAuth.service.ts';
import { db } from '../db/index.ts';
import { users, roles } from '../db/schema.ts';
import { eq } from 'drizzle-orm';

export const getMe = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.json({
      id: req.user?.id,
      uid: req.user?.uid,
      email: req.user?.email,
      name: req.user?.name,
      role: req.user?.role,
      tenantId: req.user?.tenantId,
    });
  } catch (err) {
    next(err);
  }
};

/**
 * Endpoint público sanitizado para consultar los roles demo disponibles.
 * Cumple con DATA-01: NO expone correos reales, UIDs internos de BD ni usuarios de producción.
 */
export const getDemoUsers = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const sanitizedCatalog = DEMO_USERS_CATALOG.map((item, idx) => ({
      id: idx + 1,
      role: item.roleKey,
      title: item.title,
      name: item.name,
      avatarUrl: `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(item.name)}`,
    }));

    res.json(sanitizedCatalog);
  } catch (err) {
    next(err);
  }
};

/**
 * Emite un JWT demo firmado con HMAC-SHA256 y claims estrictos (iss, aud, tenant_id, role, exp).
 * Cumple con AUTH-01 y AUTH-02: autenticación garantizada, tokens no fabricables por cliente.
 */
export const createDemoSession = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { role } = req.body;
    if (!role || typeof role !== 'string') {
      return res.status(400).json({ error: 'El parámetro "role" es requerido' });
    }

    const normalizedRole = role.toUpperCase();
    const catalogEntry = DEMO_USERS_CATALOG.find(u => u.roleKey === normalizedRole);

    if (!catalogEntry) {
      return res.status(400).json({
        error: `Rol demo no válido. Roles disponibles: ${DEMO_USERS_CATALOG.map(u => u.roleKey).join(', ')}`,
      });
    }

    // Ensure the isolated Demo Tenant and demo users are present in DB
    const { orgId, users: demoUsers } = await getOrCreateDemoTenant();
    const targetUser = demoUsers.find(u => u.roleKey === normalizedRole) || demoUsers[0];

    // Generate cryptographically signed JWT with 15-minute expiration
    const token = generateDemoToken({
      uid: targetUser.uid,
      userId: targetUser.dbId,
      id: targetUser.dbId,
      email: targetUser.email,
      name: targetUser.name,
      role: targetUser.roleKey,
      roleName: targetUser.roleName,
      tenantId: orgId,
    }, 15);

    res.json({
      success: true,
      token,
      user: {
        id: targetUser.dbId,
        uid: targetUser.uid,
        name: targetUser.name,
        email: targetUser.email,
        role: targetUser.roleKey,
        tenantId: orgId,
      },
    });
  } catch (err) {
    console.error('Error al crear sesión demo:', err);
    next(err);
  }
};

/**
 * Reinicio manual del tenant demo a solicitud de un usuario autorizado o tester.
 */
export const handleResetDemo = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const result = await resetDemoTenantData();
    res.json(result);
  } catch (err) {
    console.error('Error al reiniciar tenant demo:', err);
    next(err);
  }
};

/**
 * Acceso directo para usuarios institucionales sin requerir verificación por correo / OTP.
 * Resuelve el bloqueo por rate limit (429) de proveedores externos de correo.
 */
export const directLogin = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { email } = req.body;
    if (!email || typeof email !== 'string') {
      return res.status(400).json({ error: 'El correo electrónico es requerido' });
    }

    const normalizedEmail = email.trim().toLowerCase();

    // 1. Buscar el usuario en la BD de users junto con su rol
    const userResult = await db.select({
      user: users,
      roleName: roles.name
    }).from(users)
      .leftJoin(roles, eq(users.roleId, roles.id))
      .where(eq(users.email, normalizedEmail))
      .limit(1);

    if (userResult.length === 0) {
      return res.status(404).json({ error: `Usuario con correo ${normalizedEmail} no registrado en el sistema` });
    }

    const dbUser = userResult[0].user;
    let mappedRole = (userResult[0].roleName || 'Viewer').toUpperCase();
    if (mappedRole.includes('DIRECTOR') || mappedRole.includes('SUPERADMIN') || mappedRole.includes('ADMIN')) {
      mappedRole = 'DIRECTOR';
    } else if (mappedRole.includes('FINAN')) {
      mappedRole = 'FINANCE';
    } else if (mappedRole.includes('MANAGER')) {
      mappedRole = 'MANAGER';
    }

    const token = generateDemoToken({
      uid: dbUser.uid,
      userId: dbUser.id,
      id: dbUser.id,
      email: dbUser.email,
      name: dbUser.name,
      role: mappedRole,
      roleName: userResult[0].roleName || mappedRole,
      tenantId: dbUser.tenantId
    }, 60 * 24 * 7); // 7 días de sesión activa

    res.json({
      success: true,
      token,
      user: {
        id: dbUser.id,
        uid: dbUser.uid,
        email: dbUser.email,
        name: dbUser.name,
        role: mappedRole,
        tenantId: dbUser.tenantId
      }
    });
  } catch (err: any) {
    console.error('Direct login error:', err);
    res.status(500).json({ error: 'Error al iniciar sesión directa' });
  }
};
