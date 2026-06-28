import express from 'express';
import multer from 'multer';
import { db } from '../db/index.ts';
import { documents, auditLogs } from '../db/schema.ts';
import { requireAuth, AuthRequest } from '../middleware/auth.ts';
import { eq, and } from 'drizzle-orm';
import { createClient } from '@supabase/supabase-js';

const router = express.Router();

const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '';
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY || '';
const supabase = createClient(supabaseUrl, supabaseKey);

// Multer config (10MB limit, specific mimetypes)
const storage = multer.memoryStorage();
const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
  fileFilter: (req, file, cb) => {
    const allowedTypes = [
      'application/pdf',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document', // DOCX
      'image/jpeg',
      'image/png'
    ];
    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type. Only PDF, DOCX, JPG and PNG are allowed.'));
    }
  }
});

// Upload Document
router.post('/projects/:id/documents', requireAuth, upload.single('file'), async (req: AuthRequest, res: any) => {
  try {
    const projectId = parseInt(req.params.id);
    const tenantId = req.user?.tenantId;
    const userId = req.user?.id;
    
    if (!tenantId || !userId) return res.status(401).json({ error: 'No autorizado' });
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

    const { type, title } = req.body;
    if (!title || !type) return res.status(400).json({ error: 'Missing title or type' });

    const file = req.file;
    const originalName = file.originalname;
    const mimeType = file.mimetype;
    const size = file.size;

    // Simple versioning/naming convention
    const timestamp = Date.now();
    const safeName = originalName.replace(/[^a-zA-Z0-9.-]/g, '_');
    const storagePath = `${tenantId}/${projectId}/${timestamp}_${safeName}`;

    // Upload to Supabase Storage
    const { data: uploadData, error: uploadError } = await supabase.storage
      .from('documents')
      .upload(storagePath, file.buffer, {
        contentType: mimeType,
        upsert: false
      });

    if (uploadError) {
      console.error('Storage upload error:', uploadError);
      return res.status(500).json({ error: 'Error uploading file to storage' });
    }

    const fileUrl = `${supabaseUrl}/storage/v1/object/public/documents/${storagePath}`;

    // Insert into DB
    const [newDoc] = await db.insert(documents).values({
      tenantId,
      projectId,
      uploadedBy: userId,
      name: title, // Using 'name' for title compatibility, or keep 'title' depending on schema
      originalName,
      mimeType,
      size: String(size),
      type,
      fileUrl,
    }).returning();

    // Audit Log
    await db.insert(auditLogs).values({
      tenantId,
      userId,
      action: 'CREATE',
      entityType: 'Document',
      entityId: newDoc.id,
      newValues: newDoc,
      ipAddress: req.ip
    });

    res.json(newDoc);
  } catch (error: any) {
    console.error('Error uploading document:', error);
    if (error.message.includes('Invalid file type')) {
      return res.status(400).json({ error: error.message });
    }
    res.status(500).json({ error: 'Internal server error' });
  }
});

// List Documents
router.get('/projects/:id/documents', requireAuth, async (req: AuthRequest, res: any) => {
  try {
    const projectId = parseInt(req.params.id);
    const tenantId = req.user?.tenantId;
    
    if (!tenantId) return res.status(401).json({ error: 'No autorizado' });

    const docs = await db.select().from(documents).where(
      and(
        eq(documents.projectId, projectId),
        eq(documents.tenantId, tenantId)
      )
    );

    res.json(docs);
  } catch (error) {
    console.error('Error fetching documents:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Download/Get Signed URL (or just log audit for download)
router.get('/documents/:id/download', requireAuth, async (req: AuthRequest, res: any) => {
  try {
    const docId = parseInt(req.params.id);
    const tenantId = req.user?.tenantId;
    const userId = req.user?.id;
    
    if (!tenantId || !userId) return res.status(401).json({ error: 'No autorizado' });

    const [doc] = await db.select().from(documents).where(
      and(eq(documents.id, docId), eq(documents.tenantId, tenantId))
    );

    if (!doc) return res.status(404).json({ error: 'Document not found' });

    // Audit Log DOWNLOAD
    await db.insert(auditLogs).values({
      tenantId,
      userId,
      action: 'DOWNLOAD',
      entityType: 'Document',
      entityId: doc.id,
      ipAddress: req.ip
    });

    res.json({ url: doc.fileUrl });
  } catch (error) {
    console.error('Error handling download:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Delete Document
router.delete('/documents/:id', requireAuth, async (req: AuthRequest, res: any) => {
  try {
    const docId = parseInt(req.params.id);
    const tenantId = req.user?.tenantId;
    const userId = req.user?.id;
    
    if (!tenantId || !userId) return res.status(401).json({ error: 'No autorizado' });

    const [doc] = await db.select().from(documents).where(
      and(eq(documents.id, docId), eq(documents.tenantId, tenantId))
    );

    if (!doc) return res.status(404).json({ error: 'Document not found' });

    // Delete from Supabase Storage
    const storagePathMatch = doc.fileUrl?.match(/public\/documents\/(.*)$/);
    if (storagePathMatch && storagePathMatch[1]) {
      const storagePath = storagePathMatch[1];
      const { error: deleteError } = await supabase.storage.from('documents').remove([storagePath]);
      if (deleteError) {
        console.error('Storage delete error:', deleteError);
        // Continue deleting from DB even if storage fails? Better to log it and continue.
      }
    }

    // Delete from DB
    await db.delete(documents).where(eq(documents.id, docId));

    // Audit Log
    await db.insert(auditLogs).values({
      tenantId,
      userId,
      action: 'DELETE',
      entityType: 'Document',
      entityId: doc.id,
      oldValues: doc,
      ipAddress: req.ip
    });

    res.json({ success: true });
  } catch (error) {
    console.error('Error deleting document:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
