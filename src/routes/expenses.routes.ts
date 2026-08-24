import { Router } from 'express';
import { requireAuth } from '../middleware/auth.ts';
import { getExpensesHandler, createExpenseHandler, approveExpenseHandler } from '../controllers/expenses.controller.ts';
import { requirePermission } from '../middleware/rbac.ts';

const router = Router();

router.get('/', requireAuth, requirePermission('expenses', 'read'), getExpensesHandler);
router.post('/', requireAuth, requirePermission('expenses', 'create'), createExpenseHandler);
router.patch('/:id/approve', requireAuth, requirePermission('expenses', 'approve'), approveExpenseHandler);

export default router;
