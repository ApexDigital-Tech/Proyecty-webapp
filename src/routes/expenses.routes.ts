import { Router } from 'express';
import { requireAuth } from '../middleware/auth.ts';
import { requirePermission } from '../middleware/rbac.ts';
import {
  getProjectExpensesHandler,
  getBudgetLineExpensesHandler,
  createExpenseHandler,
  approveExpenseHandler,
  rejectExpenseHandler,
  reverseExpenseHandler,
} from '../controllers/expenses.controller.ts';

const router = Router();

// Endpoints canónicos para gastos
router.get('/projects/:projectId/expenses', requireAuth, requirePermission('expenses', 'read'), getProjectExpensesHandler);
router.get('/budget-lines/:budgetLineId/expenses', requireAuth, requirePermission('expenses', 'read'), getBudgetLineExpensesHandler);

// Crear gasto
router.post('/projects/:projectId/expenses', requireAuth, requirePermission('expenses', 'create'), createExpenseHandler);
router.post('/', requireAuth, requirePermission('expenses', 'create'), createExpenseHandler);

// Ciclo de vida: Aprobar, Rechazar, Revertir
router.patch('/:id/approve', requireAuth, requirePermission('expenses', 'approve'), approveExpenseHandler);
router.patch('/:id/reject', requireAuth, requirePermission('expenses', 'approve'), rejectExpenseHandler);
router.patch('/:id/reverse', requireAuth, requirePermission('expenses', 'approve'), reverseExpenseHandler);

export default router;
