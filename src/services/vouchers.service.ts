import { db } from '../db/index.ts';
import { receiptsVouchers, projects, expenses, budgetLines } from '../db/schema.ts';
import { eq, and } from 'drizzle-orm';
import { withTenantContext } from '../utils/dbWrapper.ts';
import { logAuditEvent } from './audit.service.ts';
import { NotFoundError, ConflictError, ValidationError } from '../utils/errors.ts';

export interface CreateReceiptVoucherDto {
  projectId: number;
  expenseId?: number;
  budgetLineId?: number;
  type: string; // 'Factura', 'Recibo de Honorarios'
  amount: number;
  currency?: string;
  provider: string;
  issueDate: string | Date;
  milestone?: string;
  description?: string;
  fileName: string;
  fileUrl?: string;
  invoiceNumber?: string; // Para unicidad fiscal (M-10)
}

export const createReceiptVoucher = async (
  tenantId: number,
  userId: number,
  data: CreateReceiptVoucherDto
) => {
  return await withTenantContext(tenantId, async (tx) => {
    // 1. Validar proyecto y pertenencia al tenant
    const [project] = await tx.select().from(projects).where(
      and(eq(projects.id, data.projectId), eq(projects.tenantId, tenantId))
    );
    if (!project) {
      throw new NotFoundError('El proyecto no existe en esta organización.');
    }

    // 2. Validar monto positivo
    if (data.amount <= 0) {
      throw new ValidationError('El monto del comprobante fiscal debe ser mayor a 0.');
    }

    // 3. Validar unicidad fiscal (M-10: evitar facturas duplicadas)
    const existing = await tx.select().from(receiptsVouchers).where(
      and(
        eq(receiptsVouchers.projectId, data.projectId),
        eq(receiptsVouchers.provider, data.provider),
        eq(receiptsVouchers.fileName, data.fileName)
      )
    );

    if (existing.length > 0) {
      throw new ConflictError(`Control M-10: Ya existe un comprobante registrado para el emisor "${data.provider}" con el archivo/referencia "${data.fileName}".`);
    }

    // 4. Inserción de comprobante
    const [newVoucher] = await tx.insert(receiptsVouchers).values({
      projectId: data.projectId,
      expenseId: data.expenseId || null,
      budgetLineId: data.budgetLineId || null,
      type: data.type,
      amount: data.amount,
      currency: data.currency || 'USD',
      provider: data.provider,
      issueDate: new Date(data.issueDate),
      milestone: data.milestone || '',
      description: data.description || '',
      fileName: data.fileName,
      fileUrl: data.fileUrl || '',
      isVerified: false,
    }).returning();

    // 5. Log de auditoría
    logAuditEvent({
      tenantId,
      userId,
      action: 'VOUCHER_REGISTERED',
      entity: 'receipt_voucher',
      entityId: newVoucher.id.toString(),
      metadata: {
        projectId: data.projectId,
        type: newVoucher.type,
        amount: newVoucher.amount,
        provider: newVoucher.provider,
        fileName: newVoucher.fileName,
      },
    });

    return newVoucher;
  });
};

export const getReceiptsVouchersByProject = async (tenantId: number, projectId: number) => {
  return await withTenantContext(tenantId, async (tx) => {
    const [project] = await tx.select().from(projects).where(
      and(eq(projects.id, projectId), eq(projects.tenantId, tenantId))
    );
    if (!project) {
      throw new NotFoundError('Proyecto no encontrado.');
    }

    return await tx.select().from(receiptsVouchers).where(eq(receiptsVouchers.projectId, projectId));
  });
};
