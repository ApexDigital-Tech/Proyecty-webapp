import { Request, Response, NextFunction } from 'express';
import { db } from '../db/index.ts';
import { tasks, users, projectMembers, taskDependencies, projects } from '../db/schema.ts';
import { eq, and, asc, inArray } from 'drizzle-orm';
import { AuthRequest } from '../middleware/auth.ts';
import { verifyProjectTenant } from './projects.controller.ts';
import { logActivity } from '../db/audit.ts';
import { hasCircularDependency, calculatePhysicalProgress } from '../services/schedule.service.ts';

export const getTasks = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const projectId = req.query.projectId ? parseInt(req.query.projectId as string) : null;
    if (!projectId) {
      return res.status(400).json({ success: false, message: 'projectId es requerido' });
    }

    const isValidTenant = await verifyProjectTenant(projectId, req.user!.tenantId);
    if (!isValidTenant) return res.status(403).json({ success: false, message: 'Acceso denegado a este proyecto' });

    const projectTasks = await db.select({
      task: tasks,
      assigneeName: users.name
    })
      .from(tasks)
      .leftJoin(users, eq(tasks.assigneeId, users.id))
      .where(and(eq(tasks.projectId, projectId), eq(tasks.tenantId, req.user!.tenantId)))
      .orderBy(asc(tasks.position));

    const taskIds = projectTasks.map(t => t.task.id);
    const dependencies = taskIds.length > 0
      ? await db.select().from(taskDependencies).where(inArray(taskDependencies.taskId, taskIds))
      : [];

    const depMap = new Map<number, number[]>();
    for (const d of dependencies) {
      if (d.taskId && d.dependsOnId) {
        if (!depMap.has(d.taskId)) depMap.set(d.taskId, []);
        depMap.get(d.taskId)!.push(d.dependsOnId);
      }
    }

    const formattedTasks = projectTasks.map(t => {
      const w = (t.task.weight !== null && t.task.weight !== undefined && t.task.weight > 0) ? t.task.weight : 1;
      let p = t.task.progress;
      if (p === null || p === undefined || (p === 0 && t.task.status !== 'TODO')) {
        p = t.task.status === 'DONE' ? 100 : t.task.status === 'IN_PROGRESS' ? 50 : 0;
      }
      return {
        ...t.task,
        assigneeName: t.assigneeName,
        weight: w,
        progress: p,
        dependsOnIds: depMap.get(t.task.id) || [],
      };
    });

    const projectPhysicalProgress = calculatePhysicalProgress(formattedTasks);

    res.json({ 
      success: true, 
      data: formattedTasks,
      projectPhysicalProgress,
    });
  } catch (err: any) {
    console.error('Error fetching tasks:', err);
    res.status(500).json({ success: false, message: 'Error al obtener tareas' });
  }
};

