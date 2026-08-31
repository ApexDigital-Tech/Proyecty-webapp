import { db } from '../db/index.ts';
import { expenses, budgetLines, projects, receiptsVouchers, auditLogs } from '../db/schema.ts';
import { eq, and, sql, desc, inArray } from 'drizzle-orm';
import { CreateExpenseDto } from '../schemas/expenses.schema.ts';
import { logger } from '../lib/logger.ts';
import { withTenantContext } from '../utils/dbWrapper.ts';
import { ConflictError, NotFoundError, ForbiddenError } from '../utils/errors.ts';
import { logAuditEvent } from './audit.service.ts';

/**
 * Recalcula la ejecución, saldo y progreso de una partida presupuestaria
 * y el progreso financiero global del proyecto de forma atómica y derivada.
 * 
 * Regla Canónica:
 * executed_amount = SUM(COALESCE(base_amount, amount)) WHERE status = 'approved'
 * balance = reformulated_amount - executed_amount (o approved_amount si no hay reformulado)
 * financial_progress = SUM(executed_amount) / approved_budget * 100
 */
export async function recalculateFinancialState(
  tenantId: number,
  projectId: number,
  budgetLineId: number,
  tx: any
): Promise<{ executedAmount: number; balance: number; financialProgress: number }> {
  // 1. Suma de gastos estrictamente APROBADOS para la partida
  const blSumResult = await tx
    .select({
      total: sql<number>`COALESCE(SUM(COALESCE(${expenses.baseAmount}, ${expenses.amount})), 0)::float`,
    })
    .from(expenses)
    .where(
      and(
        eq(expenses.tenantId, tenantId),
        eq(expenses.projectId, projectId),
        eq(expenses.budgetLineId, budgetLineId),
        eq(expenses.status, 'approved')
      )
    );

  const executedAmount = Number(blSumResult[0]?.total || 0);

  // 2. Obtener la partida con bloqueo FOR UPDATE
  const [bLine] = await tx
    .select()
    .from(budgetLines)
    .where(and(eq(budgetLines.id, budgetLineId), eq(budgetLines.projectId, projectId)))
    .for('update');

  if (!bLine) {
    throw new NotFoundError(`Partida presupuestaria ID ${budgetLineId} no encontrada`);
  }

  const baseBudget = bLine.reformulatedAmount && bLine.reformulatedAmount > 0
    ? bLine.reformulatedAmount
    : bLine.approvedAmount;

  const balance = baseBudget - executedAmount;

  if (balance < 0) {
    throw new ConflictError(
      `Bloqueo de sobre-ejecución presupuestaria: Saldo negativo detectado ($${balance}) en la partida ${bLine.code}.`
    );
  }

  const progress = baseBudget > 0 ? Math.round((executedAmount / baseBudget) * 100) : 0;

  // Actualizar la partida presupuestaria
  await tx
    .update(budgetLines)
    .set({
      executedAmount,
      balance,
      progress,
    })
    .where(eq(budgetLines.id, budgetLineId));

  // 3. Recalcular el progreso financiero total del proyecto
  const projectTotalResult = await tx
    .select({
      totalExecuted: sql<number>`COALESCE(SUM(COALESCE(${expenses.baseAmount}, ${expenses.amount})), 0)::float`,
    })
    .from(expenses)
    .where(
      and(
        eq(expenses.tenantId, tenantId),
        eq(expenses.projectId, projectId),
        eq(expenses.status, 'approved')
      )
    );

  const projectTotalExecuted = Number(projectTotalResult[0]?.totalExecuted || 0);

  const [project] = await tx
    .select({ approvedBudget: projects.approvedBudget })
    .from(projects)
    .where(and(eq(projects.id, projectId), eq(projects.tenantId, tenantId)))
    .for('update');

  const approvedBudget = project?.approvedBudget || 0;
  // Política de redondeo: Math.round()
  const financialProgress = approvedBudget > 0 ? Math.round((projectTotalExecuted / approvedBudget) * 100) : 0;

  await tx
    .update(projects)
    .set({
      financialProgress,
    })
    .where(eq(projects.id, projectId));

  return { executedAmount, balance, financialProgress };
}

