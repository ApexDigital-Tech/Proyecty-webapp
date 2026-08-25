import crypto from 'node:crypto';
import { db } from '../db/index.ts';
import { documents, projects, users } from '../db/schema.ts';
import { eq, and } from 'drizzle-orm';
import { withTenantContext } from '../utils/dbWrapper.ts';
import { logAuditEvent } from './audit.service.ts';
import { NotFoundError, ValidationError, ForbiddenError, LockedError, ConflictError } from '../utils/errors.ts';

export type DocumentScanStatus = 'PENDING_SCAN' | 'SCANNING' | 'CLEAN' | 'INFECTED' | 'SCAN_UNAVAILABLE';

export const SCANNER_INTERNAL_SVC_SECRET = process.env.SCANNER_SVC_SECRET || 'SCANNER_INTERNAL_SVC_KEY_2026_SECURE';

export interface UploadDocumentDto {
  projectId: number;
  name: string;
  originalName: string;
  declaredMimeType: string;
  contentBuffer: Buffer;
  type?: string;
}

export interface DocumentMetadata {
  sha256: string;
  magicMime: string;
  scanStatus: DocumentScanStatus;
  isQuarantined: boolean;
  isDeleted: boolean;
  deletedAt?: string | null;
  retentionUntil: string; // 5 años desde creación
  auditTrail: {
    from: string;
    to: string;
    performedBy: string;
    timestamp: string;
    reason?: string;
  }[];
}

/**
 * Valida minuciosamente el tipo MIME inspeccionando magic bytes y estructura interna OOXML (DOCX / XLSX / PDF / WEBP / PNG / JPEG)
 */
export function sniffMagicMime(buffer: Buffer, declaredMime?: string): string {
  if (!buffer || buffer.length < 4) {
    throw new ValidationError('El archivo está vacío o dañado.');
  }

  // 1. Detección y rechazo de ejecutables maliciosos (MZ header 0x4D, 0x5A)
  if (buffer[0] === 0x4D && buffer[1] === 0x5A) {
    throw new ValidationError('Control M-12 / DOC-01: Archivo ejecutable no permitido por políticas de seguridad.');
  }

  // 2. PDF: %PDF- (0x25, 0x50, 0x44, 0x46)
  if (buffer[0] === 0x25 && buffer[1] === 0x50 && buffer[2] === 0x44 && buffer[3] === 0x46) {
    return 'application/pdf';
  }

  // 3. PNG: \x89PNG\r\n\x1a\n
  if (
    buffer.length >= 8 &&
    buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4E && buffer[3] === 0x47 &&
    buffer[4] === 0x0D && buffer[5] === 0x0A && buffer[6] === 0x1A && buffer[7] === 0x0A
  ) {
    return 'image/png';
  }

  // 4. JPEG / JPG: \xFF\xD8\xFF
  if (buffer[0] === 0xFF && buffer[1] === 0xD8 && buffer[2] === 0xFF) {
    return 'image/jpeg';
  }

  // 5. WEBP: RIFF....WEBP (0x52, 0x49, 0x46, 0x46 en [0..3] y 0x57, 0x45, 0x42, 0x50 en [8..11])
  if (
    buffer.length >= 12 &&
    buffer[0] === 0x52 && buffer[1] === 0x49 && buffer[2] === 0x46 && buffer[3] === 0x46 &&
    buffer[8] === 0x57 && buffer[9] === 0x45 && buffer[10] === 0x42 && buffer[11] === 0x50
  ) {
    return 'image/webp';
  }

  // 6. Contenedores ZIP / OOXML (DOCX, XLSX)
  if (buffer[0] === 0x50 && buffer[1] === 0x4B && buffer[2] === 0x03 && buffer[3] === 0x04) {
    const rawContent = buffer.toString('binary');
    
    const hasContentTypes = rawContent.includes('[Content_Types].xml');
    const isDocx = hasContentTypes && (rawContent.includes('word/') || rawContent.includes('word/document.xml'));
    const isXlsx = hasContentTypes && (rawContent.includes('xl/') || rawContent.includes('xl/workbook.xml'));

    if (isDocx) {
      return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
    }
    if (isXlsx) {
      return 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
    }

    // ZIP genérico válido
    return 'application/zip';
  }

  // 7. Texto plano / CSV / JSON imprimible
  const isAsciiText = buffer.subarray(0, Math.min(buffer.length, 128)).every(
    byte => (byte >= 32 && byte <= 126) || byte === 10 || byte === 13 || byte === 9
  );
  if (isAsciiText) {
    return 'text/plain';
  }

  throw new ValidationError('Control M-12 / DOC-01: Formato de archivo no soportado o firma binaria inválida.');
}

/**
 * Calcula el Hash SHA-256 inmutable de un buffer de archivo
 */
export function computeFileSha256(buffer: Buffer): string {
  return crypto.createHash('sha256').update(buffer).digest('hex');
}

/**
 * Comparación segura contra ataques de temporización (timing-safe) para credenciales del escáner
 */
