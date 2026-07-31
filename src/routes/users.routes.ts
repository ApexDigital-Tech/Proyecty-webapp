import { Router } from 'express';
import { requireAuth } from '../middleware/auth.ts';
import { validateSchema } from '../middlewares/validateSchema.ts';
import * as UsersController from '../controllers/users.controller.ts';
import { z } from 'zod';

const router = Router();

// Zod schemas
const createUserSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  email: z.string().email('Invalid email'),
  role: z.enum(['DIRECTOR', 'MANAGER', 'FINANCE', 'AUDITOR', 'FINANCIADOR', 'RESPONSABLE_PROYECTO', 'TECNICO_PROYECTO']),
});

const updateUserSchema = z.object({
  name: z.string().min(1).optional(),
  email: z.string().email().optional(),
  role: z.enum(['DIRECTOR', 'MANAGER', 'FINANCE', 'AUDITOR', 'FINANCIADOR', 'RESPONSABLE_PROYECTO', 'TECNICO_PROYECTO']).optional(),
  isActive: z.boolean().optional(),
});

// Routes
router.get('/', requireAuth, UsersController.listUsers);
router.post('/', requireAuth, validateSchema(createUserSchema), UsersController.createUser);
router.patch('/:id', requireAuth, validateSchema(updateUserSchema), UsersController.updateUser);
router.delete('/:id', requireAuth, UsersController.deleteUser);

export default router;
