import { sql } from 'drizzle-orm';
import { db } from '../db/index.ts';

/**
 * Validates strictly that the process environment and database connection are isolated
 * to local test instances (127.0.0.1:55432/proyecty_test).
 * Fails closed immediately if any violation or remote host is detected.
 */
export function validateTestEnvStrict(dbUrlParam?: string, nodeEnvParam?: string): void {
  const nodeEnv = nodeEnvParam !== undefined ? nodeEnvParam : process.env.NODE_ENV;
  if (nodeEnv !== 'test') {
    throw new Error(`[SECURITY GUARD] NODE_ENV must be "test", got: "${nodeEnv}"`);
  }

  const rawUrl = dbUrlParam !== undefined ? dbUrlParam : process.env.DATABASE_URL;
  if (!rawUrl || typeof rawUrl !== 'string' || rawUrl.trim() === '') {
    throw new Error('[SECURITY GUARD] DATABASE_URL is missing or empty.');
  }

  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch (err) {
    throw new Error('[SECURITY GUARD] DATABASE_URL is not a valid URL format.');
  }

  const hostname = parsed.hostname.toLowerCase();
  if (hostname !== '127.0.0.1' && hostname !== 'localhost') {
    throw new Error(`[SECURITY GUARD] Invalid host: "${hostname}". Must be "127.0.0.1" or "localhost".`);
  }

  if (hostname.includes('supabase') || rawUrl.includes('supabase.co') || rawUrl.includes('pooler.supabase.com')) {
    throw new Error('[SECURITY GUARD] Supabase host or pooler detected in DATABASE_URL.');
  }

  if (parsed.port !== '55432') {
    throw new Error(`[SECURITY GUARD] Invalid port: "${parsed.port}". Must be "55432".`);
  }

  const pathname = parsed.pathname;
  if (pathname !== '/proyecty_test') {
    throw new Error(`[SECURITY GUARD] Invalid database: "${pathname}". Must be "/proyecty_test".`);
  }
}

/**
 * Validates the live database connection at runtime using PostgreSQL internal session attributes.
 */
export async function validateTestDatabaseRuntime(): Promise<void> {
  validateTestEnvStrict();

  const res = await db.execute(sql`
    SELECT current_database() as db_name, inet_server_addr()::text as srv_addr, inet_server_port() as srv_port;
  `);

  const row = (res.rows || res)[0] as any;
  const currentDb = row?.db_name || row?.current_database;
  const srvAddr = row?.srv_addr || row?.inet_server_addr;
  const srvPort = Number(row?.srv_port || row?.inet_server_port);

  if (currentDb !== 'proyecty_test') {
    throw new Error(`[SECURITY GUARD] Runtime DB check failed: expected "proyecty_test", got "${currentDb}"`);
  }
  if (srvAddr !== '127.0.0.1' && srvAddr !== '::1') {
    throw new Error(`[SECURITY GUARD] Runtime Host check failed: expected "127.0.0.1", got "${srvAddr}"`);
  }
  if (srvPort !== 55432) {
    throw new Error(`[SECURITY GUARD] Runtime Port check failed: expected 55432, got ${srvPort}`);
  }

  console.log('🛡️ [SECURITY GUARD] Database isolation verified:', { currentDb, srvAddr, srvPort });
}
