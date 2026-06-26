import 'dotenv/config';
import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { createServer as createViteServer } from 'vite';
import { GoogleGenAI } from '@google/genai';
import { db } from './src/db/index.ts';
import { seedDatabase } from './src/db/seed.ts';
import { requireAuth, AuthRequest } from './src/middleware/auth.ts';
import { logActivity } from './src/db/audit.ts';
import multer from 'multer';
import { createClient } from '@supabase/supabase-js';
import {
  projects,
  agreements,
  disbursements,
  clauses,
  budgetLines,
  receiptsVouchers,
  documents,
  auditLogs,
  users,
  roles,
  donors,
  budgetVersions,
} from './src/db/schema.ts';
import { eq, desc, and, inArray, ilike, sql } from 'drizzle-orm';

// Helper for cross-tenant validation
async function verifyProjectTenant(projectId: number, tenantId: number): Promise<boolean> {
  const result = await db.select({ id: projects.id })
    .from(projects)
    .where(and(eq(projects.id, projectId), eq(projects.tenantId, tenantId)))
    .limit(1);
  return result.length > 0;
}

const app = express();
const PORT = 3000;

app.use(express.json());

// Lazy-initialize Gemini AI client to prevent crash on startup if missing key
let aiClient: GoogleGenAI | null = null;
function getGeminiClient(): GoogleGenAI | null {
  if (!aiClient) {
    const key = process.env.GEMINI_API_KEY;
    if (key && key !== 'MY_GEMINI_API_KEY' && key.trim() !== '' && !key.includes('YOUR_')) {
      aiClient = new GoogleGenAI({
        apiKey: key,
        httpOptions: {
          headers: {
            'User-Agent': 'aistudio-build',
          },
        },
      });
    }
  }
  return aiClient;
}

// Initialize Supabase Client (Sync)
const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || 'https://kwmvuuwinufksjjfsuls.supabase.co';
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY || 'sb_publishable_zUPQ-kH3piQQoHvMu4tuIQ_ui7f-OUr';
const supabase = createClient(supabaseUrl, supabaseKey);

// Initialize Multer with 5MB limit and defensive parsing (Sync)
const upload = multer({ 
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 } 
});

// Ensure database is seeded on startup (Async IIFE)
(async function init() {
  try {
    // Ensure Buckets exist
    const ensureBucket = async (bucketName: string) => {
      const { data: buckets } = await supabase.storage.listBuckets();
      if (!buckets?.find((b: any) => b.name === bucketName)) {
        await supabase.storage.createBucket(bucketName, { public: true });
      }
    };
    await ensureBucket('vouchers');
    await ensureBucket('documents');

    console.log('🔄 Sincronizando base de datos local...');
    await seedDatabase();
    console.log('Database verification and optional seeding complete.');
  } catch (err) {
    console.error('Error during database seed checks:', err);
  }
})();

// ==========================================
// 1. PROJECTS ENDPOINTS
// ==========================================

// List all projects with simplified aggregated budget and progress
app.get('/api/projects', requireAuth, async (req: AuthRequest, res) => {
  try {
    const { page = '1', limit = '10', search, status, donorId, riskLevel } = req.query;
    const offset = (parseInt(page as string) - 1) * parseInt(limit as string);
    const limitNum = parseInt(limit as string);

    let conditions = [eq(projects.tenantId, req.user!.tenantId)];
    
    if (status) conditions.push(eq(projects.status, status as string));
    if (donorId) conditions.push(eq(projects.donorId, parseInt(donorId as string)));
    if (riskLevel) conditions.push(eq(projects.riskLevel, riskLevel as string));
    if (search) conditions.push(ilike(projects.name, `%${search}%`));

    const rawProjects = await db.select({
      project: projects,
      donorName: donors.name
    }).from(projects)
      .leftJoin(donors, eq(projects.donorId, donors.id))
      .where(and(...conditions))
      .orderBy(desc(projects.createdAt))
      .limit(limitNum)
      .offset(offset);

    const allProjects = rawProjects.map(r => ({
      ...r.project,
      donor: r.donorName
    }));

    const totalCountRes = await db.select({ count: sql`count(*)` }).from(projects).where(and(...conditions));
    const totalItems = Number(totalCountRes[0].count);

    res.json({
      data: allProjects,
      pagination: {
        totalItems,
        currentPage: parseInt(page as string),
        totalPages: Math.ceil(totalItems / limitNum),
        limit: limitNum
      }
    });
  } catch (err: any) {
    console.error('Error listing projects:', err);
    res.status(500).json({ error: 'Error al obtener la lista de proyectos' });
  }
});

// Create a new project (DIRECTOR or MANAGER required)
app.post('/api/projects', requireAuth, async (req: AuthRequest, res) => {
  try {
    const { role, name: userName } = req.user!;
    if (role !== 'DIRECTOR' && role !== 'MANAGER') {
      return res.status(403).json({ error: 'Permisos insuficientes. Se requiere rol de Director o Manager.' });
    }

    const { code, name, donor, approvedBudget, physicalProgress, financialProgress, nextMilestoneDate, nextMilestoneTitle, score, description } = req.body;

    if (!code || !name || !donor || !approvedBudget) {
      return res.status(400).json({ error: 'Los campos Código, Nombre, Donante y Presupuesto son requeridos.' });
    }

    try {
      const createdProject = await db.transaction(async (tx) => {
        let finalDonorId: number | null = null;
        if (donor) {
          const existingDonor = await tx.select().from(donors).where(and(eq(donors.name, donor), eq(donors.tenantId, req.user!.tenantId))).limit(1);
          if (existingDonor.length > 0) {
            finalDonorId = existingDonor[0].id;
          } else {
            const newDonor = await tx.insert(donors).values({
              tenantId: req.user!.tenantId,
              name: donor,
              type: 'Externo',
            }).returning();
            finalDonorId = newDonor[0].id;
          }
        }

        const newProject = await tx.insert(projects).values({
          tenantId: req.user!.tenantId,
          code,
          name,
          donorId: finalDonorId,
          status: 'PLANIFICACIÓN',
          riskLevel: 'Bajo',
          approvedBudget: parseFloat(approvedBudget),
          physicalProgress: physicalProgress ? parseInt(physicalProgress) : 0,
          financialProgress: financialProgress ? parseInt(financialProgress) : 0,
          nextMilestoneDate: nextMilestoneDate || 'Por definir',
          nextMilestoneTitle: nextMilestoneTitle || 'Inicio de proyecto',
          score: score ? parseInt(score) : 100,
          description: description || '',
        }).returning();

        const cp = newProject[0];

        // Create default budget version
        const newBudgetVersion = await tx.insert(budgetVersions).values({
          projectId: cp.id,
          versionName: 'V1 - Inicial',
          isApproved: true,
        }).returning();
        const budgetVersionId = newBudgetVersion[0].id;

        await tx.insert(budgetLines).values({
          projectId: cp.id,
          budgetVersionId: budgetVersionId,
          code: '1000',
          category: 'Operación General',
          subcategory: 'Gasto Administrativo Inicial',
          approvedAmount: cp.approvedBudget,
          reformulatedAmount: cp.approvedBudget,
          executedAmount: 0,
          balance: cp.approvedBudget,
          progress: 0,
          status: 'NORMAL'
        });

        // Auto-create a basic Agreement placeholder
        await tx.insert(agreements).values({
          projectId: cp.id,
          counterparty: String(donor),
          signedDate: new Date(),
          amount: cp.approvedBudget,
          durationMonths: 12,
          startDate: new Date(),
          endDate: new Date(new Date().setFullYear(new Date().getFullYear() + 1)),
          remainingDays: 365,
          status: 'Activo'
        });

        return cp;
      });

      await logActivity(createdProject.id, userName, `Creó el proyecto "${name}" (Código: ${code}) con un presupuesto aprobado de $${approvedBudget.toLocaleString()}`);

      res.status(201).json(createdProject);
    } catch (txErr: any) {
      console.error('Project creation transaction failed:', txErr);
      throw txErr; // Forward to the outer catch block
    }
  } catch (err: any) {
    console.error('Error creating project:', err);
    if (err.message?.includes('projects_code_unique')) {
      return res.status(400).json({ error: 'Ya existe un proyecto con este código.' });
    }
    res.status(500).json({ error: 'Error al registrar el proyecto en la base de datos' });
  }
});