export const createTask = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const { 
      projectId, 
      title, 
      description, 
      status, 
      priority, 
      assigneeId, 
      startDate, 
      dueDate, 
      weight, 
      progress, 
      dependsOnTaskIds 
    } = req.body;
    
    if (!projectId || !title) {
      return res.status(400).json({ success: false, message: 'projectId y title son requeridos' });
    }

    const isValidTenant = await verifyProjectTenant(projectId, req.user!.tenantId);
    if (!isValidTenant) return res.status(403).json({ success: false, message: 'Acceso denegado a este proyecto' });

    // Validar control 'assigned' para Responsable de Proyecto
    if (req.user?.role === 'RESPONSABLE_PROYECTO') {
      const [membership] = await db.select().from(projectMembers).where(
        and(eq(projectMembers.projectId, projectId), eq(projectMembers.userId, req.user.id))
      );
      if (!membership) {
        return res.status(403).json({ success: false, message: 'Acceso denegado: Solo asignados al proyecto pueden crear tareas' });
      }
    }

    const start = startDate ? new Date(startDate) : new Date();
    const due = dueDate ? new Date(dueDate) : new Date(start.getTime() + 86400000);

    if (start.getTime() > due.getTime()) {
      return res.status(400).json({ success: false, message: 'La fecha de inicio no puede ser posterior a la fecha de vencimiento' });
    }

    const parsedWeight = weight !== undefined ? Number(weight) : 1;
    if (parsedWeight <= 0 || isNaN(parsedWeight)) {
      return res.status(400).json({ success: false, message: 'El peso de la tarea debe ser un número positivo mayor a 0' });
    }

    const parsedProgress = progress !== undefined ? Math.min(100, Math.max(0, Number(progress))) : (status === 'DONE' ? 100 : 0);

    const dependsOn: number[] = Array.isArray(dependsOnTaskIds) ? dependsOnTaskIds : [];

    // Validar dependencias predecesoras
    if (dependsOn.length > 0) {
      const existingPredecessors = await db.select().from(tasks).where(
        and(inArray(tasks.id, dependsOn), eq(tasks.projectId, projectId), eq(tasks.tenantId, req.user!.tenantId))
      );

      if (existingPredecessors.length !== dependsOn.length) {
        return res.status(404).json({ success: false, message: 'Una o más tareas predecesoras no existen en este proyecto' });
      }

      for (const pred of existingPredecessors) {
        if (pred.dueDate && pred.dueDate.getTime() > start.getTime()) {
          return res.status(400).json({
            success: false,
            message: `La tarea predecesora "${pred.title}" concluye después del inicio de esta tarea`
          });
        }
      }

      // Comprobar detección de ciclos en dependencias
      const projectTasks = await db.select({ id: tasks.id }).from(tasks).where(eq(tasks.projectId, projectId));
      const pTaskIds = projectTasks.map(t => t.id);
      const existingDeps = pTaskIds.length > 0
        ? await db.select().from(taskDependencies).where(inArray(taskDependencies.taskId, pTaskIds))
        : [];

      for (const depId of dependsOn) {
        // Usar temp ID 0 para la nueva tarea
        if (hasCircularDependency(existingDeps.map(d => ({ taskId: d.taskId!, dependsOnId: d.dependsOnId! })), 0, depId)) {
          return res.status(409).json({
            success: false,
            message: `Dependencia circular detectada al vincular con la tarea ${depId}`
          });
        }
      }
    }

    const newTask = await db.insert(tasks).values({
      tenantId: req.user!.tenantId,
      projectId,
      title,
      description: description || '',
      status: status || 'TODO',
      priority: priority || 'MEDIUM',
      assigneeId: assigneeId ? parseInt(assigneeId) : null,
      createdBy: (req.user!.id !== undefined && req.user!.id !== null) ? req.user!.id : 1,
      startDate: start,
      dueDate: due,
      weight: parsedWeight,
      progress: parsedProgress,
      position: 0
    }).returning();

    const createdTask = newTask[0];

    // Guardar dependencias
    if (dependsOn.length > 0) {
      for (const depId of dependsOn) {
        await db.insert(taskDependencies).values({
          taskId: createdTask.id,
          dependsOnId: depId,
        });
      }
    }

    // Actualizar avance físico del proyecto
    const allProjectTasks = await db.select().from(tasks).where(eq(tasks.projectId, projectId));
    const newProgress = calculatePhysicalProgress(allProjectTasks);
    await db.update(projects).set({ physicalProgress: newProgress }).where(eq(projects.id, projectId));

    await logActivity(projectId, req.user!.name, `Creó la tarea: "${title}" (Peso: ${parsedWeight}, Progreso: ${parsedProgress}%)`);

    res.status(201).json({ 
      success: true, 
      data: {
        ...createdTask,
        dependsOnIds: dependsOn,
      },
      projectPhysicalProgress: newProgress
    });
  } catch (err: any) {
    console.error('Error creating task:', err);
    res.status(500).json({ success: false, message: 'Error al crear la tarea' });
  }
};

