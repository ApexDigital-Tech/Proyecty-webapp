import { db } from './index.ts';
import { auditLogs, users } from './schema.ts';
import { eq } from 'drizzle-orm';

export async function logActivity(projectId: number | null, userName: string, actionDescription: string, tenantId?: number) {
  try {
    let tId = tenantId;
    let uId: number | null = null;
    
    if (userName !== 'SISTEMA') {
       // Buscar usuario para relacionar
       const u = await db.select().from(users).where(eq(users.name, userName)).limit(1);
       if (u.length > 0) {
         if (!tId) tId = u[0].tenantId;
         uId = u[0].id;
       }
    }
    
    // Si sigue sin haber tenantId (caso raro o SISTEMA), asignamos un default o ignoramos (pero es requerido en schema)
    // Buscaremos el primer tenant si falla
    if (!tId) {
      tId = 1; // Fallback, no debería ocurrir si el seed funcionó.
    }

    await db.insert(auditLogs).values({
      tenantId: tId,
      userId: uId,
      action: actionDescription, // Se almacena la descripción en 'action' o lo separamos
      entityType: projectId ? 'Project' : 'System',
      entityId: projectId || 0,
      newValues: { description: actionDescription }
    });
  } catch (err) {
    console.error('Failed to write audit log:', err);
  }
}