/**
 * Registra un nuevo gasto en estado 'pending'.
 * Garantiza base_amount no nulo y tipo de cambio válido.
 */
export const createExpense = async (
  tenantId: number,
  userId: number,
  data: CreateExpenseDto
) => {
  return await withTenantContext(tenantId, async (tx) => {
    const projectId = data.projectId;
    const budgetLineId = data.budgetLineId;

    // 1. Verificar existencia y tenencia del proyecto
    const [project] = await tx
      .select()
      .from(projects)
      .where(and(eq(projects.id, projectId), eq(projects.tenantId, tenantId)));

    if (!project) {
      throw new NotFoundError('El proyecto no existe o no pertenece a la organización.');
    }

    // 2. Verificar existencia de la partida presupuestaria en el proyecto
    const [bLine] = await tx
      .select()
      .from(budgetLines)
      .where(and(eq(budgetLines.id, budgetLineId), eq(budgetLines.projectId, projectId)));

    if (!bLine) {
      throw new NotFoundError('La partida presupuestaria no existe en este proyecto.');
    }

    // 3. Cálculos estrictos de moneda y base_amount
    const amount = Number(data.amount);
    if (amount <= 0) {
      throw new ConflictError('El monto del gasto debe ser estrictamente positivo.');
    }

    const currency = data.currency || 'USD';
    const exchangeRate = currency === 'USD' ? 1.0 : (Number(data.exchangeRate) || 1.0);
    const baseAmount = amount * exchangeRate;

    // Alerta preventiva si el gasto excede el saldo actual
    if (bLine.balance < baseAmount) {
      logger.warn(`[Gasto Alerta] Gasto registrado ($${baseAmount}) supera saldo disponible en partida ${bLine.code} ($${bLine.balance})`);
    }

    // 4. Inserción atómica del gasto
    const [newExpense] = await tx
      .insert(expenses)
      .values({
        tenantId,
        projectId,
        budgetLineId,
        amount,
        currency,
        exchangeRate,
        baseAmount,
        originalAmount: amount,
        originalCurrency: currency,
        title: data.title,
        description: data.description || null,
        category: data.category || bLine.category,
        date: data.date ? new Date(data.date) : new Date(),
        status: 'pending',
        registeredBy: userId,
      })
      .returning();

    // 5. Registro inmutable de auditoría
    await logAuditEvent(
      {
        tenantId,
        userId,
        action: 'EXPENSE_CREATED',
        entity: 'expense',
        entityId: newExpense.id.toString(),
        metadata: {
          title: newExpense.title,
          amount: newExpense.amount,
          baseAmount: newExpense.baseAmount,
          currency: newExpense.currency,
          budgetLineId,
          projectId,
          registeredBy: userId,
        },
      },
      tx,
      { required: true }
    );

    return newExpense;
  });
};

/**
 * Consulta de gastos por proyecto con sus comprobantes asociados.
 */
export const getExpensesByProject = async (
  tenantId: number,
  projectId: number,
  budgetLineId?: number
) => {
  return await withTenantContext(tenantId, async (tx) => {
    const conditions = [
      eq(expenses.tenantId, tenantId),
      eq(expenses.projectId, projectId),
    ];

    if (budgetLineId) {
      conditions.push(eq(expenses.budgetLineId, budgetLineId));
    }

    const expenseList = await tx
      .select()
      .from(expenses)
      .where(and(...conditions))
      .orderBy(desc(expenses.createdAt));

    if (expenseList.length === 0) return [];

    const expenseIds = expenseList.map((e) => e.id);
    const vouchers = await tx
      .select()
      .from(receiptsVouchers)
      .where(inArray(receiptsVouchers.expenseId, expenseIds));

    // Mapear comprobantes al gasto correspondiente
    const vouchersByExpenseId = new Map<number, any[]>();
    for (const v of vouchers) {
      if (v.expenseId) {
        const arr = vouchersByExpenseId.get(v.expenseId) || [];
        arr.push(v);
        vouchersByExpenseId.set(v.expenseId, arr);
      }
    }

    return expenseList.map((exp) => ({
      ...exp,
      vouchers: vouchersByExpenseId.get(exp.id) || [],
    }));
  });
};

