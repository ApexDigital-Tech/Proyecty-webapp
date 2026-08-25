import { db } from '../db/index.ts';
import { tasks, taskDependencies, projectMembers, projects, users } from '../db/schema.ts';
import { eq, and, inArray, desc } from 'drizzle-orm';
import { withTenantContext } from '../utils/dbWrapper.ts';
import { logAuditEvent } from './audit.service.ts';
import { NotFoundError, ValidationError, ForbiddenError, ConflictError } from '../utils/errors.ts';

export interface CreateTaskDto {
  title: string;
  description?: string;
  startDate?: string;
  dueDate?: string;
  status?: 'TODO' | 'IN_PROGRESS' | 'REVIEW' | 'DONE';
  priority?: 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT';
  assigneeId?: number;
  weight?: number;
  progress?: number;
  dependsOnTaskIds?: number[];
}

export interface TaskNode {
  id: number;
  title: string;
  weight: number;
  progress: number;
  dependsOn: number[];
}

/**
 * Detecta si agregar una dependencia entre taskId y dependsOnId generaría un ciclo dirigido (DAG DFS)
 */
export function hasCircularDependency(
  existingDependencies: { taskId: number; dependsOnId: number }[],
  newTaskId: number,
  newDependsOnId: number
): boolean {
  if (newTaskId === newDependsOnId) return true;

  // Construir lista de adyacencia (arista de tarea dependiente a su predecesora)
  const adj = new Map<number, number[]>();
  for (const dep of existingDependencies) {
    if (!adj.has(dep.taskId)) adj.set(dep.taskId, []);
    adj.get(dep.taskId)!.push(dep.dependsOnId);
  }

  if (!adj.has(newTaskId)) adj.set(newTaskId, []);
  adj.get(newTaskId)!.push(newDependsOnId);

  // Búsqueda en profundidad (DFS) para detectar si podemos llegar desde newDependsOnId hasta newTaskId
  const visited = new Set<number>();
  const recursionStack = new Set<number>();

  function dfs(curr: number): boolean {
    visited.add(curr);
    recursionStack.add(curr);

    const neighbors = adj.get(curr) || [];
    for (const next of neighbors) {
      if (!visited.has(next)) {
        if (dfs(next)) return true;
      } else if (recursionStack.has(next)) {
        return true;
      }
    }

    recursionStack.delete(curr);
    return false;
  }

  for (const node of adj.keys()) {
    if (!visited.has(node)) {
      if (dfs(node)) return true;
    }
  }

  return false;
}

/**
 * Calcula el avance físico ponderado reproducible: sum(weight * progress) / sum(weight)
 */
export function calculatePhysicalProgress(taskList: { weight?: number | null; progress?: number | null; status?: string | null }[]): number {
  if (!taskList || taskList.length === 0) return 0;

  let totalWeight = 0;
  let weightedProgressSum = 0;

  for (const t of taskList) {
    const w = (t.weight !== undefined && t.weight !== null && t.weight > 0) ? Number(t.weight) : 1;
    let p = 0;
    if (t.progress !== undefined && t.progress !== null) {
      p = Math.min(100, Math.max(0, Number(t.progress)));
      if (p === 0 && t.status === 'DONE') p = 100;
      else if (p === 0 && t.status === 'IN_PROGRESS') p = 50;
    } else if (t.status === 'DONE') {
      p = 100;
    } else if (t.status === 'IN_PROGRESS') {
      p = 50;
    }

    totalWeight += w;
    weightedProgressSum += (w * p);
  }

  if (totalWeight === 0) return 0;
  const result = weightedProgressSum / totalWeight;
  return Math.round(result * 100) / 100; // 2 decimales
}

/**
 * Crea una tarea en el cronograma con validación de fechas, pesos, avance y dependencias,
 * y sincroniza transaccionalmente projects.physical_progress.
 */
