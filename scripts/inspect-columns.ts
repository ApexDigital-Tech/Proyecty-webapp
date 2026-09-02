import 'dotenv/config';
import { db } from '../src/db/index.ts';
import { sql } from 'drizzle-orm';

async function main() {
  console.log('Inspeccionando columnas de budget_versions...');
  try {
    const cols = await db.execute(sql`
      SELECT column_name, data_type 
      FROM information_schema.columns 
      WHERE table_name = 'budget_versions'
      ORDER BY ordinal_position;
    `);
    console.log('Columnas en budget_versions:', cols.rows);

    const projectCols = await db.execute(sql`
      SELECT column_name, data_type 
      FROM information_schema.columns 
      WHERE table_name = 'projects'
      ORDER BY ordinal_position;
    `);
    console.log('Columnas en projects:', projectCols.rows.map(r => r.column_name));

    // Test the exact query executed in getProjectById for project 216
    console.log('Probando query de proyecto 216...');
    const p = await db.execute(sql`SELECT * FROM projects WHERE id = 216 LIMIT 1;`);
    console.log('Proyecto 216 existe?', p.rows.length > 0 ? p.rows[0] : 'NO EXISTE');

    console.log('Probando query de budget_versions para proyecto 216...');
    const bv = await db.execute(sql`SELECT * FROM budget_versions WHERE project_id = 216;`);
    console.log('budget_versions rows:', bv.rows);

  } catch (err: any) {
    console.error('ERROR EN QUERY:', err.message);
  }
  process.exit(0);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
