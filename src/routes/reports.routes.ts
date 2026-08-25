import { Router } from 'express';
import { requireAuth } from '../middleware/auth.ts';
import { requirePermission } from '../middleware/rbac.ts';
import { requireFeature } from '../middlewares/requireFeature.ts';
import { 
  getDashboardMetrics, 
  generateReport, 
  getReportsData, 
  generateAiReportHandler,
  exportReportsCsv,
  exportReportsPdf,
  createDraftReportHandler,
  approveReportHandler,
  listReportsHandler
} from '../controllers/reports.controller.ts';

const router = Router();

// M-02: Dashboard ejecutivo
router.get('/dashboard/metrics', requireAuth, getDashboardMetrics);

// M-14: Ciclo de vida y versionado de reportes
router.post('/reports/drafts', requireAuth, createDraftReportHandler);
router.post('/reports/:id/approve', requireAuth, approveReportHandler);
router.get('/reports/list', requireAuth, listReportsHandler);

// M-14: Exportaciones seguras CSV y PDF
router.get('/reports/export/csv', requireAuth, exportReportsCsv);
router.get('/reports/export/pdf', requireAuth, exportReportsPdf);

// M-14: Generación con IA
router.post('/reports/generate', requireAuth, requireFeature('ai_reports'), requirePermission('reports', 'create'), generateReport);
router.post('/reports/ai-generate', requireAuth, requireFeature('ai_reports'), requirePermission('reports', 'create'), generateAiReportHandler);
router.get('/reports/data', requireAuth, requirePermission('reports', 'read'), getReportsData);

export default router;
