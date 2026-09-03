import { Router } from 'express';
import { requireAuth } from '../middleware/auth.ts';
import { getTasks, createTask, updateTask, deleteTask } from '../controllers/tasks.controller.ts';

const router = Router();

router.get('/', requireAuth, getTasks);
router.post('/', requireAuth, createTask);
router.put('/:id', requireAuth, updateTask);
router.patch('/:id', requireAuth, updateTask);
router.delete('/:id', requireAuth, deleteTask);

export default router;
