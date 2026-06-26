import { db } from '../src/db/index.js';
import { projects, budgetLines, agreements, receiptsVouchers } from '../src/db/schema.js';
import { eq, like } from 'drizzle-orm';
import 'dotenv/config';

const DEMO_PREFIX = '[DEMO VOSERDEM]';

async function runRollback() {
  console.log('Starting rollback script for demo data...');
  
  const existingProjects = await db.select().from(projects).where(like(projects.name, `${DEMO_PREFIX}%`));
  
  if (existingProjects.length === 0) {
    console.log('No demo projects found. Nothing to rollback.');
    process.exit(0);
  }

  for (const p of existingProjects) {
    console.log(`Cleaning up project: ${p.name}`);
    await db.delete(receiptsVouchers).where(eq(receiptsVouchers.projectId, p.id));
    await db.delete(agreements).where(eq(agreements.projectId, p.id));
    await db.delete(budgetLines).where(eq(budgetLines.projectId, p.id));
    await db.delete(projects).where(eq(projects.id, p.id));
    console.log(`Successfully deleted project and its relations: ${p.name}`);
  }

  console.log('Rollback script completed successfully!');
  process.exit(0);
}

runRollback().catch(err => {
  console.error('Error during rollback:', err);
  process.exit(1);
});
