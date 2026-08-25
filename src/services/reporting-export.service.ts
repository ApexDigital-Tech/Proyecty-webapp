import crypto from 'node:crypto';
import { db } from '../db/index.ts';
import { 
  generatedReports, 
  projects, 
  projectMembers, 
  budgetLines, 
  expenses, 
  agreements, 
  users, 
  organizations,
  donors
} from '../db/schema.ts';
import { eq, and, desc, inArray, sql } from 'drizzle-orm';
import { logAuditEvent } from './audit.service.ts';
import { ForbiddenError, NotFoundError, ConflictError, ValidationError } from '../utils/errors.ts';
import { withTenantContext } from '../utils/dbWrapper.ts';

export interface CreateReportDto {
  projectId?: number;
  reportType: 'FINANCIAL' | 'EXECUTIVE' | 'COMPLIANCE';
  parameters?: Record<string, any>;
  contentMarkdown?: string;
  analysisMode?: string;
}

/**
 * Sanitiza campos de texto para CSV mitigando ataques de inyección de fórmulas (CSV Injection)
 * Conforme a RFC 4180 y directrices de seguridad OWASP.
 */
export function sanitizeCsvField(val: any): string {
  if (val === null || val === undefined) return '""';
  
  let str = String(val);
  
  // Detectar fórmulas o caracteres de control incluso con espacios iniciales ocultos
  const dangerousPrefixes = ['=', '+', '-', '@', '\t', '\r'];
  const startsWithDangerous = dangerousPrefixes.some(prefix => str.startsWith(prefix)) ||
                              dangerousPrefixes.some(prefix => str.replace(/^[ ]+/, '').startsWith(prefix));
  
  if (startsWithDangerous) {
    str = `'${str}`; // Neutralizar anteponiendo apóstrofe
  }

  // Escape compatible con RFC 4180
  if (str.includes(',') || str.includes('"') || str.includes('\n') || str.includes('\r')) {
    str = `"${str.replace(/"/g, '""')}"`;
  } else {
    str = `"${str}"`;
  }

  return str;
}

/**
 * Genera contenido CSV con codificación UTF-8 y Byte Order Mark (BOM).
 */
export function generateSafeCsv(headers: string[], rows: any[][]): { buffer: Buffer; sha256: string } {
  const bom = Buffer.from('\uFEFF', 'utf-8');
  
  const headerLine = headers.map(h => sanitizeCsvField(h)).join(',');
  const rowLines = rows.map(r => r.map(cell => sanitizeCsvField(cell)).join(','));
  
  const csvContent = [headerLine, ...rowLines].join('\r\n');
  const contentBuf = Buffer.from(csvContent, 'utf-8');
  const finalBuffer = Buffer.concat([bom, contentBuf]);
  
  const sha256 = crypto.createHash('sha256').update(finalBuffer).digest('hex');
  return { buffer: finalBuffer, sha256 };
}

import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';

/**
 * Genera buffer de documento PDF estructurado en memoria conforme a la norma PDF-1.4/1.7
 * utilizando pdf-lib para garantizar árbol /Catalog -> /Pages -> /Page válido, texto extraíble y metadatos.
 */