export const createScheduleTask = async (
  tenantId: number,
  projectId: number,
  userId: number,
  userRole: string,
  data: CreateTaskDto
) => {
  return await withTenantContext(tenantId, async (tx) => {
    // 1. Validar proyecto y pertenencia al tenant
    const [project] = await tx.select().from(projects).where(
      and(eq(projects.id, projectId), eq(projects.tenantId, tenantId))
    );
    if (!project) {
      throw new NotFoundError('El proyecto no existe en esta organización.');
    }

    // 2. Control de asignación para Responsable de Proyecto
    if (userRole === 'RESPONSABLE_PROYECTO') {
      const [membership] = await tx.select().from(projectMembers).where(
        and(eq(projectMembers.projectId, projectId), eq(projectMembers.userId, userId))
      );
      if (!membership) {
        throw new ForbiddenError('Acceso denegado: El Responsable de Proyecto solo puede gestionar cronogramas de proyectos asignados.');
      }
    }

    // 3. Validación de Fechas
    const start = data.startDate ? new Date(data.startDate) : new Date();
    const due = data.dueDate ? new Date(data.dueDate) : new Date(start.getTime() + 86400000);

    if (start.getTime() > due.getTime()) {
      throw new ValidationError('Control M-07: La fecha de inicio no puede ser posterior a la fecha de vencimiento.');
    }

    // 4. Validar dependencias predecesoras
    const dependsOn = data.dependsOnTaskIds || [];
    if (dependsOn.length > 0) {
      const existingPredecessors = await tx.select().from(tasks).where(
        and(inArray(tasks.id, dependsOn), eq(tasks.projectId, projectId), eq(tasks.tenantId, tenantId))
      );

      if (existingPredecessors.length !== dependsOn.length) {
        throw new NotFoundError('Una o más tareas predecesoras no existen en este proyecto.');
      }

      // Validar fechas de predecesoras (predecessora.due <= task.start)
      for (const pred of existingPredecessors) {
        if (pred.dueDate && pred.dueDate.getTime() > start.getTime()) {
          throw new ValidationError(
            `Control M-07: La tarea predecesora "${pred.title}" termina (${pred.dueDate.toISOString().slice(0, 10)}) después del inicio de la tarea dependiente (${start.toISOString().slice(0, 10)}).`
          );
        }
      }
    }

    const parsedWeight = (data.weight !== undefined && data.weight !== null && data.weight > 0) ? Number(data.weight) : 1;
    const parsedProgress = data.progress !== undefined ? Math.min(100, Math.max(0, Number(data.progress))) : (data.status === 'DONE' ? 100 : 0);

    // 5. Inserción de tarea
    const [newTask] = await tx.insert(tasks).values({
      tenantId,
      projectId,
      title: data.title,
      description: data.description || '',
      status: data.status || 'TODO',
      priority: data.priority || 'MEDIUM',
      assigneeId: data.assigneeId || null,
      createdBy: userId,
      startDate: start,
      dueDate: due,
      weight: parsedWeight,
      progress: parsedProgress,
      position: 0,
    }).returning();

    // 6. Registro de dependencias
    if (dependsOn.length > 0) {
      for (const depId of dependsOn) {
        await tx.insert(taskDependencies).values({
          taskId: newTask.id,
          dependsOnId: depId,
        });
      }
    }

    // 7. Sincronización Transaccional Obligatoria del Avance Físico del Proyecto
    const allProjectTasks = await tx.select().from(tasks).where(eq(tasks.projectId, projectId));
    const newProjectProgress = calculatePhysicalProgress(allProjectTasks);
    await tx.update(projects).set({ physicalProgress: Math.round(newProjectProgress) }).where(eq(projects.id, projectId));

    // 8. Auditoría
    logAuditEvent({
      tenantId,
      userId,
      action: 'TASK_CREATED',
      entity: 'task',
      entityId: newTask.id.toString(),
      metadata: {
        projectId,
        title: data.title,
        weight: parsedWeight,
        progress: parsedProgress,
        dependsOnCount: dependsOn.length,
        projectPhysicalProgress: newProjectProgress,
      },
    });

    return newTask;
  });
};
