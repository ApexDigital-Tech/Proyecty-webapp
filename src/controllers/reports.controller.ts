import { Request, Response, NextFunction } from 'express';
import { db } from '../db/index.ts';
import { 
  projects, 
  projectMembers, 
  agreements, 
  disbursements, 
  budgetLines, 
  budgetVersions,
  organizations,
  receiptsVouchers, 
  documents, 
  auditLogs, 
  events, 
  tasks, 
  donors,
  users
} from '../db/schema.ts';
import { eq, and, or, inArray, desc, gte, lte, asc, sql } from 'drizzle-orm';
import { AuthRequest } from '../middleware/auth.ts';
import { GoogleGenAI } from '@google/genai';
import { logActivity } from '../db/audit.ts';
import { getExpensesByTenant } from '../services/expenses.service.ts';
import { generateFinancialReport } from '../services/ai.service.ts';
import { logger } from '../lib/logger.ts';

function getGeminiInstance() {
  const key = process.env.GEMINI_API_KEY;
  if (!key || key.includes('YOUR_')) return null;
  return new GoogleGenAI({ apiKey: key });
}
import { getDashboardMetricsForUser } from '../services/dashboard.service.ts';
import { 
  createReportDraft, 
  approveReport, 
  getReportsListForUser, 
  generateSafeCsv, 
  generateStructuredPdf,
  validateProjectScope
} from '../services/reporting-export.service.ts';
import { logAuditEvent } from '../services/audit.service.ts';
import { ForbiddenError, NotFoundError, ConflictError, ValidationError } from '../utils/errors.ts';

/**
 * M-02: Endpoint de métricas ejecutivas del Dashboard con alcance de rol estricto.
 */
export const getDashboardMetrics = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const tenantId = req.user!.tenantId;
    const userId = req.user!.id || 1;
    const userRole = req.user!.role;
    const { donorId, status, period } = req.query;

    const metrics = await getDashboardMetricsForUser(tenantId, userId, userRole, {
      donorId: donorId ? parseInt(donorId as string) : undefined,
      status: status as string | undefined,
      period: period as string | undefined,
    });

    res.json(metrics);
  } catch (err: any) {
    console.error('Error fetching dashboard metrics:', err);
    if (err.name === 'ForbiddenError') {
      return res.status(403).json({ error: err.message });
    }
    res.status(500).json({ error: 'Failed to fetch dashboard metrics' });
  }
};

/**
 * M-14: Crear un borrador de reporte (DRAFT) — Exclusivo: DIRECTOR, MANAGER, FINANCE
 */
export const createDraftReportHandler = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const tenantId = req.user!.tenantId;
    const userId = req.user!.id || 1;
    const userRole = req.user!.role;
    const { projectId, reportType, parameters, contentMarkdown, analysisMode } = req.body;

    if (!reportType || !['FINANCIAL', 'EXECUTIVE', 'COMPLIANCE'].includes(reportType)) {
      return res.status(400).json({ error: 'Tipo de reporte inválido. Opciones: FINANCIAL, EXECUTIVE, COMPLIANCE.' });
    }

    const draft = await createReportDraft(tenantId, userId, userRole, {
      projectId: projectId ? parseInt(projectId) : undefined,
      reportType,
      parameters,
      contentMarkdown,
      analysisMode,
    });

    res.status(201).json({ success: true, data: draft });
  } catch (err: any) {
    if (err.name === 'ForbiddenError') return res.status(403).json({ error: err.message });
    if (err.name === 'NotFoundError') return res.status(404).json({ error: err.message });
    console.error('Error creating report draft:', err);
    res.status(500).json({ error: err.message || 'Error al crear borrador de reporte' });
  }
};

/**
 * M-14: Aprobar reporte con segregación estricta (created_by != approved_by) e inmutabilidad
 */
export const approveReportHandler = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const tenantId = req.user!.tenantId;
    const userId = req.user!.id || 1;
    const userRole = req.user!.role;
    const reportId = parseInt(req.params.id);

    if (isNaN(reportId)) return res.status(400).json({ error: 'ID de reporte inválido' });

    const approved = await approveReport(tenantId, userId, userRole, reportId);
    res.json({ success: true, data: approved });
  } catch (err: any) {
    if (err.name === 'ForbiddenError') return res.status(403).json({ error: err.message });
    if (err.name === 'NotFoundError') return res.status(404).json({ error: err.message });
    if (err.name === 'ConflictError') return res.status(409).json({ error: err.message });
    console.error('Error approving report:', err);
    res.status(500).json({ error: err.message || 'Error al aprobar reporte' });
  }
};

/**
 * M-14: Listar reportes generados con alcance de rol canónico
 */
