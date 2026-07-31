import { Request, Response, NextFunction } from 'express';
import { AuthRequest } from '../middleware/auth.ts';
import { createExpenseSchema, approveExpenseSchema } from '../schemas/expenses.schema.ts';
import { createExpense, getExpensesByTenant, approveExpense } from '../services/expenses.service.ts';
import { logger } from '../lib/logger.ts';

export const getExpensesHandler = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const tenantId = req.user?.tenantId;
    if (!tenantId) return res.status(401).json({ error: 'No autorizado' });

    const expensesList = await getExpensesByTenant(tenantId);
    return res.json(expensesList);
  } catch (error) {
    logger.error('Error in getExpensesHandler', { error });
    next(error);
  }
};

export const createExpenseHandler = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const tenantId = req.user?.tenantId;
    const userId = req.user?.id;
    if (!tenantId || !userId) return res.status(401).json({ error: 'No autorizado' });

    // Validar body con Zod
    const data = createExpenseSchema.parse(req.body);

    const expense = await createExpense(tenantId, userId, data);
    return res.status(201).json(expense);
  } catch (error) {
    logger.error('Error in createExpenseHandler', { error });
    next(error);
  }
};

export const approveExpenseHandler = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const tenantId = req.user?.tenantId;
    const userId = req.user?.id;
    const role = req.user?.role;
    if (!tenantId || !userId) return res.status(401).json({ error: 'No autorizado' });

    // RBAC Check for Admin/Manager
    if (role !== 'DIRECTOR' && role !== 'MANAGER') {
      return res.status(403).json({ error: 'Acceso denegado. Permisos insuficientes para aprobar gastos.' });
    }

    const expenseId = parseInt(req.params.id, 10);
    if (isNaN(expenseId)) {
      return res.status(400).json({ error: 'ID de gasto inválido' });
    }

    // Validar status
    const data = approveExpenseSchema.parse(req.body);

    const updatedExpense = await approveExpense(tenantId, expenseId, userId, data.status);
    return res.json(updatedExpense);
  } catch (error) {
    logger.error('Error in approveExpenseHandler', { error });
    next(error);
  }
};
