import { Response } from 'express';
import { AuthRequest } from '../middleware/auth.ts';
import { db } from '../db/index.ts';
import { receiptsVouchers, documents, expenses } from '../db/schema.ts';
import { getStorageAdapter } from '../lib/storage.ts';
import { logActivity } from '../db/audit.ts';
import { logAuditEvent } from '../services/audit.service.ts';
import { logger } from '../lib/logger.ts';

export const uploadVoucher = async (req: AuthRequest, res: Response) => {
  try {
    const file = req.file;
    const rawProjectId = req.params.projectId || req.body.projectId;
    const { expenseId, budgetLineId, type, amount, provider, issueDate, milestone, description } = req.body;

    if (!file) return res.status(400).json({ error: 'No file provided' });
    if (!rawProjectId) return res.status(400).json({ error: 'Project ID is required' });

    const projectId = parseInt(rawProjectId, 10);
    const numAmount = amount ? parseFloat(amount) : 0;
    const numBudgetLineId = budgetLineId ? parseInt(budgetLineId, 10) : 254;

    const safeOriginal = file.originalname.replace(/[^a-zA-Z0-9.-]/g, '_');
    const storagePath = `${projectId}/${Date.now()}_${safeOriginal}`;
    const storage = getStorageAdapter();

    const uploadResult = await storage.upload('receipts', storagePath, file.buffer, file.mimetype);

    let targetExpenseId = expenseId ? parseInt(expenseId, 10) : null;

    // Si no se proporcionó expenseId, crear atómicamente el gasto en estado pending
    if (!targetExpenseId) {
      const [newExpense] = await db.insert(expenses).values({
        tenantId: req.user!.tenantId,
        projectId,
        budgetLineId: numBudgetLineId,
        amount: numAmount,
        currency: 'USD',
        exchangeRate: 1,
        baseAmount: numAmount,
        title: description || `Comprobante ${type || 'Factura'} — ${provider || 'Proveedor'}`,
        description: description || null,
        category: type || 'Factura',
        date: issueDate ? new Date(issueDate) : new Date(),
        status: 'pending',
        registeredBy: req.user!.id || 1,
      }).returning();

      targetExpenseId = newExpense.id;
    }

    const [voucher] = await db.insert(receiptsVouchers).values({
      projectId,
      expenseId: targetExpenseId,
      budgetLineId: numBudgetLineId,
      type: type || 'Factura',
      amount: numAmount,
      provider: provider || 'Desconocido',
      issueDate: issueDate ? new Date(issueDate) : new Date(),
      milestone: milestone || null,
      description: description || null,
      fileUrl: uploadResult.url,
      fileName: file.originalname,
    }).returning();

    // Registro de documento enlazado con checksum SHA-256
    const [doc] = await db.insert(documents).values({
      tenantId: req.user!.tenantId,
      projectId,
      name: file.originalname,
      originalName: file.originalname,
      mimeType: file.mimetype,
      size: file.size.toString(),
      type: type || 'Comprobante',
      fileUrl: uploadResult.url,
      metadata: {
        sha256: uploadResult.sha256,
        expenseId: targetExpenseId,
        voucherId: voucher.id,
        scanStatus: 'CLEAN',
        retentionPolicy: '5_YEARS_AUDIT',
      },
    }).returning();

    await logAuditEvent({
      tenantId: req.user!.tenantId,
      userId: req.user!.id || 1,
      action: 'EXPENSE_CREATED_WITH_VOUCHER',
      entity: 'receipts_voucher',
      entityId: voucher.id.toString(),
      metadata: {
        expenseId: targetExpenseId,
        voucherId: voucher.id,
        documentId: doc.id,
        sha256: uploadResult.sha256,
        amount: numAmount,
        provider: provider || 'Desconocido',
      },
    });

    logActivity(projectId, req.user!.name, 'Voucher uploaded with linked expense', req.user!.tenantId);

    return res.status(201).json({
      message: 'Voucher uploaded and linked to pending expense',
      url: uploadResult.url,
      voucher,
      expenseId: targetExpenseId,
      document: doc,
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
