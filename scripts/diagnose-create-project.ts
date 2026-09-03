import 'dotenv/config';
import { db } from '../src/db/index.ts';
import { projects, donors, agreements, organizations } from '../src/db/schema.ts';
import { eq, and, sql } from 'drizzle-orm';
import { withTenantContext } from '../src/utils/dbWrapper.ts';
import { validateCurrency } from '../src/services/currency.service.ts';
import { logActivity } from '../src/db/audit.ts';

async function diagnoseCreateProject() {
  console.log('--- DIAGNOSTIC STEP-BY-STEP CREATE PROJECT ---');
  const tenantId = 13;
  const userName = 'Rolando Gutierrez';
  const code = 'VS-PROY/001-2026';
  const name = 'Unidad Académica Sacaca (UAS - UCB) / UPPAE Sacaca.';
  const donor = 'Voserdem';
  const approvedBudget = '245600';
  const description = 'es de carácter estrictamente académico.';
  const baseCurrency = 'BOB';

  try {
    const validatedBaseCurrency = baseCurrency ? validateCurrency(baseCurrency, 'Moneda base') : 'USD';
    console.log('1. validatedBaseCurrency:', validatedBaseCurrency);

    // Trial check
    const [currentOrg] = await db.select().from(organizations).where(eq(organizations.id, tenantId)).limit(1);
    console.log('2. currentOrg:', currentOrg);

    const createdProject = await withTenantContext(tenantId, async (tx) => {
      let finalDonorId: number | null = null;
      if (donor) {
        const existingDonor = await tx.select({ id: donors.id }).from(donors).where(and(eq(donors.name, donor), eq(donors.tenantId, tenantId))).limit(1);
        console.log('3. existingDonor:', existingDonor);
        if (existingDonor.length > 0) {
          finalDonorId = existingDonor[0].id;
        } else {
          console.log('3b. Inserting new donor...');
          const newDonor = await tx.insert(donors).values({
            tenantId: tenantId,
            name: donor,
            type: 'Externo',
          }).returning({ id: donors.id });
          finalDonorId = newDonor[0].id;
          console.log('3c. finalDonorId:', finalDonorId);
        }
      }

      console.log('4. Inserting new project...');
      const newProject = await tx.insert(projects).values({
        tenantId: tenantId,
        code,
        name,
        donorId: finalDonorId,
        status: 'PLANIFICACIÓN',
        riskLevel: 'Bajo',
        approvedBudget: parseFloat(approvedBudget),
        physicalProgress: 0,
        financialProgress: 0,
        nextMilestoneDate: 'Por definir',
        nextMilestoneTitle: 'Inicio de proyecto',
        score: 100,
        description: description || '',
        baseCurrency: validatedBaseCurrency,
      }).returning();
      console.log('4b. newProject:', newProject);

      const cp = newProject[0];

      console.log('5. Inserting placeholder agreement...');
      await tx.insert(agreements).values({
        projectId: cp.id,
        counterparty: String(donor),
        signedDate: new Date(),
        amount: cp.approvedBudget,
        currency: validatedBaseCurrency,
        durationMonths: 12,
        startDate: new Date(),
        endDate: new Date(new Date().setFullYear(new Date().getFullYear() + 1)),
        remainingDays: 365,
        status: 'Activo'
      });
      console.log('5b. Agreement inserted');

      return cp;
    });

    console.log('6. Logging activity...');
    await logActivity(createdProject.id, userName, `Creó el proyecto "${name}" (Código: ${code}) con un presupuesto aprobado de $${approvedBudget}`);
    console.log('✅ PROYECTO CREADO EXITOSAMENTE:', createdProject);
  } catch (err: any) {
    console.error('❌ ERROR DETALLADO:', err);
  }
}

diagnoseCreateProject().catch(console.error).finally(() => process.exit(0));
