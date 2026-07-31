import { Request, Response, NextFunction } from 'express';
import { db } from '../db/index.ts';
import { projects, projectMembers, agreements, disbursements, budgetLines, receiptsVouchers, documents, auditLogs, events, tasks, donors } from '../db/schema.ts';
import { eq, and, inArray, desc, gte, lte, asc } from 'drizzle-orm';
import { AuthRequest } from '../middleware/auth.ts';
import { getGeminiClient } from '../../server.ts';
import { logActivity } from '../db/audit.ts';
import { getExpensesByTenant } from '../services/expenses.service.ts';
import { generateFinancialReport } from '../services/ai.service.ts';
import { logger } from '../lib/logger.ts';

export const getDashboardMetrics = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const tenantId = req.user!.tenantId;
    const { donorId, status } = req.query;

    let conditions = [eq(projects.tenantId, tenantId)];
    
    if (req.user!.role === 'RESPONSABLE_PROYECTO' || req.user!.role === 'TECNICO_PROYECTO') {
      const userProjects = await db.select({ projectId: projectMembers.projectId })
        .from(projectMembers)
        .where(eq(projectMembers.userId, req.user!.id!));
        
      if (userProjects.length > 0) {
        conditions.push(inArray(projects.id, userProjects.map(p => p.projectId)));
      } else {
        conditions.push(eq(projects.id, -1));
      }
    }

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
};



export const getReportsData = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const { type, projectId } = req.query;
    
    let allowedProjectIds: number[] | null = null;
    if (req.user!.role === 'RESPONSABLE_PROYECTO' || req.user!.role === 'TECNICO_PROYECTO') {
      const userProjects = await db.select({ projectId: projectMembers.projectId })
        .from(projectMembers)
        .where(eq(projectMembers.userId, req.user!.id!));
      allowedProjectIds = userProjects.map(p => p.projectId);
      if (allowedProjectIds.length === 0) allowedProjectIds = [-1];
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
    if (!tenantId) return res.status(401).json({ error: 'No autorizado' });

    const expenses = await getExpensesByTenant(tenantId);
    
    // Pass recent expenses to Gemini
    const recentExpenses = expenses.slice(0, 100);

    const reportMarkdown = await generateFinancialReport(recentExpenses);

    return res.json({
      report: reportMarkdown,
      generatedAt: new Date(),
    });
  } catch (error) {
    logger.error('Error in generateAiReportHandler', { error });
    next(error);
  }
};



