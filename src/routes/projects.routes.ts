import { Router } from 'express';
import { requireAuth } from '../middleware/auth.ts';
import {
  getProjects, createProject, update, getProjectById, remove, getMembers, addMembers, removeMembers, addAgreements, addBudgetItems, getProjectLogs, addLogs, getEvents, addExpenses
} from '../controllers/projects.controller.ts';

const router = Router();

router.get('/', requireAuth, getProjects);
router.post('/', requireAuth, createProject);
router.put('/:id', requireAuth, update);
router.get('/:id', requireAuth, getProjectById);
router.delete('/:id', requireAuth, remove);
router.get('/:id/members', requireAuth, getMembers);
router.post('/:id/members', requireAuth, addMembers);
router.delete('/:id/members/:userId', requireAuth, removeMembers);
router.post('/:projectId/agreements', requireAuth, addAgreements);
router.post('/:projectId/budget-items', requireAuth, addBudgetItems);
router.get('/:id/logs', requireAuth, getProjectLogs);
router.post('/:id/logs', requireAuth, addLogs);
router.get('/:id/events', requireAuth, getEvents);
router.post('/:projectId/expenses', requireAuth, addExpenses);

export default router;