export const updateTask = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const taskId = parseInt(req.params.id);
    const { 
      title, 
      description, 
      status, 
      priority, 
      assigneeId, 
      startDate, 
      dueDate, 
      weight, 
      progress, 
      position,
      dependsOnTaskIds 
    } = req.body;
    
    if (isNaN(taskId)) return res.status(400).json({ success: false, message: 'ID de tarea inválido' });

    const existingTask = await db.select().from(tasks).where(
      and(eq(tasks.id, taskId), eq(tasks.tenantId, req.user!.tenantId))
    ).limit(1);
    
    if (existingTask.length === 0) {
      return res.status(404).json({ success: false, message: 'Tarea no encontrada' });
    }

    const task = existingTask[0];

    // Control de dependencias y detección de ciclos
    if (dependsOnTaskIds !== undefined && Array.isArray(dependsOnTaskIds)) {
      const projectTasks = await db.select({ id: tasks.id }).from(tasks).where(eq(tasks.projectId, task.projectId));
      const pTaskIds = projectTasks.map(t => t.id);
      
      const existingDeps = pTaskIds.length > 0
        ? await db.select().from(taskDependencies).where(
            and(inArray(taskDependencies.taskId, pTaskIds))
          )
        : [];

      // Filtrar dependencias actuales de esta tarea para chequear el nuevo grafo
      const otherDeps = existingDeps
        .filter(d => d.taskId !== taskId)
        .map(d => ({ taskId: d.taskId!, dependsOnId: d.dependsOnId! }));

      for (const depId of dependsOnTaskIds) {
        if (hasCircularDependency(otherDeps, taskId, depId)) {
          return res.status(409).json({
            success: false,
            message: `Dependencia circular detectada al vincular la tarea ${taskId} con la tarea predecesora ${depId}`
          });
        }
      }

      // Reemplazar dependencias de la tarea
      await db.delete(taskDependencies).where(eq(taskDependencies.taskId, taskId));
      for (const depId of dependsOnTaskIds) {
        await db.insert(taskDependencies).values({
          taskId,
          dependsOnId: depId,
        });
      }
    }

    const parsedWeight = weight !== undefined ? Number(weight) : task.weight;
    if (parsedWeight <= 0 || isNaN(parsedWeight)) {
      return res.status(400).json({ success: false, message: 'El peso de la tarea debe ser mayor a 0' });
    }

    const parsedProgress = progress !== undefined ? Math.min(100, Math.max(0, Number(progress))) : (status === 'DONE' ? 100 : task.progress);

    const updatedTask = await db.update(tasks).set({
      title: title !== undefined ? title : task.title,
      description: description !== undefined ? description : task.description,
      status: status !== undefined ? status : task.status,
      priority: priority !== undefined ? priority : task.priority,
      assigneeId: assigneeId !== undefined ? (assigneeId ? parseInt(assigneeId) : null) : task.assigneeId,
      startDate: startDate !== undefined ? (startDate ? new Date(startDate) : null) : task.startDate,
      dueDate: dueDate !== undefined ? (dueDate ? new Date(dueDate) : null) : task.dueDate,
      weight: parsedWeight,
      progress: parsedProgress,
      position: position !== undefined ? position : task.position,
      completedAt: (status === 'DONE' || parsedProgress === 100) && task.status !== 'DONE' ? new Date() : (status !== 'DONE' && parsedProgress < 100 ? null : task.completedAt)
    }).where(eq(tasks.id, taskId)).returning();

    // Recomputar avance del proyecto
    const allProjectTasks = await db.select().from(tasks).where(eq(tasks.projectId, task.projectId));
    const newProgress = calculatePhysicalProgress(allProjectTasks);
    await db.update(projects).set({ physicalProgress: newProgress }).where(eq(projects.id, task.projectId));

    await logActivity(task.projectId, req.user!.name, `Actualizó la tarea: "${updatedTask[0].title}"`);

    res.json({ 
      success: true, 
      data: updatedTask[0],
      projectPhysicalProgress: newProgress
    });
  } catch (err: any) {
    console.error('Error updating task:', err);
    res.status(500).json({ success: false, message: 'Error al actualizar la tarea' });
  }
};

export const deleteTask = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const taskId = parseInt(req.params.id);
    if (isNaN(taskId)) return res.status(400).json({ success: false, message: 'ID de tarea inválido' });

    const existingTask = await db.select().from(tasks).where(
      and(eq(tasks.id, taskId), eq(tasks.tenantId, req.user!.tenantId))
    ).limit(1);
    
    if (existingTask.length === 0) {
      return res.status(404).json({ success: false, message: 'Tarea no encontrada' });
    }

    await db.delete(taskDependencies).where(eq(taskDependencies.taskId, taskId));
    await db.delete(taskDependencies).where(eq(taskDependencies.dependsOnId, taskId));
    await db.delete(tasks).where(eq(tasks.id, taskId));

    // Recomputar avance del proyecto
    const allProjectTasks = await db.select().from(tasks).where(eq(tasks.projectId, existingTask[0].projectId));
    const newProgress = calculatePhysicalProgress(allProjectTasks);
    await db.update(projects).set({ physicalProgress: newProgress }).where(eq(projects.id, existingTask[0].projectId));

    await logActivity(existingTask[0].projectId, req.user!.name, `Eliminó la tarea: "${existingTask[0].title}"`);

    res.json({ success: true, message: 'Tarea eliminada', projectPhysicalProgress: newProgress });
  } catch (err: any) {
    console.error('Error deleting task:', err);
    res.status(500).json({ success: false, message: 'Error al eliminar la tarea' });
  }
};