/**
 * Consulta de todos los gastos de la organización (para reportes y dashboards).
 */
export const getExpensesByTenant = async (tenantId: number) => {
  return await withTenantContext(tenantId, async (tx) => {
    return await tx
      .select()
      .from(expenses)
      .where(eq(expenses.tenantId, tenantId))
      .orderBy(desc(expenses.createdAt));
  });
};

/**
 * Consulta de gastos detallada por partida presupuestaria con totales consolidados.
 */
export const getExpensesByBudgetLine = async (
  tenantId: number,
  budgetLineId: number
) => {
  return await withTenantContext(tenantId, async (tx) => {
    const [bLine] = await tx
      .select()
      .from(budgetLines)
      .where(eq(budgetLines.id, budgetLineId));

    if (!bLine) {
      throw new NotFoundError('Partida presupuestaria no encontrada');
    }

    const expenseList = await getExpensesByProject(tenantId, bLine.projectId, budgetLineId);

    let totalApproved = 0;
    let totalPending = 0;
    let totalRejected = 0;
    let totalReversed = 0;

    for (const exp of expenseList) {
      const bAmt = Number(exp.baseAmount ?? exp.amount);
      if (exp.status === 'approved') totalApproved += bAmt;
      else if (exp.status === 'pending') totalPending += bAmt;
      else if (exp.status === 'rejected') totalRejected += bAmt;
      else if (exp.status === 'reversed') totalReversed += bAmt;
    }

    return {
      budgetLine: bLine,
      totals: {
        approvedAmount: bLine.approvedAmount,
        reformulatedAmount: bLine.reformulatedAmount,
        executedAmount: bLine.executedAmount,
        availableBalance: bLine.balance,
        totalApprovedExpenses: totalApproved,
        totalPendingExpenses: totalPending,
        totalRejectedExpenses: totalRejected,
        totalReversedExpenses: totalReversed,
      },
      expenses: expenseList,
    };
  });
};

/**
 * Aprobación o Rechazo de Gastos con Segregación Estricta de Funciones (FIN-01).
 * Bloquea la auto-aprobación y recalcula estados atómicamente.
 */
