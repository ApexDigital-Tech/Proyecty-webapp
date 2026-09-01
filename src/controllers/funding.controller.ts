import { Response, NextFunction } from 'express';
import { AuthRequest } from '../middleware/auth.ts';
import {
  createDonor,
  getDonorsByTenant,
  createAgreement,
  createDisbursement,
  getFundingSummaryByProject,
} from '../services/funding.service.ts';
import { logger } from '../lib/logger.ts';

export const createDonorHandler = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const tenantId = req.user?.tenantId;
    const userId = req.user?.id;
    if (!tenantId || !userId) return res.status(401).json({ error: 'No autorizado' });

    const donor = await createDonor(tenantId, userId, req.body);
    return res.status(201).json(donor);
  } catch (error) {
    logger.error('Error in createDonorHandler', { error });
    next(error);
  }
};

export const getDonorsHandler = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const tenantId = req.user?.tenantId;
    if (!tenantId) return res.status(401).json({ error: 'No autorizado' });

    const donorsList = await getDonorsByTenant(tenantId);
    return res.json(donorsList);
  } catch (error) {
    logger.error('Error in getDonorsHandler', { error });
    next(error);
  }
};

export const createAgreementHandler = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const tenantId = req.user?.tenantId;
    const userId = req.user?.id;
    if (!tenantId || !userId) return res.status(401).json({ error: 'No autorizado' });

    const projectId = req.params.projectId ? parseInt(req.params.projectId, 10) : req.body.projectId;
    const agreement = await createAgreement(tenantId, userId, {
      ...req.body,
      projectId: Number(projectId),
    });

    return res.status(201).json(agreement);
  } catch (error) {
    logger.error('Error in createAgreementHandler', { error });
    next(error);
  }
};

export const createDisbursementHandler = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const tenantId = req.user?.tenantId;
    const userId = req.user?.id;
    if (!tenantId || !userId) return res.status(401).json({ error: 'No autorizado' });

    const agreementId = req.params.agreementId ? parseInt(req.params.agreementId, 10) : req.body.agreementId;
    const disbursement = await createDisbursement(tenantId, userId, {
      ...req.body,
      agreementId: Number(agreementId),
    });

    return res.status(201).json(disbursement);
  } catch (error) {
    logger.error('Error in createDisbursementHandler', { error });
    next(error);
  }
};

export const getFundingSummaryHandler = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const tenantId = req.user?.tenantId;
    if (!tenantId) return res.status(401).json({ error: 'No autorizado' });

    const projectId = parseInt(req.params.projectId, 10);
    if (isNaN(projectId)) return res.status(400).json({ error: 'ID de proyecto inválido' });

    const summary = await getFundingSummaryByProject(tenantId, projectId);
    return res.json(summary);
  } catch (error) {
    logger.error('Error in getFundingSummaryHandler', { error });
    next(error);
  }
};
