import 'dotenv/config';
import { db } from '../src/db/index.ts';
import { sql } from 'drizzle-orm';

async function inspectAllTableColumns() {
  console.log('--- INSPECTING ALL POSTGRESQL TABLES AND COLUMNS ---');
  const res: any = await db.execute(sql`
    SELECT table_name, column_name, data_type, is_nullable
    FROM information_schema.columns
    WHERE table_schema = 'public'
    ORDER BY table_name, ordinal_position;
  `);

  const rows = res.rows || res;
  const tables: Record<string, string[]> = {};
  for (const row of rows) {
    if (!tables[row.table_name]) {
      tables[row.table_name] = [];
    }
    tables[row.table_name].push(row.column_name);
  }

  for (const [tName, cols] of Object.entries(tables)) {
    console.log(`\nTable: "${tName}"`);
    console.log(`Columns (${cols.length}): ${cols.join(', ')}`);
  }
}

inspectAllTableColumns().catch(console.error).finally(() => process.exit(0));
