import { db } from '../db/index.ts';
import { agreements, disbursements, projects } from '../db/schema.ts';
import { eq, and, sql } from 'drizzle-orm';
import { withTenantContext } from '../utils/dbWrapper.ts';
import { logAuditEvent } from './audit.service.ts';
import { NotFoundError, ConflictError, ValidationError } from '../utils/errors.ts';

export interface CreateAgreementDto {
  counterparty: string;
  signedDate: string | Date;
  amount: number;
  currency?: string;
  durationMonths: number;
  startDate: string | Date;
  endDate: string | Date;
  status?: string;
}

export interface CreateDisbursementDto {
  milestoneTitle: string;
  estimatedDate: string | Date;
  amount: number;
  condition: string;
  status?: string; // 'PAGADO', 'PENDIENTE', 'ATRASADO'
  exchangeRate?: number;
  exchangeRateDate?: string | Date;
}

export const createAgreement = async (
  tenantId: number,
  projectId: number,
  userId: number,
  data: CreateAgreementDto
) => {
  return await withTenantContext(tenantId, async (tx) => {
    // 1. Validar existencia y aislamiento de proyecto
    const [project] = await tx.select().from(projects).where(
      and(eq(projects.id, projectId), eq(projects.tenantId, tenantId))
    );
    if (!project) {
      throw new NotFoundError('El proyecto especificado no existe en esta organización.');
    }

    // 2. Validaciones de montos y fechas
    if (data.amount <= 0) {
      throw new ValidationError('El monto del convenio debe ser estrictamente mayor a 0.');
    }

    const signed = new Date(data.signedDate);
    const start = new Date(data.startDate);
    const end = new Date(data.endDate);

    if (isNaN(signed.getTime()) || isNaN(start.getTime()) || isNaN(end.getTime())) {
      throw new ValidationError('Las fechas del convenio deben ser válidas.');
    }

    if (signed > start) {
      throw new ValidationError('La fecha de firma no puede ser posterior a la fecha de inicio del convenio.');
    }

    if (start > end) {
      throw new ValidationError('La fecha de inicio no puede ser posterior a la fecha de finalización.');
    }

    const now = new Date();
    const diffTime = end.getTime() - now.getTime();
    const remainingDays = Math.max(0, Math.ceil(diffTime / (1000 * 60 * 60 * 24)));

    // 3. Inserción de convenio
    const [newAgreement] = await tx.insert(agreements).values({
      projectId,
      counterparty: data.counterparty,
      signedDate: signed,
      amount: data.amount,
      currency: data.currency || 'USD',
      durationMonths: data.durationMonths,
      startDate: start,
      endDate: end,
      remainingDays,
      status: data.status || 'Activo',
    }).returning();

    // 4. Log de auditoría
    logAuditEvent({
      tenantId,
      userId,
      action: 'AGREEMENT_CREATED',
      entity: 'agreement',
      entityId: newAgreement.id.toString(),
      metadata: {
        projectId,
        counterparty: newAgreement.counterparty,
        amount: newAgreement.amount,
        currency: newAgreement.currency,
        startDate: newAgreement.startDate,
        endDate: newAgreement.endDate,
      },
    });

    return newAgreement;
  });
};

export const getAgreementsByProject = async (tenantId: number, projectId: number) => {
  return await withTenantContext(tenantId, async (tx) => {
    const [project] = await tx.select().from(projects).where(
      and(eq(projects.id, projectId), eq(projects.tenantId, tenantId))
    );
    if (!project) {
      throw new NotFoundError('Proyecto no encontrado.');
    }

    return await tx.select().from(agreements).where(eq(agreements.projectId, projectId));
  });
};

export const createDisbursement = async (
  tenantId: number,
  agreementId: number,
  userId: number,
  data: CreateDisbursementDto
) => {
  return await withTenantContext(tenantId, async (tx) => {
    // 1. Obtener convenio y verificar pertenencia al tenant
    const agreementResult = await tx.select({
      agreement: agreements,
      project: projects,
    }).from(agreements)
      .innerJoin(projects, eq(agreements.projectId, projects.id))
      .where(and(eq(agreements.id, agreementId), eq(projects.tenantId, tenantId)));

    if (agreementResult.length === 0) {
      throw new NotFoundError('El convenio especificado no existe o no pertenece a esta organización.');
    }

    const { agreement } = agreementResult[0];

    // 2. Validar monto positivo
    if (data.amount <= 0) {
      throw new ValidationError('El monto del desembolso debe ser estrictamente mayor a 0.');
    }

    // 3. Validar desembolsos acumulados vs monto total del convenio (M-06)
    const existingDisbursements = await tx.select().from(disbursements).where(eq(disbursements.agreementId, agreementId));
    const currentDisbursedTotal = existingDisbursements.reduce((sum, d) => sum + (d.amount || 0), 0);

    if (currentDisbursedTotal + data.amount > agreement.amount) {
      throw new ConflictError(
        `Control M-06: El desembolso acumulado ($${(currentDisbursedTotal + data.amount).toLocaleString()}) excede el monto total del convenio ($${agreement.amount.toLocaleString()}). Saldo disponible por desembolsar: $${(agreement.amount - currentDisbursedTotal).toLocaleString()}.`
      );
    }

    // 4. Inserción de desembolso
    const [newDisbursement] = await tx.insert(disbursements).values({
      agreementId,
      milestoneTitle: data.milestoneTitle,
      estimatedDate: new Date(data.estimatedDate),
      amount: data.amount,
      condition: data.condition,
      status: data.status || 'PENDIENTE',
    }).returning();

    // 5. Log de auditoría
    logAuditEvent({
      tenantId,
      userId,
      action: 'DISBURSEMENT_CREATED',
      entity: 'disbursement',
      entityId: newDisbursement.id.toString(),
      metadata: {
        agreementId,
        milestoneTitle: newDisbursement.milestoneTitle,
        amount: newDisbursement.amount,
        status: newDisbursement.status,
        cumulativeDisbursed: currentDisbursedTotal + data.amount,
        agreementTotal: agreement.amount,
      },
    });

    return newDisbursement;
  });
};

export const getDisbursementsByAgreement = async (tenantId: number, agreementId: number) => {
  return await withTenantContext(tenantId, async (tx) => {
    const agreementResult = await tx.select({
      agreement: agreements,
      project: projects,
    }).from(agreements)
      .innerJoin(projects, eq(agreements.projectId, projects.id))
      .where(and(eq(agreements.id, agreementId), eq(projects.tenantId, tenantId)));

    if (agreementResult.length === 0) {
      throw new NotFoundError('Convenio no encontrado.');
    }

    return await tx.select().from(disbursements).where(eq(disbursements.agreementId, agreementId));
  });
};