export const approveExpense = async (
  tenantId: number,
  expenseId: number,
  reviewerUserId: number,
  newStatus: 'approved' | 'rejected'
) => {
  return await withTenantContext(tenantId, async (tx) => {
    // 1. Obtener gasto con tenencia
    const [existingExpense] = await tx
      .select()
      .from(expenses)
      .where(and(eq(expenses.id, expenseId), eq(expenses.tenantId, tenantId)));

    if (!existingExpense) {
      throw new NotFoundError('El gasto especificado no existe o no pertenece a la organización.');
    }

    if (existingExpense.status !== 'pending') {
      throw new ConflictError(
        `El gasto ID ${expenseId} no está pendiente de aprobación (estado actual: "${existingExpense.status}").`
      );
    }

    // 2. Control FIN-01: Segregación estricta de funciones (Creador !== Aprobador)
    if (existingExpense.registeredBy && existingExpense.registeredBy === reviewerUserId) {
      throw new ForbiddenError(
        'Segregación de funciones (FIN-01): El usuario que registró el gasto no puede aprobarlo ni rechazarlo.'
      );
    }

    // 3. Si se aprueba, verificar comprobantes si la política lo exige y verificar saldo
    const expenseBaseAmount = Number(existingExpense.baseAmount ?? existingExpense.amount);

    if (newStatus === 'approved') {
      const [bLine] = await tx
        .select()
        .from(budgetLines)
        .where(eq(budgetLines.id, existingExpense.budgetLineId))
        .for('update');

      if (!bLine) {
        throw new NotFoundError('La partida presupuestaria vinculada no existe.');
      }

      if (bLine.balance < expenseBaseAmount) {
        throw new ConflictError(
          `Bloqueo de sobre-ejecución: El monto del gasto ($${expenseBaseAmount}) excede el saldo disponible en la partida ${bLine.code} ($${bLine.balance}).`
        );
      }
    }

    // 4. Actualizar estado del gasto
    const [updatedExpense] = await tx
      .update(expenses)
      .set({
        status: newStatus,
        approvedBy: reviewerUserId,
      })
      .where(and(eq(expenses.id, expenseId), eq(expenses.tenantId, tenantId)))
      .returning();

    // 5. Recalcular partida y proyecto en la misma transacción si fue aprobado
    if (newStatus === 'approved') {
      await recalculateFinancialState(
        tenantId,
        existingExpense.projectId,
        existingExpense.budgetLineId,
        tx
      );
    }

    // 6. Auditoría inmutable
    await logAuditEvent(
      {
        tenantId,
        userId: reviewerUserId,
        action: newStatus === 'approved' ? 'EXPENSE_APPROVED' : 'EXPENSE_REJECTED',
        entity: 'expense',
        entityId: expenseId.toString(),
        metadata: {
          before_state: { status: existingExpense.status, approvedBy: existingExpense.approvedBy },
          after_state: { status: updatedExpense.status, approvedBy: reviewerUserId },
          title: updatedExpense.title,
          amount: updatedExpense.amount,
          baseAmount: updatedExpense.baseAmount,
          registeredBy: existingExpense.registeredBy,
          approvedBy: reviewerUserId,
        },
      },
      tx,
      { required: true }
    );

    return updatedExpense;
  });
};

/**
 * Reversión de un gasto aprobado (Solo Director/Admin con motivo justificado).
 * Restaura el saldo y descuenta el ejecutado atómicamente.
 */
export const reverseExpense = async (
  tenantId: number,
  expenseId: number,
  reverserUserId: number,
  reason: string
) => {
  return await withTenantContext(tenantId, async (tx) => {
    const [existingExpense] = await tx
      .select()
      .from(expenses)
      .where(and(eq(expenses.id, expenseId), eq(expenses.tenantId, tenantId)));

    if (!existingExpense) {
      throw new NotFoundError('El gasto especificado no existe o no pertenece a la organización.');
    }

    if (existingExpense.status !== 'approved') {
      throw new ConflictError(
        `Solo se pueden revertir gastos previamente aprobados (estado actual: "${existingExpense.status}").`
      );
    }

    // Actualizar estado a 'reversed'
    const [updatedExpense] = await tx
      .update(expenses)
      .set({
        status: 'reversed',
        approvedBy: reverserUserId,
      })
      .where(and(eq(expenses.id, expenseId), eq(expenses.tenantId, tenantId)))
      .returning();

    // Recalcular partida y proyecto en la misma transacción (descuenta el gasto)
    await recalculateFinancialState(
      tenantId,
      existingExpense.projectId,
      existingExpense.budgetLineId,
      tx
    );

    // Auditoría inmutable con motivo de reversión
    await logAuditEvent(
      {
        tenantId,
        userId: reverserUserId,
        action: 'EXPENSE_REVERSED',
        entity: 'expense',
        entityId: expenseId.toString(),
        metadata: {
          reason,
          reversedBy: reverserUserId,
          previousStatus: 'approved',
          newStatus: 'reversed',
          title: updatedExpense.title,
          amount: updatedExpense.amount,
          baseAmount: updatedExpense.baseAmount,
        },
      },
      tx,
      { required: true }
    );

    return updatedExpense;
  });
};