// Dashboard metrics
app.get('/api/dashboard/metrics', requireAuth, async (req: AuthRequest, res) => {
  try {
    const tenantId = req.user!.tenantId;
    const { donorId, status } = req.query;

    let conditions = [eq(projects.tenantId, tenantId)];
    if (donorId) conditions.push(eq(projects.donorId, parseInt(donorId as string)));
    if (status) conditions.push(eq(projects.status, status as string));

    const projectsList = await db.select().from(projects).where(and(...conditions));

    let totalBudget = 0;
    let totalPhysical = 0;
    let totalFinancial = 0;
    let totalScore = 0;
    let highRiskProjectsCount = 0;
    let highRiskProjectsDetails = [];
    
    const statusDistribution = {
      'ACTIVO': 0,
      'EJECUCIÓN': 0,
      'PLANIFICACIÓN': 0
    };

    for (const p of projectsList) {
      totalBudget += p.approvedBudget;
      totalPhysical += p.physicalProgress;
      totalFinancial += p.financialProgress;
      totalScore += p.score;
      
      if (p.status in statusDistribution) {
        statusDistribution[p.status as keyof typeof statusDistribution]++;
      }

      const hasRiskGap = (p.physicalProgress - p.financialProgress > 15);
      if (p.riskLevel === 'Alto' || hasRiskGap) {
        highRiskProjectsCount++;
        highRiskProjectsDetails.push({
          id: p.id,
          code: p.code,
          name: p.name,
          riskLevel: p.riskLevel,
          physicalProgress: p.physicalProgress,
          financialProgress: p.financialProgress
        });
      }
    }

    const count = projectsList.length;
    const avgPhysical = count > 0 ? Math.round(totalPhysical / count) : 0;
    const avgFinancial = count > 0 ? Math.round(totalFinancial / count) : 0;
    const avgScore = count > 0 ? Math.round(totalScore / count) : 0;

    const projectIds = projectsList.map(p => p.id);
    let pendingDisbursementsCount = 0;
    let pendingDisbursementsAmount = 0;

    if (projectIds.length > 0) {
      const agrs = await db.select({ id: agreements.id }).from(agreements).where(inArray(agreements.projectId, projectIds));
      const agrIds = agrs.map(a => a.id);
      if (agrIds.length > 0) {
        const pendingDisbs = await db.select().from(disbursements)
          .where(and(inArray(disbursements.agreementId, agrIds), eq(disbursements.status, 'PENDIENTE')));
        pendingDisbursementsCount = pendingDisbs.length;
        pendingDisbursementsAmount = pendingDisbs.reduce((acc, d) => acc + d.amount, 0);
      }
    }

    res.json({
      totalBudget,
      avgPhysical,
      avgFinancial,
      avgScore,
      highRiskProjectsCount,
      highRiskProjectsDetails,
      statusDistribution,
      pendingDisbursementsCount,
      pendingDisbursementsAmount,
      projectsList
    });

  } catch (err) {
    console.error('Error fetching dashboard metrics:', err);
    res.status(500).json({ error: 'Failed to fetch dashboard metrics' });
  }
});

// Detailed view of a project with all aggregate relations
app.get('/api/projects/:id', requireAuth, async (req: AuthRequest, res) => {
  try {
    const projectId = parseInt(req.params.id);
    if (isNaN(projectId)) {
      return res.status(400).json({ error: 'ID de proyecto inválido' });
    }

    const projectResult = await db.select({
      project: projects,
      donorName: donors.name
    }).from(projects)
      .leftJoin(donors, eq(projects.donorId, donors.id))
      .where(and(eq(projects.id, projectId), eq(projects.tenantId, req.user!.tenantId)));
      
    if (projectResult.length === 0) {
      return res.status(404).json({ error: 'Proyecto no encontrado' });
    }

    const project = {
      ...projectResult[0].project,
      donor: projectResult[0].donorName
    };

    // Fetch relational datasets
    const projectAgreements = await db.select().from(agreements).where(eq(agreements.projectId, projectId));
    const projectBudgetItems = await db.select().from(budgetLines).where(eq(budgetLines.projectId, projectId));
    const projectDocuments = await db.select().from(documents).where(eq(documents.projectId, projectId));
    const projectVouchers = await db.select().from(receiptsVouchers).where(eq(receiptsVouchers.projectId, projectId));
    const projectLogs = await db.select().from(auditLogs).where(and(eq(auditLogs.entityId, projectId), eq(auditLogs.entityType, 'Project'))).orderBy(desc(auditLogs.createdAt));

    // For agreements, fetch disbursements & clauses
    const enrichedAgreements = [];
    for (const ag of projectAgreements) {
      const dbDisbursements = await db.select().from(disbursements).where(eq(disbursements.agreementId, ag.id));
      const dbClauses = await db.select().from(clauses).where(eq(clauses.agreementId, ag.id));
      enrichedAgreements.push({
        ...ag,
        disbursements: dbDisbursements,
        clauses: dbClauses
      });
    }

    res.json({
      ...project,
      agreements: enrichedAgreements,
      budgetLines: projectBudgetItems,
      documents: projectDocuments,
      receiptsVouchers: projectVouchers,
      auditLogs: projectLogs
    });
  } catch (err: any) {
    console.error('Error fetching project detail:', err);
    res.status(500).json({ error: 'Error al cargar el detalle del proyecto' });
  }
});