export const listReportsHandler = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const tenantId = req.user!.tenantId;
    const userId = req.user!.id || 1;
    const userRole = req.user!.role;
    const { projectId } = req.query;

    const reports = await getReportsListForUser(
      tenantId,
      userId,
      userRole,
      projectId ? parseInt(projectId as string) : undefined
    );

    res.json({ success: true, data: reports });
  } catch (err: any) {
    if (err.name === 'ForbiddenError') return res.status(403).json({ error: err.message });
    if (err.name === 'NotFoundError') return res.status(404).json({ error: err.message });
    console.error('Error listing reports:', err);
    res.status(500).json({ error: err.message || 'Error al listar reportes' });
  }
};

/**
 * M-14: Exportación CSV segura con mitigación de inyección de fórmulas y UTF-8 BOM
 */
export const exportReportsCsv = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const tenantId = req.user!.tenantId;
    const userId = req.user!.id || 1;
    const userRole = req.user!.role;
    const { type, projectId } = req.query;

    const pId = projectId ? parseInt(projectId as string) : undefined;
    await validateProjectScope(tenantId, userId, userRole, pId);

    // Financiador solo puede exportar proyectos asignados
    if (userRole === 'FINANCIADOR' && !pId) {
      return res.status(403).json({ error: 'Acceso denegado: El Financiador solo puede exportar proyectos asignados.' });
    }

    let headers: string[] = [];
    let rows: any[][] = [];
    let filename = `reporte_${type || 'general'}_${Date.now()}.csv`;

    if (type === 'financiero') {
      headers = ['Código Partida', 'Categoría', 'Subcategoría', 'Presupuesto Aprobado', 'Presupuesto Reformulado', 'Ejecutado', 'Saldo', 'Progreso (%)', 'Estado'];

      // Determinar los proyectos alcanzables por el usuario dentro del tenant
      let projectConditions = [eq(projects.tenantId, tenantId)];
      if (pId) {
        projectConditions.push(eq(projects.id, pId));
      }
      if (userRole === 'RESPONSABLE_PROYECTO') {
        const assigned = await db.select({ projectId: projectMembers.projectId })
          .from(projectMembers).where(eq(projectMembers.userId, userId));
        const assignedIds = assigned.map(a => a.projectId);
        projectConditions.push(inArray(projects.id, assignedIds.length > 0 ? assignedIds : [-1]));
      } else if (userRole === 'FINANCIADOR') {
        const [userRecord] = await db.select({ donorId: users.donorId }).from(users).where(eq(users.id, userId));
        if (userRecord && userRecord.donorId) {
          projectConditions.push(eq(projects.donorId, userRecord.donorId));
        } else {
          projectConditions.push(eq(projects.id, -1));
        }
      }

      const tenantProjects = await db.select({ id: projects.id })
        .from(projects)
        .where(and(...projectConditions));
      
      const targetProjectIds = tenantProjects.map(p => p.id);

      if (targetProjectIds.length === 0) {
        rows = [];
      } else {
        // Consultar exclusivamente versiones presupuestarias activas/aprobadas para estos proyectos
        const activeVersions = await db.select({ id: budgetVersions.id, projectId: budgetVersions.projectId })
          .from(budgetVersions)
          .where(
            and(
              eq(budgetVersions.tenantId, tenantId),
              inArray(budgetVersions.projectId, targetProjectIds),
              or(eq(budgetVersions.status, 'APPROVED'), eq(budgetVersions.isApproved, true))
            )
          );

        const activeVersionIds = activeVersions.map(v => v.id);

        if (activeVersionIds.length === 0) {
          rows = [];
        } else {
          // Consultar exclusivamente las partidas presupuestarias de las versiones aprobadas activas
          const linesQuery = await db.select()
            .from(budgetLines)
            .where(
              and(
                inArray(budgetLines.projectId, targetProjectIds),
                inArray(budgetLines.budgetVersionId, activeVersionIds)
              )
            );

          rows = linesQuery.map(l => [
            l.code,
            l.category,
            l.subcategory,
            l.approvedAmount,
            l.reformulatedAmount,
            l.executedAmount,
            l.balance,
            l.progress,
            l.status
          ]);
        }
      }
    } else {
      headers = ['Código Proyecto', 'Nombre', 'Estado', 'Riesgo', 'Presupuesto Aprobado', 'Progreso Físico (%)', 'Progreso Financiero (%)', 'Score'];
      
      let prjQuery = [eq(projects.tenantId, tenantId)];
      if (pId) prjQuery.push(eq(projects.id, pId));
      if (userRole === 'RESPONSABLE_PROYECTO') {
        const assigned = await db.select({ projectId: projectMembers.projectId })
          .from(projectMembers).where(eq(projectMembers.userId, userId));
        const assignedIds = assigned.map(a => a.projectId);
        prjQuery.push(inArray(projects.id, assignedIds.length > 0 ? assignedIds : [-1]));
      } else if (userRole === 'FINANCIADOR') {
        const [userRecord] = await db.select({ donorId: users.donorId }).from(users).where(eq(users.id, userId));
        if (userRecord && userRecord.donorId) {
          prjQuery.push(eq(projects.donorId, userRecord.donorId));
        } else {
          prjQuery.push(eq(projects.id, -1));
        }
      }

      const projectsList = await db.select().from(projects).where(and(...prjQuery));
      rows = projectsList.map(p => [
        p.code,
        p.name,
        p.status,
        p.riskLevel,
        p.approvedBudget,
        p.physicalProgress,
        p.financialProgress,
        p.score
      ]);
    }

    const { buffer, sha256 } = generateSafeCsv(headers, rows);

    logAuditEvent({
      tenantId,
      userId,
      action: 'REPORT_EXPORTED',
      entity: 'export_csv',
      entityId: String(pId || tenantId),
      metadata: {
        format: 'CSV',
        reportType: type || 'general',
        projectId: pId,
        rowCount: rows.length,
        sha256,
      },
    });

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('X-Content-SHA256', sha256);
    res.send(buffer);
  } catch (err: any) {
    if (err.name === 'ForbiddenError') return res.status(403).json({ error: err.message });
    if (err.name === 'NotFoundError') return res.status(404).json({ error: err.message });
    console.error('Error exporting CSV:', err);
    res.status(500).json({ error: err.message || 'Error al exportar CSV' });
  }
};

