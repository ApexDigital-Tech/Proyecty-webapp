import { TenantIsolationError } from './errors.ts';

/**
 * Wrapper centralizado para escrituras en BD (UPDATE / DELETE).
 * Si la operación no afectó filas (affectedRows === 0), asume que fue bloqueada
 * por RLS o por una condición de negocio no cumplida.
 * 
 * Para distinguir entre un bloqueo de seguridad (RLS -> 404/403) y un fallo 
 * de negocio (ej. WHERE status = 'pending' -> 409), se puede pasar `options.checkExists`.
 * 
 * @param queryPromise Promesa de la operación de BD (ej. db.update().returning())
 * @param options Opciones adicionales para validación de negocio.
 * @returns El resultado de la operación si fue exitosa.
 */
export async function withRlsValidation<T extends any[]>(
  queryPromise: Promise<T>,
  options?: {
    checkExists?: () => Promise<boolean>;
    businessConflictMessage?: string;
  }
): Promise<T> {
  const result = await queryPromise;
  
  if (!result || result.length === 0) {
    if (options?.checkExists) {
      const exists = await options.checkExists();
      if (exists) {
        // RLS dejó pasar el SELECT, por tanto, el UPDATE/DELETE falló 
        // exclusivamente por la condición de negocio (ej. status no es el esperado).
        const err = new Error(options.businessConflictMessage || 'Conflicto de estado (Condición de negocio no cumplida)');
        (err as any).statusCode = 409;
        throw err;
      }
    }
    // Si no existía (o no se proveyó checkExists), asumimos 404 por aislamiento de tenant
    throw new TenantIsolationError();
  }
  
  return result;
}

/**
 * Wrapper para ejecutar operaciones dentro de una transacción con el contexto RLS activo.
 * Abre una transacción, aplica `set_config` y `SET LOCAL ROLE`, y luego ejecuta el callback.
 * 
 * @param tenantId ID del tenant actual.
 * @param callback Función que recibe el objeto de transacción (tx) con el RLS ya activo.
 * @returns El resultado del callback.
 */
import { db } from '../db/index.ts';
import { sql } from 'drizzle-orm';

export type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

export async function withTenantContext<T>(
  tenantId: number,
  callback: (tx: Tx) => Promise<T>
): Promise<T> {
  return await db.transaction(async (tx) => {
    // 1. Establecer el contexto del tenant (scope local a la transacción)
    await tx.execute(sql`SELECT set_config('app.current_tenant', ${tenantId.toString()}, true)`);
    // 2. Degradación de privilegios a authenticated
    await tx.execute(sql`SET LOCAL ROLE 'authenticated'`);
    
    // 3. Ejecutar la operación de negocio pasando el tx asegurado
    return await callback(tx);
  });
}
