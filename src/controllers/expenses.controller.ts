import { Response, NextFunction } from 'express';
import { AuthRequest } from '../middleware/auth.ts';
import {
  createExpenseSchema,
  approveExpenseSchema,
  reverseExpenseSchema,
} from '../schemas/expenses.schema.ts';
import {
  createExpense,
  getExpensesByProject,
  getExpensesByBudgetLine,
  approveExpense,
  reverseExpense,
} from '../services/expenses.service.ts';
import { logger } from '../lib/logger.ts';

export const getProjectExpensesHandler = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    const tenantId = req.user?.tenantId;
    if (!tenantId) return res.status(401).json({ error: 'No autorizado' });

    const projectId = parseInt(req.params.projectId, 10);
    if (isNaN(projectId)) {
      return res.status(400).json({ error: 'ID de proyecto inválido' });
    }

    const budgetLineId = req.query.budgetLineId
      ? parseInt(req.query.budgetLineId as string, 10)
      : undefined;

    const expensesList = await getExpensesByProject(tenantId, projectId, budgetLineId);
    return res.json(expensesList);
  } catch (error) {
    logger.error('Error in getProjectExpensesHandler', { error });
    next(error);
  }
};

export const getBudgetLineExpensesHandler = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    const tenantId = req.user?.tenantId;
    if (!tenantId) return res.status(401).json({ error: 'No autorizado' });

    const budgetLineId = parseInt(req.params.budgetLineId, 10);
    if (isNaN(budgetLineId)) {
      return res.status(400).json({ error: 'ID de partida presupuestaria inválido' });
    }

    const summary = await getExpensesByBudgetLine(tenantId, budgetLineId);
    return res.json(summary);
  } catch (error) {
    logger.error('Error in getBudgetLineExpensesHandler', { error });
    next(error);
  }
};

export const createExpenseHandler = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    const tenantId = req.user?.tenantId;
    const userId = req.user?.id;
    if (!tenantId || !userId) return res.status(401).json({ error: 'No autorizado' });

    const projectId = req.params.projectId
      ? parseInt(req.params.projectId, 10)
      : req.body.projectId;

    const payload = {
      ...req.body,
      projectId: Number(projectId),
      budgetLineId: Number(req.body.budgetLineId),
    };

    const data = createExpenseSchema.parse(payload);
    const expense = await createExpense(tenantId, userId, data);
    return res.status(201).json(expense);
  } catch (error) {
    logger.error('Error in createExpenseHandler', { error });
    next(error);
  }
};

export const approveExpenseHandler = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    const tenantId = req.user?.tenantId;
    const userId = req.user?.id;
    if (!tenantId || !userId) return res.status(401).json({ error: 'No autorizado' });

    const expenseId = parseInt(req.params.id, 10);
    if (isNaN(expenseId)) {
      return res.status(400).json({ error: 'ID de gasto inválido' });
    }

    const data = approveExpenseSchema.parse(req.body);
    const updatedExpense = await approveExpense(
      tenantId,
      expenseId,
      userId,
      data.status
    );
    return res.json(updatedExpense);
  } catch (error) {
    logger.error('Error in approveExpenseHandler', { error });
    next(error);
  }
};

export const rejectExpenseHandler = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    const tenantId = req.user?.tenantId;
    const userId = req.user?.id;
    if (!tenantId || !userId) return res.status(401).json({ error: 'No autorizado' });

    const expenseId = parseInt(req.params.id, 10);
    if (isNaN(expenseId)) {
      return res.status(400).json({ error: 'ID de gasto inválido' });
    }

    const updatedExpense = await approveExpense(
      tenantId,
      expenseId,
      userId,
      'rejected'
    );
    return res.json(updatedExpense);
  } catch (error) {
    logger.error('Error in rejectExpenseHandler', { error });
    next(error);
  }
};

export const reverseExpenseHandler = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    const tenantId = req.user?.tenantId;
    const userId = req.user?.id;
    if (!tenantId || !userId) return res.status(401).json({ error: 'No autorizado' });

    const expenseId = parseInt(req.params.id, 10);
    if (isNaN(expenseId)) {
      return res.status(400).json({ error: 'ID de gasto inválido' });
    }

    const data = reverseExpenseSchema.parse(req.body);
    const updatedExpense = await reverseExpense(
      tenantId,
      expenseId,
      userId,
      data.reason
    );
    return res.json(updatedExpense);
  } catch (error) {
    logger.error('Error in reverseExpenseHandler', { error });
    next(error);
  }
};
