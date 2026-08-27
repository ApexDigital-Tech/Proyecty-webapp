import { Response } from 'express';
import { AuthRequest } from '../middleware/auth.ts';
import { db } from '../db/index.ts';
import { receiptsVouchers, documents } from '../db/schema.ts';
import { supabaseBackend as supabase } from '../lib/supabase-backend.ts';
import { logActivity } from '../db/audit.ts';

export const uploadVoucher = async (req: AuthRequest, res: Response) => {
  try {
    const file = req.file;
    const { projectId, expenseId, type, amount, provider, issueDate, milestone, description } = req.body;

    if (!file) return res.status(400).json({ error: 'No file provided' });

    // Upload to Supabase
    const fileName = `${projectId}/${Date.now()}_${file.originalname}`;
    const { data, error } = await supabase.storage
      .from('receipts')
      .upload(fileName, file.buffer, {
        contentType: file.mimetype,
      });

    if (error) throw error;

    const fileUrl = `${process.env.SUPABASE_URL}/storage/v1/object/public/receipts/${fileName}`;

    await db.insert(receiptsVouchers).values({
      projectId: parseInt(projectId),
      expenseId: expenseId ? parseInt(expenseId) : null,
      type: type || 'Voucher',
      amount: amount ? parseFloat(amount) : 0,
      provider: provider || 'Unknown',
      issueDate: issueDate ? new Date(issueDate) : new Date(),
      milestone: milestone || null,
      description: description || null,
      fileUrl,
      fileName: file.originalname,
    });

    logActivity(parseInt(projectId), req.user!.name, 'Voucher uploaded', req.user!.tenantId);

    res.json({ message: 'Voucher uploaded', url: fileUrl });
  } catch (err) {
    console.error('Upload Error:', err);
    res.status(500).json({ error: 'Failed to upload voucher' });
  }
};

export const uploadDocument = async (req: AuthRequest, res: Response) => {
  try {
    const file = req.file;
    const { projectId, category } = req.body;

    if (!file) return res.status(400).json({ error: 'No file provided' });

    const fileName = `${projectId}/${Date.now()}_${file.originalname}`;
    const { data, error } = await supabase.storage
      .from('documents')
      .upload(fileName, file.buffer, {
        contentType: file.mimetype,
      });

    if (error) throw error;

    const fileUrl = `${process.env.SUPABASE_URL}/storage/v1/object/public/documents/${fileName}`;

    await db.insert(documents).values({
      tenantId: req.user!.tenantId,
      projectId: parseInt(projectId),
      name: file.originalname,
      originalName: file.originalname,
      mimeType: file.mimetype,
      size: file.size.toString(),
      type: category || 'General',
      fileUrl,
    });

    logActivity(parseInt(projectId), req.user!.name, 'Document uploaded', req.user!.tenantId);

    res.json({ message: 'Document uploaded', url: fileUrl });
  } catch (err) {
    console.error('Upload Error:', err);
    res.status(500).json({ error: 'Failed to upload document' });
  }
};
