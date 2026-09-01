import crypto from 'crypto';
import { db } from '../db/index.ts';
import { importBatches, importRows, importErrors, projects } from '../db/schema.ts';
import { eq, and } from 'drizzle-orm';
import { withTenantContext } from '../utils/dbWrapper.ts';
import { ConflictError, NotFoundError } from '../utils/errors.ts';
import { logAuditEvent } from './audit.service.ts';
import { createNewBudgetVersionTx } from './budgetPlans.service.ts';

export const OFFICIAL_PLAN_TEMPLATE_HEADER = 'codigo_proyecto,gestion,periodo,version_plan,codigo_partida,categoria,subcategoria,descripcion,unidad,cantidad,costo_unitario,monto_aprobado,moneda,fuente_financiamiento,financiador,convenio,fecha_inicio,fecha_fin,responsable,observaciones';

export const getOfficialPlanTemplateCsv = () => {
  return `${OFFICIAL_PLAN_TEMPLATE_HEADER}
PRJ-DEMO-2026,2026,Anual,V1,BL-01,Talento Humano,Especialista Social,Honorarios Técnicos Especialista Social,Mes,12,2000,24000,USD,Convenio VOSERDEM,UNICEF,CONV-2026-01,2026-01-01,2026-12-31,Coordinación Proyecto,Planificación inicial aprobada
PRJ-DEMO-2026,2026,Anual,V1,BL-02,Infraestructura y Equipamiento,Sistemas de Filtración,Adquisición e Instalación de Lote de Filtración,Unidad,2,25000,50000,USD,Convenio VOSERDEM,UNICEF,CONV-2026-01,2026-01-01,2026-12-31,Área Técnica,Equipamiento agua potable
PRJ-DEMO-2026,2026,Anual,V1,BL-03,Capacitación y Talleres,Guías y Materiales,Talleres Participativos y Material Didáctico,Taller,5,5000,25000,USD,Convenio VOSERDEM,UNICEF,CONV-2026-01,2026-01-01,2026-12-31,Área Social,Talleres comunitarios
PRJ-DEMO-2026,2026,Anual,V1,BL-04,Monitoreo y Auditoría,Auditoría Externa,Auditoría Financiera Externa de Medio Término,Informe,1,5000,5000,USD,Convenio VOSERDEM,UNICEF,CONV-2026-01,2026-01-01,2026-12-31,Dirección,Monitoreo independiente
`;
};

export interface PlanRowData {
  projectCode: string;
  gestion: number;
  period: string;
  planVersion: string;
  budgetCode: string;
  category: string;
  subcategory: string;
  description: string;
  unit: string;
  quantity: number;
  unitCost: number;
  approvedAmount: number;
  currency: string;
  fundingSource?: string;
  donorName?: string;
  agreementCode?: string;
  startDate?: string;
  endDate?: string;
  responsibleName?: string;
  observations?: string;
}