// Update project status/progress (RBAC: DIRECTOR/MANAGER)
app.patch('/api/projects/:id', requireAuth, async (req: AuthRequest, res) => {
  try {
    const { role, name: userName } = req.user!;
    if (role !== 'DIRECTOR' && role !== 'MANAGER') {
      return res.status(403).json({ error: 'Permisos insuficientes. Requiere rol de Director o Manager.' });
    }

    const projectId = parseInt(req.params.id);
    const { physicalProgress, financialProgress, status, riskLevel, nextMilestoneDate, nextMilestoneTitle, score } = req.body;

    const currentProject = await db.select().from(projects).where(and(eq(projects.id, projectId), eq(projects.tenantId, req.user!.tenantId)));
    if (currentProject.length === 0) {
      return res.status(404).json({ error: 'Proyecto no encontrado' });
    }

    const updatedData: any = {};
    const logChanges = [];

    if (physicalProgress !== undefined) {
      updatedData.physicalProgress = parseInt(physicalProgress);
      logChanges.push(`progreso físico a ${physicalProgress}%`);
    }
    if (financialProgress !== undefined) {
      updatedData.financialProgress = parseInt(financialProgress);
      logChanges.push(`progreso financiero a ${financialProgress}%`);
    }
    if (status) {
      updatedData.status = status;
      logChanges.push(`estado a ${status}`);
    }
    if (riskLevel) {
      updatedData.riskLevel = riskLevel;
      logChanges.push(`nivel de riesgo a ${riskLevel}`);
    }
    if (nextMilestoneDate) updatedData.nextMilestoneDate = nextMilestoneDate;
    if (nextMilestoneTitle) updatedData.nextMilestoneTitle = nextMilestoneTitle;
    if (score !== undefined) updatedData.score = parseInt(score);

    const updatedProject = await db.update(projects)
      .set(updatedData)
      .where(and(eq(projects.id, projectId), eq(projects.tenantId, req.user!.tenantId)))
      .returning();

    if (logChanges.length > 0) {
      await logActivity(projectId, userName, `Actualizó el proyecto "${currentProject[0].name}": modificó ${logChanges.join(', ')}`);
    }

    res.json(updatedProject[0]);
  } catch (err: any) {
    console.error('Error patching project:', err);
    res.status(500).json({ error: 'Error al actualizar el progreso del proyecto' });
  }
});

// Delete project (DIRECTOR only)
app.delete('/api/projects/:id', requireAuth, async (req: AuthRequest, res) => {
  try {
    const { role, name: userName } = req.user!;
    if (role !== 'DIRECTOR') {
      return res.status(403).json({ error: 'No autorizado. Eliminar proyectos es una acción exclusiva del Director Operativo.' });
    }

    const projectId = parseInt(req.params.id);
    const currentProject = await db.select().from(projects).where(and(eq(projects.id, projectId), eq(projects.tenantId, req.user!.tenantId)));
    if (currentProject.length === 0) {
      return res.status(404).json({ error: 'Proyecto no encontrado' });
    }

    await db.delete(projects).where(and(eq(projects.id, projectId), eq(projects.tenantId, req.user!.tenantId)));
    await logActivity(null, userName, `Eliminó permanentemente el proyecto "${currentProject[0].name}" de la plataforma`);

    res.json({ success: true, message: 'Proyecto eliminado con éxito' });
  } catch (err: any) {
    console.error('Error deleting project:', err);
    res.status(500).json({ error: 'Error al eliminar el proyecto de la base de datos' });
  }
});

// ==========================================
// 2. AGREEMENTS (CONVENIOS) ENDPOINTS
// ==========================================

// Create an agreement
app.post('/api/projects/:projectId/agreements', requireAuth, async (req: AuthRequest, res) => {
  try {
    const projectId = parseInt(req.params.projectId);
    const { counterparty, signedDate, amount, durationMonths, startDate, endDate } = req.body;
    const { name: userName } = req.user!;

    if (!counterparty || !signedDate || !amount || !durationMonths) {
      return res.status(400).json({ error: 'Campos requeridos incompletos.' });
    }

    if (!(await verifyProjectTenant(projectId, req.user!.tenantId))) {
      return res.status(403).json({ error: 'Acceso denegado a este proyecto.' });
    }

    const newAgreement = await db.insert(agreements).values({
      projectId,
      counterparty,
      signedDate,
      amount: parseFloat(amount),
      durationMonths: parseInt(durationMonths),
      startDate: startDate || signedDate,
      endDate: endDate || 'Por definir',
      remainingDays: durationMonths * 30,
      status: 'Activo'
    }).returning();

    await logActivity(projectId, userName, `Registró un nuevo convenio con "${counterparty}" por un monto de $${parseFloat(amount).toLocaleString()}`);
    res.status(201).json(newAgreement[0]);
  } catch (err) {
    console.error('Error creating agreement:', err);
    res.status(500).json({ error: 'Error al registrar convenio.' });
  }
});

// Add key clause
app.post('/api/agreements/:id/clauses', requireAuth, async (req: AuthRequest, res) => {
  try {
    const agreementId = parseInt(req.params.id);
    const { title, description, priority, category } = req.body;
    const { name: userName } = req.user!;

    if (!title || !description || !priority || !category) {
      return res.status(400).json({ error: 'Información de cláusula incompleta.' });
    }

    // Tenant Check
    const agResult = await db.select().from(agreements).where(eq(agreements.id, agreementId));
    if (agResult.length === 0 || !(await verifyProjectTenant(agResult[0].projectId, req.user!.tenantId))) {
      return res.status(403).json({ error: 'Acceso denegado a este convenio.' });
    }

    const newClause = await db.insert(clauses).values({
      agreementId,
      title,
      description,
      priority,
      category
    }).returning();

    // Fetch project ID for audit trail
    if (agResult.length > 0) {
      await logActivity(agResult[0].projectId, userName, `Añadió la cláusula clave "${title}" al convenio con ${agResult[0].counterparty}`);
    }

    res.status(201).json(newClause[0]);
  } catch (err) {
    console.error('Error adding clause:', err);
    res.status(500).json({ error: 'Error al añadir cláusula' });
  }
});

// Add disbursement
app.post('/api/agreements/:id/disbursements', requireAuth, async (req: AuthRequest, res) => {
  try {
    const agreementId = parseInt(req.params.id);
    const { milestoneTitle, estimatedDate, amount, condition } = req.body;
    const { name: userName } = req.user!;

    if (!milestoneTitle || !estimatedDate || !amount) {
      return res.status(400).json({ error: 'Datos de desembolso incompletos.' });
    }

    const agResult = await db.select().from(agreements).where(eq(agreements.id, agreementId));
    if (agResult.length === 0 || !(await verifyProjectTenant(agResult[0].projectId, req.user!.tenantId))) {
      return res.status(403).json({ error: 'Acceso denegado a este convenio.' });
    }

    const newDisbursement = await db.insert(disbursements).values({
      agreementId,
      milestoneTitle,
      estimatedDate,
      amount: parseFloat(amount),
      condition: condition || 'Sin condiciones',
      status: 'PENDIENTE'
    }).returning();

    if (agResult.length > 0) {
      await logActivity(agResult[0].projectId, userName, `Agregó desembolso programado de $${parseFloat(amount).toLocaleString()} ("${milestoneTitle}")`);
    }

    res.status(201).json(newDisbursement[0]);
  } catch (err) {
    console.error('Error adding disbursement:', err);
    res.status(500).json({ error: 'Error al agendar desembolso' });
  }
});

// Update disbursement status (PAGADO, atrasado, etc)
app.patch('/api/disbursements/:id', requireAuth, async (req: AuthRequest, res) => {
  try {
    const disbursementId = parseInt(req.params.id);
    const { status } = req.body;
    const { name: userName } = req.user!;

    const dbDisb = await db.select().from(disbursements).where(eq(disbursements.id, disbursementId));
    if (dbDisb.length === 0) {
      return res.status(404).json({ error: 'Desembolso no encontrado' });
    }

    const agResult = await db.select().from(agreements).where(eq(agreements.id, dbDisb[0].agreementId));
    if (agResult.length === 0 || !(await verifyProjectTenant(agResult[0].projectId, req.user!.tenantId))) {
      return res.status(403).json({ error: 'Acceso denegado.' });
    }

    const updated = await db.update(disbursements)
      .set({ status })
      .where(eq(disbursements.id, disbursementId))
      .returning();

    if (agResult.length > 0) {
      await logActivity(agResult[0].projectId, userName, `Cambió el estado del desembolso "${dbDisb[0].milestoneTitle}" a ${status}`);
    }

    res.json(updated[0]);
  } catch (err) {
    console.error('Error updating disbursement:', err);
    res.status(500).json({ error: 'Error al actualizar estado del desembolso' });
  }
});

