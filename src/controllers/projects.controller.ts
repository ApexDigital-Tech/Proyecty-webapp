import { Request, Response, NextFunction } from 'express';
import { db } from '../db/index.ts';
import { projects, projectMembers, agreements, disbursements, budgetLines, receiptsVouchers, documents, auditLogs, events, tasks, donors, users, projectLogs, clauses , expenses, budgetVersions} from '../db/schema.ts';
import { eq, and, inArray, desc, gte, lte, asc , ilike, sql} from 'drizzle-orm';
import { AuthRequest } from '../middleware/auth.ts';
import { logActivity } from '../db/audit.ts';
import { withTenantContext, withRlsValidation } from '../utils/dbWrapper.ts';
import { calculatePhysicalProgress } from '../services/schedule.service.ts';

// Helper function from server.ts
export async function verifyProjectTenant(projectId: number, tenantId: number): Promise<boolean> {
  const p = await db.select({ id: projects.id }).from(projects).where(and(eq(projects.id, projectId), eq(projects.tenantId, tenantId))).limit(1);
  return p.length > 0;
}

export const getProjects = async (req: AuthRequest, res, next: NextFunction) => {
  try {
    const { page = '1', limit = '10', search, status, donorId, riskLevel } = req.query;
    const offset = (parseInt(page as string) - 1) * parseInt(limit as string);
    const limitNum = parseInt(limit as string);

    let conditions = [eq(projects.tenantId, req.user!.tenantId)];
    
    // Filtro estricto por rol: Responsables y Técnicos solo ven sus proyectos asignados
    if (req.user!.role === 'RESPONSABLE_PROYECTO' || req.user!.role === 'TECNICO_PROYECTO') {
      const userProjects = await db.select({ projectId: projectMembers.projectId })
        .from(projectMembers)
        .where(eq(projectMembers.userId, req.user!.id!));
        
      if (userProjects.length > 0) {
        conditions.push(inArray(projects.id, userProjects.map(p => p.projectId)));
      } else {
        // Si no tiene proyectos asignados, forzamos una condición imposible para que retorne 0
        conditions.push(eq(projects.id, -1));
      }
    }
    
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

    const projectIds = rawProjects.map(r => r.project.id);
    const allTasksForProjects = projectIds.length > 0
      ? await db.select({
          projectId: tasks.projectId,
          weight: tasks.weight,
          progress: tasks.progress,
          status: tasks.status,
        }).from(tasks).where(inArray(tasks.projectId, projectIds))
      : [];

    const tasksByProjectId = new Map<number, typeof allTasksForProjects>();
    for (const t of allTasksForProjects) {
      if (!tasksByProjectId.has(t.projectId)) tasksByProjectId.set(t.projectId, []);
      tasksByProjectId.get(t.projectId)!.push(t);
    }

    const allProjects = rawProjects.map(r => {
      const pTasks = tasksByProjectId.get(r.project.id) || [];
      const computedProgress = pTasks.length > 0 ? calculatePhysicalProgress(pTasks) : (r.project.physicalProgress ?? 0);
      return {
        ...r.project,
        physicalProgress: computedProgress,
        donor: r.donorName
      };
    });

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
};

export const createProject = async (req: AuthRequest, res, next: NextFunction) => {
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
      const createdProject = await withTenantContext(req.user!.tenantId, async (tx) => {
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
};

export const update = async (req: AuthRequest, res, next: NextFunction) => {
  try {
    const { role, name: userName } = req.user!;
    if (role !== 'DIRECTOR' && role !== 'MANAGER' && role !== 'RESPONSABLE_PROYECTO') {
      return res.status(403).json({ error: 'Permisos insuficientes. Se requiere rol de Director, Manager o Responsable de Proyecto.' });
    }

    const projectId = parseInt(req.params.id);
    const isValidTenant = await verifyProjectTenant(projectId, req.user!.tenantId);
    if (!isValidTenant) return res.status(404).json({ error: 'Proyecto no encontrado' });

    if (role === 'RESPONSABLE_PROYECTO') {
      const isMember = await db.select({ id: projectMembers.id }).from(projectMembers)
        .where(and(eq(projectMembers.projectId, projectId), eq(projectMembers.userId, req.user!.id!)))
        .limit(1);
      if (isMember.length === 0) {
        return res.status(403).json({ error: 'No tienes permisos para editar este proyecto específico.' });
      }
    }

    const { code, name, donor, approvedBudget, description } = req.body;

    if (!code || !name || !donor || !approvedBudget) {
      return res.status(400).json({ error: 'Los campos Código, Nombre, Donante y Presupuesto son requeridos.' });
    }

    try {
      const updatedProject = await withTenantContext(req.user!.tenantId, async (tx) => {
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

        const projectUpdate = await withRlsValidation(
          tx.update(projects).set({
            code,
            name,
            donorId: finalDonorId,
            approvedBudget: parseFloat(approvedBudget),
            description: description || '',
          }).where(eq(projects.id, projectId)).returning()
        );

        return projectUpdate[0];
      });

      await logActivity(projectId, userName, `Editó los datos generales del proyecto "${name}" (Código: ${code})`);

      res.status(200).json(updatedProject);
    } catch (txErr: any) {
      console.error('Project update transaction failed:', txErr);
      throw txErr;
    }
  } catch (err: any) {
    console.error('Error updating project:', err);
    if (err.message?.includes('projects_code_unique')) {
      return res.status(400).json({ error: 'Ya existe otro proyecto con este código.' });
    }
    res.status(500).json({ error: 'Error al actualizar el proyecto en la base de datos' });
  }
};

export const getProjectById = async (req: AuthRequest, res, next: NextFunction) => {
  try {
    const projectId = parseInt(req.params.id);
    if (isNaN(projectId)) {
      return res.status(400).json({ success: false, message: 'ID de proyecto inválido' });
    }

    const projectResult = await db.select({
      project: projects,
      donorName: donors.name
    }).from(projects)
      .leftJoin(donors, eq(projects.donorId, donors.id))
      .where(and(eq(projects.id, projectId), eq(projects.tenantId, req.user!.tenantId)));
      
    if (projectResult.length === 0) {
      return res.status(404).json({ success: false, message: 'Proyecto no encontrado' });
    }

    if (req.user!.role === 'RESPONSABLE_PROYECTO' || req.user!.role === 'TECNICO_PROYECTO') {
      const isMember = await db.select({ id: projectMembers.id }).from(projectMembers)
        .where(and(eq(projectMembers.projectId, projectId), eq(projectMembers.userId, req.user!.id!)))
        .limit(1);
      if (isMember.length === 0) {
        return res.status(403).json({ success: false, message: 'No tienes acceso a este proyecto' });
      }
    }

    const projectTaskList = await db.select({
      weight: tasks.weight,
      progress: tasks.progress,
      status: tasks.status,
    }).from(tasks).where(eq(tasks.projectId, projectId));

    const realPhysicalProgress = projectTaskList.length > 0
      ? calculatePhysicalProgress(projectTaskList)
      : (projectResult[0].project.physicalProgress ?? 0);

    const project = {
      ...projectResult[0].project,
      physicalProgress: realPhysicalProgress,
      donor: projectResult[0].donorName
    };

    // Fetch relational datasets
    const projectAgreements = await db.select().from(agreements).where(eq(agreements.projectId, projectId));
    
    // Obtener versiones presupuestarias y filtrar partidas de la versión activa (BUD-01)
    const versions = await db.select().from(budgetVersions)
      .where(eq(budgetVersions.projectId, projectId))
      .orderBy(desc(budgetVersions.versionNumber));
    
    const activeVersion = versions.find(v => v.status === 'APPROVED' || v.isApproved) || versions[0];
    const projectBudgetItems = activeVersion
      ? await db.select().from(budgetLines).where(eq(budgetLines.budgetVersionId, activeVersion.id))
      : await db.select().from(budgetLines).where(eq(budgetLines.projectId, projectId));

    const projectDocuments = await db.select().from(documents).where(eq(documents.projectId, projectId));
    const projectVouchers = await db.select().from(receiptsVouchers).where(eq(receiptsVouchers.projectId, projectId));
    const projectLogs = await db.select().from(auditLogs).where(and(eq(auditLogs.entityId, String(projectId)), eq(auditLogs.entity, 'Project'))).orderBy(desc(auditLogs.createdAt));

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
      success: true,
      data: {
        ...project,
        agreements: enrichedAgreements,
        budgetVersions: versions,
        activeBudgetVersion: activeVersion || null,
        budgetLines: projectBudgetItems,
        documents: projectDocuments,
        receiptsVouchers: projectVouchers,
        auditLogs: projectLogs
      }
    });
  } catch (err: any) {
    console.error('Error fetching project detail:', err);
    res.status(500).json({ success: false, message: 'Error al cargar el detalle del proyecto', error: err.message });
  }
};

export const remove = async (req: AuthRequest, res, next: NextFunction) => {
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

    await withTenantContext(req.user!.tenantId, async (tx) => {
      await tx.delete(projects).where(eq(projects.id, projectId));
    });
    
    await logActivity(null, userName, `Eliminó permanentemente el proyecto "${currentProject[0].name}" de la plataforma`);

    res.json({ success: true, message: 'Proyecto eliminado con éxito' });
  } catch (err: any) {
    console.error('Error deleting project:', err);
    res.status(500).json({ error: 'Error al eliminar el proyecto de la base de datos' });
  }
};