export const processPlanImportBatch = async (
  tenantId: number,
  userId: number,
  projectId: number,
  fileName: string,
  fileContent: string
) => {
  return await withTenantContext(tenantId, async (tx) => {
    const fileHash = crypto.createHash('sha256').update(fileContent).digest('hex');

    const lines = fileContent
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter((l) => l.length > 0);

    if (lines.length <= 1) {
      throw new ConflictError('El archivo importado está vacío o no contiene filas de datos.');
    }

    const header = lines[0].toLowerCase();
    const dataLines = lines.slice(1);

    // Create import batch
    const [batch] = await tx
      .insert(importBatches)
      .values({
        tenantId,
        projectId,
        type: 'BUDGET_PLAN',
        fileName,
        fileHash,
        totalRows: dataLines.length,
        status: 'PENDING',
        createdBy: userId,
      })
      .returning();

    let validCount = 0;
    let rejectedCount = 0;
    let totalBatchAmount = 0;
    const parsedRows: Array<{ rowNumber: number; data: PlanRowData }> = [];
    const seenCodes = new Set<string>();
    const batchErrors: Array<{ rowNumber: number; field: string; errorMessage: string }> = [];

    for (let i = 0; i < dataLines.length; i++) {
      const rowNum = i + 2;
      const cols = dataLines[i].split(',').map((c) => c.trim());

      const code = cols[4] || cols[0];
      const category = cols[5] || cols[1] || 'General';
      const subcategory = cols[6] || cols[2] || 'Subcategoría Generada';
      const desc = cols[7] || cols[3] || category;
      const unit = cols[8] || 'Unidad';
      const qty = parseFloat(cols[9] || '1');
      const unitCost = parseFloat(cols[10] || cols[11] || '0');
      const approvedAmount = parseFloat(cols[11] || cols[10] || '0');
      const currency = cols[12] || 'USD';

      let isRowValid = true;

      if (!code) {
        batchErrors.push({ rowNumber: rowNum, field: 'codigo_partida', errorMessage: 'Código de partida obligatorio' });
        isRowValid = false;
      } else if (seenCodes.has(code)) {
        batchErrors.push({ rowNumber: rowNum, field: 'codigo_partida', errorMessage: `Código de partida duplicado en el archivo: ${code}` });
        isRowValid = false;
      } else {
        seenCodes.add(code);
      }

      if (isNaN(approvedAmount) || approvedAmount <= 0) {
        batchErrors.push({ rowNumber: rowNum, field: 'monto_aprobado', errorMessage: 'Monto aprobado debe ser mayor a 0' });
        isRowValid = false;
      }

      if (!['USD', 'BOB', 'EUR'].includes(currency.toUpperCase())) {
        batchErrors.push({ rowNumber: rowNum, field: 'moneda', errorMessage: `Moneda no autorizada: ${currency}` });
        isRowValid = false;
      }

      if (isRowValid) {
        validCount++;
        totalBatchAmount += approvedAmount;
        parsedRows.push({
          rowNumber: rowNum,
          data: {
            projectCode: cols[0] || 'PRJ-DEMO-2026',
            gestion: parseInt(cols[1] || '2026', 10),
            period: cols[2] || 'Anual',
            planVersion: cols[3] || 'V1',
            budgetCode: code,
            category,
            subcategory,
            description: desc,
            unit,
            quantity: isNaN(qty) ? 1 : qty,
            unitCost: isNaN(unitCost) ? approvedAmount : unitCost,
            approvedAmount,
            currency: currency.toUpperCase(),
            fundingSource: cols[13],
            donorName: cols[14],
            agreementCode: cols[15],
            startDate: cols[16],
            endDate: cols[17],
            responsibleName: cols[18],
            observations: cols[19],
          },
        });
      } else {
        rejectedCount++;
      }

      await tx.insert(importRows).values({
        batchId: batch.id,
        rowNumber: rowNum,
        status: isRowValid ? 'VALID' : 'INVALID',
        rowData: { cols },
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

    let createdVerId = null;

    if (rejectedCount === 0 && parsedRows.length > 0) {
      // Create new budget version automatically if 100% valid
      const linesToCopy = parsedRows.map((r) => ({
        code: r.data.budgetCode,
        category: r.data.category,
        subcategory: r.data.subcategory,
        approvedAmount: r.data.approvedAmount,
        reformulatedAmount: r.data.approvedAmount,
      }));

      const verResult = await createNewBudgetVersionTx(
        tenantId,
        projectId,
        userId,
        `V-Imported (${fileName})`,
        linesToCopy
      );
      createdVerId = verResult.version.id;
    }

    await tx
      .update(importBatches)
      .set({
        validRows: validCount,
        rejectedRows: rejectedCount,
        totalAmount: totalBatchAmount,
        status: rejectedCount === 0 ? 'APPLIED' : 'REJECTED',
        createdVersionId: createdVerId,
      })
      .where(eq(importBatches.id, batch.id));

    await logAuditEvent(
      {
        tenantId,
        userId,
        action: 'PLAN_IMPORT_COMPLETED',
        entity: 'import_batch',
        entityId: batch.id.toString(),
        metadata: {
          fileName,
          fileHash,
          totalRows: dataLines.length,
          validRows: validCount,
          rejectedRows: rejectedCount,
          status: rejectedCount === 0 ? 'APPLIED' : 'REJECTED',
          versionId: createdVerId,
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
      totalAmount: totalBatchAmount,
      status: rejectedCount === 0 ? 'APPLIED' : 'REJECTED',
      errors: batchErrors,
      createdVersionId: createdVerId,
    };
  });
};
