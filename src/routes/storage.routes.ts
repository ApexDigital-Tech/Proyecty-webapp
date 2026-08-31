import { Router, Response } from 'express';
import { requireAuth, AuthRequest } from '../middleware/auth.ts';
import { getStorageAdapter } from '../lib/storage.ts';
import { logger } from '../lib/logger.ts';

const router = Router();

/**
 * GET /api/storage/:bucket/*
 * Descarga autenticada de archivos del almacenamiento con protección anti-traversal y verificación de integridad.
 */
router.get('/storage/:bucket/*', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    const bucket = req.params.bucket;
    // req.params[0] contiene el resto de la ruta del archivo
    const targetPath = (req.params as any)[0];

    if (!bucket || !targetPath) {
      return res.status(400).json({ error: 'Bucket y ruta de archivo requeridos' });
    }

    const storage = getStorageAdapter();
    const result = await storage.download(bucket, targetPath);

    res.setHeader('Content-Type', result.mimeType);
    res.setHeader('Content-Length', result.buffer.length);
    res.setHeader('X-Content-SHA256', result.sha256);
    res.setHeader('Cache-Control', 'private, no-cache, no-store, must-revalidate');

    return res.status(200).send(result.buffer);
  } catch (err: any) {
    logger.error('Error downloading file from storage:', { error: err.message });
    if (err.message?.includes('no encontrado')) {
      return res.status(404).json({ error: 'Archivo no encontrado' });
    }
    if (err.message?.includes('Path traversal') || err.message?.includes('escapa')) {
      return res.status(400).json({ error: 'Ruta no permitida' });
    }
    return res.status(500).json({ error: 'Error al recuperar archivo del almacenamiento' });
  }
});

export default router;