// ==========================================
// 3. BUDGET ITEMS ENDPOINTS
// ==========================================

// Add a new budget line item
app.post('/api/projects/:projectId/budget-items', requireAuth, async (req: AuthRequest, res) => {
  try {
    const projectId = parseInt(req.params.projectId);
    const { code, category, subcategory, approved } = req.body;
    const { name: userName } = req.user!;

    if (!code || !category || !subcategory || approved === undefined) {
      return res.status(400).json({ error: 'Datos de partida presupuestaria incompletos.' });
    }

    if (!(await verifyProjectTenant(projectId, req.user!.tenantId))) {
      return res.status(403).json({ error: 'Acceso denegado a este proyecto.' });
    }

    const approvedAmount = parseFloat(approved);

    const newItem = await db.insert(budgetLines).values({
      projectId,
      budgetVersionId: 1,
      code,
      category,
      subcategory,
      approvedAmount: parseFloat(approved),
      reformulatedAmount: parseFloat(approved),
      executedAmount: 0,
      balance: approvedAmount,
      progress: 0,
      status: 'NORMAL'
    }).returning();

    await logActivity(projectId, userName, `Creó la partida presupuestaria [${code}] - ${category} (${subcategory}) por $${approvedAmount.toLocaleString()}`);

    res.status(201).json(newItem[0]);
  } catch (err) {
    console.error('Error adding budget item:', err);
    res.status(500).json({ error: 'Error al añadir partida presupuestaria' });
  }
});

// Reformulate / update budget line item (RBAC: DIRECTOR or MANAGER)
app.patch('/api/budget-items/:id', requireAuth, async (req: AuthRequest, res) => {
  try {
    const { role, name: userName } = req.user!;
    if (role !== 'DIRECTOR' && role !== 'MANAGER') {
      return res.status(403).json({ error: 'Permisos insuficientes para reformular presupuestos.' });
    }

    const itemId = parseInt(req.params.id);
    const { reformulated } = req.body;

    const currentItem = await db.select().from(budgetLines).where(eq(budgetLines.id, itemId));
    if (currentItem.length === 0) {
      return res.status(404).json({ error: 'Partida presupuestaria no encontrada.' });
    }

    if (!(await verifyProjectTenant(currentItem[0].projectId, req.user!.tenantId))) {
      return res.status(403).json({ error: 'Acceso denegado a esta partida.' });
    }

    const refVal = parseFloat(reformulated);
    const newBalance = refVal - currentItem[0].executedAmount;
    const newProgress = refVal > 0 ? Math.round((currentItem[0].executedAmount / refVal) * 100) : 0;
    
    let status = 'NORMAL';
    if (newProgress >= 100) status = 'EXCEDIDO';
    else if (newProgress >= 90) status = 'EN LÍMITE';

    const updated = await db.update(budgetLines)
      .set({
        reformulatedAmount: refVal,
        balance: newBalance,
        progress: newProgress,
        status
      })
      .where(eq(budgetLines.id, itemId))
      .returning();

    await logActivity(currentItem[0].projectId, userName, `Reformuló la partida presupuestaria [${currentItem[0].code}]: ajustó asignación a $${refVal.toLocaleString()} (Nuevo saldo: $${newBalance.toLocaleString()})`);

    res.json(updated[0]);
  } catch (err) {
    console.error('Error patch budget item:', err);
    res.status(500).json({ error: 'Error al reformular partida presupuestaria.' });
  }
});

// ==========================================
// 4. VOUCHERS (COMPROBANTES) ENDPOINTS
// ==========================================

// Add compliance voucher (carga de comprobante con validación en caliente)
app.post('/api/projects/:projectId/receiptsVouchers', requireAuth, upload.single('file'), async (req: AuthRequest, res) => {
  try {
    const projectId = parseInt(req.params.projectId);
    const { budgetLineId, type, amount, currency, provider, issueDate, milestone, description } = req.body;
    const file = req.file;
    const { name: userName } = req.user!;

    if (!budgetLineId || !type || amount === undefined || !provider || !issueDate || !file) {
      return res.status(400).json({ error: 'Falta información requerida o el archivo del comprobante.' });
    }

    if (!(await verifyProjectTenant(projectId, req.user!.tenantId))) {
      return res.status(403).json({ error: 'Acceso denegado a este proyecto.' });
    }

    const voucherAmount = parseFloat(amount);

    // Fetch budget item to check balance
    const dbItemResult = await db.select().from(budgetLines).where(eq(budgetLines.id, parseInt(budgetLineId)));
    if (dbItemResult.length === 0) {
      return res.status(404).json({ error: 'Partida presupuestaria seleccionada no existe.' });
    }

    const item = dbItemResult[0];

    // AUTOMATED SYSTEM COMPLIANCE CHECK
    // If the voucher amount exceeds the available balance, warn the user, or let them register but mark budget item as EXCEDIDO.
    // Also, budget-items update logic:
    const newExecuted = item.executedAmount + voucherAmount;
    const newBalance = item.reformulatedAmount - newExecuted;
    const newProgress = item.reformulatedAmount > 0 ? Math.round((newExecuted / item.reformulatedAmount) * 100) : 0;
    
    let itemStatus = 'NORMAL';
    if (newProgress >= 100) itemStatus = 'EXCEDIDO';
    else if (newProgress >= 90) itemStatus = 'EN LÍMITE';

    // Insert voucher
    // Upload file to Supabase Storage
    const fileName = `${Date.now()}_${file.originalname.replace(/\s+/g, '_')}`;
    const { data: uploadData, error: uploadError } = await supabase.storage
      .from('vouchers')
      .upload(`${projectId}/${fileName}`, file.buffer, {
        contentType: file.mimetype,
      });

    if (uploadError) {
      console.error('Upload Error:', uploadError);
      return res.status(500).json({ error: 'Error al subir el archivo a Storage.' });
    }

    const { data: publicUrlData } = supabase.storage.from('vouchers').getPublicUrl(`${projectId}/${fileName}`);
    const fileUrl = publicUrlData.publicUrl;

    const newVoucher = await db.insert(receiptsVouchers).values({
      projectId,
      budgetLineId: parseInt(budgetLineId),
      type,
      amount: voucherAmount,
      currency: currency || 'USD',
      provider,
      issueDate: new Date(issueDate),
      milestone: milestone || null,
      description: description || null,
      fileName: file.originalname,
      fileUrl: fileUrl,
      isVerified: false, // verification is done by FINANCE/DIRECTOR
    }).returning();

    // Update budget item statistics
    await db.update(budgetLines)
      .set({
        executedAmount: newExecuted,
        balance: newBalance,
        progress: newProgress,
        status: itemStatus
      })
      .where(eq(budgetLines.id, item.id));

    // Calculate overall financial progress for the project
    const allItems = await db.select().from(budgetLines).where(eq(budgetLines.projectId, projectId));
    const totalApproved = allItems.reduce((acc, i) => acc + i.reformulatedAmount, 0);
    const totalExecuted = allItems.reduce((acc, i) => acc + i.executedAmount, 0);
    const overallProgress = totalApproved > 0 ? Math.round((totalExecuted / totalApproved) * 100) : 0;

    await db.update(projects)
      .set({ financialProgress: overallProgress })
      .where(and(eq(projects.id, projectId), eq(projects.tenantId, req.user!.tenantId)));

    await logActivity(
      projectId,
      userName,
      `Cargó comprobante "${fileName}" ($${voucherAmount.toLocaleString()} USD) en partida [${item.code}]. El progreso financiero del proyecto aumentó a ${overallProgress}%`
    );

    res.status(201).json({
      voucher: newVoucher[0],
      complianceAlert: voucherAmount > item.balance ? `ALERTA: El monto cargado ($${voucherAmount}) excede el saldo de la partida ($${item.balance}).` : null
    });
  } catch (err) {
    console.error('Error posting voucher:', err);
    res.status(500).json({ error: 'Error al registrar el comprobante de pago.' });
  }
});

