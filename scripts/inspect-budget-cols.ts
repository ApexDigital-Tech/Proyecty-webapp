import 'dotenv/config';
import { db } from '../src/db/index.ts';
import { sql } from 'drizzle-orm';

async function inspectBudgetVersionsCols() {
  const res: any = await db.execute(sql`
    SELECT column_name, data_type, udt_name, is_nullable
    FROM information_schema.columns
    WHERE table_name = 'budget_versions';
  `);
  console.log('budget_versions columns:', res.rows || res);
}

inspectBudgetVersionsCols().catch(console.error).finally(() => process.exit(0));