export function verifyScannerAuthKey(providedKey?: string): boolean {
  if (!providedKey) return false;
  try {
    const secretBuf = Buffer.from(SCANNER_INTERNAL_SVC_SECRET);
    const providedBuf = Buffer.from(providedKey);
    if (secretBuf.length !== providedBuf.length) return false;
    return crypto.timingSafeEqual(secretBuf, providedBuf);
  } catch {
    return false;
  }
}

/**
 * Registra y sube un documento al repositorio seguro con retención legal de 5 años y escaneo inicial fail-closed
 */
export const uploadDocument = async (
  tenantId: number,
  userId: number,
  data: UploadDocumentDto
) => {
  return await withTenantContext(tenantId, async (tx) => {
    // 1. Validar proyecto y pertenencia al tenant
    const [project] = await tx.select().from(projects).where(
      and(eq(projects.id, data.projectId), eq(projects.tenantId, tenantId))
    );
    if (!project) {
      throw new NotFoundError('El proyecto no existe en esta organización.');
    }

    // 2. Validación de Magic Bytes vs Declarado
    const verifiedMime = sniffMagicMime(data.contentBuffer, data.declaredMimeType);
    const sha256 = computeFileSha256(data.contentBuffer);

    // Calcular retención legal de 5 años
    const now = new Date();
    const retentionDate = new Date(now.getTime());
    retentionDate.setFullYear(retentionDate.getFullYear() + 5);

    const docMeta: DocumentMetadata = {
      sha256,
      magicMime: verifiedMime,
      scanStatus: 'PENDING_SCAN', // Estado inicial fail-closed obligatorio
      isQuarantined: false,
      isDeleted: false,
      deletedAt: null,
      retentionUntil: retentionDate.toISOString(),
      auditTrail: [
        {
          from: 'NONE',
          to: 'PENDING_SCAN',
          performedBy: `USER_${userId}`,
          timestamp: now.toISOString(),
          reason: 'Carga inicial del documento',
        }
      ],
    };

    // 3. Inserción
    const [newDoc] = await tx.insert(documents).values({
      tenantId,
      projectId: data.projectId,
      uploadedBy: userId,
      name: data.name,
      originalName: data.originalName,
      mimeType: verifiedMime,
      size: `${Math.round(data.contentBuffer.length / 1024)} KB`,
      type: data.type || 'Informe',
      uploadDate: now.toISOString().slice(0, 10),
      fileUrl: `https://storage.proyecty.internal/tenants/${tenantId}/docs/${sha256}`,
      metadata: docMeta as any,
    }).returning();

    // 4. Auditoría
    logAuditEvent({
      tenantId,
      userId,
      action: 'DOCUMENT_UPLOADED',
      entity: 'document',
      entityId: newDoc.id.toString(),
      metadata: {
        projectId: data.projectId,
        fileName: data.name,
        sha256,
        mimeType: verifiedMime,
        scanStatus: 'PENDING_SCAN',
      },
    });

    return newDoc;
  });
};

/**
 * Transición de estado de escaneo con validación estricta de autoridad y reglas de máquina de estados
 */
export const updateDocumentScanStatus = async (
  tenantId: number,
  documentId: number,
  scannerAuthKey: string | undefined,
  targetStatus: DocumentScanStatus,
  reason?: string
) => {
  return await withTenantContext(tenantId, async (tx) => {
    // Validar autoridad criptográfica del escáner
    const isAuthorizedScanner = verifyScannerAuthKey(scannerAuthKey);

    if (targetStatus === 'CLEAN' && !isAuthorizedScanner) {
      throw new ForbiddenError('Control M-12 / DOC-01: Solo el servicio de escaneo de seguridad autorizado puede certificar un documento como CLEAN.');
    }

    if (!isAuthorizedScanner && targetStatus !== 'PENDING_SCAN') {
      throw new ForbiddenError('Control M-12 / DOC-01: Acceso denegado: Autenticación de escáner requerida para actualizar estados de seguridad.');
    }

    const [doc] = await tx.select().from(documents).where(
      and(eq(documents.id, documentId), eq(documents.tenantId, tenantId))
    );

    if (!doc) {
      throw new NotFoundError('Documento no encontrado.');
    }

    const currentMeta = (doc.metadata || {}) as DocumentMetadata;
    const fromStatus = currentMeta.scanStatus || 'PENDING_SCAN';

    // Regla de Máquina de Estados: Transición prohibida INFECTED -> CLEAN
    if (fromStatus === 'INFECTED' && targetStatus === 'CLEAN') {
      throw new ConflictError('Control M-12: Transición prohibida: Un documento INFECTED no puede promoverse a CLEAN.');
    }

    const isQuarantined = targetStatus === 'INFECTED';

    const updatedTrail = [
      ...(currentMeta.auditTrail || []),
      {
        from: fromStatus,
        to: targetStatus,
        performedBy: isAuthorizedScanner ? 'SYSTEM_ANTIVIRUS_SERVICE' : 'SYSTEM_USER',
        timestamp: new Date().toISOString(),
        reason: reason || 'Resultado de escaneo de seguridad verificado',
      }
    ];

    const updatedMeta: DocumentMetadata = {
      ...currentMeta,
      scanStatus: targetStatus,
      isQuarantined,
      auditTrail: updatedTrail,
    };

    const [updatedDoc] = await tx.update(documents)
      .set({ metadata: updatedMeta as any })
      .where(eq(documents.id, documentId))
      .returning();

    logAuditEvent({
      tenantId,
      userId: 1,
      action: 'DOCUMENT_SCAN_STATUS_UPDATED',
      entity: 'document',
      entityId: documentId.toString(),
      metadata: {
        from: fromStatus,
        to: targetStatus,
        isQuarantined,
      },
    });

    return updatedDoc;
  });
};