/**
 * M-14: Exportación PDF estructurada en memoria
 */
export const exportReportsPdf = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const tenantId = req.user!.tenantId;
    const userId = req.user!.id || 1;
    const userRole = req.user!.role;
    const { type, projectId } = req.query;

    const pId = projectId ? parseInt(projectId as string) : undefined;
    await validateProjectScope(tenantId, userId, userRole, pId);

    if (userRole === 'FINANCIADOR' && !pId) {
      return res.status(403).json({ error: 'Acceso denegado: El Financiador solo puede exportar proyectos asignados.' });
    }

    const [org] = await db.select().from(organizations).where(eq(organizations.id, tenantId));
    let projInfo = null;
    let financialSummary: Record<string, string> | undefined = undefined;

    if (pId) {
      const [p] = await db.select().from(projects).where(and(eq(projects.id, pId), eq(projects.tenantId, tenantId)));
      if (p) {
        projInfo = { code: p.code, name: p.name };
        financialSummary = {
          'Presupuesto Aprobado': `$${Number(p.approvedBudget).toLocaleString()} USD`,
          'Progreso Físico': `${p.physicalProgress}%`,
          'Progreso Financiero': `${p.financialProgress}%`,
          'Nivel de Riesgo': p.riskLevel,
        };
      }
    } else {
      const metrics = await getDashboardMetricsForUser(tenantId, userId, userRole);
      financialSummary = {
        'Presupuesto Total Tenant': `$${metrics.totalBudget.toLocaleString()} USD`,
        'Ejecución Financiera Total': `$${metrics.totalExecuted.toLocaleString()} USD`,
        'Saldo Disponible': `$${metrics.availableBalance.toLocaleString()} USD`,
        'Avance Financiero Global': `${metrics.avgFinancial}%`,
        'Avance Físico Global': `${metrics.avgPhysical}%`,
      };
    }

    const reportTitle = type ? String(type).toUpperCase() : 'EJECUTIVO';
    const content = `Reporte oficial de seguimiento y fiscalización financiera emitido para la organización ${org?.name || 'Proyecty'}. Toda cifra está respaldada por registros transaccionales auditados en PostgreSQL.`;

    const { buffer, sha256 } = await generateStructuredPdf(
      org?.name || 'Proyecty Org',
      projInfo,
      reportTitle,
      1,
      content,
      financialSummary
    );

    logAuditEvent({
      tenantId,
      userId,
      action: 'REPORT_EXPORTED',
      entity: 'export_pdf',
      entityId: String(pId || tenantId),
      metadata: {
        format: 'PDF',
        reportType: reportTitle,
        projectId: pId,
        sha256,
      },
    });

    const filename = `reporte_${reportTitle.toLowerCase()}_${Date.now()}.pdf`;
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('X-Content-SHA256', sha256);
    res.send(buffer);
  } catch (err: any) {
    if (err.name === 'ForbiddenError') return res.status(403).json({ error: err.message });
    if (err.name === 'NotFoundError') return res.status(404).json({ error: err.message });
    console.error('Error exporting PDF:', err);
    res.status(500).json({ error: err.message || 'Error al exportar PDF' });
  }
};

