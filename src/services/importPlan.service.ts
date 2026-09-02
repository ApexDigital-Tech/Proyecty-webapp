import crypto from 'node:crypto';
import {
  budgetLines,
  budgetPlans,
  budgetVersions,
  importBatches,
  importErrors,
  importRows,
  projects,
} from '../db/schema.ts';
import { and, desc, eq, ne } from 'drizzle-orm';
import { withTenantContext } from '../utils/dbWrapper.ts';
import { ConflictError, NotFoundError, ValidationError } from '../utils/errors.ts';
import { logAuditEvent } from './audit.service.ts';

export const OFFICIAL_PLAN_TEMPLATE_HEADER = 'codigo_proyecto,gestion,periodo,version_plan,codigo_partida,categoria,subcategoria,descripcion,unidad,cantidad,costo_unitario,monto_aprobado,moneda,fuente_financiamiento,financiador,convenio,fecha_inicio,fecha_fin,responsable,observaciones';

const csvEscape = (value: string | number) => {
  const text = String(value ?? '');
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
};

export const ABUELITAS_PLAN_ROWS = [
  ['11700', 'Servicios Personales', 'Sueldos', 'Sueldos (1 Cocinero y 1 Administrador/Nutricionista x 12 meses)', 'Persona-mes', 24, 3500, 84000],
  ['12100', 'Servicios Personales', 'Personal Eventual', 'Apoyo de limpieza y asistencia temporal', 'Mes', 12, 2500, 30000],
  ['21200', 'Servicios No Personales', 'Energía Eléctrica', 'Consumo mensual estimado del comedor', 'Mes', 12, 450, 5400],
  ['21300', 'Servicios No Personales', 'Agua Potable', 'Lavado de alimentos, vajilla e higiene', 'Mes', 12, 300, 3600],
  ['21400', 'Servicios No Personales', 'Gas Domiciliario / Garrafas', 'Cocción diaria de raciones', 'Mes', 12, 200, 2400],
  ['23100', 'Servicios No Personales', 'Alquiler de Edificios', 'Arrendamiento del local del comedor', 'Mes', 12, 3000, 36000],
  ['31110', 'Materiales y Suministros', 'Productos Agrícolas', 'Verduras, frutas y legumbres frescas', 'Mes', 12, 4000, 48000],
  ['31120', 'Materiales y Suministros', 'Alimentos y Bebidas', 'Abarrotes: arroz, fideo, aceite y carne', 'Mes', 12, 6500, 78000],
  ['39500', 'Materiales y Suministros', 'Útiles de Limpieza e Higiene', 'Desinfectantes y detergentes', 'Mes', 12, 500, 6000],
  ['43110', 'Activos Reales', 'Equipo de Oficina y Muebles', 'Mesas y sillas para los adultos mayores', 'Lote', 1, 15000, 15000],
  ['43500', 'Activos Reales', 'Equipo de Cocina y Comedor', 'Cocina industrial, refrigerador y ollas', 'Lote', 1, 25000, 25000],
] as const;

const CLASSIFIER_WARNINGS: Record<string, string> = {
  '21400': 'El PDF asigna Gas Domiciliario a 21400; el clasificador boliviano debe revisarse (referencia habitual: 21500).',
  '31110': 'El PDF asigna Productos Agrícolas a 31110; debe revisarse su correspondencia con 31300.',
  '39500': 'El PDF asigna Limpieza e Higiene a 39500; debe revisarse su correspondencia con 39100.',
  '43500': 'La partida mezcla cocina/refrigerador y ollas; debe separarse o justificarse su clasificación antes de aprobación.',
};

export const getAbuelitasPlanTemplateCsv = (projectCode = 'PRJ-VS-2000') => {
  const common = [projectCode, 2026, 'Anual', 'V1'];
  const tail = ['BOB', 'Aportes institucionales y cooperación', 'Organización Dona un Sorriso (DUS)', 'Convenio VOSERDEM 2026', '2026-01-01', '2026-12-31', 'Administración VOSERDEM', 'Importado del presupuesto de referencia; sujeto a revisión del clasificador'];
  const lines = ABUELITAS_PLAN_ROWS.map((row) => [...common, ...row, ...tail].map(csvEscape).join(','));
  return `${OFFICIAL_PLAN_TEMPLATE_HEADER}\r\n${lines.join('\r\n')}\r\n`;
};

export const getOfficialPlanTemplateCsv = () => getAbuelitasPlanTemplateCsv('PRJ-DEMO-2026');

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

export interface PlanImportNotice {
  rowNumber: number;
  field: string;
  message: string;
}

