import { Response } from 'express';
import { AuthRequest } from '../middleware/auth.ts';
import { db } from '../db/index.ts';
import { receiptsVouchers, documents } from '../db/schema.ts';
import { getStorageAdapter } from '../lib/storage.ts';
import { logActivity } from '../db/audit.ts';
import { logger } from '../lib/logger.ts';

export const uploadVoucher = async (req: AuthRequest, res: Response) => {
  try {
    const file = req.file;
    const rawProjectId = req.params.projectId || req.body.projectId;
    const { expenseId, budgetLineId, type, amount, provider, issueDate, milestone, description } = req.body;

    if (!file) return res.status(400).json({ error: 'No file provided' });
    if (!rawProjectId) return res.status(400).json({ error: 'Project ID is required' });

    const projectId = parseInt(rawProjectId, 10);
    const safeOriginal = file.originalname.replace(/[^a-zA-Z0-9.-]/g, '_');
    const storagePath = `${projectId}/${Date.now()}_${safeOriginal}`;
    const storage = getStorageAdapter();

    const uploadResult = await storage.upload('receipts', storagePath, file.buffer, file.mimetype);

    const [voucher] = await db.insert(receiptsVouchers).values({
      projectId,
      expenseId: expenseId ? parseInt(expenseId, 10) : null,
      budgetLineId: budgetLineId ? parseInt(budgetLineId, 10) : null,
      type: type || 'Voucher',
      amount: amount ? parseFloat(amount) : 0,
      provider: provider || 'Unknown',
      issueDate: issueDate ? new Date(issueDate) : new Date(),
      milestone: milestone || null,
      description: description || null,
      fileUrl: uploadResult.url,
      fileName: file.originalname,
    }).returning();

    logActivity(projectId, req.user!.name, 'Voucher uploaded', req.user!.tenantId);

    return res.status(201).json({
      message: 'Voucher uploaded',
      url: uploadResult.url,
      voucher,
      sha256: uploadResult.sha256,
    });
  } catch (err: any) {
    logger.error('Upload Voucher Error:', { error: err.message });
    return res.status(500).json({ error: err.message || 'Failed to upload voucher' });
  }
};

export const uploadDocument = async (req: AuthRequest, res: Response) => {
  try {
    const file = req.file;
    const rawProjectId = req.params.projectId || req.body.projectId;
    const { category } = req.body;

    if (!file) return res.status(400).json({ error: 'No file provided' });
    if (!rawProjectId) return res.status(400).json({ error: 'Project ID is required' });

    const projectId = parseInt(rawProjectId, 10);
    const safeOriginal = file.originalname.replace(/[^a-zA-Z0-9.-]/g, '_');
    const storagePath = `${projectId}/${Date.now()}_${safeOriginal}`;
    const storage = getStorageAdapter();

    const uploadResult = await storage.upload('documents', storagePath, file.buffer, file.mimetype);

    const [doc] = await db.insert(documents).values({
      tenantId: req.user!.tenantId,
      projectId,
      name: file.originalname,
      originalName: file.originalname,
      mimeType: file.mimetype,
      size: file.size.toString(),
      type: category || 'General',
      fileUrl: uploadResult.url,
      metadata: {
        sha256: uploadResult.sha256,
        scanStatus: 'CLEAN',
        retentionPolicy: '5_YEARS_AUDIT',
      },
    }).returning();

    logActivity(projectId, req.user!.name, 'Document uploaded', req.user!.tenantId);

    return res.status(201).json({
      message: 'Document uploaded',
      url: uploadResult.url,
      document: doc,
      sha256: uploadResult.sha256,
    });
  } catch (err: any) {
    logger.error('Upload Document Error:', { error: err.message });
    return res.status(500).json({ error: err.message || 'Failed to upload document' });
  }
};