export const generateReport = async (req: AuthRequest, res: Response, next: NextFunction) => {
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

    const gemini = getGeminiInstance();
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

    let prompt = `
Actúa como un Auditor Financiero Senior. Genera un reporte Markdown detallado para el proyecto:
- Código: ${p.code}
- Nombre: ${p.name}
- Presupuesto: $${p.approvedBudget} USD
- Progreso Físico: ${p.physicalProgress}%
- Progreso Financiero: ${p.financialProgress}%
- Riesgo: ${p.riskLevel}

Partidas:
${budgetContext}

Convenios:
${agreementsContext}

Comprobantes:
${receiptsVouchersContext}
`;

    const response = await gemini.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: prompt,
    });

    const reportMarkdown = response.text || 'Error al generar contenido.';
    await logActivity(p.id, userName, `Generó un informe analítico inteligente mediante Gemini AI para el proyecto "${p.name}"`);

    res.json({ report: reportMarkdown });
  } catch (err: any) {
    console.error('Error generating AI report:', err);
    res.status(500).json({ error: `Ocurrió un error al procesar el reporte inteligente con Gemini AI. Detalle: ${err.message || err}` });
  }
};

export const getReportsData = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const { type, projectId } = req.query;
    
    let allowedProjectIds: number[] | null = null;
    if (req.user!.role === 'RESPONSABLE_PROYECTO') {
      const userProjects = await db.select({ projectId: projectMembers.projectId })
        .from(projectMembers)
        .where(eq(projectMembers.userId, req.user!.id!));
      allowedProjectIds = userProjects.map(p => p.projectId);
      if (allowedProjectIds.length === 0) allowedProjectIds = [-1];
    } else if (req.user!.role === 'FINANCIADOR') {
      const [userRecord] = await db.select({ donorId: users.donorId }).from(users).where(eq(users.id, req.user!.id!));
      if (!userRecord || !userRecord.donorId) return res.json([]);
      const donorPrjs = await db.select({ id: projects.id }).from(projects).where(eq(projects.donorId, userRecord.donorId));
      allowedProjectIds = donorPrjs.map(p => p.id);
      if (allowedProjectIds.length === 0) return res.json([]);
    }

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
      
      const filteredByProject = pId ? allLines.filter(l => l.projectId === pId) : allLines;
      const filtered = allowedProjectIds ? filteredByProject.filter(l => allowedProjectIds!.includes(l.projectId)) : filteredByProject;
      return res.json(filtered);
      
    } else if (type === 'ejecutivo') {
      const pId = projectId ? Number(projectId) : null;
      const allProjects = await db.select({
        id: projects.id,
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

      const filteredByProject = pId ? allProjects.filter(p => p.id === pId) : allProjects;
      const filtered = allowedProjectIds ? filteredByProject.filter(p => allowedProjectIds!.includes(p.id)) : filteredByProject;
      return res.json(filtered);

    } else if (type === 'cumplimiento') {
      const pId = projectId ? Number(projectId) : null;
      const allAgreements = await db.select({
        id: agreements.id,
        projectId: agreements.projectId,
        counterparty: agreements.counterparty,
        amount: agreements.amount,
        startDate: agreements.startDate,
        endDate: agreements.endDate,
        status: agreements.status
      }).from(agreements);

      const filteredByProject = pId ? allAgreements.filter(a => a.projectId === pId) : allAgreements;
      const filtered = allowedProjectIds ? filteredByProject.filter(a => allowedProjectIds!.includes(a.projectId)) : filteredByProject;
      return res.json(filtered);
    }
  } catch (err) {
    console.error('Error fetching reports data:', err);
    res.status(500).json({ error: 'Error al generar los datos del reporte.' });
  }
};

export const generateAiReportHandler = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const tenantId = req.user?.tenantId;
    const userId = req.user?.id || 1;
    if (!tenantId) return res.status(401).json({ error: 'No autorizado' });

    const expensesList = await getExpensesByTenant(tenantId);
    
    // Pass recent expenses to Gemini
    const recentExpenses = expensesList.slice(0, 100);

    const reportData = await generateFinancialReport(tenantId, userId, recentExpenses);

    return res.json({
      report: reportData.reportMarkdown,
      model: reportData.model,
      modelVersion: reportData.modelVersion,
      sources: reportData.sources,
      generatedAt: reportData.generatedAt,
      requiresHumanReview: reportData.requiresHumanReview,
    });
  } catch (error) {
    logger.error('Error in generateAiReportHandler', { error });
    next(error);
  }
};
