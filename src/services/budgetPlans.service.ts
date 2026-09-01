import { db } from '../db/index.ts';
import { budgetPlans, budgetVersions, budgetLines, fundingAllocations, projects } from '../db/schema.ts';
import { eq, and, desc } from 'drizzle-orm';
import { withTenantContext } from '../utils/dbWrapper.ts';
import { ConflictError, NotFoundError } from '../utils/errors.ts';
import { logAuditEvent } from './audit.service.ts';

export interface CreateBudgetPlanDto {
  projectId: number;
  title: string;
  period?: string;
  fiscalYear?: number;
}

export interface ReformulateBudgetLineDto {
  budgetLineId: number;
  newApprovedAmount?: number;
  newReformulatedAmount?: number;
  reason?: string;
}

export const createBudgetPlan = async (tenantId: number, userId: number, data: CreateBudgetPlanDto) => {
  return await withTenantContext(tenantId, async (tx) => {
    const [plan] = await tx
      .insert(budgetPlans)
      .values({
        tenantId,
        projectId: data.projectId,
        title: data.title,
        period: data.period || 'Anual',
        fiscalYear: data.fiscalYear || 2026,
        status: 'ACTIVE',
      })
      .returning();

    const [v1] = await tx
      .insert(budgetVersions)
      .values({
        tenantId,
        projectId: data.projectId,
        budgetPlanId: plan.id,
        versionName: 'V1 - Plan Inicial',
        versionNumber: 1,
        status: 'APPROVED',
        isApproved: true,
        approvedBy: userId,
      })
      .returning();

    await logAuditEvent(
      {
        tenantId,
        userId,
        action: 'BUDGET_PLAN_CREATED',
        entity: 'budget_plan',
        entityId: plan.id.toString(),
        metadata: { title: plan.title, versionId: v1.id },
      },
      tx,
      { required: true }
    );

    return { plan, initialVersion: v1 };
  });
};

export const createNewBudgetVersionTx = async (
  tenantId: number,
  projectId: number,
  userId: number,
  versionName: string,
  linesToCopy: Array<{ code: string; category: string; subcategory: string; approvedAmount: number; reformulatedAmount?: number }>
) => {
  return await withTenantContext(tenantId, async (tx) => {
    // 1. Get latest version number
    const existingVersions = await tx
      .select()
      .from(budgetVersions)
      .where(and(eq(budgetVersions.projectId, projectId), eq(budgetVersions.tenantId, tenantId)))
      .orderBy(desc(budgetVersions.versionNumber));

    const nextVerNum = (existingVersions[0]?.versionNumber || 0) + 1;

    // 2. Archive current approved version
    await tx
      .update(budgetVersions)
      .set({ status: 'ARCHIVED' })
      .where(and(eq(budgetVersions.projectId, projectId), eq(budgetVersions.status, 'APPROVED')));

    // 3. Create new approved version
    const [newVersion] = await tx
      .insert(budgetVersions)
      .values({
        tenantId,
        projectId,
        versionName: versionName || `V${nextVerNum} - Reformulado`,
        versionNumber: nextVerNum,
        status: 'APPROVED',
        isApproved: true,
        approvedBy: userId,
      })
      .returning();

    // 4. Create budget lines for new version
    const createdLines = [];
    for (const line of linesToCopy) {
      const appAmt = Number(line.approvedAmount);
      const refAmt = line.reformulatedAmount !== undefined ? Number(line.reformulatedAmount) : appAmt;
      const [insertedLine] = await tx
        .insert(budgetLines)
        .values({
          projectId,
          budgetVersionId: newVersion.id,
          code: line.code,
          category: line.category,
          subcategory: line.subcategory,
          approvedAmount: appAmt,
          reformulatedAmount: refAmt,
          executedAmount: 0,
          balance: refAmt,
          progress: 0,
          status: 'NORMAL',
        })
        .returning();
      createdLines.push(insertedLine);
    }

    await logAuditEvent(
      {
        tenantId,
        userId,
        action: 'BUDGET_VERSION_CREATED',
        entity: 'budget_version',
        entityId: newVersion.id.toString(),
        metadata: { versionName: newVersion.versionName, versionNumber: nextVerNum, linesCount: createdLines.length },
      },
      tx,
      { required: true }
    );

    return { version: newVersion, lines: createdLines };
  });
};

export const getBudgetVersionsByProject = async (tenantId: number, projectId: number) => {
  return await withTenantContext(tenantId, async (tx) => {
    return await tx
      .select()
      .from(budgetVersions)
      .where(and(eq(budgetVersions.projectId, projectId), eq(budgetVersions.tenantId, tenantId)))
      .orderBy(desc(budgetVersions.versionNumber));
  });
};