export const getMembers = async (req: AuthRequest, res, next: NextFunction) => {
  try {
    const projectId = parseInt(req.params.id);
    const members = await db.select({
      id: projectMembers.id,
      userId: projectMembers.userId,
      roleInProject: projectMembers.roleInProject,
      name: users.name,
      email: users.email,
      role: users.roleId
    }).from(projectMembers)
      .leftJoin(users, eq(users.id, projectMembers.userId))
      .where(eq(projectMembers.projectId, projectId));
    res.json(members);
  } catch (err: any) {
    res.status(500).json({ error: 'Error al listar los miembros del proyecto' });
  }
};

export const addMembers = async (req: AuthRequest, res, next: NextFunction) => {
  try {
    const { role } = req.user!;
    if (role !== 'DIRECTOR' && role !== 'MANAGER' && role !== 'RESPONSABLE_PROYECTO') {
      return res.status(403).json({ error: 'No autorizado para asignar equipo' });
    }
    const projectId = parseInt(req.params.id);
    const { userId, roleInProject } = req.body;

    const existing = await db.select().from(projectMembers)
      .where(and(eq(projectMembers.projectId, projectId), eq(projectMembers.userId, userId)));
    
    if (existing.length > 0) {
      return res.status(400).json({ error: 'El usuario ya es miembro de este proyecto' });
    }

    await withTenantContext(req.user!.tenantId, async (tx) => {
      await tx.insert(projectMembers).values({
        projectId,
        userId,
        roleInProject
      });
    });
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: 'Error al asignar usuario' });
  }
};