// Verify voucher (RBAC: FINANCE or DIRECTOR required)
app.patch('/api/receiptsVouchers/:id/verify', requireAuth, async (req: AuthRequest, res) => {
  try {
    const { role, name: userName } = req.user!;
    if (role !== 'FINANCE' && role !== 'DIRECTOR') {
      return res.status(403).json({ error: 'Permisos insuficientes. Se requiere rol de Director o Ejecutivo de Finanzas para aprobar comprobantes.' });
    }

    const voucherId = parseInt(req.params.id);
    const { isVerified } = req.body;

    const currentVoucher = await db.select().from(receiptsVouchers).where(eq(receiptsVouchers.id, voucherId));
    if (currentVoucher.length === 0) {
      return res.status(404).json({ error: 'Comprobante no encontrado' });
    }

    if (!(await verifyProjectTenant(currentVoucher[0].projectId, req.user!.tenantId))) {
      return res.status(403).json({ error: 'Acceso denegado a este comprobante.' });
    }

    const updated = await db.update(receiptsVouchers)
      .set({ isVerified: !!isVerified })
      .where(eq(receiptsVouchers.id, voucherId))
      .returning();

    await logActivity(
      currentVoucher[0].projectId,
      userName,
      `${isVerified ? 'VERIFICÓ' : 'RECHAZÓ'} la validez del comprobante "${currentVoucher[0].fileName}" por valor de $${currentVoucher[0].amount.toLocaleString()}`
    );

    res.json(updated[0]);
  } catch (err) {
    console.error('Error verifying voucher:', err);
    res.status(500).json({ error: 'Error al actualizar la verificación del comprobante.' });
  }
});

// ==========================================
// 5. DIGITAL REPOSITORY DOCUMENTS
// ==========================================
app.post('/api/projects/:projectId/documents', requireAuth, upload.single('file'), async (req: AuthRequest, res) => {
  try {
    const projectId = parseInt(req.params.projectId);
    const file = req.file;
    const { name: userName, id: userId } = req.user!;

    if (!file) {
      return res.status(400).json({ error: 'Debe proporcionar un archivo.' });
    }

    if (!(await verifyProjectTenant(projectId, req.user!.tenantId))) {
      return res.status(403).json({ error: 'Acceso denegado a este proyecto.' });
    }

    const fileName = `${Date.now()}_${file.originalname.replace(/\s+/g, '_')}`;
    const { data: uploadData, error: uploadError } = await supabase.storage
      .from('documents')
      .upload(`${projectId}/${fileName}`, file.buffer, {
        contentType: file.mimetype,
      });

    if (uploadError) {
      console.error('Upload Error:', uploadError);
      return res.status(500).json({ error: 'Error al subir el documento a Storage.' });
    }

    const { data: publicUrlData } = supabase.storage.from('documents').getPublicUrl(`${projectId}/${fileName}`);
    const fileUrl = publicUrlData.publicUrl;

    const fileSizeKB = (file.size / 1024).toFixed(2) + ' KB';

    const newDoc = await db.insert(documents).values({
      projectId,
      uploadedBy: userId,
      name: file.originalname,
      size: fileSizeKB,
      type: file.mimetype,
      uploadDate: new Date().toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: '2-digit' }),
      fileUrl: fileUrl,
      metadata: { bucketPath: `${projectId}/${fileName}`, mimeType: file.mimetype, originalSize: file.size }
    }).returning();

    await logActivity(projectId, userName, `Subió el documento "${file.originalname}" (${fileSizeKB}) al repositorio digital.`);

    res.status(201).json(newDoc[0]);
  } catch (err) {
    console.error('Error posting document:', err);
    res.status(500).json({ error: 'Error al subir el archivo.' });
  }
});

