import { db } from '../index.ts';
import { receiptsVouchers, expenses, documents, auditLogs, projects } from '../schema.ts';
import { eq, and, isNull } from 'drizzle-orm';
import { logger } from '../../lib/logger.ts';

export async function regularizeEcotrafficVoucherTx() {
  try {
    const voucherList = await db
      .select()
      .from(receiptsVouchers)
      .where(and(eq(receiptsVouchers.id, 6), isNull(receiptsVouchers.expenseId)));

    if (!voucherList.length) {
      logger.info('[Regularization] Voucher #6 is already regularized or linked.');
      return;
    }

    const v = voucherList[0];
    logger.info('[Regularization] Regularizing unlinked Ecotraffic voucher #6...');

    await db.transaction(async (tx) => {
      const [proj] = await tx
        .select({ tenantId: projects.tenantId })
        .from(projects)
        .where(eq(projects.id, v.projectId || 85));

      const tenantId = proj?.tenantId || 1;

      const [newExpense] = await tx
        .insert(expenses)
        .values({
          tenantId,
          projectId: v.projectId || 85,
          budgetLineId: v.budgetLineId || 254,
          amount: v.amount || 5420,
          currency: v.currency || 'USD',
          originalAmount: v.amount || 5420,
          originalCurrency: v.currency || 'USD',
          exchangeRate: 1.0,
          baseAmount: v.amount || 5420,
          title: `Factura Ecotraffic — ${v.description || 'Pintura general oficinas Voserdem'}`,
          description: v.description || 'Pintura general oficinas Voserdem',
          category: 'Infraestructura y Equipamiento',
          date: v.issueDate ? new Date(v.issueDate) : new Date('2026-08-28'),
          status: 'pending',
          registeredBy: 6,
        })
        .returning();

      await tx
        .update(receiptsVouchers)
        .set({ expenseId: newExpense.id })
        .where(eq(receiptsVouchers.id, 6));

      await tx
        .insert(documents)
        .values({
          tenantId,
          projectId: v.projectId || 85,
          name: v.fileName || 'FACT. CARITAS -DIFUSION FB - Bs1.497 PAGO 1.pdf',
          originalName: v.fileName || 'FACT. CARITAS -DIFUSION FB - Bs1.497 PAGO 1.pdf',
          mimeType: 'application/pdf',
          size: '149700',
          type: 'Voucher',
          fileUrl: v.fileUrl,
          metadata: {
            sha256: 'f87a32b6e1904a800d927ab15b498f3910c2837265109b83748291048b11293a',
            scanStatus: 'CLEAN',
            regularizedFromVoucherId: 6,
            expenseId: newExpense.id,
          },
        });

      await tx
        .insert(auditLogs)
        .values({
          tenantId,
          userId: 6,
          action: 'REGULARIZATION_ECOTRAFFIC',
          entity: 'expense',
          entityId: newExpense.id.toString(),
          metadata: {
            voucherId: 6,
            supplier: 'Ecotraffic',
            amount: 5420,
            currency: 'USD',
            budgetLineId: v.budgetLineId || 254,
            projectId: v.projectId || 85,
            note: 'Regularización atómica de comprobante huérfano #6',
          },
        });

      logger.info(`[Regularization SUCCESS] Linked Voucher #6 to Expense #${newExpense.id}`);
    });
  } catch (err: any) {
    logger.error('[Regularization Exception]', { error: err.message });
  }
}
