import 'dotenv/config';
import { db } from '../src/db/index.ts';
import { sql } from 'drizzle-orm';

const results = await db.execute(sql`
  SELECT polname, polroles::regrole[] as roles, relname as table_name
  FROM pg_policy p
  JOIN pg_class c ON p.polrelid = c.oid
  ORDER BY relname, polname
`);
console.log('=== RLS POLICIES ===');
for (const r of results.rows) {
  console.log(`  ${r.table_name}.${r.polname} → roles: ${JSON.stringify(r.roles)}`);
}

const grants = await db.execute(sql`
  SELECT grantee, table_name, privilege_type
  FROM information_schema.role_table_grants
  WHERE grantee NOT IN ('postgres', 'supabase_admin', 'supabase_auth_admin', 'supabase_storage_admin', 'dashboard_user', 'anon', 'service_role', 'supabase_realtime_admin', 'supabase_replication_admin', 'pgsodium_keyholder', 'pgsodium_keyiduser', 'pgsodium_keymaker', 'pgbouncer', 'supabase_read_only_user')
    AND table_schema = 'public'
  ORDER BY grantee, table_name, privilege_type
  LIMIT 30
`);
console.log('\n=== GRANTS (non-system, public schema, first 30) ===');
for (const g of grants.rows) {
  console.log(`  ${g.grantee} → ${g.table_name}.${g.privilege_type}`);
}

const roleCheck = await db.execute(sql`
  SELECT rolname FROM pg_roles WHERE rolname IN ('app_user', 'authenticated')
`);
console.log('\n=== DB ROLES PRESENT ===');
for (const r of roleCheck.rows) {
  console.log(`  ${r.rolname}`);
}

const roles = await db.execute(sql`
  SELECT id, name FROM roles ORDER BY id
`);
console.log('\n=== ROLES ===');
for (const r of roles.rows) {
  console.log(`  ${r.id}: ${r.name}`);
}

const permCounts = await db.execute(sql`
  SELECT role_id, count(*) as c FROM permissions GROUP BY role_id ORDER BY role_id
`);
console.log('\n=== PERMISSIONS COUNT ===');
for (const p of permCounts.rows) {
  console.log(`  Role ${p.role_id}: ${p.c} permissions`);
}

const role7Perms = await db.execute(sql`
  SELECT module, action FROM permissions WHERE role_id = 7
`);
console.log('\n=== ROLE 7 PERMS ===');
for (const p of role7Perms.rows) {
  console.log(`  ${p.module}:${p.action}`);
}
process.exit(0);