// ==========================================
// 6. GEMINI REPORT ENDPOINT (INTELIGENCIA AI)
// ==========================================
app.post('/api/reports/generate', requireAuth, async (req: AuthRequest, res) => {
  try {
    const { projectId, reportType, focusArea } = req.body;
    const { name: userName } = req.user!;

    if (!projectId) {
      return res.status(400).json({ error: 'ID de proyecto requerido.' });
    }

    // Fetch full project context to supply as Gemini Grounding Data
    const projectResult = await db.select().from(projects).where(eq(projects.id, parseInt(projectId)));
    if (projectResult.length === 0) {
      return res.status(404).json({ error: 'Proyecto no encontrado' });
    }

    const p = projectResult[0];
    const projectAgreements = await db.select().from(agreements).where(eq(agreements.projectId, p.id));
    const projectBudgetItems = await db.select().from(budgetLines).where(eq(budgetLines.projectId, p.id));
    const projectVouchers = await db.select().from(receiptsVouchers).where(eq(receiptsVouchers.projectId, p.id));

    const gemini = getGeminiClient();
    if (!gemini) {
      return res.status(503).json({
        error: 'El servicio de Inteligencia Artificial (Gemini API) no está configurado en este entorno. Por favor, agregue su clave GEMINI_API_KEY.',
        demoMarkdown: `## ⚠️ Servicio de IA No Disponible (Sin Clave de API)
Aquí tiene un informe de simulación para el proyecto **${p.name}** (${p.code}):

- **Diagnóstico General**: El proyecto tiene un progreso físico del ${p.physicalProgress}% y financiero del ${p.financialProgress}%.
- **Análisis de Desviaciones**: No se detectaron sobrecostos críticos, pero la partida de Gastos Administrativos está excedida en un 6%.
- **Siguientes Pasos Recomendados**: Se sugiere la recalibración de la partida de materiales y agendar el próximo desembolso de USAID.`
      });
    }

    const budgetContext = projectBudgetItems.map(item => (
      `Partida [${item.code}] ${item.category} (${item.subcategory}): Aprobado $${item.approvedAmount}, Reformulado $${item.reformulatedAmount}, Ejecutado $${item.executedAmount}, Saldo $${item.balance}, Progreso ${item.progress}%, Estado: ${item.status}`
    )).join('\n');

    const agreementsContext = projectAgreements.map(ag => (
      `Convenio con ${ag.counterparty}: Monto $${ag.amount}, Estado: ${ag.status}, Días restantes: ${ag.remainingDays}`
    )).join('\n');

    const receiptsVouchersContext = projectVouchers.map(v => (
      `Comprobante de ${v.provider} por $${v.amount} (${v.type}) - Verificado: ${v.isVerified ? 'SÍ' : 'NO'}`
    )).join('\n');

    let prompt = '';

    if (reportType === 'Reporte Narrativo de Donante') {
      prompt = `
Actúa como un Auditor de Cooperación Internacional de LATAM experto en el desarrollo de ONGs.
Genera un informe analítico profesional, formal y ejecutivo en formato Markdown estructurado según la plantilla **Reporte Narrativo de Donante / Progreso del Proyecto** basada en las guías de UNDP.

INFORMACIÓN DEL PROYECTO:
- Código: ${p.code}
- Nombre: ${p.name}
- Donante ID: ${p.donorId}
- Presupuesto Aprobado: $${p.approvedBudget} USD
- Progreso Físico: ${p.physicalProgress}%
- Progreso Financiero: ${p.financialProgress}%
- Nivel de Riesgo Institucional: ${p.riskLevel}
- Puntuación de Cumplimiento: ${p.score}/100

CONTEXTO FINANCIERO (PARTIDAS PRESUPUESTARIAS):
${budgetContext}

CONVENIOS ASOCIADOS:
${agreementsContext}

COMPROBANTES CARGADOS:
${receiptsVouchersContext}

NIVEL DE ANÁLISIS ENFOQUE: ${focusArea || 'General'}

Estructura tu reporte de forma elegante, profesional y con excelente redacción técnica en español, incluyendo estrictamente las siguientes secciones:
1. **PORTADA**: Nombre del proyecto, código, período reportado, organización ejecutora y donante (${p.donorId}).
2. **RESUMEN EJECUTIVO**: Principales logros del período, estado actual del proyecto, progreso físico vs financiero y conclusión general de viabilidad técnica.
3. **CONTEXTO Y OBJETIVOS**: Justificación de la intervención, metas clave, período reportado y cambios relevantes identificados.
4. **ACTIVIDADES EJECUTADAS**: Qué se hizo, contra qué estaba planificado (cruza los datos de las actividades registradas) y con qué evidencias se cuenta.
5. **RESULTADOS Y AVANCES**: Logros cuantitativos frente a los objetivos, estado de los indicadores y beneficiarios alcanzados.
6. **DIFICULTADES Y LECCIONES APRENDIDAS**: Principales obstáculos, desvíos presentados y lecciones aprendidas para el equipo operativo.
7. **RESUMEN FINANCIERO CONSOLIDADO**: Balance simplificado de gasto real versus presupuesto, con explicación directa de las variaciones identificadas.
8. **ANEXOS DOCUMENTALES**: Checklist de evidencias obligatorias de soporte, haciendo alusión a la documentación probatoria y comprobantes verídicos de la base de datos de auditoría.
      `;
    } else if (reportType === 'Reporte Financiero Presupuesto vs Ejecutado') {
      prompt = `
Actúa como un Auditor de Cooperación Internacional de LATAM experto en el desarrollo de ONGs.
Genera un informe financiero detallado y analítico en formato Markdown estructurado según la plantilla **Reporte Financiero del Proyecto / Presupuesto vs Ejecutado**.

INFORMACIÓN DEL PROYECTO:
- Código: ${p.code}
- Nombre: ${p.name}
- Donante ID: ${p.donorId}
- Presupuesto Aprobado: $${p.approvedBudget} USD
- Progreso Físico: ${p.physicalProgress}%
- Progreso Financiero: ${p.financialProgress}%
- Nivel de Riesgo Institucional: ${p.riskLevel}
- Puntuación de Cumplimiento: ${p.score}/100

CONTEXTO FINANCIERO (PARTIDAS PRESUPUESTARIAS):
${budgetContext}

CONVENIOS ASOCIADOS:
${agreementsContext}

COMPROBANTES CARGADOS:
${receiptsVouchersContext}

NIVEL DE ANÁLISIS ENFOQUE: ${focusArea || 'General'}

Estructura tu reporte de forma matemática, clara y auditiva en español, incluyendo estrictamente las siguientes secciones:
1. **ENCABEZADO**: Identificación del proyecto, convenio asociado, período reportado, moneda base de la subvención y responsable técnico.
2. **RESUMEN FINANCIERO EJECUTIVO**: Presupuesto total aprobado, presupuesto ejecutado ($${(p.approvedBudget * p.financialProgress / 100).toFixed(2)} USD), saldo remanente y porcentaje de ejecución financiera global de ${p.financialProgress}%.
3. **TABLA COMPARATIVA PRESUPUESTO VS REAL**: Diseña una tabla de Markdown limpia y legible con los datos de las partidas presupuestarias provistas (Código, Categoría, Aprobado, Reformulado, Ejecutado, Saldo y Progreso). Utiliza señales visuales sutiles o alertas (p.ej., emojis 🟢, 🟡, 🔴) según el estado de la partida y si el presupuesto se encuentra excedido o con subejecución crítica.
4. **ANÁLISIS DE VARIACIONES SIGNIFICATIVAS**: Explicación técnica de sobre o subejecución relevante basándote en las subcategorías y partidas específicas de la base de datos.
5. **SOLICITUDES DE REPROGRAMACIÓN**: Propuestas de reasignación presupuestaria (reallocation/reprogramación de fondos) para mitigar partidas excedidas o canalizar saldos ociosos.
6. **ANEXOS Y AUDITORÍA FINANCIERA**: Resumen de comprobantes cargados, estado de verificación de gastos, y soporte a auditoría de la subvención.
      `;
    } else {
      // Reporte Anual Institucional
      prompt = `
Actúa como un Director Ejecutivo y Consultor de Transparencia de Cooperación Internacional de LATAM.
Genera un informe anual de impacto institucional en formato Markdown estructurado según la plantilla **Reporte Anual Institucional / Impacto + Transparencia**. El estilo debe ser altamente institucional, persuasivo, transparente y con visión estratégica.

INFORMACIÓN DEL PROYECTO DE REFERENCIA:
- Código: ${p.code}
- Nombre: ${p.name}
- Donante ID: ${p.donorId}
- Presupuesto Aprobado: $${p.approvedBudget} USD
- Progreso Físico: ${p.physicalProgress}%
- Progreso Financiero: ${p.financialProgress}%
- Nivel de Riesgo Institucional: ${p.riskLevel}
- Puntuación de Cumplimiento: ${p.score}/100

CONTEXTO FINANCIERO (PARTIDAS PRESUPUESTARIAS):
${budgetContext}

CONVENIOS ASOCIADOS:
${agreementsContext}

NIVEL DE ANÁLISIS ENFOQUE: ${focusArea || 'General'}

Estructura tu reporte con un diseño de contenido editorial y de alto nivel en español, incluyendo estrictamente las siguientes secciones:
1. **CARTA DE LIDERAZGO**: Mensaje estratégico de la junta directiva y dirección ejecutiva sobre gobernanza, ética, y rendición de cuentas institucional del año 2026.
2. **MISIÓN, VISIÓN Y CONTEXTO ANUAL**: Enfoque de impacto social en América Latina y compromiso con el desarrollo sostenible de las comunidades vulnerables.
3. **LOGROS MÁS IMPORTANTES Y CIFRAS CLAVE**: Destaca los principales indicadores de impacto del portafolio en una lista scannable o tabla de Markdown. Haz mención del progreso físico del ${p.physicalProgress}%, la excelente puntuación de cumplimiento del ${p.score}/100, y el volumen financiero gestionado.
4. **PORTAFOLIO DE PROYECTOS EJECUTADOS Y ALCANCE TERRITORIAL**: Detalle del proyecto "${p.name}" y su articulación con los convenios de cooperación.
5. **HISTORIAS DE IMPACTO**: Presenta una breve narrativa humana o caso de éxito que demuestre el valor social real generado por la intervención en el territorio.
6. **RESUMEN FINANCIERO INSTITUCIONAL**: Gráfico o resumen simplificado de ingresos institucionales provenientes del Donante ID: ${p.donorId} y la eficiencia en la ejecución de fondos restringidos.
7. **RECONOCIMIENTO A FINANCIADORES Y ALIADOS**: Agradecimiento formal a los donantes por su confianza y soporte en los procesos de auditoría continua.
8. **PRÓXIMOS DESAFÍOS Y METAS**: Perspectiva futura y agenda de metas para consolidar la rendición de cuentas institucional.
      `;
    }

    const response = await gemini.models.generateContent({
      model: 'gemini-3.5-flash',
      contents: prompt,
    });

    const reportMarkdown = response.text || 'Error al generar contenido.';

    await logActivity(p.id, userName, `Generó un informe analítico inteligente mediante Gemini AI para el proyecto "${p.name}"`);

    res.json({ report: reportMarkdown });
  } catch (err: any) {
    console.error('Error generating AI report:', err);
    res.status(500).json({ error: `Ocurrió un error al procesar el reporte inteligente con Gemini AI. Detalle: ${err.message || err}` });
  }
});