export const removeMembers = async (req: AuthRequest, res, next: NextFunction) => {
  try {
    const { role } = req.user!;
    if (role !== 'DIRECTOR' && role !== 'MANAGER' && role !== 'RESPONSABLE_PROYECTO') {
      return res.status(403).json({ error: 'No autorizado para remover equipo' });
    }
    const projectId = parseInt(req.params.id);
    const userId = parseInt(req.params.userId);

    await withTenantContext(req.user!.tenantId, async (tx) => {
      await tx.delete(projectMembers)
        .where(and(eq(projectMembers.projectId, projectId), eq(projectMembers.userId, userId)));
    });
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: 'Error al remover usuario' });
  }
};

export const addAgreements = async (req: AuthRequest, res, next: NextFunction) => {
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

    const newAgreement = await withTenantContext(req.user!.tenantId, async (tx) => {
      return await tx.insert(agreements).values({
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
    });

    await logActivity(projectId, userName, `Registró un nuevo convenio con "${counterparty}" por un monto de $${parseFloat(amount).toLocaleString()}`);
    res.status(201).json(newAgreement[0]);
  } catch (err) {
    console.error('Error creating agreement:', err);
    res.status(500).json({ error: 'Error al registrar convenio.' });
  }
};

export const addBudgetItems = async (req: AuthRequest, res, next: NextFunction) => {
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

    const newItem = await withTenantContext(req.user!.tenantId, async (tx) => {
      return await tx.insert(budgetLines).values({
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
    });

    await logActivity(projectId, userName, `Creó la partida presupuestaria [${code}] - ${category} (${subcategory}) por $${approvedAmount.toLocaleString()}`);

    res.status(201).json(newItem[0]);
  } catch (err) {
    console.error('Error adding budget item:', err);
    res.status(500).json({ error: 'Error al añadir partida presupuestaria' });
  }
};



export const getProjectLogs = async (req: AuthRequest, res, next: NextFunction) => {
  try {
    const projectId = parseInt(req.params.id);
    const tenantId = req.user!.tenantId;
    
    const isValid = await verifyProjectTenant(projectId, tenantId);
    if (!isValid) return res.status(403).json({ error: 'Access denied' });

    const logs = await db.select({
      id: projectLogs.id,
      type: projectLogs.type,
      content: projectLogs.content,
      date: projectLogs.date,
      authorId: projectLogs.authorId,
      authorName: users.name
    }).from(projectLogs)
      .leftJoin(users, eq(projectLogs.authorId, users.id))
      .where(and(eq(projectLogs.projectId, projectId), eq(projectLogs.tenantId, tenantId)))
      .orderBy(desc(projectLogs.date));

    res.json(logs);
  } catch (err) {
    console.error('Error fetching logs:', err);
    res.status(500).json({ error: 'Failed to fetch logs' });
  }
};

export const addLogs = async (req: AuthRequest, res, next: NextFunction) => {
  try {
    const projectId = parseInt(req.params.id);
    const tenantId = req.user!.tenantId;
    const authorId = req.user!.id;
    const { type, content } = req.body;
    
    const isValid = await verifyProjectTenant(projectId, tenantId);
    if (!isValid) return res.status(403).json({ error: 'Access denied' });

    const newLog = await withTenantContext(req.user!.tenantId, async (tx) => {
      return await tx.insert(projectLogs).values({
        tenantId,
        projectId,
        authorId,
        type,
        content,
        date: new Date()
      }).returning();
    });

    await logActivity(tenantId, req.user!.name, `Added project log (${type}) to project ID ${projectId}`);
    res.json({
      ...newLog[0],
      authorName: req.user!.name // O cualquier nombre disponible
    });
  } catch (err) {
    console.error('Error creating log:', err);
    res.status(500).json({ error: 'Failed to create log' });
  }
};

export const getEvents = async (req: AuthRequest, res, next: NextFunction) => {
  try {
    const tenantId = req.user!.tenantId;
    const projectId = parseInt(req.params.id);
    const eventsData = await db.select().from(events)
      .where(and(eq(events.tenantId, tenantId), eq(events.projectId, projectId)))
      .orderBy(events.startTime);
    res.json(eventsData);
  } catch (err) {
    console.error('Error fetching project events:', err);
    res.status(500).json({ error: 'Failed to fetch events' });
  }
};

export const addExpenses = async (req: AuthRequest, res, next: NextFunction) => {
  try {
    const { projectId } = req.params;
    const tenantId = req.user!.tenantId;
    
    if (!(await verifyProjectTenant(parseInt(projectId), tenantId))) {
      return res.status(403).json({ error: 'Access denied to this project' });
    }

    const { 
      budgetLineId, 
      originalAmount, 
      originalCurrency, 
      exchangeRate, 
      baseAmount, 
      exchangeRateSource, 
      exchangeRateDate,
      date, 
      description 
    } = req.body;

    const newExpense = await withTenantContext(req.user!.tenantId, async (tx) => {
      return await tx.insert(expenses).values({
        tenantId,
        projectId: parseInt(projectId),
        budgetLineId: parseInt(budgetLineId),
        amount: originalAmount, // legacy fallback for now
        currency: originalCurrency, // legacy fallback for now
        originalAmount,
        originalCurrency,
        exchangeRate: exchangeRate || 1,
        baseAmount,
        exchangeRateSource,
        exchangeRateDate: exchangeRateDate ? new Date(exchangeRateDate) : new Date(),
        date: new Date(date),
        description,
        status: 'PENDING_APPROVAL',
        registeredBy: req.user!.id
      }).returning();
    });

    res.json(newExpense[0]);
  } catch (err) {
    console.error('Error creating expense:', err);
    res.status(500).json({ error: 'Failed to create expense' });
  }
};

// --- BUD-01: Control de Versiones Presupuestarias e Inmutabilidad ---

export const getBudgetVersions = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const projectId = parseInt(req.params.id);
    const tenantId = req.user!.tenantId;

    if (!(await verifyProjectTenant(projectId, tenantId))) {
      return res.status(404).json({ error: 'Proyecto no encontrado en esta organización.' });
    }

    const { getBudgetVersionsByProject } = await import('../services/budget.service.ts');
    const versions = await getBudgetVersionsByProject(tenantId, projectId);
    res.json(versions);
  } catch (err) {
    console.error('Error fetching budget versions:', err);
    res.status(500).json({ error: 'Error al consultar versiones presupuestarias' });
  }
};

export const addBudgetVersion = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const projectId = parseInt(req.params.id);
    const tenantId = req.user!.tenantId;
    const userId = req.user!.id || 1;

    if (!(await verifyProjectTenant(projectId, tenantId))) {
      return res.status(404).json({ error: 'Proyecto no encontrado en esta organización.' });
    }

    const { versionName, reason, lines } = req.body;
    const { createBudgetVersion } = await import('../services/budget.service.ts');

    const newVersion = await createBudgetVersion(tenantId, projectId, userId, {
      versionName,
      reason,
      lines,
    });

    res.status(201).json(newVersion);
  } catch (err: any) {
    console.error('Error creating budget version:', err);
    res.status(err.statusCode || 500).json({ error: err.message || 'Error al crear versión presupuestaria' });
  }
};