export function parseCsv(content: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;

  for (let index = 0; index < content.length; index++) {
    const char = content[index];
    if (quoted) {
      if (char === '"' && content[index + 1] === '"') {
        field += '"';
        index++;
      } else if (char === '"') {
        quoted = false;
      } else {
        field += char;
      }
    } else if (char === '"') {
      quoted = true;
    } else if (char === ',') {
      row.push(field.trim());
      field = '';
    } else if (char === '\n') {
      row.push(field.trim());
      if (row.some((value) => value.length > 0)) rows.push(row);
      row = [];
      field = '';
    } else if (char !== '\r') {
      field += char;
    }
  }

  if (quoted) throw new ValidationError('El archivo CSV contiene una comilla sin cerrar.');
  row.push(field.trim());
  if (row.some((value) => value.length > 0)) rows.push(row);
  return rows;
}

const parseNumber = (value: string) => {
  const normalized = value.replace(/\s/g, '').replace(/Bs\.?/gi, '');
  if (normalized.includes(',') && normalized.includes('.')) return Number(normalized.replace(/,/g, ''));
  return Number(normalized.replace(',', '.'));
};

export function validateBudgetPlanCsv(fileContent: string, expectedProjectCode: string) {
  const csvRows = parseCsv(fileContent.replace(/^\uFEFF/, ''));
  if (csvRows.length <= 1) throw new ValidationError('El archivo está vacío o no contiene partidas.');

  const header = csvRows[0].map((value) => value.toLowerCase().trim());
  const required = OFFICIAL_PLAN_TEMPLATE_HEADER.split(',');
  const missing = required.filter((name) => !header.includes(name));
  if (missing.length > 0) throw new ValidationError(`Faltan columnas obligatorias: ${missing.join(', ')}`);

  const position = new Map(header.map((name, index) => [name, index]));
  const get = (row: string[], name: string) => row[position.get(name)!] ?? '';
  const errors: PlanImportNotice[] = [];
  const warnings: PlanImportNotice[] = [];
  const parsedRows: Array<{ rowNumber: number; data: PlanRowData }> = [];
  const seenCodes = new Set<string>();

  csvRows.slice(1).forEach((row, index) => {
    const rowNumber = index + 2;
    const projectCode = get(row, 'codigo_proyecto').trim();
    const budgetCode = get(row, 'codigo_partida').trim();
    const category = get(row, 'categoria').trim();
    const subcategory = get(row, 'subcategoria').trim();
    const description = get(row, 'descripcion').trim();
    const unit = get(row, 'unidad').trim();
    const quantity = parseNumber(get(row, 'cantidad'));
    const unitCost = parseNumber(get(row, 'costo_unitario'));
    const approvedAmount = parseNumber(get(row, 'monto_aprobado'));
    const currency = get(row, 'moneda').trim().toUpperCase();

    if (projectCode !== expectedProjectCode) errors.push({ rowNumber, field: 'codigo_proyecto', message: `Se esperaba ${expectedProjectCode} y se recibió ${projectCode || '(vacío)'}` });
    if (!budgetCode) errors.push({ rowNumber, field: 'codigo_partida', message: 'Código de partida obligatorio' });
    if (seenCodes.has(budgetCode)) errors.push({ rowNumber, field: 'codigo_partida', message: `Código duplicado: ${budgetCode}` });
    seenCodes.add(budgetCode);
    if (!category || !subcategory || !description || !unit) errors.push({ rowNumber, field: 'clasificacion', message: 'Categoría, subcategoría, descripción y unidad son obligatorias' });
    if (!Number.isFinite(quantity) || quantity <= 0) errors.push({ rowNumber, field: 'cantidad', message: 'Cantidad debe ser mayor a cero' });
    if (!Number.isFinite(unitCost) || unitCost < 0) errors.push({ rowNumber, field: 'costo_unitario', message: 'Costo unitario inválido' });
    if (!Number.isFinite(approvedAmount) || approvedAmount <= 0) errors.push({ rowNumber, field: 'monto_aprobado', message: 'Monto aprobado debe ser mayor a cero' });
    if (Number.isFinite(quantity) && Number.isFinite(unitCost) && Number.isFinite(approvedAmount) && Math.abs(quantity * unitCost - approvedAmount) > 0.01) {
      errors.push({ rowNumber, field: 'monto_aprobado', message: `Cantidad x precio unitario no coincide (${quantity} x ${unitCost} != ${approvedAmount})` });
    }
    if (!['BOB', 'USD', 'EUR'].includes(currency)) errors.push({ rowNumber, field: 'moneda', message: `Moneda no autorizada: ${currency}` });
    if (CLASSIFIER_WARNINGS[budgetCode]) warnings.push({ rowNumber, field: 'codigo_partida', message: CLASSIFIER_WARNINGS[budgetCode] });

    parsedRows.push({
      rowNumber,
      data: {
        projectCode,
        gestion: Number.parseInt(get(row, 'gestion'), 10),
        period: get(row, 'periodo') || 'Anual',
        planVersion: get(row, 'version_plan') || 'V1',
        budgetCode,
        category,
        subcategory,
        description,
        unit,
        quantity,
        unitCost,
        approvedAmount,
        currency,
        fundingSource: get(row, 'fuente_financiamiento'),
        donorName: get(row, 'financiador'),
        agreementCode: get(row, 'convenio'),
        startDate: get(row, 'fecha_inicio'),
        endDate: get(row, 'fecha_fin'),
        responsibleName: get(row, 'responsable'),
        observations: get(row, 'observaciones'),
      },
    });
  });

  const currencies = new Set(parsedRows.map((row) => row.data.currency));
  if (currencies.size > 1) errors.push({ rowNumber: 1, field: 'moneda', message: 'Todas las partidas deben usar una sola moneda base' });

  return {
    rows: parsedRows,
    errors,
    warnings,
    totalAmount: parsedRows.reduce((sum, row) => sum + (Number.isFinite(row.data.approvedAmount) ? row.data.approvedAmount : 0), 0),
    currency: parsedRows[0]?.data.currency || 'BOB',
    fiscalYear: parsedRows[0]?.data.gestion || new Date().getFullYear(),
    period: parsedRows[0]?.data.period || 'Anual',
  };
}

