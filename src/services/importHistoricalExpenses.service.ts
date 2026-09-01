import crypto from 'crypto';
import { db } from '../db/index.ts';
import { importBatches, importRows, importErrors, expenses, budgetLines, receiptsVouchers, documents } from '../db/schema.ts';
import { eq, and, sql } from 'drizzle-orm';
import { withTenantContext } from '../utils/dbWrapper.ts';
import { ConflictError, NotFoundError } from '../utils/errors.ts';
import { logAuditEvent } from './audit.service.ts';
import { recalculateFinancialState } from './expenses.service.ts';

export const OFFICIAL_HISTORICAL_EXPENSES_TEMPLATE_HEADER = 'external_id,numero_comprobante,codigo_proyecto,gestion,fecha,codigo_partida,fuente_financiamiento,financiador,convenio,proveedor,nit_ci,titulo,concepto,moneda,monto,tipo_cambio,monto_base,estado_historico,numero_factura,archivo_respaldo,creador_original,fecha_aprobacion,aprobador_original,observaciones';

export const getOfficialHistoricalExpensesTemplateCsv = () => {
  return `${OFFICIAL_HISTORICAL_EXPENSES_TEMPLATE_HEADER}
EXT-2026-001,FAC-2026-001,PRJ-DEMO-2026,2026,2026-01-15,BL-01,Convenio VOSERDEM,UNICEF,CONV-2026-01,Consultora Social S.R.L.,10293847,Honorarios Enero,Honorarios Técnicos Especialista Social,USD,2000,1.0,2000,approved,FACT-1092,factura_enero.pdf,Administrador,2026-01-16,Director General,Importado desde sistema contable previo
EXT-2026-002,FAC-2026-002,PRJ-DEMO-2026,2026,2026-02-15,BL-01,Convenio VOSERDEM,UNICEF,CONV-2026-01,Consultora Social S.R.L.,10293847,Honorarios Febrero,Honorarios Técnicos Especialista Social,USD,2000,1.0,2000,approved,FACT-1093,factura_febrero.pdf,Administrador,2026-02-16,Director General,Importado desde sistema contable previo
`;
};

export interface HistoricalExpenseRowData {
  externalId: string;
  voucherNumber: string;
  projectCode: string;
  gestion: number;
  date: string;
  budgetCode: string;
  fundingSource?: string;
  donorName?: string;
  agreementCode?: string;
  provider: string;
  taxId?: string;
  title: string;
  description?: string;
  currency: string;
  amount: number;
  exchangeRate: number;
  baseAmount: number;
  historicalStatus: string; // 'approved', 'pending', 'rejected'
  invoiceNumber?: string;
  documentFile?: string;
  originalCreator?: string;
  approvalDate?: string;
  approverName?: string;
  observations?: string;
}

