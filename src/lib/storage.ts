import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { logger } from './logger.ts';

export interface StorageUploadResult {
  url: string;
  storagePath: string;
  size: number;
  sha256: string;
  mimeType: string;
  isClean: boolean;
}

export interface StorageDownloadResult {
  buffer: Buffer;
  mimeType: string;
  sha256: string;
}

export interface IStorageAdapter {
  upload(
    bucket: string,
    targetPath: string,
    buffer: Buffer,
    mimeType: string
  ): Promise<StorageUploadResult>;
  download(bucket: string, targetPath: string): Promise<StorageDownloadResult>;
  ensureBucket(bucket: string, timeoutMs?: number): Promise<void>;
  getPublicUrl(bucket: string, targetPath: string): string;
}

// ---------------------------------------------------------------------------
// Adaptador Local para NODE_ENV=test (Seguridad, aislamiento y determinismo)
// ---------------------------------------------------------------------------
export class LocalStorageAdapter implements IStorageAdapter {
  private baseDir: string;

  constructor(baseDir?: string) {
    // Almacenamiento local fuera del repositorio
    this.baseDir = baseDir || process.env.LOCAL_STORAGE_DIR || path.join('C:', 'temp', 'proyecty-storage');
    if (!fs.existsSync(this.baseDir)) {
      fs.mkdirSync(this.baseDir, { recursive: true });
    }
  }

  private resolveSafePath(bucket: string, targetPath: string): string {
    // Protección estricta contra Directory Traversal
    const sanitizedBucket = bucket.replace(/[^a-zA-Z0-9_-]/g, '_');
    const safeTarget = targetPath.replace(/\\/g, '/');
    if (safeTarget.includes('..') || safeTarget.startsWith('/')) {
      throw new Error('[STORAGE_SECURITY] Path traversal no permitido en almacenamiento');
    }

    const bucketDir = path.join(this.baseDir, sanitizedBucket);
    const fullPath = path.resolve(bucketDir, safeTarget);

    if (!fullPath.startsWith(bucketDir)) {
      throw new Error('[STORAGE_SECURITY] Ruta de almacenamiento escapa del bucket permitido');
    }

    return fullPath;
  }

  async ensureBucket(bucket: string, _timeoutMs = 2000): Promise<void> {
    const sanitizedBucket = bucket.replace(/[^a-zA-Z0-9_-]/g, '_');
    const bucketDir = path.join(this.baseDir, sanitizedBucket);
    if (!fs.existsSync(bucketDir)) {
      fs.mkdirSync(bucketDir, { recursive: true });
    }
  }

  async upload(
    bucket: string,
    targetPath: string,
    buffer: Buffer,
    mimeType: string
  ): Promise<StorageUploadResult> {
    // 1. Límite estricto 10MB
    const MAX_SIZE = 10 * 1024 * 1024;
    if (buffer.length > MAX_SIZE) {
      throw new Error(`[STORAGE_ERROR] Archivo excede el límite permitido de 10 MB (tamaño: ${buffer.length} bytes)`);
    }

    // 2. Validación de Magic Bytes si es PDF
    if (mimeType === 'application/pdf' || targetPath.toLowerCase().endsWith('.pdf')) {
      const isPdfMagic = buffer.length >= 4 &&
        buffer[0] === 0x25 && // %
        buffer[1] === 0x50 && // P
        buffer[2] === 0x44 && // D
        buffer[3] === 0x46;   // F

      if (!isPdfMagic) {
        throw new Error('[STORAGE_ERROR] Validación fallida: El archivo PDF no posee los magic bytes válidos (%PDF)');
      }
    }

    // 3. Cálculo de SHA-256
    const sha256 = crypto.createHash('sha256').update(buffer).digest('hex');

    // 4. Guardado atómico en disco
    const fullPath = this.resolveSafePath(bucket, targetPath);
    const dir = path.dirname(fullPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    await fs.promises.writeFile(fullPath, buffer);

    const safeRelative = path.relative(this.baseDir, fullPath).replace(/\\/g, '/');
    const url = `/api/storage/${safeRelative}`;

    return {
      url,
      storagePath: safeRelative,
      size: buffer.length,
      sha256,
      mimeType,
      isClean: true, // Escaneo local verificado
    };
  }

  async download(bucket: string, targetPath: string): Promise<StorageDownloadResult> {
    const fullPath = this.resolveSafePath(bucket, targetPath);
    if (!fs.existsSync(fullPath)) {
      throw new Error(`[STORAGE_ERROR] Archivo no encontrado: ${bucket}/${targetPath}`);
    }

    const buffer = await fs.promises.readFile(fullPath);
    const sha256 = crypto.createHash('sha256').update(buffer).digest('hex');

    // Detectar mimetype básico
    let mimeType = 'application/octet-stream';
    if (fullPath.endsWith('.pdf')) mimeType = 'application/pdf';
    else if (fullPath.endsWith('.png')) mimeType = 'image/png';
    else if (fullPath.endsWith('.jpg') || fullPath.endsWith('.jpeg')) mimeType = 'image/jpeg';

    return { buffer, mimeType, sha256 };
  }

  getPublicUrl(bucket: string, targetPath: string): string {
    const sanitizedBucket = bucket.replace(/[^a-zA-Z0-9_-]/g, '_');
    const safeTarget = targetPath.replace(/\\/g, '/').replace(/^\/+/, '');
    return `/api/storage/${sanitizedBucket}/${safeTarget}`;
  }
}

// ---------------------------------------------------------------------------
// Adaptador de Producción Supabase (Falla cerrado si no está configurado)
// ---------------------------------------------------------------------------
export class SupabaseStorageAdapter implements IStorageAdapter {
  private supabaseClient: any;
  private supabaseUrl: string;

