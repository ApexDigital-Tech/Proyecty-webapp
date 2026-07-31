import { Router } from 'express';
import { requireAuth } from '../middleware/auth.ts';
import multer from 'multer';
import { uploadVoucher, uploadDocument } from '../controllers/uploads.controller.ts';

const router = Router();

// Initialize Multer with 10MB limit and memory storage
const upload = multer({ 
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 } 
});

router.post('/projects/:projectId/receiptsVouchers', requireAuth, upload.single('file'), uploadVoucher);
router.post('/projects/:projectId/documents', requireAuth, upload.single('file'), uploadDocument);

export default router;
