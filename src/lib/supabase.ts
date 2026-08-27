/// <reference types="vite/client" />
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env?.VITE_SUPABASE_URL || (typeof process !== 'undefined' ? process.env.VITE_SUPABASE_URL : null);
const supabaseAnonKey = import.meta.env?.VITE_SUPABASE_ANON_KEY || (typeof process !== 'undefined' ? process.env.VITE_SUPABASE_ANON_KEY : null);

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Supabase URL or Anon Key is missing. Ensure VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY are set.');
}

if (typeof process !== 'undefined' && process.env && process.env.NODE_ENV === 'test' && supabaseUrl.includes('kwmvuuwinufksjjfsuls')) {
  throw new Error('SECURITY_VIOLATION: Production Supabase hostname is forbidden during tests.');
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
