import { db } from '../db/index.ts';
import { budgetVersions, budgetLines, projects, users } from '../db/schema.ts';
import { eq, and, desc } from 'drizzle-orm';
import { withTenantContext } from '../utils/dbWrapper.ts';
import { logAuditEvent } from './audit.service.ts';
import { NotFoundError, ConflictError } from '../utils/errors.ts';

export interface CreateBudgetVersionDto {
  versionName: string;
  reason?: string;
  lines?: {
    code: string;
    category: string;
    subcategory: string;
    approvedAmount: number;
  }[];
}

export const getBudgetVersionsByProject = async (tenantId: number, projectId: number) => {
  return await withTenantContext(tenantId, async (tx) => {
    const versions = await tx.select({
      id: budgetVersions.id,
      versionName: budgetVersions.versionName,
      versionNumber: budgetVersions.versionNumber,
      status: budgetVersions.status,
      isApproved: budgetVersions.isApproved,
      approvedBy: budgetVersions.approvedBy,
      approvedByName: users.name,
      createdAt: budgetVersions.createdAt,
    }).from(budgetVersions)
      .leftJoin(users, eq(budgetVersions.approvedBy, users.id))
      .where(and(eq(budgetVersions.projectId, projectId), eq(budgetVersions.tenantId, tenantId)))
      .orderBy(desc(budgetVersions.versionNumber));

    // Fetch lines for each version
    const result = [];
    for (const v of versions) {
      const lines = await tx.select()
        .from(budgetLines)
        .where(eq(budgetLines.budgetVersionId, v.id));
      result.push({ ...v, lines });
    }

    return result;
  });
};

/**
 * Crea una nueva versión presupuestaria inmutable (BUD-01) para adendas o reformulaciones.
 * La versión anterior permanece archivada e inalterable para trazabilidad de auditoría.
 */
export const createBudgetVersion = async (
  tenantId: number,
  projectId: number,
  userId: number,
  data: CreateBudgetVersionDto
) => {
  return await withTenantContext(tenantId, async (tx) => {
    // 1. Verificar proyecto
    const [project] = await tx.select().from(projects).where(
      and(eq(projects.id, projectId), eq(projects.tenantId, tenantId))
    );

    if (!project) {
      throw new NotFoundError('El proyecto no existe en esta organización.');
    }

    // 2. Obtener última versión existente
    const existingVersions = await tx.select()
      .from(budgetVersions)
      .where(and(eq(budgetVersions.projectId, projectId), eq(budgetVersions.tenantId, tenantId)))
      .orderBy(desc(budgetVersions.versionNumber))
      .limit(1);

    const nextVersionNumber = existingVersions.length > 0 ? existingVersions[0].versionNumber + 1 : 1;

    // Normalizar versionName para que siempre refleje con precisión su número de versión (BUD-01)
    let finalVersionName = data.versionName;
    if (!finalVersionName) {
      finalVersionName = `V${nextVersionNumber} - Reformulación Presupuestaria`;
    } else {
      const cleanName = finalVersionName.replace(/^V\d+\s*[-:]*\s*/i, '').trim();
      finalVersionName = `V${nextVersionNumber} - ${cleanName || 'Reformulación Presupuestaria'}`;
    }

    // 3. Crear nueva versión
    const [newVersion] = await tx.insert(budgetVersions).values({
      tenantId,
      projectId,
      versionName: finalVersionName,
      versionNumber: nextVersionNumber,
      status: 'APPROVED',
      isApproved: true,
      approvedBy: userId,
    }).returning();

    // 4. Insertar líneas presupuestarias
    const linesToInsert = data.lines && data.lines.length > 0 ? data.lines : [];
    
    // Si no se proporcionaron líneas nuevas, copiar las de la versión anterior como base
    if (linesToInsert.length === 0 && existingVersions.length > 0) {
      const prevLines = await tx.select()
        .from(budgetLines)
        .where(eq(budgetLines.budgetVersionId, existingVersions[0].id));

      for (const pLine of prevLines) {
        await tx.insert(budgetLines).values({
          projectId,
          budgetVersionId: newVersion.id,
          code: pLine.code,
          category: pLine.category,
          subcategory: pLine.subcategory,
          approvedAmount: pLine.approvedAmount,
          reformulatedAmount: pLine.reformulatedAmount,
          executedAmount: pLine.executedAmount,
          balance: pLine.balance,
          progress: pLine.progress,
          status: pLine.status,
        });
      }
    } else {
      for (const l of linesToInsert) {
        await tx.insert(budgetLines).values({
          projectId,
          budgetVersionId: newVersion.id,
          code: l.code,
          category: l.category,
          subcategory: l.subcategory,
          approvedAmount: l.approvedAmount,
          reformulatedAmount: l.approvedAmount,
          executedAmount: 0,
          balance: l.approvedAmount,
          progress: 0,
          status: 'NORMAL',
        });
      }
    }

    // 5. Registrar en auditoría inmutable
    logAuditEvent({
      tenantId,
      userId,
      action: 'BUDGET_VERSION_CREATED',
      entity: 'budget_version',
      entityId: newVersion.id.toString(),
      metadata: {
        projectId,
        versionName: newVersion.versionName,
        versionNumber: newVersion.versionNumber,
        previousVersionId: existingVersions[0]?.id || null,
        reason: data.reason || 'Adenda / Reformulación oficial aprobada',
      },
    });

    return newVersion;
  });
};
