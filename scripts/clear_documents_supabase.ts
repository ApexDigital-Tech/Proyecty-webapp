import { createClient } from '@supabase/supabase-js';
import 'dotenv/config';

const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '';
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY || '';

const supabase = createClient(supabaseUrl, supabaseKey);

async function main() {
  const { error } = await supabase.from('documents').delete().neq('id', 0);
  if (error) {
    console.error('Error deleting documents:', error);
  } else {
    console.log('Documents cleared successfully via Supabase REST API.');
  }
}

main();
