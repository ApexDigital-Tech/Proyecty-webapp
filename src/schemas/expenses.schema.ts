import { z } from 'zod';

export const createExpenseSchema = z.object({
  title: z.string().min(3, 'El título debe tener al menos 3 caracteres'),
  amount: z.number().positive('El monto debe ser positivo'),
  category: z.string().min(2, 'La categoría es requerida'),
  currency: z.enum(['BOB', 'USD', 'EUR'], {
    errorMap: () => ({ message: 'Moneda no autorizada. Monedas permitidas: BOB, USD, EUR' }),
  }).optional(),
  projectId: z.number().int().positive('Project ID inválido').optional(),
  budgetLineId: z.number().int().positive('Budget Line ID inválido').optional(),
});

export type CreateExpenseDto = z.infer<typeof createExpenseSchema>;

export const approveExpenseSchema = z.object({
  status: z.enum(['approved', 'rejected']),
});

export type ApproveExpenseDto = z.infer<typeof approveExpenseSchema>;
