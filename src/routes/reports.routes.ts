import { Router } from 'express';
import { requireAuth } from '../middleware/auth.ts';
import { requirePermission } from '../middleware/rbac.ts';
import { requireFeature } from '../middlewares/requireFeature.ts';
import { getDashboardMetrics, generateReport, getReportsData, generateAiReportHandler } from '../controllers/reports.controller.ts';

const router = Router();

router.get('/dashboard/metrics', requireAuth, getDashboardMetrics);
router.post('/reports/generate', requireAuth, requireFeature('ai_reports'), requirePermission('reports', 'create'), generateReport);
router.post('/reports/ai-generate', requireAuth, requireFeature('ai_reports'), requirePermission('reports', 'create'), generateAiReportHandler);
router.get('/reports/data', requireAuth, requirePermission('reports', 'read'), getReportsData);

export default router;
