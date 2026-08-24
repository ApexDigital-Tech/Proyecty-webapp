import { Router } from 'express';
import { requireAuth } from '../middleware/auth.ts';
import {
  getProjects, createProject, update, getProjectById, remove, getMembers, addMembers, removeMembers, addAgreements, addBudgetItems, getProjectLogs, addLogs, getEvents, addExpenses, getBudgetVersions, addBudgetVersion
} from '../controllers/projects.controller.ts';
import { requirePermission } from '../middleware/rbac.ts';

const router = Router();

router.get('/', requireAuth, getProjects);
router.post('/', requireAuth, createProject);
router.put('/:id', requireAuth, update);
router.get('/:id', requireAuth, getProjectById);
router.delete('/:id', requireAuth, remove);
router.get('/:id/members', requireAuth, requirePermission('projects', 'read'), getMembers);
router.post('/:id/members', requireAuth, requirePermission('projects', 'manage'), addMembers);
router.delete('/:id/members/:userId', requireAuth, requirePermission('projects', 'manage'), removeMembers);
router.post('/:projectId/agreements', requireAuth, requirePermission('agreements', 'create'), addAgreements);
router.post('/:projectId/budget-items', requireAuth, requirePermission('budget_lines', 'create'), addBudgetItems);
router.get('/:id/budget-versions', requireAuth, requirePermission('budgets', 'read'), getBudgetVersions);
router.post('/:id/budget-versions', requireAuth, requirePermission('budgets', 'create'), addBudgetVersion);
router.get('/:id/logs', requireAuth, requirePermission('projects', 'read'), getProjectLogs);
router.post('/:id/logs', requireAuth, requirePermission('projects', 'update'), addLogs);
router.get('/:id/events', requireAuth, requirePermission('projects', 'read'), getEvents);
router.post('/:projectId/expenses', requireAuth, requirePermission('expenses', 'create'), addExpenses);

export default router;
