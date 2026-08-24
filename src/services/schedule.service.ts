import { db } from '../db/index.ts';
import { tasks, taskDependencies, projects, projectMembers, users } from '../db/schema.ts';
import { eq, and, asc, inArray } from 'drizzle-orm';
import { withTenantContext } from '../utils/dbWrapper.ts';
import { logAuditEvent } from './audit.service.ts';
import { NotFoundError, ConflictError, ValidationError, ForbiddenError } from '../utils/errors.ts';

export interface CreateTaskDto {
  title: string;
  description?: string;
  status?: 'TODO' | 'IN_PROGRESS' | 'REVIEW' | 'DONE';
  priority?: 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT';
  assigneeId?: number;
  startDate?: string | Date;
  dueDate?: string | Date;
  weight?: number; // Ponderación de avance físico
  progress?: number; // 0 a 100
  dependsOnTaskIds?: number[]; // IDs de tareas predecesoras
}

/**
 * Algoritmo de detección de ciclos en grafo dirigido de dependencias (M-07)
 */
export function hasCircularDependency(
  allDependencies: { taskId: number; dependsOnId: number }[],
  newTaskId: number,
  newDependsOnId: number
): boolean {
  // Si depende de sí misma
  if (newTaskId === newDependsOnId) return true;

  // Construir lista de adyacencia (taskId -> lista de tareas de las que depende)
  const adj = new Map<number, number[]>();
  for (const dep of allDependencies) {
    if (!adj.has(dep.taskId)) adj.set(dep.taskId, []);
    adj.get(dep.taskId)!.push(dep.dependsOnId);
  }

  // Añadir la nueva arista propuesta
  if (!adj.has(newTaskId)) adj.set(newTaskId, []);
  adj.get(newTaskId)!.push(newDependsOnId);

  // DFS para detectar ciclos desde newTaskId
  const visited = new Set<number>();
  const recStack = new Set<number>();

  function dfs(curr: number): boolean {
    visited.add(curr);
    recStack.add(curr);

    const neighbors = adj.get(curr) || [];
    for (const next of neighbors) {
      if (!visited.has(next)) {
        if (dfs(next)) return true;
      } else if (recStack.has(next)) {
        return true; // Ciclo encontrado
      }
    }

    recStack.delete(curr);
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
 * Crea una tarea / hito en el cronograma con validación de fechas, dependencias y RBAC (M-07)
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
      position: 0,
    }).returning();

    // 6. Validar y registrar dependencias con detección de ciclos
    if (dependsOn.length > 0) {
      // Obtener todas las dependencias existentes del proyecto
      const projectTasks = await tx.select({ id: tasks.id }).from(tasks).where(eq(tasks.projectId, projectId));
      const pTaskIds = projectTasks.map(t => t.id);

      const existingDeps = pTaskIds.length > 0
        ? await tx.select().from(taskDependencies).where(inArray(taskDependencies.taskId, pTaskIds))
        : [];

      for (const depId of dependsOn) {
        if (hasCircularDependency(existingDeps.map(d => ({ taskId: d.taskId!, dependsOnId: d.dependsOnId! })), newTask.id, depId)) {
          throw new ConflictError(`Control M-07: Dependencia circular detectada al vincular la tarea ${newTask.id} con la tarea predecesora ${depId}.`);
        }

        await tx.insert(taskDependencies).values({
          taskId: newTask.id,
          dependsOnId: depId,
        });
      }
    }

    // 7. Auditoría
    logAuditEvent({
      tenantId,
      userId,
      action: 'SCHEDULE_TASK_CREATED',
      entity: 'task',
      entityId: newTask.id.toString(),
      metadata: {
        projectId,
        title: newTask.title,
        startDate: start.toISOString(),
        dueDate: due.toISOString(),
        dependencies: dependsOn,
      },
    });

    return newTask;
  });
};

/**
 * Calcula el avance físico ponderado reproducible del proyecto (M-07)
 */
export const calculatePhysicalProgress = (
  taskList: { id: number; status: string; weight?: number; progress?: number }[]
): number => {
  if (!taskList || taskList.length === 0) return 0;

  let totalWeight = 0;
  let weightedProgressSum = 0;

  for (const t of taskList) {
    const w = t.weight && t.weight > 0 ? t.weight : 1;
    let p = 0;
    if (t.progress !== undefined && t.progress !== null) {
      p = Math.min(100, Math.max(0, t.progress));
    } else {
      // Cálculo estándar por estado
      if (t.status === 'DONE') p = 100;
      else if (t.status === 'REVIEW') p = 80;
      else if (t.status === 'IN_PROGRESS') p = 50;
      else p = 0;
    }

    totalWeight += w;
    weightedProgressSum += (w * p);
  }

  if (totalWeight === 0) return 0;
  return Math.round((weightedProgressSum / totalWeight) * 100) / 100;
};
