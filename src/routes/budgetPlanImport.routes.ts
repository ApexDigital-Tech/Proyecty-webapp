import { Router } from 'express';
import multer from 'multer';
import { requireAuth } from '../middleware/auth.ts';
import {
  approveBudgetPlanVersion,
  downloadAbuelitasPlanTemplate,
  importBudgetPlan,
} from '../controllers/budgetPlanImport.controller.ts';

const router = Router();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 2 * 1024 * 1024, files: 1 },
  fileFilter: (_req, file, callback) => {
    const csv = file.mimetype === 'text/csv' || file.mimetype === 'application/vnd.ms-excel' || file.originalname.toLowerCase().endsWith('.csv');
    if (csv) callback(null, true);
    else callback(new Error('Solo se admiten archivos CSV.'));
  },
});

router.get('/projects/:id/budget-plan/template/abuelitas', requireAuth, downloadAbuelitasPlanTemplate);
router.post('/projects/:id/budget-plan/import', requireAuth, upload.single('file'), importBudgetPlan);
router.post('/projects/:id/budget-plan/versions/:versionId/approve', requireAuth, approveBudgetPlanVersion);

export default router;
