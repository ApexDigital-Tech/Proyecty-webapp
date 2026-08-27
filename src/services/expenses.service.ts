import { db } from '../db/index.ts';
import { expenses, users, budgetLines, projects } from '../db/schema.ts';
import { eq, and } from 'drizzle-orm';
import { sendNewExpenseNotification } from './email.service.ts';
import { logAuditEvent } from './audit.service.ts';
import { CreateExpenseDto } from '../schemas/expenses.schema.ts';
import { logger } from '../lib/logger.ts';
import { withTenantContext, withRlsValidation } from '../utils/dbWrapper.ts';
import { ConflictError, NotFoundError } from '../utils/errors.ts';

export const createExpense = async (tenantId: number, userId: number, data: CreateExpenseDto) => {
  return await withTenantContext(tenantId, async (tx) => {
    const projectId = data.projectId || 1;
    const budgetLineId = data.budgetLineId || 1;

    const [project] = await tx.select().from(projects).where(
      and(eq(projects.id, projectId), eq(projects.tenantId, tenantId))
    );
    if (!project) {
      throw new NotFoundError('El proyecto no existe o no pertenece a esta organización.');
    }

    // Verificar que la línea presupuestaria exista y pertenezca al proyecto
    const [bLine] = await tx.select().from(budgetLines).where(eq(budgetLines.id, budgetLineId));
    if (bLine && bLine.balance < data.amount) {
      logger.warn(`[Gasto Alerta] Gasto registrado supera saldo disponible en partida ${bLine.code}: monto=${data.amount}, saldo=${bLine.balance}`);
    }
    
    const result = await tx.insert(expenses).values({
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

    // Log audit event
    await logAuditEvent({
      tenantId,
      userId,
      action: 'EXPENSE_CREATED',
      entity: 'expense',
      entityId: newExpense.id.toString(),
      metadata: {
        title: newExpense.title,
        amount: newExpense.amount,
        category: newExpense.category,
        registeredBy: userId,
      },
    }, tx);

    // Notify Admins/Directors of the tenant
    try {
      const adminUsers = await tx.select({ email: users.email })
        .from(users)
        .where(and(eq(users.tenantId, tenantId), eq(users.roleId, 1)));

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
  });
};

export const getExpensesByTenant = async (tenantId: number) => {
  return await withTenantContext(tenantId, async (tx) => {
    return await tx.select()
      .from(expenses)
      .where(eq(expenses.tenantId, tenantId));
  });
};

/**
 * Aprobación / Rechazo de Gastos con Segregación Estricta de Funciones (FIN-01).
 * Bloquea la auto-aprobación si el creador del gasto es quien intenta aprobarlo.
 */
export const approveExpense = async (
  tenantId: number,
  expenseId: number,
  approvedByUserId: number,
  status: 'approved' | 'rejected'
) => {
  return await withTenantContext(tenantId, async (tx) => {
    // 1. Obtener el gasto actual para verificar creador y estado previo
    const [existingExpense] = await tx.select().from(expenses).where(
      and(eq(expenses.id, expenseId), eq(expenses.tenantId, tenantId))
    );

    if (!existingExpense) {
      throw new NotFoundError('El gasto especificado no existe o no pertenece a la organización.');
    }

    if (existingExpense.status !== 'pending' && existingExpense.status !== 'PENDING_APPROVAL') {
      throw new ConflictError(`El gasto ID ${expenseId} ya fue procesado con estado "${existingExpense.status}".`);
    }

    // 2. Control FIN-01: Segregación estricta de funciones
    if (existingExpense.registeredBy && existingExpense.registeredBy === approvedByUserId) {
      throw new ConflictError('Segregación de funciones (FIN-01): El usuario que registró el gasto no puede aprobarlo ni rechazarlo. Se requiere la autorización de un revisor independiente.');
    }

    // 3. Control de sobre-ejecución presupuestaria y bloqueo de concurrencia (FOR UPDATE)
    if (status === 'approved') {
      const [bLine] = await tx.select().from(budgetLines)
        .where(eq(budgetLines.id, existingExpense.budgetLineId))
        .for('update');

      if (!bLine) {
        throw new NotFoundError('La partida presupuestaria vinculada no existe.');
      }

      if (bLine.balance < existingExpense.amount) {
        throw new ConflictError(`Bloqueo de sobre-ejecución: El monto del gasto ($${existingExpense.amount}) excede el saldo disponible en la partida presupuestaria ${bLine.code} ($${bLine.balance}).`);
      }

      // Actualizar balance y monto ejecutado de la partida presupuestaria atómicamente
      const newExecuted = (bLine.executedAmount || 0) + existingExpense.amount;
      const newBalance = (bLine.approvedAmount || 0) - newExecuted;
      await tx.update(budgetLines)
        .set({
          executedAmount: newExecuted,
          balance: newBalance,
          progress: bLine.approvedAmount > 0 ? Math.round((newExecuted / bLine.approvedAmount) * 100) : 0,
        })
        .where(eq(budgetLines.id, bLine.id));
    }

    // 4. Actualizar estado del gasto
    const result = await tx.update(expenses)
      .set({
        status,
        approvedBy: approvedByUserId,
      })
      .where(and(eq(expenses.id, expenseId), eq(expenses.tenantId, tenantId)))
      .returning();

    const updatedExpense = result[0];

    // 5. Registrar en bitácora inmutable de auditoría (AUD-01)
    await logAuditEvent({
      tenantId,
      userId: approvedByUserId,
      action: status === 'approved' ? 'EXPENSE_APPROVED' : 'EXPENSE_REJECTED',
      entity: 'expense',
      entityId: expenseId.toString(),
      metadata: {
        before_state: { status: existingExpense.status, approvedBy: existingExpense.approvedBy },
        after_state: { status: updatedExpense.status, approvedBy: approvedByUserId },
        title: updatedExpense.title,
        amount: updatedExpense.amount,
        registeredBy: existingExpense.registeredBy,
        approvedBy: approvedByUserId,
      },
    }, tx);

    return updatedExpense;
  });
};