export const processPlanImportBatch = async (
  tenantId: number,
  userId: number,
  projectId: number,
  fileName: string,
  fileContent: string
) => withTenantContext(tenantId, async (tx) => {
  const [project] = await tx.select({ id: projects.id, code: projects.code }).from(projects)
    .where(and(eq(projects.id, projectId), eq(projects.tenantId, tenantId))).limit(1);
  if (!project) throw new NotFoundError('Proyecto no encontrado para esta organización.');

  const fileHash = crypto.createHash('sha256').update(fileContent).digest('hex');
  const [duplicate] = await tx.select({ id: importBatches.id }).from(importBatches)
    .where(and(eq(importBatches.projectId, projectId), eq(importBatches.fileHash, fileHash), ne(importBatches.status, 'REJECTED'))).limit(1);
  if (duplicate) throw new ConflictError(`Este archivo ya fue importado (lote #${duplicate.id}).`);

  const validation = validateBudgetPlanCsv(fileContent, project.code);
  const invalidRows = new Set(validation.errors.filter((error) => error.rowNumber > 1).map((error) => error.rowNumber));
  const [batch] = await tx.insert(importBatches).values({
    tenantId,
    projectId,
    type: 'BUDGET_PLAN',
    fileName,
    fileHash,
    totalRows: validation.rows.length,
    validRows: validation.rows.length - invalidRows.size,
    rejectedRows: invalidRows.size,
    totalAmount: validation.totalAmount,
    status: validation.errors.length > 0 ? 'REJECTED' : 'VALIDATED',
    createdBy: userId,
  }).returning();

  for (const row of validation.rows) {
    const rowErrors = validation.errors.filter((error) => error.rowNumber === row.rowNumber);
    const rowWarnings = validation.warnings.filter((warning) => warning.rowNumber === row.rowNumber);
    await tx.insert(importRows).values({
      batchId: batch.id,
      rowNumber: row.rowNumber,
      status: rowErrors.length > 0 ? 'INVALID' : 'VALID',
      rowData: { ...row.data, classifierWarnings: rowWarnings.map((warning) => warning.message) },
      rowHash: crypto.createHash('sha256').update(JSON.stringify(row.data)).digest('hex'),
    });
  }
  for (const error of validation.errors) {
    await tx.insert(importErrors).values({ batchId: batch.id, rowNumber: error.rowNumber, field: error.field, errorMessage: error.message });
  }

  const validRowsData = validation.rows.filter(row => !invalidRows.has(row.rowNumber));

  if (validRowsData.length === 0) {
    return { batchId: batch.id, status: 'REJECTED', totalRows: validation.rows.length, validRows: 0, rejectedRows: invalidRows.size, totalAmount: 0, errors: validation.errors, warnings: validation.warnings };
  }

  let [plan] = await tx.select().from(budgetPlans)
    .where(and(eq(budgetPlans.projectId, projectId), eq(budgetPlans.tenantId, tenantId))).limit(1);
  if (!plan) {
    [plan] = await tx.insert(budgetPlans).values({
      tenantId,
      projectId,
      title: `Plan de Gastos ${validation.fiscalYear}`,
      period: validation.period,
      fiscalYear: validation.fiscalYear,
      status: 'ACTIVE',
    }).returning();
  }

  const versions = await tx.select({ versionNumber: budgetVersions.versionNumber }).from(budgetVersions)
    .where(and(eq(budgetVersions.projectId, projectId), eq(budgetVersions.tenantId, tenantId)))
    .orderBy(desc(budgetVersions.versionNumber));
  const nextVersionNumber = (versions[0]?.versionNumber || 0) + 1;
  const [version] = await tx.insert(budgetVersions).values({
    tenantId,
    projectId,
    budgetPlanId: plan.id,
    versionName: `V${nextVersionNumber} - Plan importado ${validation.fiscalYear}`,
    versionNumber: nextVersionNumber,
    status: 'DRAFT',
    isApproved: false,
  }).returning();

  for (const row of validRowsData) {
    const data = row.data;
    await tx.insert(budgetLines).values({
      projectId,
      budgetVersionId: version.id,
      code: data.budgetCode,
      category: data.category,
      subcategory: data.subcategory,
      description: data.description,
      unit: data.unit,
      quantity: data.quantity,
      unitCost: data.unitCost,
      currency: data.currency,
      approvedAmount: data.approvedAmount,
      reformulatedAmount: data.approvedAmount,
      executedAmount: 0,
      balance: data.approvedAmount,
      progress: 0,
      status: 'NORMAL',
    });
  }

  const importedTotalAmount = validRowsData.reduce((sum, row) => sum + (Number.isFinite(row.data.approvedAmount) ? row.data.approvedAmount : 0), 0);

  await tx.update(importBatches).set({ createdVersionId: version.id, totalAmount: importedTotalAmount, status: validation.errors.length > 0 ? 'PARTIAL_SUCCESS' : 'VALIDATED' }).where(eq(importBatches.id, batch.id));
  await logAuditEvent({
    tenantId,
    userId,
    action: 'BUDGET_PLAN_IMPORTED_FOR_APPROVAL',
    entity: 'import_batch',
    entityId: batch.id.toString(),
    metadata: { fileName, fileHash, projectId, versionId: version.id, totalRows: validation.rows.length, validRows: validRowsData.length, totalAmount: importedTotalAmount, currency: validation.currency, classifierWarnings: validation.warnings },
  }, tx, { required: true });

  return { batchId: batch.id, status: validation.errors.length > 0 ? 'PARTIAL_SUCCESS' : 'VALIDATED', totalRows: validation.rows.length, validRows: validRowsData.length, rejectedRows: invalidRows.size, totalAmount: importedTotalAmount, currency: validation.currency, createdVersionId: version.id, versionStatus: 'DRAFT', errors: validation.errors, warnings: validation.warnings };
});

