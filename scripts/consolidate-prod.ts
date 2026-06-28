// @ts-nocheck
import { db } from '../src/db/index.ts';
import { users, projects, expenses, roles, budgetLines } from '../src/db/schema.ts';
import { eq, and, desc, sql, like } from 'drizzle-orm';
import dotenv from 'dotenv';
dotenv.config();

async function main() {
  console.log('--- CONSOLIDATION TASK ---');

  // 1. Fix Rodrigo G. Duplicate
  console.log('1. Fixing Rodrigo G. duplicates...');
  
  // Find Rodrigo's accounts
  const rodigos = await db.select({ user: users, role: roles }).from(users).leftJoin(roles, eq(users.roleId, roles.id)).where(eq(users.email, 'rodrigo@proyecty.org'));
  
  let managerId = null;
  let directorId = null;
  
  for (const row of rodigos) {
    if (row.role?.name?.toUpperCase() === 'MANAGER') {
      managerId = row.user.id;
    } else if (row.role?.name?.toUpperCase() === 'DIRECTOR') {
      directorId = row.user.id;
    }
  }

  if (managerId && directorId) {
    console.log(`Found duplicate. Deleting DIRECTOR role user (ID: ${directorId})`);
    // Delete the director duplicate
    await db.delete(users).where(eq(users.id, directorId));
    console.log('Deleted successfully.');
  } else if (directorId && !managerId) {
     console.log(`Only found DIRECTOR. Converting to MANAGER.`);
     const managerRole = await db.select().from(roles).where(eq(roles.name, 'MANAGER')).limit(1);
     if (managerRole.length > 0) {
         await db.update(users).set({ roleId: managerRole[0].id }).where(eq(users.id, directorId));
         console.log('Updated successfully.');
     }
  } else {
    console.log('No duplicate action needed or Manager already exists without Director duplicate.');
  }

  // 2. Update VOSERDEM projects progress
  console.log('\n2. Updating VOSERDEM projects progress & financials...');
  
  const voserdemProjects = await db.select().from(projects).where(like(projects.code, 'PY-VS%'));
  
  for (const proj of voserdemProjects) {
    if (proj.name.includes('abuelitas')) {
      console.log(`Updating ${proj.name} to 35% physical progress...`);
      await db.update(projects).set({ physicalProgress: '35.00' }).where(eq(projects.id, proj.id));
      
      // Add transaction (expense)
      const budgetLine = await db.select().from(budgetLines).where(eq(budgetLines.projectId, proj.id)).limit(1);
      if (budgetLine.length > 0) {
        await db.insert(expenses).values({
          projectId: proj.id,
          budgetLineId: budgetLine[0].id,
          amount: 15000.00,
          type: 'EXPENSE',
          date: new Date(),
          description: 'Compra de insumos iniciales para las abuelitas',
          status: 'APPROVED'
        } as any);
        console.log('Added financial transaction.');
        // Also update financialProgress directly
        await db.update(projects).set({ financialProgress: 15 }).where(eq(projects.id, proj.id));
      }
    } else if (proj.name.includes('Comedores')) {
      console.log(`Updating ${proj.name} to 20% physical progress...`);
      await db.update(projects).set({ physicalProgress: '20.00' }).where(eq(projects.id, proj.id));
      
      // Add transaction (expense)
      const budgetLine = await db.select().from(budgetLines).where(eq(budgetLines.projectId, proj.id)).limit(1);
      if (budgetLine.length > 0) {
        await db.insert(expenses).values({
          projectId: proj.id,
          budgetLineId: budgetLine[0].id,
          amount: 5000.00,
          type: 'EXPENSE',
          date: new Date(),
          description: 'Pago de logística y traslado de alimentos',
          status: 'APPROVED'
        } as any);
        console.log('Added financial transaction.');
        // Also update financialProgress directly
        await db.update(projects).set({ financialProgress: 10 }).where(eq(projects.id, proj.id));
      }
    }
  }
  
  console.log('\nConsolidation Complete.');
  process.exit(0);
}

main().catch(err => {
  console.error('Failed consolidation:', err);
  process.exit(1);
});
