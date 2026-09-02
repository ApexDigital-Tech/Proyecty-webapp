import type { NextFunction, Response } from 'express';
import type { AuthRequest } from '../middleware/auth.ts';
import {
  approveImportedPlanVersion,
  getAbuelitasPlanTemplateCsv,
  processPlanImportBatch,
} from '../services/importPlan.service.ts';
import { db } from '../db/index.ts';
import { projects } from '../db/schema.ts';
import { and, eq } from 'drizzle-orm';

const allowedImportRoles = new Set(['DIRECTOR', 'MANAGER', 'FINANCE']);

const parseProjectId = (value: string) => {
  const id = Number.parseInt(value, 10);
  if (!Number.isInteger(id) || id <= 0) throw Object.assign(new Error('Identificador de proyecto inválido.'), { statusCode: 400 });
  return id;
};

export const downloadAbuelitasPlanTemplate = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const projectId = parseProjectId(req.params.id);
    const [project] = await db.select({ code: projects.code }).from(projects)
      .where(and(eq(projects.id, projectId), eq(projects.tenantId, req.user!.tenantId))).limit(1);
    if (!project) return res.status(404).json({ error: 'Proyecto no encontrado.' });

    const csv = getAbuelitasPlanTemplateCsv(project.code);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="plan_abuelitas_${project.code}_2026.csv"`);
    return res.status(200).send(`\uFEFF${csv}`);
  } catch (error) {
    next(error);
  }
};

export const importBudgetPlan = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    if (!allowedImportRoles.has(req.user!.role)) return res.status(403).json({ error: 'Solo Dirección, Coordinación o Finanzas pueden importar planes.' });
    if (!req.file) return res.status(400).json({ error: 'Debe seleccionar un archivo CSV.' });
    const projectId = parseProjectId(req.params.id);
    const content = req.file.buffer.toString('utf8');
    const result = await processPlanImportBatch(req.user!.tenantId, req.user!.id!, projectId, req.file.originalname, content);
    return res.status(result.status === 'REJECTED' ? 422 : 201).json(result);
  } catch (error) {
    next(error);
  }
};

export const approveBudgetPlanVersion = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    if (req.user!.role !== 'DIRECTOR') return res.status(403).json({ error: 'La aprobación corresponde exclusivamente al Director.' });
    const projectId = parseProjectId(req.params.id);
    const versionId = parseProjectId(req.params.versionId);
    const result = await approveImportedPlanVersion(
      req.user!.tenantId,
      req.user!.id!,
      projectId,
      versionId,
      req.body?.acknowledgeClassifierWarnings === true
    );
    return res.status(200).json(result);
  } catch (error) {
    next(error);
  }
};
