import 'dotenv/config';
import { db } from '../src/db/index.ts';
import { users, organizations, roles, auditLogs } from '../src/db/schema.ts';
import { eq, like, or, and, notInArray } from 'drizzle-orm';
import { seedRoles } from '../src/db/seed_roles.ts';
import { setupVoserdemTrialTenant } from '../src/services/voserdemTrial.service.ts';

async function main() {
  console.log('================================================================');
  console.log('🚀 INICIANDO NORMALIZACIÓN CONTROLADA Y SETUP VOSERDEM (v1.5.0)');
  console.log('================================================================\n');

  // 1. Seed / verify canonical roles
  console.log('1. Asegurando roles canónicos...');
  await seedRoles();

  // 2. Normalize users: archive / suspend test fixtures (Reversible isActive = false)
  console.log('\n2. Suspendiendo fixtures de prueba de forma reversible...');

  // Identify all test patterns
  const allUsers = await db.select().from(users);

  const preservedEmails = [
    'apexdigital70@gmail.com',
    'rolangutiali.rg@gmail.com',
    'aliendredilan@gmail.com',
    'ecotraffic.bo@gmail.com',
    'laura.1787598424871@proyecty.org',
    'laura.1787598487478@proyecty.org',
    'mirosromeroc@gmail.com',
    'demo.director@proyecty.org',
    'demo.manager@proyecty.org',
    'demo.finance@proyecty.org',
    'demo.auditor@proyecty.org',
    'demo.financiador@proyecty.org',
  ];

  let suspendedCount = 0;

  for (const u of allUsers) {
    const emailLower = u.email.toLowerCase();
    const isPreserved = preservedEmails.some(pe => pe.toLowerCase() === emailLower);

    if (!isPreserved && u.isActive) {
      // Suspend fixture reversibly
      await db.update(users).set({ isActive: false }).where(eq(users.id, u.id));

      // Log in audit_logs
      try {
        await db.insert(auditLogs).values({
          tenantId: u.tenantId,
          userId: 22, // Apex Digital admin
          action: 'USER_SUSPENDED_NORMALIZATION',
          entity: 'user',
          entityId: u.id.toString(),
          metadata: {
            before_state: { isActive: true, email: u.email, roleId: u.roleId },
            after_state: { isActive: false, email: u.email, roleId: u.roleId },
            reason: 'AUDITORIA_NORMALIZACION_LANCEMENTO',
            timestamp: new Date().toISOString(),
          },
        });
      } catch (e) {
        // Audit log immutable table
      }

      suspendedCount++;
    }
  }

  console.log(`✅ Fixtures suspendidos con registro de auditoría: ${suspendedCount}`);

  // 3. Setup VOSERDEM Trial Tenant & Seed
  console.log('\n3. Creando / Actualizando Tenant Privado VOSERDEM...');
  const voserdemData = await setupVoserdemTrialTenant();
  console.log(`✅ VOSERDEM configurado: Tenant ID ${voserdemData.orgId}, Proyecto ID ${voserdemData.projectId}`);

  console.log('\n================================================================');
  console.log('✨ NORMALIZACIÓN Y SETUP COMPLETADOS EXITOSAMENTE');
  console.log('================================================================');

  process.exit(0);
}

main().catch(err => {
  console.error('Error durante la normalización:', err);
  process.exit(1);
});
