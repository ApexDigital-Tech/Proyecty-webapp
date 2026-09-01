import { db } from '../db/index.ts';
import { donors, agreements, disbursements, projects, auditLogs } from '../db/schema.ts';
import { eq, and, sql, sum } from 'drizzle-orm';
import { withTenantContext } from '../utils/dbWrapper.ts';
import { ConflictError, NotFoundError } from '../utils/errors.ts';
import { logAuditEvent } from './audit.service.ts';

export interface CreateDonorDto {
  name: string;
  code?: string;
  type?: string; // 'Multilateral', 'Bilateral', 'ONG', 'Privado', 'Gobierno'
  country?: string;
  contactEmail?: string;
}

export interface CreateAgreementDto {
  projectId: number;
  donorId?: number;
  counterparty: string;
  signedDate: string | Date;
  amount: number;
  currency?: string;
  durationMonths: number;
  startDate?: string | Date;
  endDate?: string | Date;
  restrictions?: string;
}

export interface CreateDisbursementDto {
  agreementId: number;
  milestoneTitle: string;
  estimatedDate: string | Date;
  amount: number;
  condition?: string;
  currency?: string;
  status?: string; // 'PAGADO', 'PENDIENTE', 'ATRASADO'
  accountReference?: string;
}

export const createDonor = async (tenantId: number, userId: number, data: CreateDonorDto) => {
  return await withTenantContext(tenantId, async (tx) => {
    const [donor] = await tx
      .insert(donors)
      .values({
        tenantId,
        name: data.name,
        code: data.code || data.name.substring(0, 5).toUpperCase(),
        type: data.type || 'Bilateral',
        country: data.country || 'Bolivia',
        contactEmail: data.contactEmail || null,
      })
      .returning();

    await logAuditEvent(
      {
        tenantId,
        userId,
        action: 'DONOR_CREATED',
        entity: 'donor',
        entityId: donor.id.toString(),
        metadata: { name: donor.name, code: donor.code },
      },
      tx,
      { required: true }
    );

    return donor;
  });
};

export const getDonorsByTenant = async (tenantId: number) => {
  return await withTenantContext(tenantId, async (tx) => {
    return await tx
      .select()
      .from(donors)
      .where(eq(donors.tenantId, tenantId));
  });
};

export const createAgreement = async (tenantId: number, userId: number, data: CreateAgreementDto) => {
  return await withTenantContext(tenantId, async (tx) => {
    const [proj] = await tx
      .select()
      .from(projects)
      .where(and(eq(projects.id, data.projectId), eq(projects.tenantId, tenantId)));

    if (!proj) throw new NotFoundError('Proyecto no encontrado en esta organización.');

    const signed = data.signedDate ? new Date(data.signedDate) : new Date();
    const start = data.startDate ? new Date(data.startDate) : signed;
    const duration = data.durationMonths || 12;
    const end = data.endDate ? new Date(data.endDate) : new Date(new Date(start).setMonth(start.getMonth() + duration));

    const [agreement] = await tx
      .insert(agreements)
      .values({
        projectId: data.projectId,
        counterparty: data.counterparty,
        signedDate: signed,
        amount: data.amount,
        currency: data.currency || 'USD',
        durationMonths: duration,
        startDate: start,
        endDate: end,
        remainingDays: Math.max(0, Math.ceil((end.getTime() - Date.now()) / (1000 * 60 * 60 * 24))),
        status: 'Activo',
      })
      .returning();

    await logAuditEvent(
      {
        tenantId,
        userId,
        action: 'AGREEMENT_CREATED',
        entity: 'agreement',
        entityId: agreement.id.toString(),
        metadata: {
          projectId: data.projectId,
          counterparty: agreement.counterparty,
          amount: agreement.amount,
          currency: agreement.currency,
        },
      },
      tx,
      { required: true }
    );

    return agreement;
  });
};

export const createDisbursement = async (tenantId: number, userId: number, data: CreateDisbursementDto) => {
  return await withTenantContext(tenantId, async (tx) => {
    const [ag] = await tx
      .select()
      .from(agreements)
      .where(eq(agreements.id, data.agreementId));

    if (!ag) throw new NotFoundError('Convenio no encontrado.');

    const [disb] = await tx
      .insert(disbursements)
      .values({
        agreementId: data.agreementId,
        milestoneTitle: data.milestoneTitle,
        estimatedDate: new Date(data.estimatedDate),
        amount: data.amount,
        condition: data.condition || 'Cumplimiento de hito',
        status: data.status || 'PENDIENTE',
      })
      .returning();

    await logAuditEvent(
      {
        tenantId,
        userId,
        action: 'DISBURSEMENT_CREATED',
        entity: 'disbursement',
        entityId: disb.id.toString(),
        metadata: {
          agreementId: data.agreementId,
          amount: disb.amount,
          status: disb.status,
          milestone: disb.milestoneTitle,
        },
      },
      tx,
      { required: true }
    );

    return disb;
  });
};

export const getFundingSummaryByProject = async (tenantId: number, projectId: number) => {
  return await withTenantContext(tenantId, async (tx) => {
    const projAgreements = await tx
      .select()
      .from(agreements)
      .where(eq(agreements.projectId, projectId));

    const totalCommitted = projAgreements.reduce((sum, a) => sum + (a.amount || 0), 0);

    const agIds = projAgreements.map((a) => a.id);
    let totalReceived = 0;
    let totalScheduled = 0;

    if (agIds.length > 0) {
      const disbList = await tx
        .select()
        .from(disbursements)
        .where(sql`${disbursements.agreementId} IN ${agIds}`);

      for (const d of disbList) {
        if (d.status === 'PAGADO') totalReceived += d.amount || 0;
        else totalScheduled += d.amount || 0;
      }
    }

    return {
      projectId,
      totalCommitted,
      totalReceived,
      totalScheduled,
      agreementsCount: projAgreements.length,
      agreements: projAgreements,
    };
  });
};
