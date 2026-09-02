import 'dotenv/config';
import { db } from '../src/db/index.ts';
import { sql } from 'drizzle-orm';
import { budgetLines, budgetVersions, projects, agreements, disbursements, clauses, documents, receiptsVouchers, auditLogs } from '../src/db/schema.ts';

async function main() {
  console.log('--- VALIDATING SELECTS ON ACTUAL DATABASE ---');

  // 1. Projects
  try {
    const p = await db.select().from(projects).limit(1);
    console.log('✅ SELECT projects OK');
  } catch (e: any) {
    console.error('❌ SELECT projects FAILED:', e.message);
  }

  // 2. Budget Versions
  try {
    const bv = await db.select().from(budgetVersions).limit(1);
    console.log('✅ SELECT budgetVersions OK');
  } catch (e: any) {
    console.error('❌ SELECT budgetVersions FAILED:', e.message);
  }

  // 3. Budget Lines
  try {
    const bl = await db.select().from(budgetLines).limit(1);
    console.log('✅ SELECT budgetLines OK');
  } catch (e: any) {
    console.error('❌ SELECT budgetLines FAILED:', e.message);
  }

  // 4. Agreements
  try {
    const ag = await db.select().from(agreements).limit(1);
    console.log('✅ SELECT agreements OK');
  } catch (e: any) {
    console.error('❌ SELECT agreements FAILED:', e.message);
  }

  // 5. Disbursements
  try {
    const d = await db.select().from(disbursements).limit(1);
    console.log('✅ SELECT disbursements OK');
  } catch (e: any) {
    console.error('❌ SELECT disbursements FAILED:', e.message);
  }

  // 6. Clauses
  try {
    const cl = await db.select().from(clauses).limit(1);
    console.log('✅ SELECT clauses OK');
  } catch (e: any) {
    console.error('❌ SELECT clauses FAILED:', e.message);
  }

  // 7. Documents
  try {
    const doc = await db.select().from(documents).limit(1);
    console.log('✅ SELECT documents OK');
  } catch (e: any) {
    console.error('❌ SELECT documents FAILED:', e.message);
  }

  // 8. Receipts Vouchers
  try {
    const rv = await db.select().from(receiptsVouchers).limit(1);
    console.log('✅ SELECT receiptsVouchers OK');
  } catch (e: any) {
    console.error('❌ SELECT receiptsVouchers FAILED:', e.message);
  }

  // 9. Audit Logs
  try {
    const al = await db.select().from(auditLogs).limit(1);
    console.log('✅ SELECT auditLogs OK');
  } catch (e: any) {
    console.error('❌ SELECT auditLogs FAILED:', e.message);
  }
}

main().catch(console.error).finally(() => process.exit(0));
