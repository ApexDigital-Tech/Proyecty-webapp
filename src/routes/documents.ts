import express from 'express';
import multer from 'multer';
import { db } from '../db/index.ts';
import { documents, auditLogs } from '../db/schema.ts';
import { requireAuth, AuthRequest } from '../middleware/auth.ts';
import { eq, and } from 'drizzle-orm';
import { createClient } from '@supabase/supabase-js';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { documentAnalysis } from '../db/schema.ts';

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || '');

const router = express.Router();

const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '';
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY || '';

let supabase: any;
try {
  if (supabaseUrl && supabaseKey) {
    supabase = createClient(supabaseUrl, supabaseKey);
  } else {
    console.warn("WARNING: SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY missing. Document endpoints will fail.");
  }
} catch (e) {
  console.error("Failed to initialize Supabase client:", e);
}

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
    if (!supabase) {
      throw new Error("Supabase client not initialized. Check environment variables.");
    }
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
    if (!supabase) {
      throw new Error("Supabase client not initialized. Check environment variables.");
    }
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

// Analyze Document (Fase 5B)
router.post('/documents/:id/analyze', requireAuth, async (req: AuthRequest, res: any) => {
  try {
    const docId = parseInt(req.params.id);
    const tenantId = req.user?.tenantId;
    const userId = req.user?.id;
    
    if (!tenantId || !userId) return res.status(401).json({ error: 'No autorizado' });

    // 1. Fetch document metadata
    const [doc] = await db.select().from(documents).where(
      and(eq(documents.id, docId), eq(documents.tenantId, tenantId))
    );

    if (!doc) return res.status(404).json({ error: 'Document not found' });
    if (doc.mimeType !== 'application/pdf') {
      return res.status(400).json({ error: 'Solo se soportan documentos PDF por ahora.' });
    }

    // 2. Check if already analyzed to return cache (or re-analyze if forced, but we'll keep it simple: return existing if exists)
    const [existingAnalysis] = await db.select().from(documentAnalysis).where(eq(documentAnalysis.documentId, docId));
    if (existingAnalysis && !req.query.force) {
      return res.json(existingAnalysis);
    }

    // 3. Download file from Supabase Storage
    if (!supabase) {
      throw new Error("Supabase client not initialized. Check environment variables.");
    }
    const storagePathMatch = doc.fileUrl?.match(/public\/documents\/(.*)$/);
    if (!storagePathMatch || !storagePathMatch[1]) {
      return res.status(400).json({ error: 'Invalid document URL' });
    }
    const storagePath = storagePathMatch[1];
    
    const { data: fileData, error: downloadError } = await supabase.storage.from('documents').download(storagePath);
    if (downloadError || !fileData) {
      console.error('Download error:', downloadError);
      return res.status(500).json({ error: 'Failed to download document for analysis' });
    }

    // 4. Convert Blob to Buffer and base64 for Gemini
    const buffer = Buffer.from(await fileData.arrayBuffer());
    const base64Data = buffer.toString('base64');

    // 5. Send to Gemini
    if (!process.env.GEMINI_API_KEY) {
      return res.status(500).json({ error: 'GEMINI_API_KEY no está configurada en el servidor.' });
    }
    
    // We use gemini-2.0-flash as it supports PDF documents natively and is recommended
    let responseText = "";
    if (process.env.GEMINI_API_KEY === 'mock') {
      console.log("Mocking Gemini API call...");
      // Simulate delay
      await new Promise(r => setTimeout(r, 1500));
      responseText = JSON.stringify({
        summary: "Este es un resumen ejecutivo de prueba (Mock) del documento analizado por la IA.",
        keyPoints: [
          "El documento trata sobre desarrollo de software.",
          "Contiene especificaciones técnicas importantes.",
          "El presupuesto estimado es de $50,000 USD."
        ],
        detectedEntities: [
          { name: "$50,000 USD", type: "Monto" },
          { name: "Apex Digital", type: "Empresa" }
        ],
        suggestedCategory: "Contrato"
      });
    } else {
      const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash" });
      
      const prompt = `Analiza el siguiente documento y devuelve EXCLUSIVAMENTE un objeto JSON válido con la siguiente estructura (no incluyas markdown \`\`\`json ni nada extra):
{
  "summary": "Resumen ejecutivo del documento en 2-3 oraciones",
  "keyPoints": ["Punto clave 1", "Punto clave 2", "Punto clave 3"],
  "detectedEntities": [
    {"name": "Nombre de entidad o monto", "type": "Persona | Empresa | Monto | Fecha"}
  ],
  "suggestedCategory": "Factura | Contrato | Informe | Otro"
}`;

      const result = await model.generateContent([
        {
          inlineData: {
            data: base64Data,
            mimeType: "application/pdf"
          }
        },
        prompt
      ]);

      responseText = result.response.text();
    }

    let aiData;
    try {
      // Limpiar posible formato markdown
      const cleanedText = responseText.replace(/```json\n?|\n?```/g, '').trim();
      aiData = JSON.parse(cleanedText);
    } catch (e: any) {
      console.error('Error parsing AI response:', responseText);
      return res.status(500).json({ error: 'El modelo no retornó un formato válido.', raw: responseText });
    }

    // 6. Save to database
    let savedAnalysis;
    if (existingAnalysis) {
      [savedAnalysis] = await db.update(documentAnalysis).set({
        summary: aiData.summary,
        keyPoints: aiData.keyPoints,
        detectedEntities: aiData.detectedEntities,
        suggestedCategory: aiData.suggestedCategory,
        rawAiResponse: aiData,
        analyzedBy: userId,
      }).where(eq(documentAnalysis.id, existingAnalysis.id)).returning();
    } else {
      [savedAnalysis] = await db.insert(documentAnalysis).values({
        documentId: doc.id,
        tenantId,
        summary: aiData.summary,
        keyPoints: aiData.keyPoints,
        detectedEntities: aiData.detectedEntities,
        suggestedCategory: aiData.suggestedCategory,
        rawAiResponse: aiData,
        analyzedBy: userId,
      }).returning();
    }

    // Audit log
    await db.insert(auditLogs).values({
      tenantId,
      userId,
      action: 'ANALYZE',
      entityType: 'Document',
      entityId: doc.id,
      ipAddress: req.ip
    });

    res.json(savedAnalysis);
  } catch (error: any) {
    console.error('Error in AI analysis:', error);
    
    // Identificar errores específicos de Gemini o Timeout
    let errorMessage = 'Ocurrió un error interno durante el análisis.';
    if (error.message?.includes('API key not valid') || error.message?.includes('API key not found')) {
      errorMessage = 'La clave API de Inteligencia Artificial configurada es inválida o expiró.';
    } else if (error.message?.includes('quota') || error.message?.includes('429')) {
      errorMessage = 'Se ha superado la cuota de uso del proveedor de Inteligencia Artificial.';
    } else if (error.message?.includes('timeout') || error.name === 'TimeoutError') {
      errorMessage = 'El análisis tomó demasiado tiempo. El proveedor de IA no respondió.';
    }

    res.status(500).json({ error: errorMessage });
  }
});

export default router;