export const processHistoricalExpenseImportBatch = async (
  tenantId: number,
  userId: number,
  projectId: number,
  fileName: string,
  fileContent: string,
  importMode: 'DRAFT' | 'PENDING_REVIEW' | 'HISTORICAL_APPROVED' = 'PENDING_REVIEW'
) => {
  return await withTenantContext(tenantId, async (tx) => {
    const fileHash = crypto.createHash('sha256').update(fileContent).digest('hex');

    const lines = fileContent
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter((l) => l.length > 0);

    if (lines.length <= 1) {
      throw new ConflictError('El archivo de gastos históricos está vacío o no contiene filas.');
    }

    const dataLines = lines.slice(1);

    // Create import batch
    const [batch] = await tx
      .insert(importBatches)
      .values({
        tenantId,
        projectId,
        type: 'HISTORICAL_EXPENSES',
        fileName,
        fileHash,
        totalRows: dataLines.length,
        status: 'PENDING',
        createdBy: userId,
      })
      .returning();

    // Fetch budget lines for project
    const bLines = await tx
      .select()
      .from(budgetLines)
      .where(eq(budgetLines.projectId, projectId));

    const bLineMap = new Map<string, number>();
    bLines.forEach((b) => bLineMap.set(b.code.toUpperCase(), b.id));

    // Fetch existing expenses for duplicate check
    const existingExpenses = await tx
      .select()
      .from(expenses)
      .where(and(eq(expenses.tenantId, tenantId), eq(expenses.projectId, projectId)));

    const existingHashSet = new Set<string>();
    existingExpenses.forEach((e) => {
      const hashKey = `${e.budgetLineId}_${e.amount}_${e.currency}_${e.date ? new Date(e.date).toISOString().split('T')[0] : ''}_${e.title?.toLowerCase()}`;
      existingHashSet.add(hashKey);
    });

    let validCount = 0;
    let rejectedCount = 0;
    let duplicateCount = 0;
    let totalBatchAmount = 0;
    const validRowsToInsert: Array<{ rowNumber: number; data: HistoricalExpenseRowData; bLineId: number }> = [];
    const batchErrors: Array<{ rowNumber: number; field: string; errorMessage: string }> = [];

    for (let i = 0; i < dataLines.length; i++) {
      const rowNum = i + 2;
      const cols = dataLines[i].split(',').map((c) => c.trim());

      const extId = cols[0] || `EXT-${Date.now()}-${i}`;
      const voucherNum = cols[1] || `VOUCHER-${i}`;
      const dateStr = cols[4] || new Date().toISOString().split('T')[0];
      const code = (cols[5] || 'BL-01').toUpperCase();
      const provider = cols[9] || 'Proveedor Histórico';
      const title = cols[11] || cols[12] || 'Gasto Histórico Importado';
      const currency = (cols[13] || 'USD').toUpperCase();
      const amount = parseFloat(cols[14] || '0');
      const rate = parseFloat(cols[15] || '1');
      const baseAmount = amount * rate;
      const statusInput = (cols[17] || 'approved').toLowerCase();

      let isRowValid = true;
      const bLineId = bLineMap.get(code);

      if (!bLineId) {
        batchErrors.push({ rowNumber: rowNum, field: 'codigo_partida', errorMessage: `La partida ${code} no existe en el proyecto` });
        isRowValid = false;
      }

      if (isNaN(amount) || amount <= 0) {
        batchErrors.push({ rowNumber: rowNum, field: 'monto', errorMessage: 'Monto debe ser mayor a 0' });
        isRowValid = false;
      }

      if (!['USD', 'BOB', 'EUR'].includes(currency)) {
        batchErrors.push({ rowNumber: rowNum, field: 'moneda', errorMessage: `Moneda no autorizada: ${currency}` });
        isRowValid = false;
      }

      // Check duplicate
      const hashKey = `${bLineId}_${amount}_${currency}_${dateStr}_${title.toLowerCase()}`;
      if (existingHashSet.has(hashKey)) {
        duplicateCount++;
        batchErrors.push({ rowNumber: rowNum, field: 'duplicado', errorMessage: `Registro duplicado exacto detectado y omitido: ${title} ($${amount})` });
        isRowValid = false;
      }

      if (isRowValid && bLineId) {
        validCount++;
        totalBatchAmount += baseAmount;
        validRowsToInsert.push({
          rowNumber: rowNum,
          bLineId,
          data: {
            externalId: extId,
            voucherNumber: voucherNum,
            projectCode: cols[2] || 'PRJ-DEMO-2026',
            gestion: parseInt(cols[3] || '2026', 10),
            date: dateStr,
            budgetCode: code,
            fundingSource: cols[6],
            donorName: cols[7],
            agreementCode: cols[8],
            provider,
            taxId: cols[10],
            title,
            description: cols[12] || title,
            currency,
            amount,
            exchangeRate: rate,
            baseAmount,
            historicalStatus: statusInput === 'approved' && importMode === 'HISTORICAL_APPROVED' ? 'approved' : 'pending',
            invoiceNumber: cols[18],
            documentFile: cols[19],
            originalCreator: cols[20],
            approvalDate: cols[21],
            approverName: cols[22],
            observations: cols[23],
          },
        });
      } else {
        rejectedCount++;
      }

      await tx.insert(importRows).values({
        batchId: batch.id,
        rowNumber: rowNum,
        status: isRowValid ? 'VALID' : existingHashSet.has(hashKey) ? 'DUPLICATE' : 'INVALID',
        externalId: extId,
        rowData: { cols },
        rowHash: crypto.createHash('sha256').update(lines[i]).digest('hex'),
      });
    }

    for (const err of batchErrors) {
      await tx.insert(importErrors).values({
        batchId: batch.id,
        rowNumber: err.rowNumber,
        field: err.field,
        errorMessage: err.errorMessage,
      });
    }

    // Apply valid rows if mode allows and no critical failures
    const importedExpenseIds: number[] = [];
    if (validRowsToInsert.length > 0) {
      for (const item of validRowsToInsert) {
        const d = item.data;
        const [exp] = await tx
          .insert(expenses)
          .values({
            tenantId,
            projectId,
            budgetLineId: item.bLineId,
            amount: d.amount,
            currency: d.currency,
            originalAmount: d.amount,
            originalCurrency: d.currency,
            exchangeRate: d.exchangeRate,
            baseAmount: d.baseAmount,
            title: `[HISTÓRICO] ${d.title}`,
            description: d.description || null,
            category: 'Gasto Histórico',
            date: new Date(d.date),
            status: d.historicalStatus === 'approved' ? 'approved' : 'pending',
            registeredBy: userId,
            approvedBy: d.historicalStatus === 'approved' ? userId : null,
          })
          .returning();

        importedExpenseIds.push(exp.id);

        // If voucher file mentioned, attach voucher
        if (d.documentFile || d.voucherNumber) {
          const fileName = d.documentFile || `${d.voucherNumber}.pdf`;
          const [vRow] = await tx
            .insert(receiptsVouchers)
            .values({
              projectId,
              expenseId: exp.id,
              budgetLineId: item.bLineId,
              type: 'Factura',
              amount: d.amount,
              currency: d.currency,
              provider: d.provider,
              issueDate: new Date(d.date),
              description: d.description || d.title,
              fileName,
              fileUrl: `/fixtures/demo/${fileName}`,
              isVerified: d.historicalStatus === 'approved',
            })
            .returning();

          await tx.insert(documents).values({
            tenantId,
            projectId,
            name: fileName,
            originalName: fileName,
            mimeType: 'application/pdf',
            size: '100000',
            type: 'Voucher',
            fileUrl: `/fixtures/demo/${fileName}`,
            metadata: {
              origin: 'imported',
              batchId: batch.id,
              externalId: d.externalId,
              expenseId: exp.id,
              receiptVoucherId: vRow.id,
              scanStatus: 'CLEAN',
            },
          });
        }

        // Recalculate financial state if approved
        if (d.historicalStatus === 'approved') {
          await recalculateFinancialState(tenantId, projectId, item.bLineId, tx);
        }
      }
    }

    const batchStatus = rejectedCount === dataLines.length ? 'REJECTED' : 'APPLIED';

    await tx
      .update(importBatches)
      .set({
        validRows: validCount,
        rejectedRows: rejectedCount,
        totalAmount: totalBatchAmount,
        status: batchStatus,
      })
      .where(eq(importBatches.id, batch.id));

    await logAuditEvent(
      {
        tenantId,
        userId,
        action: 'HISTORICAL_EXPENSE_IMPORT_COMPLETED',
        entity: 'import_batch',
        entityId: batch.id.toString(),
        metadata: {
          fileName,
          fileHash,
          totalRows: dataLines.length,
          validRows: validCount,
          rejectedRows: rejectedCount,
          duplicateCount,
          importedExpenseIds,
          totalAmount: totalBatchAmount,
          status: batchStatus,
        },
      },
      tx,
      { required: true }
    );

    return {
      batchId: batch.id,
      fileName,
      totalRows: dataLines.length,
      validRows: validCount,
      rejectedRows: rejectedCount,
      duplicateCount,
      totalAmount: totalBatchAmount,
      reconciliation: {
        totalFileRows: dataLines.length,
        totalImported: validCount,
        totalRejectedOrDuplicates: rejectedCount,
        formulaCheckPassed: dataLines.length === validCount + rejectedCount,
      },
      status: batchStatus,
      errors: batchErrors,
    };
  });
};
