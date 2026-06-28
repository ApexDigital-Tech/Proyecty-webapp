// @ts-nocheck
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabaseUrl = process.env.VITE_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

async function main() {
  console.log('--- CONSOLIDATION TASK VIA SUPABASE API ---');
  
  // 1. Fix Rodrigo G. Duplicate
  console.log('1. Fixing Rodrigo G. duplicates...');
  
  // Find Rodrigo's accounts
  const { data: rodigos, error: userErr } = await supabase.from('users').select('id, role_id, roles(name, is_system_role)').eq('email', 'rodrigo@proyecty.org');
  if (userErr) throw userErr;

  let managerId = null;
  let directorId = null;
  let managerRoleId = null;

  for (const row of rodigos || []) {
    const roleName = row.roles?.name?.toUpperCase();
    if (roleName === 'MANAGER') {
      managerId = row.id;
    } else if (roleName === 'DIRECTOR') {
      directorId = row.id;
    }
  }

  if (managerId && directorId) {
    console.log(`Found duplicate. Deleting DIRECTOR role user (ID: ${directorId})`);
    await supabase.from('users').delete().eq('id', directorId);
    console.log('Deleted successfully.');
  } else if (directorId && !managerId) {
    console.log(`Only found DIRECTOR. Converting to MANAGER.`);
    const { data: roleData } = await supabase.from('roles').select('id').eq('name', 'MANAGER').single();
    if (roleData) {
      await supabase.from('users').update({ role_id: roleData.id }).eq('id', directorId);
      console.log('Updated successfully.');
    }
  } else {
    console.log('No duplicate action needed or Manager already exists without Director duplicate.');
  }

  // 2. Update VOSERDEM projects progress
  console.log('\n2. Updating VOSERDEM projects progress & financials...');
  
  const { data: voserdemProjects, error: projErr } = await supabase.from('projects').select('*').like('code', 'PY-VS%');
  if (projErr) throw projErr;

  for (const proj of voserdemProjects || []) {
    if (proj.name.includes('abuelitas')) {
      console.log(`Updating ${proj.name} to 35% physical progress...`);
      await supabase.from('projects').update({ physical_progress: 35 }).eq('id', proj.id);
      
      const { data: budgetLine } = await supabase.from('budget_lines').select('id').eq('project_id', proj.id).limit(1).single();
      
      if (budgetLine) {
        await supabase.from('expenses').insert({
          project_id: proj.id,
          budget_line_id: budgetLine.id,
          amount: 15000.00,
          type: 'EXPENSE',
          date: new Date().toISOString(),
          description: 'Compra de insumos iniciales para las abuelitas',
          status: 'APPROVED'
        });
        console.log('Added financial transaction.');
        await supabase.from('projects').update({ financial_progress: 15 }).eq('id', proj.id);
      }
    } else if (proj.name.includes('Comedores')) {
      console.log(`Updating ${proj.name} to 20% physical progress...`);
      await supabase.from('projects').update({ physical_progress: 20 }).eq('id', proj.id);
      
      const { data: budgetLine } = await supabase.from('budget_lines').select('id').eq('project_id', proj.id).limit(1).single();
      
      if (budgetLine) {
        await supabase.from('expenses').insert({
          project_id: proj.id,
          budget_line_id: budgetLine.id,
          amount: 5000.00,
          type: 'EXPENSE',
          date: new Date().toISOString(),
          description: 'Pago de logística y traslado de alimentos',
          status: 'APPROVED'
        });
        console.log('Added financial transaction.');
        await supabase.from('projects').update({ financial_progress: 10 }).eq('id', proj.id);
      }
    }
  }
  
  console.log('\nConsolidation Complete.');
}

main().catch(err => {
  console.error('Failed consolidation:', err);
  process.exit(1);
});
