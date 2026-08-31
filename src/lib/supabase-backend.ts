import ws from 'ws';
import { createClient } from '@supabase/supabase-js';

const isProduction = process.env.NODE_ENV === 'production';
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (isProduction) {
  // En producción, credenciales son estrictamente obligatorias
  if (!supabaseUrl || !supabaseKey) {
    throw new Error('CONFIG_ERROR: Missing required backend configuration for Supabase (SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are mandatory in production).');
  }
} else {
  // En entorno test / local, PROHIBIDO conectar a supabase.co o hosts remotos
  if (supabaseUrl && (supabaseUrl.includes('supabase.co') || supabaseUrl.includes('kwmvuuwinufksjjfsuls'))) {
    throw new Error('SECURITY_VIOLATION: Production or remote Supabase host is strictly forbidden outside production.');
  }
}

// Fuera de producción, si no hay credenciales locales, exportamos un stub que falle cerrado si se invoca
export const supabaseBackend: any = !isProduction && (!supabaseUrl || !supabaseKey)
  ? new Proxy({}, {
      get(_target, prop) {
        if (prop === 'storage') {
          throw new Error('[SECURITY_GUARD] El cliente Supabase directo está bloqueado fuera de producción. Utilice getStorageAdapter() de src/lib/storage.ts.');
        }
        return () => {
          throw new Error(`[SECURITY_GUARD] Método supabase.${String(prop)} no disponible fuera de producción.`);
        };
      }
    })
  : createClient(supabaseUrl || 'http://127.0.0.1:54321', supabaseKey || 'dummy-key-for-test', {
      auth: { persistSession: false, autoRefreshToken: false },
      realtime: { transport: ws as any }
    });
