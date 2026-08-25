import 'dotenv/config';
import { db } from '../src/db/index.ts';
import { sql } from 'drizzle-orm';

async function migrate() {
  console.log('Migrating tasks table with weight and progress...');
  await db.execute(sql`
    ALTER TABLE tasks ADD COLUMN IF NOT EXISTS weight DOUBLE PRECISION NOT NULL DEFAULT 1;
    ALTER TABLE tasks ADD COLUMN IF NOT EXISTS progress INTEGER NOT NULL DEFAULT 0;
  `);
  console.log('Migration completed successfully.');
  process.exit(0);
}

migrate().catch(err => {
  console.error('Migration failed:', err);
  process.exit(1);
});