// ==========================================
// 7. GET SYSTEM AUDIT TRAIL / ACTIVITY LOGS
// ==========================================
app.get('/api/activity-logs', requireAuth, async (req: AuthRequest, res) => {
  try {
    const rawLogs = await db.select({
      id: auditLogs.id,
      tenantId: auditLogs.tenantId,
      userId: auditLogs.userId,
      userName: users.name,
      action: auditLogs.action,
      entityType: auditLogs.entityType,
      entityId: auditLogs.entityId,
      oldValues: auditLogs.oldValues,
      newValues: auditLogs.newValues,
      createdAt: auditLogs.createdAt
    })
    .from(auditLogs)
    .leftJoin(users, eq(auditLogs.userId, users.id))
    .where(eq(auditLogs.tenantId, req.user!.tenantId))
    .orderBy(desc(auditLogs.createdAt))
    .limit(300);

    const mappedLogs = rawLogs.map(l => ({
      id: l.id,
      tenantId: l.tenantId,
      userId: l.userId,
      userName: l.userName || 'SISTEMA',
      actionDescription: l.action,
      action: l.action,
      entityType: l.entityType,
      entityId: l.entityId,
      oldValues: l.oldValues,
      newValues: l.newValues,
      createdAt: l.createdAt
    }));
    
    res.json(mappedLogs);
  } catch (err) {
    console.error('Error listing activity logs:', err);
    res.status(500).json({ error: 'Error al obtener la bitácora de auditoría.' });
  }
});

// ==========================================
// 8. REPORTS EXPORT MODULE
// ==========================================
app.get('/api/reports/data', requireAuth, async (req: AuthRequest, res) => {
  try {
    const { type, projectId } = req.query;

    if (type === 'financiero') {
      const pId = projectId ? Number(projectId) : null;
      const allLines = await db.select({
        code: budgetLines.code,
        category: budgetLines.category,
        subcategory: budgetLines.subcategory,
        approved: budgetLines.approvedAmount,
        reformulated: budgetLines.reformulatedAmount,
        executed: budgetLines.executedAmount,
        balance: budgetLines.balance,
        progress: budgetLines.progress,
        status: budgetLines.status,
        projectId: budgetLines.projectId
      }).from(budgetLines);
      
      const filtered = pId ? allLines.filter(l => l.projectId === pId) : allLines;
      return res.json(filtered);
      
    } else if (type === 'ejecutivo') {
      const pId = projectId ? Number(projectId) : null;
      const allProjects = await db.select({
        code: projects.code,
        name: projects.name,
        donor: projects.donorId,
        status: projects.status,
        approvedBudget: projects.approvedBudget,
        physicalProgress: projects.physicalProgress,
        financialProgress: projects.financialProgress,
        score: projects.score,
        riskLevel: projects.riskLevel
      }).from(projects).where(eq(projects.tenantId, req.user!.tenantId));

      const filtered = pId ? allProjects.filter(p => p.id === pId) : allProjects;
      return res.json(filtered);

    } else if (type === 'cumplimiento') {
      const pId = projectId ? Number(projectId) : null;
      const allAgreements = await db.select({
        counterparty: agreements.counterparty,
        amount: agreements.amount,
        startDate: agreements.startDate,
        endDate: agreements.endDate,
        status: agreements.status,
        projectId: agreements.projectId
      }).from(agreements);

      const filtered = pId ? allAgreements.filter(a => a.projectId === pId) : allAgreements;
      return res.json(filtered);
    }
    
    return res.status(400).json({ error: 'Tipo de reporte inválido.' });

  } catch (err) {
    console.error('Error fetching reports data:', err);
    res.status(500).json({ error: 'Error al generar los datos del reporte.' });
  }
});

// ==========================================
// 8. USER MANAGEMENT & MONITORING ENDPOINTS
// ==========================================

function mapRoleNameToEnum(name: string): string {
  if (name === 'Director' || name === 'SuperAdmin Tech' || name === 'Admin de Organización') return 'DIRECTOR';
  if (name === 'Coordinador de Proyecto') return 'MANAGER';
  if (name === 'Administrativo / Finanzas') return 'FINANCE';
  if (name === 'Auditor') return 'AUDITOR';
  if (name === 'Donante / Financiador') return 'FINANCIADOR';
  return 'DIRECTOR';
}

function mapEnumToRoleName(roleEnum: string): string {
  if (roleEnum === 'DIRECTOR') return 'Director';
  if (roleEnum === 'MANAGER') return 'Coordinador de Proyecto';
  if (roleEnum === 'FINANCE') return 'Administrativo / Finanzas';
  if (roleEnum === 'AUDITOR') return 'Auditor';
  if (roleEnum === 'FINANCIADOR') return 'Donante / Financiador';
  return 'Director';
}

// Public demo users endpoint
app.get('/api/public/demo-users', async (req, res) => {
  if (process.env.NODE_ENV === 'production' && process.env.ENABLE_DEMO_LOGIN !== 'true') {
    return res.status(403).json({ error: 'Endpoint not available in production without feature flag' });
  }
  try {
    const rawUsers = await db.select({
      user: users,
      roleName: roles.name
    }).from(users)
      .leftJoin(roles, eq(users.roleId, roles.id))
      .orderBy(users.id);
      
    const mapped = rawUsers.map(r => ({
      ...r.user,
      role: mapRoleNameToEnum(r.roleName || '')
    }));
    res.json(mapped);
  } catch (err) {
    console.error('Error fetching demo users', err);
    res.status(500).json({ error: 'Failed to fetch demo users' });
  }
});

