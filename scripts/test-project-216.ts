import 'dotenv/config';
import { db } from '../src/db/index.ts';
import { sql } from 'drizzle-orm';

async function main() {
  console.log('--- TEST GET PROJECT 216 ---');
  const tables = await db.execute(sql`SELECT table_name FROM information_schema.tables WHERE table_schema='public' ORDER BY table_name;`);
  console.log('Tablas en public:', tables.rows.map(r => r.table_name));

  const bvCols = await db.execute(sql`SELECT column_name FROM information_schema.columns WHERE table_name='budget_versions';`);
  console.log('Columnas budget_versions:', bvCols.rows.map(r => r.column_name));

  const blCols = await db.execute(sql`SELECT column_name FROM information_schema.columns WHERE table_name='budget_lines';`);
  console.log('Columnas budget_lines:', blCols.rows.map(r => r.column_name));
}

main().catch(console.error).finally(() => process.exit(0));
