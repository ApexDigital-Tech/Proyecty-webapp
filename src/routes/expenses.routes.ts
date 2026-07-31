import { Router } from 'express';
import { requireAuth } from '../middleware/auth.ts';
import { getExpensesHandler, createExpenseHandler, approveExpenseHandler } from '../controllers/expenses.controller.ts';

const router = Router();

router.get('/', requireAuth, getExpensesHandler);
router.post('/', requireAuth, createExpenseHandler);
router.patch('/:id/approve', requireAuth, approveExpenseHandler);

export default router;