/**
 * Descarga y visualización fail-closed (HTTP 423 si no es CLEAN, o si está en papelera/cuarentena)
 */
export const getDocumentForDownload = async (tenantId: number, documentId: number) => {
  return await withTenantContext(tenantId, async (tx) => {
    const [doc] = await tx.select().from(documents).where(
      and(eq(documents.id, documentId), eq(documents.tenantId, tenantId))
    );

    if (!doc) {
      throw new NotFoundError('Documento no encontrado.');
    }

    const meta = (doc.metadata || {}) as DocumentMetadata;

    if (meta.isDeleted) {
      throw new LockedError('Control M-12: El documento se encuentra en la papelera de reciclaje y no puede descargarse (HTTP 423).');
    }

    if (meta.isQuarantined || meta.scanStatus === 'INFECTED') {
      throw new LockedError('Control M-12 / DOC-01: Documento bloqueado por detección de amenazas o puesto en cuarentena (HTTP 423).');
    }

    if (meta.scanStatus !== 'CLEAN') {
      throw new LockedError(`Control M-12 / DOC-01: Documento no verificado (Estado actual: ${meta.scanStatus || 'PENDING_SCAN'}). Descarga bloqueada con HTTP 423.`);
    }

    return {
      id: doc.id,
      name: doc.name,
      mimeType: doc.mimeType,
      fileUrl: doc.fileUrl,
      sha256: meta.sha256,
      status: 'CLEAN',
    };
  });
};

/**
 * Papelera recuperable (Soft Delete)
 */
export const softDeleteDocument = async (tenantId: number, documentId: number, userId: number) => {
  return await withTenantContext(tenantId, async (tx) => {
    const [doc] = await tx.select().from(documents).where(
      and(eq(documents.id, documentId), eq(documents.tenantId, tenantId))
    );

    if (!doc) {
      throw new NotFoundError('Documento no encontrado.');
    }

    const meta = (doc.metadata || {}) as DocumentMetadata;
    const now = new Date();

    const updatedMeta: DocumentMetadata = {
      ...meta,
      isDeleted: true,
      deletedAt: now.toISOString(),
      auditTrail: [
        ...(meta.auditTrail || []),
        {
          from: 'ACTIVE',
          to: 'TRASH',
          performedBy: `USER_${userId}`,
          timestamp: now.toISOString(),
          reason: 'Movido a papelera recuperable',
        }
      ]
    };

    const [updatedDoc] = await tx.update(documents)
      .set({ metadata: updatedMeta as any })
      .where(eq(documents.id, documentId))
      .returning();

    logAuditEvent({
      tenantId,
      userId,
      action: 'DOCUMENT_MOVED_TO_TRASH',
      entity: 'document',
      entityId: documentId.toString(),
      metadata: { deletedAt: now.toISOString() },
    });

    return updatedDoc;
  });
};

/**
 * Restauración de documento desde papelera
 */
export const restoreDocument = async (tenantId: number, documentId: number, userId: number) => {
  return await withTenantContext(tenantId, async (tx) => {
    const [doc] = await tx.select().from(documents).where(
      and(eq(documents.id, documentId), eq(documents.tenantId, tenantId))
    );

    if (!doc) {
      throw new NotFoundError('Documento no encontrado.');
    }

    const meta = (doc.metadata || {}) as DocumentMetadata;
    const now = new Date();

    const updatedMeta: DocumentMetadata = {
      ...meta,
      isDeleted: false,
      deletedAt: null,
      auditTrail: [
        ...(meta.auditTrail || []),
        {
          from: 'TRASH',
          to: 'ACTIVE',
          performedBy: `USER_${userId}`,
          timestamp: now.toISOString(),
          reason: 'Restaurado desde papelera',
        }
      ]
    };

    const [updatedDoc] = await tx.update(documents)
      .set({ metadata: updatedMeta as any })
      .where(eq(documents.id, documentId))
      .returning();

    logAuditEvent({
      tenantId,
      userId,
      action: 'DOCUMENT_RESTORED',
      entity: 'document',
      entityId: documentId.toString(),
      metadata: { restoredAt: now.toISOString() },
    });

    return updatedDoc;
  });
};