export const approveImportedPlanVersion = async (
  tenantId: number,
  userId: number,
  projectId: number,
  versionId: number,
  acknowledgeClassifierWarnings: boolean
) => withTenantContext(tenantId, async (tx) => {
  const [version] = await tx.select().from(budgetVersions)
    .where(and(eq(budgetVersions.id, versionId), eq(budgetVersions.projectId, projectId), eq(budgetVersions.tenantId, tenantId))).limit(1);
  if (!version) throw new NotFoundError('Versión presupuestaria no encontrada.');
  if (version.status !== 'DRAFT') throw new ConflictError('Solo se puede aprobar una versión en borrador.');

  const lines = await tx.select().from(budgetLines).where(eq(budgetLines.budgetVersionId, versionId));
  if (lines.length === 0) throw new ConflictError('La versión no contiene partidas presupuestarias.');
  const warnings = lines.flatMap((line) => CLASSIFIER_WARNINGS[line.code] ? [{ code: line.code, message: CLASSIFIER_WARNINGS[line.code] }] : []);
  if (warnings.length > 0 && !acknowledgeClassifierWarnings) {
    throw new ConflictError('Debe revisar y reconocer las advertencias del clasificador antes de aprobar.');
  }

  const totalAmount = lines.reduce((sum, line) => sum + Number(line.reformulatedAmount), 0);
  const currency = lines[0].currency || 'BOB';
  await tx.update(budgetVersions).set({ status: 'ARCHIVED', isApproved: false })
    .where(and(eq(budgetVersions.projectId, projectId), eq(budgetVersions.status, 'APPROVED')));
  await tx.update(budgetVersions).set({ status: 'APPROVED', isApproved: true, approvedBy: userId })
    .where(eq(budgetVersions.id, versionId));
  await tx.update(projects).set({ approvedBudget: totalAmount, baseCurrency: currency })
    .where(and(eq(projects.id, projectId), eq(projects.tenantId, tenantId)));
  await tx.update(importBatches).set({ status: 'APPLIED' }).where(eq(importBatches.createdVersionId, versionId));

  await logAuditEvent({
    tenantId,
    userId,
    action: 'BUDGET_PLAN_VERSION_APPROVED',
    entity: 'budget_version',
    entityId: versionId.toString(),
    metadata: { projectId, totalAmount, currency, linesCount: lines.length, classifierWarningsAcknowledged: warnings },
  }, tx, { required: true });
  return { versionId, status: 'APPROVED', totalAmount, currency, linesCount: lines.length, warnings };
});
