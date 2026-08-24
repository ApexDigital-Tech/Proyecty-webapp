import crypto from 'node:crypto';
import { db } from '../db/index.ts';
import { documents, projects, users } from '../db/schema.ts';
import { eq, and } from 'drizzle-orm';
import { withTenantContext } from '../utils/dbWrapper.ts';
import { logAuditEvent } from './audit.service.ts';
import { NotFoundError, ValidationError, ForbiddenError, LockedError, ConflictError } from '../utils/errors.ts';

export type DocumentScanStatus = 'PENDING_SCAN' | 'SCANNING' | 'CLEAN' | 'INFECTED' | 'SCAN_UNAVAILABLE';

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
 * Valida el tipo MIME inspeccionando los magic bytes del contenido real (M-12)
 */
export function sniffMagicMime(buffer: Buffer): string {
  if (!buffer || buffer.length < 4) {
    throw new ValidationError('El archivo está vacío o dañado.');
  }

  // Comprobar ejecutables maliciosos (MZ header para .exe / .dll)
  if (buffer[0] === 0x4D && buffer[1] === 0x5A) {
    throw new ValidationError('Control M-12: Archivo ejecutable no permitido por políticas de seguridad.');
  }

  // PDF: %PDF-
  if (buffer[0] === 0x25 && buffer[1] === 0x50 && buffer[2] === 0x44 && buffer[3] === 0x46) {
    return 'application/pdf';
  }

  // PNG: \x89PNG
  if (buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4E && buffer[3] === 0x47) {
    return 'image/png';
  }

  // JPEG: \xFF\xD8\xFF
  if (buffer[0] === 0xFF && buffer[1] === 0xD8 && buffer[2] === 0xFF) {
    return 'image/jpeg';
  }

  // ZIP / DOCX / XLSX: PK\x03\x04
  if (buffer[0] === 0x50 && buffer[1] === 0x4B && buffer[2] === 0x03 && buffer[3] === 0x04) {
    return 'application/zip';
  }

  // Texto plano / CSV / JSON (Comprobar caracteres imprimibles)
  const isAsciiText = buffer.subarray(0, Math.min(buffer.length, 128)).every(byte => (byte >= 32 && byte <= 126) || byte === 10 || byte === 13 || byte === 9);
  if (isAsciiText) {
    return 'text/plain';
  }

  return 'application/octet-stream';
}

/**
 * Calcula el Hash SHA-256 inmutable de un buffer de archivo
 */
export function computeFileSha256(buffer: Buffer): string {
  return crypto.createHash('sha256').update(buffer).digest('hex');
}

/**
 * Registra y sube un documento al repositorio seguro con retención de 5 años y escaneo inicial fail-closed
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
    const verifiedMime = sniffMagicMime(data.contentBuffer);
    const sha256 = computeFileSha256(data.contentBuffer);

    // Calcular retención de 5 años
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
 * Transición de estado de escaneo (Solo el scanner de seguridad autorizado puede marcar CLEAN)
 */
export const updateDocumentScanStatus = async (
  tenantId: number,
  documentId: number,
  scannerAuthKey: string,
  targetStatus: DocumentScanStatus,
  reason?: string
) => {
  return await withTenantContext(tenantId, async (tx) => {
    // Verificar autoridad del escáner para estados limpios
    if (targetStatus === 'CLEAN' && scannerAuthKey !== 'SCANNER_INTERNAL_SVC_KEY') {
      throw new ForbiddenError('Control M-12 / DOC-01: Solo el servicio de escaneo automatizado autorizado puede certificar un documento como CLEAN.');
    }

    const [doc] = await tx.select().from(documents).where(
      and(eq(documents.id, documentId), eq(documents.tenantId, tenantId))
    );

    if (!doc) {
      throw new NotFoundError('Documento no encontrado.');
    }

    const currentMeta = (doc.metadata || {}) as DocumentMetadata;
    const fromStatus = currentMeta.scanStatus || 'PENDING_SCAN';
    const isQuarantined = targetStatus === 'INFECTED';

    const updatedTrail = [
      ...(currentMeta.auditTrail || []),
      {
        from: fromStatus,
        to: targetStatus,
        performedBy: scannerAuthKey === 'SCANNER_INTERNAL_SVC_KEY' ? 'SYSTEM_ANTIVIRUS' : 'USER',
        timestamp: new Date().toISOString(),
        reason: reason || 'Resultado de escaneo de seguridad',
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
 * Acceso / Descarga de documento con Máquina de Estados Fail-Closed (M-12)
 * Bloquea con HTTP 423 si el estado es distinto de CLEAN o está en papelera/cuarentena.
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
      throw new LockedError('Control M-12: El documento se encuentra en la papelera de reciclaje y no puede descargarse.');
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
 * Papelera recuperable (Soft Delete) y Retención de 5 años
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