// List all users with activity log counts and last active status (DIRECTOR only)
app.get('/api/users', requireAuth, async (req: AuthRequest, res) => {
  try {
    const { role } = req.user!;
    if (role !== 'DIRECTOR') {
      return res.status(403).json({ error: 'Acceso denegado: Se requiere el rol de Director / SuperAdmin para gestionar usuarios.' });
    }

    const allUsers = await db.select({
      user: users,
      roleName: roles.name
    }).from(users)
      .leftJoin(roles, eq(users.roleId, roles.id))
      .where(eq(users.tenantId, req.user!.tenantId))
      .orderBy(desc(users.createdAt));
      
    const allLogs = await db.select().from(auditLogs).where(eq(auditLogs.tenantId, req.user!.tenantId)).orderBy(desc(auditLogs.createdAt));

    const enriched = allUsers.map(r => {
      const u = r.user;
      const userLogs = allLogs.filter(l => l.userId === u.id);
      return {
        ...u,
        activityCount: userLogs.length,
        lastActive: userLogs.length > 0 ? userLogs[0].createdAt : u.createdAt,
        recentActions: userLogs.slice(0, 5).map(l => ({
          id: l.id,
          actionDescription: l.action,
          createdAt: l.createdAt
        })),
        role: mapRoleNameToEnum(r.roleName || '')
      };
    });

    res.json(enriched);
  } catch (err: any) {
    console.error('Error listing users:', err);
    res.status(500).json({ error: 'Error al obtener la lista de usuarios y monitorear su actividad.' });
  }
});

// Create a new user (DIRECTOR only)
app.post('/api/users', requireAuth, async (req: AuthRequest, res) => {
  try {
    const { role: requesterRole, name: userName, tenantId } = req.user!;
    if (requesterRole !== 'DIRECTOR') {
      return res.status(403).json({ error: 'Acceso denegado: Se requiere el rol de Director / SuperAdmin.' });
    }

    const { name, email, role } = req.body;

    if (!name || !email || !role) {
      return res.status(400).json({ error: 'Faltan campos obligatorios (name, email, role).' });
    }

    if (!['DIRECTOR', 'MANAGER', 'FINANCE', 'AUDITOR', 'FINANCIADOR'].includes(role)) {
      return res.status(400).json({ error: 'El rol especificado es inválido o no existe.' });
    }

    const roleStringName = mapEnumToRoleName(role);
    const roleObj = await db.select().from(roles).where(eq(roles.name, roleStringName));
    if (roleObj.length === 0) return res.status(400).json({ error: 'Rol no encontrado en la base de datos' });

    const uid = `pending_${Date.now()}_${Math.random().toString(36).substring(7)}`;

    const newUser = await db.insert(users)
      .values({
        tenantId,
        uid,
        name,
        email,
        roleId: roleObj[0].id,
        avatarUrl: `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(name)}`,
        isActive: true,
      })
      .returning();

    await logActivity(null, userName, `Creó el nuevo usuario "${name}" con rol ${role}`);

    res.status(201).json(newUser[0]);
  } catch (err: any) {
    console.error('Error creating user:', err);
    res.status(500).json({ error: 'Error al crear el nuevo usuario.' });
  }
});

// Update a user (DIRECTOR only)
app.patch('/api/users/:id', requireAuth, async (req: AuthRequest, res) => {
  try {
    const { role: requesterRole, name: userName, uid: requesterUid } = req.user!;
    if (requesterRole !== 'DIRECTOR') {
      return res.status(403).json({ error: 'Acceso denegado: Se requiere el rol de Director / SuperAdmin.' });
    }

    const userId = parseInt(req.params.id);
    const { name, email, role, isActive } = req.body;

    const userToUpdate = await db.select().from(users).where(eq(users.id, userId));
    if (userToUpdate.length === 0) {
      return res.status(404).json({ error: 'Usuario no encontrado.' });
    }

    // Protect against self-deactivation
    if (isActive === false && userToUpdate[0].uid === requesterUid) {
      return res.status(400).json({ error: 'No puedes desactivar tu propia cuenta.' });
    }

    const updates: any = {};
    if (name !== undefined) updates.name = name;
    if (email !== undefined) updates.email = email;
    if (isActive !== undefined) updates.isActive = isActive;

    if (role !== undefined) {
      if (!['DIRECTOR', 'MANAGER', 'FINANCE', 'AUDITOR', 'FINANCIADOR'].includes(role)) {
        return res.status(400).json({ error: 'El rol especificado es inválido o no existe.' });
      }
      const roleStringName = mapEnumToRoleName(role);
      const newRoleObj = await db.select().from(roles).where(eq(roles.name, roleStringName));
      if (newRoleObj.length === 0) return res.status(400).json({ error: 'Rol no encontrado en la base de datos' });
      updates.roleId = newRoleObj[0].id;
    }

    if (Object.keys(updates).length === 0) {
      return res.status(400).json({ error: 'No se enviaron campos para actualizar.' });
    }

    const updated = await db.update(users)
      .set(updates)
      .where(eq(users.id, userId))
      .returning();

    let actionMsg = `Modificó los datos del usuario "${userToUpdate[0].name}"`;
    if (isActive !== undefined && isActive !== userToUpdate[0].isActive) {
      actionMsg = isActive ? `Reactivó al usuario "${userToUpdate[0].name}"` : `Suspendió al usuario "${userToUpdate[0].name}"`;
    }
    
    await logActivity(null, userName, actionMsg);

    res.json(updated[0]);
  } catch (err: any) {
    console.error('Error patching user:', err);
    res.status(500).json({ error: 'Error al actualizar el usuario.' });
  }
});

// Delete a user (DIRECTOR only)
app.delete('/api/users/:id', requireAuth, async (req: AuthRequest, res) => {
  try {
    const { role: requesterRole, name: userName } = req.user!;
    if (requesterRole !== 'DIRECTOR') {
      return res.status(403).json({ error: 'Acceso denegado: Se requiere el rol de Director / SuperAdmin.' });
    }

    const userId = parseInt(req.params.id);
    const userToDelete = await db.select().from(users).where(eq(users.id, userId));
    if (userToDelete.length === 0) {
      return res.status(404).json({ error: 'Usuario no encontrado.' });
    }

    // Do not let user delete themselves if they correspond to the logged-in user
    if (userToDelete[0].uid === req.user!.uid) {
      return res.status(400).json({ error: 'No puedes eliminar tu propio usuario de la plataforma.' });
    }

    await db.delete(users).where(eq(users.id, userId));
    await logActivity(null, userName, `Eliminó permanentemente el usuario "${userToDelete[0].name}" (${userToDelete[0].email}) de la plataforma`);

    res.json({ success: true, message: 'Usuario eliminado con éxito.' });
  } catch (err: any) {
    console.error('Error deleting user:', err);
    res.status(500).json({ error: 'Error al eliminar el usuario del sistema.' });
  }
});

// ==========================================
// VITE OR STATIC FILE SERVING
// ==========================================
async function initializeViteAndListen() {
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    // ESM safe way to get __dirname
    const __filename = fileURLToPath(import.meta.url);
    const __dirname = path.dirname(__filename);
    
    // In production, server.js is bundled inside the dist/ folder
    const clientDist = __dirname;
    
    app.use('/assets', express.static(path.join(clientDist, 'assets')));
    app.use(express.static(clientDist));
    
    app.get('*', (req, res, next) => {
      if (req.path.startsWith('/api')) return next();
      if (req.path.startsWith('/assets')) return next();
      res.sendFile(path.join(clientDist, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`PROYECTY Server running on port ${PORT}`);
  });
}

initializeViteAndListen().catch((err) => {
  console.error('Error starting server:', err);
});
