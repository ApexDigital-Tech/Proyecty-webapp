import ws from 'ws';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  // Solo se lanza si se intenta importar el módulo, y es un error sanitizado sin imprimir claves
  throw new Error('CONFIG_ERROR: Missing required backend configuration for Supabase (SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are mandatory).');
}

export const supabaseBackend = createClient(supabaseUrl, supabaseKey, {
  auth: { persistSession: false, autoRefreshToken: false },
  realtime: { transport: ws as any }
});
