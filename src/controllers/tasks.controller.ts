import { Request, Response, NextFunction } from 'express';
import { db } from '../db/index.ts';
import { tasks, users, projectMembers } from '../db/schema.ts';
import { eq, and, asc } from 'drizzle-orm';
import { AuthRequest } from '../middleware/auth.ts';
import { verifyProjectTenant } from './projects.controller.ts';
import { logActivity } from '../db/audit.ts';

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

    const formattedTasks = projectTasks.map(t => ({
      ...t.task,
      assigneeName: t.assigneeName
    }));

    res.json({ success: true, data: formattedTasks });
  } catch (err: any) {
    console.error('Error fetching tasks:', err);
    res.status(500).json({ success: false, message: 'Error al obtener tareas' });
  }
};

export const createTask = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const { projectId, title, description, status, priority, assigneeId, startDate, dueDate } = req.body;
    
    if (!projectId || !title) {
      return res.status(400).json({ success: false, message: 'projectId y title son requeridos' });
    }

    const isValidTenant = await verifyProjectTenant(projectId, req.user!.tenantId);
    if (!isValidTenant) return res.status(403).json({ success: false, message: 'Acceso denegado a este proyecto' });

    const newTask = await db.insert(tasks).values({
      tenantId: req.user!.tenantId,
      projectId,
      title,
      description: description || '',
      status: status || 'TODO',
      priority: priority || 'MEDIUM',
      assigneeId: assigneeId ? parseInt(assigneeId) : null,
      createdBy: (req.user!.id !== undefined && req.user!.id !== null) ? req.user!.id : 1,
      startDate: startDate ? new Date(startDate) : null,
      dueDate: dueDate ? new Date(dueDate) : null,
      position: 0
    }).returning();

    await logActivity(projectId, req.user!.name, `Creó la tarea: "${title}"`);

    res.status(201).json({ success: true, data: newTask[0] });
  } catch (err: any) {
    console.error('Error creating task:', err);
    res.status(500).json({ success: false, message: 'Error al crear la tarea' });
  }
};

export const updateTask = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const taskId = parseInt(req.params.id);
    const { title, description, status, priority, assigneeId, startDate, dueDate, position } = req.body;
    
    if (isNaN(taskId)) return res.status(400).json({ success: false, message: 'ID de tarea inválido' });

    const existingTask = await db.select().from(tasks).where(and(eq(tasks.id, taskId), eq(tasks.tenantId, req.user!.tenantId))).limit(1);
    
    if (existingTask.length === 0) {
      return res.status(404).json({ success: false, message: 'Tarea no encontrada' });
    }

    const updatedTask = await db.update(tasks).set({
      title: title !== undefined ? title : existingTask[0].title,
      description: description !== undefined ? description : existingTask[0].description,
      status: status !== undefined ? status : existingTask[0].status,
      priority: priority !== undefined ? priority : existingTask[0].priority,
      assigneeId: assigneeId !== undefined ? (assigneeId ? parseInt(assigneeId) : null) : existingTask[0].assigneeId,
      startDate: startDate !== undefined ? (startDate ? new Date(startDate) : null) : existingTask[0].startDate,
      dueDate: dueDate !== undefined ? (dueDate ? new Date(dueDate) : null) : existingTask[0].dueDate,
      position: position !== undefined ? position : existingTask[0].position,
      completedAt: status === 'DONE' && existingTask[0].status !== 'DONE' ? new Date() : (status !== 'DONE' ? null : existingTask[0].completedAt)
    }).where(eq(tasks.id, taskId)).returning();

    await logActivity(existingTask[0].projectId, req.user!.name, `Actualizó la tarea: "${updatedTask[0].title}"`);

    res.json({ success: true, data: updatedTask[0] });
  } catch (err: any) {
    console.error('Error updating task:', err);
    res.status(500).json({ success: false, message: 'Error al actualizar la tarea' });
  }
};

export const deleteTask = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const taskId = parseInt(req.params.id);
    if (isNaN(taskId)) return res.status(400).json({ success: false, message: 'ID de tarea inválido' });

    const existingTask = await db.select().from(tasks).where(and(eq(tasks.id, taskId), eq(tasks.tenantId, req.user!.tenantId))).limit(1);
    
    if (existingTask.length === 0) {
      return res.status(404).json({ success: false, message: 'Tarea no encontrada' });
    }

    await db.delete(tasks).where(eq(tasks.id, taskId));

    await logActivity(existingTask[0].projectId, req.user!.name, `Eliminó la tarea: "${existingTask[0].title}"`);

    res.json({ success: true, message: 'Tarea eliminada' });
  } catch (err: any) {
    console.error('Error deleting task:', err);
    res.status(500).json({ success: false, message: 'Error al eliminar la tarea' });
  }
};
