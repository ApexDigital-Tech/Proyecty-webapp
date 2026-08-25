import 'dotenv/config';
import { db } from '../src/db/index.ts';
import { users, auditLogs } from '../src/db/schema.ts';
import { eq, inArray, and, notInArray } from 'drizzle-orm';

async function suspendAllTestFixtures() {
  const allUsers = await db.select().from(users);
  
  // Whitelist of active accounts
  const preservedEmails = [
    'mirosromeroc@gmail.com',
    'demo.director@proyecty.org',
    'demo.manager@proyecty.org',
    'demo.finance@proyecty.org',
    'demo.auditor@proyecty.org',
    'demo.financiador@proyecty.org',
    'laura.1787598424871@proyecty.org',
    'laura.1787598487478@proyecty.org',
    'rolangutiali.rg@gmail.com',
    'aliendredilan@gmail.com',
    'ecotraffic.bo@gmail.com',
    'apexdigital70@gmail.com'
  ];

  let suspendedCount = 0;
  for (const u of allUsers) {
    const email = (u.email || '').toLowerCase().trim();
    if (!preservedEmails.includes(email) && u.isActive === true) {
      await db.update(users).set({ isActive: false }).where(eq(users.id, u.id));
      await db.insert(auditLogs).values({
        tenantId: u.tenantId || 1,
        userId: u.id,
        userName: u.name || 'System Normalizer',
        action: 'USER_SUSPENDED_AUDIT',
        entity: 'user',
        entityId: String(u.id),
        metadata: {
          reason: 'Suspensión controlada de fixture efímero de prueba para habilitación VOSERDEM v1.5.0',
          email: u.email,
          previousState: 'ACTIVE',
          newState: 'SUSPENDED',
          timestamp: new Date().toISOString(),
        },
      });
      suspendedCount++;
    }
  }

  console.log(`✅ Suspensión controlada completada. Total fixtures suspendidos en esta pasada: ${suspendedCount}`);
  process.exit(0);
}

suspendAllTestFixtures().catch(err => {
  console.error(err);
  process.exit(1);
});
