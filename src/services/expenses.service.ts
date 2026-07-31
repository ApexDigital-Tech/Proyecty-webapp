import { db } from '../db/index.ts';
import { expenses, users } from '../db/schema.ts';
import { eq, and } from 'drizzle-orm';
import { sendNewExpenseNotification } from './email.service.ts';
import { logAuditEvent } from './audit.service.ts';
import { CreateExpenseDto } from '../schemas/expenses.schema.ts';
import { logger } from '../lib/logger.ts';

export const createExpense = async (tenantId: number, userId: number, data: CreateExpenseDto) => {
  // Enforce relation mapping based on existing expenses schema design
  const projectId = data.projectId || 1; // Fallback since it's required in schema but might not be in UI yet
  const budgetLineId = data.budgetLineId || 1; // Fallback
  
  const result = await db.insert(expenses).values({
    tenantId,
    registeredBy: userId,
    title: data.title,
    amount: data.amount,
    category: data.category,
    projectId,
    budgetLineId,
    date: new Date(),
    status: 'pending',
  }).returning();

  const newExpense = result[0];

  // Notify Admins/Directors of the tenant
  try {
    const adminUsers = await db.select({ email: users.email })
      .from(users)
      .where(and(eq(users.tenantId, tenantId), eq(users.roleId, 1))); // Assuming roleId 1 is Director/Admin

    for (const admin of adminUsers) {
      if (admin.email) {
        sendNewExpenseNotification(admin.email, data.title, data.amount).catch(err => {
          logger.error('Failed async expense notification', { err });
        });
      }
    }
  } catch (error) {
    logger.error('Error fetching admins for expense notification', { error });
  }

  return newExpense;
};

export const getExpensesByTenant = async (tenantId: number) => {
  return await db.select()
    .from(expenses)
    .where(eq(expenses.tenantId, tenantId));
};

export const approveExpense = async (tenantId: number, expenseId: number, approvedByUserId: number, status: 'approved' | 'rejected') => {
  const result = await db.update(expenses)
    .set({
      status,
      approvedBy: approvedByUserId,
    })
    .where(
      and(
        eq(expenses.id, expenseId),
        eq(expenses.tenantId, tenantId)
      )
    )
    .returning();

  if (result.length === 0) {
    throw new Error('Gasto no encontrado o no autorizado');
  }

  const updatedExpense = result[0];

  // Log audit event as a fire-and-forget task
  logAuditEvent({
    tenantId,
    userId: approvedByUserId,
    action: status === 'approved' ? 'EXPENSE_APPROVED' : 'EXPENSE_REJECTED',
    entity: 'expense',
    entityId: expenseId.toString(),
    metadata: { title: updatedExpense.title, amount: updatedExpense.amount }
  });

  return updatedExpense;
};