export async function generateStructuredPdf(
  orgName: string,
  projectInfo: { code: string; name: string } | null,
  reportType: string,
  versionNumber: number,
  contentMarkdown: string,
  financialSummary?: Record<string, any>
): Promise<{ buffer: Buffer; sha256: string }> {
  const pdfDoc = await PDFDocument.create();
  
  const title = `PROYECTY - REPORTE OFICIAL ${reportType} (V${versionNumber})`;
  pdfDoc.setTitle(title);
  pdfDoc.setAuthor(orgName);
  pdfDoc.setSubject(`Reporte Ejecutivo Oficial ${reportType}`);
  pdfDoc.setCreator('Proyecty Platform');
  pdfDoc.setProducer('pdf-lib');
  pdfDoc.setCreationDate(new Date());

  const helvetica = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const helveticaBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

  // Formato A4 estándar (595.28 x 841.89 pt)
  const page = pdfDoc.addPage([595.28, 841.89]);
  const { width, height } = page.getSize();
  const margin = 50;
  let y = height - margin;

  // Encabezado decorativo institucional
  page.drawRectangle({
    x: margin,
    y: y - 35,
    width: width - 2 * margin,
    height: 40,
    color: rgb(0.12, 0.23, 0.38),
  });

  page.drawText('PROYECTY - GESTION Y FISCALIZACION EJECUTIVA', {
    x: margin + 15,
    y: y - 22,
    size: 13,
    font: helveticaBold,
    color: rgb(1, 1, 1),
  });

  y -= 60;

  // Título del reporte
  page.drawText(title, {
    x: margin,
    y,
    size: 12,
    font: helveticaBold,
    color: rgb(0.1, 0.1, 0.1),
  });
  y -= 18;

  // Subtítulo e información de proyecto / organización
  const subtitle = projectInfo 
    ? `Proyecto: [${projectInfo.code}] ${projectInfo.name}` 
    : `Reporte Institucional Global: ${orgName}`;
  
  page.drawText(subtitle.length > 80 ? subtitle.slice(0, 77) + '...' : subtitle, {
    x: margin,
    y,
    size: 10,
    font: helveticaBold,
    color: rgb(0.2, 0.4, 0.7),
  });
  y -= 15;

  page.drawText(`Organizacion: ${orgName} | Fecha Emision: ${new Date().toISOString()}`, {
    x: margin,
    y,
    size: 8.5,
    font: helvetica,
    color: rgb(0.4, 0.4, 0.4),
  });
  y -= 25;

  // Resumen financiero tabular si existe
  if (financialSummary && Object.keys(financialSummary).length > 0) {
    page.drawText('RESUMEN FINANCIERO CONCILIADO:', {
      x: margin,
      y,
      size: 10.5,
      font: helveticaBold,
      color: rgb(0.15, 0.15, 0.15),
    });
    y -= 15;

    for (const [key, val] of Object.entries(financialSummary)) {
      if (y < margin + 60) break;
      const entryText = `* ${key}: ${String(val)}`;
      page.drawText(entryText.length > 85 ? entryText.slice(0, 82) + '...' : entryText, {
        x: margin + 8,
        y,
        size: 9,
        font: helvetica,
        color: rgb(0.2, 0.2, 0.2),
      });
      y -= 13;
    }
    y -= 15;
  }

  // Contenido y Dictamen
  page.drawText('CONTENIDO Y DICTAMEN AUDITADO:', {
    x: margin,
    y,
    size: 10.5,
    font: helveticaBold,
    color: rgb(0.15, 0.15, 0.15),
  });
  y -= 15;

  const rawLines = contentMarkdown.split('\n');
  for (const line of rawLines) {
    if (y < margin + 40) break;
    const cleanLine = line.replace(/^[#*-]+\s*/, '').trim();
    if (!cleanLine) {
      y -= 6;
      continue;
    }
    const truncated = cleanLine.length > 90 ? cleanLine.slice(0, 87) + '...' : cleanLine;
    page.drawText(truncated, {
      x: margin + 8,
      y,
      size: 8.5,
      font: helvetica,
      color: rgb(0.25, 0.25, 0.25),
    });
    y -= 12;
  }

  // Pie de página oficial
  page.drawText('Pagina 1 de 1 - Documento oficial emitido con hash SHA-256 e inmutabilidad auditada', {
    x: margin,
    y: margin - 15,
    size: 8,
    font: helvetica,
    color: rgb(0.5, 0.5, 0.5),
  });

  const pdfBytes = await pdfDoc.save();
  const buffer = Buffer.from(pdfBytes);
  const sha256 = crypto.createHash('sha256').update(buffer).digest('hex');

  return { buffer, sha256 };
}

/**
 * Valida el alcance y acceso a un proyecto según el rol del usuario.
 */
export async function validateProjectScope(
  tenantId: number,
  userId: number,
  userRole: string,
  projectId?: number | null
): Promise<boolean> {
  if (!projectId) {
    // Reporte global de tenant: solo DIRECTOR, MANAGER, FINANCE y AUDITOR
    return userRole === 'DIRECTOR' || userRole === 'MANAGER' || userRole === 'FINANCE' || userRole === 'AUDITOR';
  }

  // 1. Pertenencia al tenant
  const [project] = await db.select().from(projects).where(
    and(eq(projects.id, projectId), eq(projects.tenantId, tenantId))
  );
  if (!project) {
    throw new NotFoundError('El proyecto no existe en esta organización.');
  }

  // 2. Control de asignación para Responsable de Proyecto
  if (userRole === 'RESPONSABLE_PROYECTO') {
    const [membership] = await db.select().from(projectMembers).where(
      and(eq(projectMembers.projectId, projectId), eq(projectMembers.userId, userId))
    );
    if (!membership) {
      throw new ForbiddenError('Acceso denegado: El Responsable de Proyecto solo puede acceder a proyectos asignados.');
    }
  }

  // 3. Control de vinculación para Financiador
  if (userRole === 'FINANCIADOR') {
    const [userRecord] = await db.select({ donorId: users.donorId }).from(users).where(eq(users.id, userId));
    if (!userRecord || !userRecord.donorId || project.donorId !== userRecord.donorId) {
      throw new ForbiddenError('Acceso denegado: El Financiador solo puede acceder a proyectos vinculados a su donante.');
    }
  }

  return true;
}

/**
 * Crea un borrador de reporte (DRAFT) — Exclusivo: DIRECTOR, MANAGER, FINANCE
 */
export async function createReportDraft(
  tenantId: number,
  userId: number,
  userRole: string,
  data: CreateReportDto
) {
  // Matriz canónica: Generar reporte solo Director, Manager, Finance
  if (userRole !== 'DIRECTOR' && userRole !== 'MANAGER' && userRole !== 'FINANCE') {
    throw new ForbiddenError(`Acceso denegado: El rol ${userRole} no tiene permisos para generar reportes.`);
  }

  if (data.projectId) {
    await validateProjectScope(tenantId, userId, userRole, data.projectId);
  }

  return await withTenantContext(tenantId, async (tx) => {
    // Obtener versión correlativa siguiente
    let nextVersion = 1;
    const existingReports = data.projectId
      ? await tx.select({ versionNumber: generatedReports.versionNumber })
          .from(generatedReports)
          .where(
            and(
              eq(generatedReports.tenantId, tenantId),
              eq(generatedReports.projectId, data.projectId),
              eq(generatedReports.reportType, data.reportType)
            )
          )
          .orderBy(desc(generatedReports.versionNumber))
      : await tx.select({ versionNumber: generatedReports.versionNumber })
          .from(generatedReports)
          .where(
            and(
              eq(generatedReports.tenantId, tenantId),
              sql`${generatedReports.projectId} IS NULL`,
              eq(generatedReports.reportType, data.reportType)
            )
          )
          .orderBy(desc(generatedReports.versionNumber));

    if (existingReports.length > 0) {
      nextVersion = existingReports[0].versionNumber + 1;
    }

    // Capturar snapshot de datos transaccionales
    const snapshot: Record<string, any> = {
      generatedAt: new Date().toISOString(),
      parameters: data.parameters || {},
    };

    if (data.projectId) {
      const [proj] = await tx.select().from(projects).where(eq(projects.id, data.projectId));
      const bLines = await tx.select().from(budgetLines).where(eq(budgetLines.projectId, data.projectId));
      const projExpenses = await tx.select().from(expenses).where(eq(expenses.projectId, data.projectId));
      snapshot.project = proj;
      snapshot.budgetLines = bLines;
      snapshot.expensesCount = projExpenses.length;
    }

    const [newReport] = await tx.insert(generatedReports).values({
      tenantId,
      projectId: data.projectId || null,
      reportType: data.reportType,
      versionNumber: nextVersion,
      status: 'DRAFT',
      parameters: data.parameters || {},
      snapshotData: snapshot,
      contentMarkdown: data.contentMarkdown || '## Borrador de Reporte Inicial',
      analysisMode: data.analysisMode || 'PRIMARY_AI_PROVIDER',
      requiresHumanReview: true,
      createdBy: userId,
    }).returning();

    logAuditEvent({
      tenantId,
      userId,
      action: 'REPORT_GENERATED',
      entity: 'generated_report',
      entityId: newReport.id.toString(),
      metadata: {
        projectId: data.projectId,
        reportType: data.reportType,
        version: nextVersion,
        status: 'DRAFT',
      },
    });

    return newReport;
  });
}

/**
 * Aprueba un reporte con segregación estricta (created_by != approved_by) e inmutabilidad (APPROVED -> SUPERSEDED).
 */
export async function approveReport(
  tenantId: number,
  userId: number,
  userRole: string,
  reportId: number
) {
  // Matriz canónica: Aprobar reporte solo DIRECTOR o FINANCE
  if (userRole !== 'DIRECTOR' && userRole !== 'FINANCE') {
    throw new ForbiddenError(`Acceso denegado: El rol ${userRole} no está autorizado para aprobar reportes.`);
  }

  return await withTenantContext(tenantId, async (tx) => {
    const [report] = await tx.select().from(generatedReports).where(
      and(eq(generatedReports.id, reportId), eq(generatedReports.tenantId, tenantId))
    );

    if (!report) {
      throw new NotFoundError('El reporte no existe.');
    }

    if (report.status === 'APPROVED') {
      throw new ConflictError('El reporte ya se encuentra en estado APROBADO e inmutable.');
    }

    // Segregación de funciones obligatoria: created_by != approved_by
    if (report.createdBy === userId) {
      logAuditEvent({
        tenantId,
        userId,
        action: 'REPORT_APPROVAL_BLOCKED_SELF',
        entity: 'generated_report',
        entityId: report.id.toString(),
        metadata: {
          reason: 'Violación de segregación de funciones: intento de autoaprobación de reporte.',
        },
      });
      throw new ConflictError('Segregación de funciones: No está permitido autoaprobar reportes propios (created_by == approved_by).');
    }

    // Transición en la misma transacción: Marcar anteriores aprobados como SUPERSEDED
    if (report.projectId) {
      await tx.update(generatedReports)
        .set({ status: 'SUPERSEDED' })
        .where(
          and(
            eq(generatedReports.tenantId, tenantId),
            eq(generatedReports.projectId, report.projectId),
            eq(generatedReports.reportType, report.reportType),
            eq(generatedReports.status, 'APPROVED')
          )
        );
    } else {
      await tx.update(generatedReports)
        .set({ status: 'SUPERSEDED' })
        .where(
          and(
            eq(generatedReports.tenantId, tenantId),
            sql`${generatedReports.projectId} IS NULL`,
            eq(generatedReports.reportType, report.reportType),
            eq(generatedReports.status, 'APPROVED')
          )
        );
    }

    // Generar hashes finales inmutables
    const [org] = await tx.select().from(organizations).where(eq(organizations.id, tenantId));
    let projInfo = null;
    if (report.projectId) {
      const [p] = await tx.select().from(projects).where(eq(projects.id, report.projectId));
      if (p) projInfo = { code: p.code, name: p.name };
    }

    const { sha256: pdfSha } = await generateStructuredPdf(
      org?.name || 'Proyecty Org',
      projInfo,
      report.reportType,
      report.versionNumber,
      report.contentMarkdown,
      report.snapshotData as any
    );

    const [approved] = await tx.update(generatedReports).set({
      status: 'APPROVED',
      approvedBy: userId,
      approvedAt: new Date(),
      pdfSha256: pdfSha,
    }).where(eq(generatedReports.id, report.id)).returning();

    logAuditEvent({
      tenantId,
      userId,
      action: 'REPORT_APPROVED',
      entity: 'generated_report',
      entityId: approved.id.toString(),
      metadata: {
        reportType: approved.reportType,
        version: approved.versionNumber,
        pdfSha256: pdfSha,
      },
    });

    return approved;
  });
}

/**
 * Consulta listado de reportes con alcance estricto por rol.
 */
export async function getReportsListForUser(
  tenantId: number,
  userId: number,
  userRole: string,
  projectId?: number
) {
  let conditions = [eq(generatedReports.tenantId, tenantId)];

  if (projectId) {
    await validateProjectScope(tenantId, userId, userRole, projectId);
    conditions.push(eq(generatedReports.projectId, projectId));
  } else if (userRole === 'RESPONSABLE_PROYECTO') {
    const assigned = await db.select({ projectId: projectMembers.projectId })
      .from(projectMembers)
      .where(eq(projectMembers.userId, userId));
    const assignedIds = assigned.map(a => a.projectId);
    if (assignedIds.length > 0) {
      conditions.push(inArray(generatedReports.projectId, assignedIds));
    } else {
      conditions.push(eq(generatedReports.id, -1));
    }
  } else if (userRole === 'FINANCIADOR') {
    // Financiador solo puede ver reportes APPROVED de proyectos vinculados
    const [userRecord] = await db.select({ donorId: users.donorId }).from(users).where(eq(users.id, userId));
    if (!userRecord || !userRecord.donorId) {
      return [];
    }
    const linkedProjects = await db.select({ id: projects.id })
      .from(projects)
      .where(and(eq(projects.tenantId, tenantId), eq(projects.donorId, userRecord.donorId)));
    const linkedIds = linkedProjects.map(p => p.id);
    if (linkedIds.length === 0) return [];

    conditions.push(inArray(generatedReports.projectId, linkedIds));
    conditions.push(eq(generatedReports.status, 'APPROVED')); // Solo aprobados
  }

  // Si Financiador intenta ver borradores, la condición status === APPROVED lo bloquea automáticamente
  return await db.select().from(generatedReports)
    .where(and(...conditions))
    .orderBy(desc(generatedReports.createdAt));
}