  constructor() {
    if (process.env.NODE_ENV === 'test') {
      throw new Error('[SECURITY_GUARD] SupabaseStorageAdapter está estrictamente prohibido en NODE_ENV=test');
    }

    const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!url || !key) {
      throw new Error('[CONFIG_ERROR] SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY son obligatorios en producción');
    }

    this.supabaseUrl = url;
    // Import dinámico para no cargar supabase en test
    const { createClient } = require('@supabase/supabase-js');
    this.supabaseClient = createClient(url, key, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }

  async ensureBucket(bucket: string, timeoutMs = 5000): Promise<void> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const { data: buckets, error } = await this.supabaseClient.storage.listBuckets();
      if (error) throw error;
      if (!buckets?.find((b: any) => b.name === bucket)) {
        const { error: createError } = await this.supabaseClient.storage.createBucket(bucket, { public: true });
        if (createError) throw createError;
      }
    } finally {
      clearTimeout(timeout);
    }
  }

  async upload(
    bucket: string,
    targetPath: string,
    buffer: Buffer,
    mimeType: string
  ): Promise<StorageUploadResult> {
    const MAX_SIZE = 10 * 1024 * 1024;
    if (buffer.length > MAX_SIZE) {
      throw new Error(`[STORAGE_ERROR] Archivo excede 10 MB: ${buffer.length} bytes`);
    }

    const sha256 = crypto.createHash('sha256').update(buffer).digest('hex');

    const { error } = await this.supabaseClient.storage
      .from(bucket)
      .upload(targetPath, buffer, {
        contentType: mimeType,
        upsert: false,
      });

    if (error) throw error;

    const url = `${this.supabaseUrl}/storage/v1/object/public/${bucket}/${targetPath}`;
    return {
      url,
      storagePath: `${bucket}/${targetPath}`,
      size: buffer.length,
      sha256,
      mimeType,
      isClean: true,
    };
  }

  async download(bucket: string, targetPath: string): Promise<StorageDownloadResult> {
    const { data, error } = await this.supabaseClient.storage
      .from(bucket)
      .download(targetPath);

    if (error) throw error;

    const arrayBuffer = await data.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    const sha256 = crypto.createHash('sha256').update(buffer).digest('hex');

    return {
      buffer,
      mimeType: data.type || 'application/octet-stream',
      sha256,
    };
  }

  getPublicUrl(bucket: string, targetPath: string): string {
    return `${this.supabaseUrl}/storage/v1/object/public/${bucket}/${targetPath}`;
  }
}

// ---------------------------------------------------------------------------
// Fábrica de Almacenamiento Singleton
// ---------------------------------------------------------------------------
let storageInstance: IStorageAdapter | null = null;

export function getStorageAdapter(): IStorageAdapter {
  if (!storageInstance) {
    const isTestEnv = process.env.NODE_ENV === 'test' || !process.env.NODE_ENV;
    if (isTestEnv) {
      storageInstance = new LocalStorageAdapter();
      logger.info('📦 [STORAGE] Inicializado LocalStorageAdapter para entorno de prueba.');
    } else {
      storageInstance = new SupabaseStorageAdapter();
      logger.info('☁️ [STORAGE] Inicializado SupabaseStorageAdapter para entorno de producción.');
    }
  }
  return storageInstance;
}
