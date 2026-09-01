import { Router } from 'express';
import { requireAuth } from '../middleware/auth.ts';
import { requirePermission } from '../middleware/rbac.ts';
import {
  createDonorHandler,
  getDonorsHandler,
  createAgreementHandler,
  createDisbursementHandler,
  getFundingSummaryHandler,
} from '../controllers/funding.controller.ts';

const router = Router();

router.get('/donors', requireAuth, requirePermission('agreements', 'read'), getDonorsHandler);
router.post('/donors', requireAuth, requirePermission('agreements', 'create'), createDonorHandler);

router.post('/projects/:projectId/agreements', requireAuth, requirePermission('agreements', 'create'), createAgreementHandler);
router.get('/projects/:projectId/funding-summary', requireAuth, requirePermission('agreements', 'read'), getFundingSummaryHandler);

router.post('/agreements/:agreementId/disbursements', requireAuth, requirePermission('agreements', 'create'), createDisbursementHandler);

export default router;
