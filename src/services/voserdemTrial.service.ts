import crypto from 'node:crypto';
import { db } from '../db/index.ts';
import {
  organizations,
  roles,
  users,
  donors,
  projects,
  agreements,
  budgetVersions,
  budgetLines,
  tasks,
  documents,
  auditLogs,
} from '../db/schema.ts';
import { eq, and, sql } from 'drizzle-orm';
import { updateDocumentScanStatus, SCANNER_INTERNAL_SVC_SECRET } from './documents.service.ts';

export const VOSERDEM_ORG_NAME = 'ORG-TRIAL-VOSERDEM';
export const VOSERDEM_DIRECTOR_EMAIL = 'mirosromeroc@gmail.com';
export const VOSERDEM_EXPIRATION_DATE = new Date('2026-09-24T23:59:59Z');

export async function setupVoserdemTrialTenant(): Promise<{
  orgId: number;
  user: { id: number; email: string; name: string; role: string; tenantId: number };
  projectId: number;
}> {
  console.log('[VOSERDEM Service] Configurando entorno privado de evaluación...');

  // 1. Get or create VOSERDEM Tenant
  let voserdemOrg = await db.select().from(organizations).where(eq(organizations.name, VOSERDEM_ORG_NAME)).limit(1);
  let orgId: number;

  if (voserdemOrg.length === 0) {
    const inserted = await db.insert(organizations).values({
      name: VOSERDEM_ORG_NAME,
      subscriptionPlan: 'TRIAL_PRIVATE',
      isActive: true,
      subscriptionStatus: 'trial',
      renewsAt: VOSERDEM_EXPIRATION_DATE,
    }).returning();
    orgId = inserted[0].id;
  } else {
    orgId = voserdemOrg[0].id;
    // Ensure expiration and trial plan are up to date
    await db.update(organizations).set({
      subscriptionPlan: 'TRIAL_PRIVATE',
      subscriptionStatus: 'trial',
      renewsAt: VOSERDEM_EXPIRATION_DATE,
      isActive: true,
    }).where(eq(organizations.id, orgId));
  }

  // 2. Fetch DIRECTOR role
  const dbRoles = await db.select().from(roles);
  const directorRole = dbRoles.find(r => r.name.toUpperCase() === 'DIRECTOR') || dbRoles[0];

  // 3. Pre-register / Link Miroslava Romero
  const normalizedEmail = VOSERDEM_DIRECTOR_EMAIL.toLowerCase().trim();
  const existingUser = await db.select().from(users).where(eq(users.email, normalizedEmail)).limit(1);

  let userId: number;
  if (existingUser.length > 0) {
    userId = existingUser[0].id;
    await db.update(users).set({
      tenantId: orgId,
      name: 'Miroslava Romero',
      roleId: directorRole.id,
      isActive: true,
    }).where(eq(users.id, userId));
  } else {
    const insertedUser = await db.insert(users).values({
      tenantId: orgId,
      uid: 'preauth-google-mirosromeroc-voserdem',
      email: normalizedEmail,
      name: 'Miroslava Romero',
      roleId: directorRole.id,
      avatarUrl: `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent('Miroslava Romero')}`,
      isActive: true,
    }).returning();
    userId = insertedUser[0].id;
  }

  // 4. Check or Create Introductory Example Project
  const existingProject = await db.select().from(projects).where(and(eq(projects.tenantId, orgId), eq(projects.code, 'PRJ-VOS-EJEMPLO'))).limit(1);
  let projectId: number;

  if (existingProject.length === 0) {
    // 4.1 Donor
    const [donor] = await db.insert(donors).values({
      tenantId: orgId,
      name: 'Agencia de Cooperación Internacional (Demostrativo)',
      type: 'Internacional',
      contactEmail: 'cooperacion.ejemplo@voserdem.org',
    }).returning();

    // 4.2 Project: Physical 80%, Financial 0% (Clean starting state)
    const [prj] = await db.insert(projects).values({
      tenantId: orgId,
      code: 'PRJ-VOS-EJEMPLO',
      name: '[EJEMPLO] Fortalecimiento Institucional y Apoyo Comunitario VOSERDEM',
      donorId: donor.id,
      status: 'EJECUCIÓN',
      riskLevel: 'Bajo',
      approvedBudget: 45000.0,
      physicalProgress: 80,
      financialProgress: 0,
      nextMilestoneDate: '2026-09-10',
      nextMilestoneTitle: 'Presentación de Informe Diagnóstico',
      score: 100,
      description: 'Proyecto introductorio de ejemplo para VOSERDEM. Los cálculos de avance físico (80%) y financiero (0%) son reproducibles y transparentes.',
    }).returning();
    projectId = prj.id;

    // 4.3 Agreement
    await db.insert(agreements).values({
      projectId,
      counterparty: 'Agencia de Cooperación Internacional (Demostrativo)',
      signedDate: new Date('2026-01-15'),
      amount: 45000.0,
      currency: 'USD',
      durationMonths: 12,
      startDate: new Date('2026-01-15'),
      endDate: new Date('2027-01-15'),
      status: 'Activo',
    });

    // 4.4 Budget Version & Budget Lines
    const [bVersion] = await db.insert(budgetVersions).values({
      projectId,
      versionName: 'V1 - Inicial',
      isApproved: true,
    }).returning();

    await db.insert(budgetLines).values([
      {
        projectId,
        budgetVersionId: bVersion.id,
        code: '1.1',
        category: 'Capacitación y Asistencia',
        subcategory: 'Talleres de Capacitación y Asistencia Técnica',
        approvedAmount: 18000.0,
        reformulatedAmount: 18000.0,
        executedAmount: 0.0,
        balance: 18000.0,
        progress: 0,
      },
      {
        projectId,
        budgetVersionId: bVersion.id,
        code: '1.2',
        category: 'Equipamiento',
        subcategory: 'Equipamiento e Infraestructura Comunitaria',
        approvedAmount: 20000.0,
        reformulatedAmount: 20000.0,
        executedAmount: 0.0,
        balance: 20000.0,
        progress: 0,
      },
      {
        projectId,
        budgetVersionId: bVersion.id,
        code: '1.3',
        category: 'Monitoreo y Auditoría',
        subcategory: 'Monitoreo, Auditoría y Reportes',
        approvedAmount: 7000.0,
        reformulatedAmount: 7000.0,
        executedAmount: 0.0,
        balance: 7000.0,
        progress: 0,
      },
    ]);

    // 4.5 Tasks (Weight 60 @ 100%, Weight 40 @ 50% => Weighted Progress = 80.0%)
    await db.insert(tasks).values([
      {
        tenantId: orgId,
        projectId,
        title: 'Diagnóstico Situacional y Línea de Base',
        description: 'Levantamiento de información y diagnóstico participativo en campo.',
        weight: 60,
        progress: 100,
        status: 'DONE',
        priority: 'HIGH',
        startDate: new Date('2026-02-01'),
        dueDate: new Date('2026-04-30'),
        assigneeId: userId,
        createdBy: userId,
      },
      {
        tenantId: orgId,
        projectId,
        title: 'Capacitación Técnica y Entrega de Insumos',
        description: 'Desarrollo de módulos técnicos y fortalecimiento de capacidades.',
        weight: 40,
        progress: 50,
        status: 'IN_PROGRESS',
        priority: 'MEDIUM',
        startDate: new Date('2026-05-01'),
        dueDate: new Date('2026-09-30'),
        assigneeId: userId,
        createdBy: userId,
      },
    ]);

    // 4.6 Fictitious PDF Document flowing through security state machine
    const dummyPdfContent = Buffer.from(
      '%PDF-1.4\n1 0 obj\n<< /Title (Guia de Evaluacion VOSERDEM) >>\nendobj\ntrailer\n<< /Root 1 0 R >>\n%%EOF'
    );
    const pdfSha256 = crypto.createHash('sha256').update(dummyPdfContent).digest('hex');

    const [doc] = await db.insert(documents).values({
      projectId,
      tenantId: orgId,
      name: 'Guia_Evaluacion_VOSERDEM.pdf',
      originalName: 'Guia_Evaluacion_VOSERDEM.pdf',
      mimeType: 'application/pdf',
      size: '10 KB',
      type: 'Guía Metodológica',
      uploadDate: new Date().toISOString().split('T')[0],
      uploadedBy: userId,
      metadata: {
        sha256: pdfSha256,
        magicMime: 'application/pdf',
        scanStatus: 'PENDING_SCAN',
        isQuarantined: false,
        isDeleted: false,
        retentionUntil: new Date(Date.now() + 5 * 365 * 24 * 60 * 60 * 1000).toISOString(),
        auditTrail: [
          {
            from: 'NONE',
            to: 'PENDING_SCAN',
            performedBy: 'SYSTEM_SEED',
            timestamp: new Date().toISOString(),
            reason: 'Carga inicial de documento demostrativo',
          },
        ],
      },
    }).returning();

    // Promote through SCANNING -> CLEAN via authenticated scanner service logic
    await updateDocumentScanStatus(orgId, doc.id, SCANNER_INTERNAL_SVC_SECRET, 'SCANNING', 'Iniciando escaneo antivirus automatizado');
    await updateDocumentScanStatus(orgId, doc.id, SCANNER_INTERNAL_SVC_SECRET, 'CLEAN', 'Escaneo antivirus finalizado sin amenazas');

    console.log(`[VOSERDEM Service] Documento ID ${doc.id} escaneado y promovido a CLEAN.`);
  } else {
    projectId = existingProject[0].id;

    // Ensure tasks exist for this project
    const existingTasks = await db.select().from(tasks).where(eq(tasks.projectId, projectId));
    if (existingTasks.length === 0) {
      await db.insert(tasks).values([
        {
          tenantId: orgId,
          projectId,
          title: 'Diagnóstico Situacional y Línea de Base',
          description: 'Levantamiento de información y diagnóstico participativo en campo.',
          weight: 60,
          progress: 100,
          status: 'DONE',
          priority: 'HIGH',
          startDate: new Date('2026-02-01'),
          dueDate: new Date('2026-04-30'),
          assigneeId: userId,
          createdBy: userId,
        },
        {
          tenantId: orgId,
          projectId,
          title: 'Capacitación Técnica y Entrega de Insumos',
          description: 'Desarrollo de módulos técnicos y fortalecimiento de capacidades.',
          weight: 40,
          progress: 50,
          status: 'IN_PROGRESS',
          priority: 'MEDIUM',
          startDate: new Date('2026-05-01'),
          dueDate: new Date('2026-09-30'),
          assigneeId: userId,
          createdBy: userId,
        },
      ]);
    }

    // Ensure clean document exists for this project
    const existingDocs = await db.select().from(documents).where(eq(documents.projectId, projectId));
    if (existingDocs.length === 0) {
      const dummyPdfContent = Buffer.from(
        '%PDF-1.4\n1 0 obj\n<< /Title (Guia de Evaluacion VOSERDEM) >>\nendobj\ntrailer\n<< /Root 1 0 R >>\n%%EOF'
      );
      const pdfSha256 = crypto.createHash('sha256').update(dummyPdfContent).digest('hex');

      const [doc] = await db.insert(documents).values({
        projectId,
        tenantId: orgId,
        name: 'Guia_Evaluacion_VOSERDEM.pdf',
        originalName: 'Guia_Evaluacion_VOSERDEM.pdf',
        mimeType: 'application/pdf',
        size: '10 KB',
        type: 'Guía Metodológica',
        uploadDate: new Date().toISOString().split('T')[0],
        uploadedBy: userId,
        metadata: {
          sha256: pdfSha256,
          magicMime: 'application/pdf',
          scanStatus: 'PENDING_SCAN',
          isQuarantined: false,
          isDeleted: false,
          retentionUntil: new Date(Date.now() + 5 * 365 * 24 * 60 * 60 * 1000).toISOString(),
          auditTrail: [
            {
              from: 'NONE',
              to: 'PENDING_SCAN',
              performedBy: 'SYSTEM_SEED',
              timestamp: new Date().toISOString(),
              reason: 'Carga inicial de documento demostrativo',
            },
          ],
        },
      }).returning();

      await updateDocumentScanStatus(orgId, doc.id, SCANNER_INTERNAL_SVC_SECRET, 'SCANNING', 'Iniciando escaneo antivirus automatizado');
      await updateDocumentScanStatus(orgId, doc.id, SCANNER_INTERNAL_SVC_SECRET, 'CLEAN', 'Escaneo antivirus finalizado sin amenazas');
    }
  }

  console.log(`[VOSERDEM Service] Tenant VOSERDEM listo. Org ID: ${orgId}, User ID: ${userId}, Project ID: ${projectId}`);

  return {
    orgId,
    user: {
      id: userId,
      email: normalizedEmail,
      name: 'Miroslava Romero',
      role: 'DIRECTOR',
      tenantId: orgId,
    },
    projectId,
  };
}
