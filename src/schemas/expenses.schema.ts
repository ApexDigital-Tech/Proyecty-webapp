import { z } from 'zod';

export const expenseStatusEnum = z.enum(['pending', 'approved', 'rejected', 'reversed'], {
  errorMap: () => ({ message: 'Estado inválido. Debe ser: pending, approved, rejected o reversed' }),
});

export const createExpenseSchema = z.object({
  title: z.string().min(3, 'El título debe tener al menos 3 caracteres'),
  amount: z.number().positive('El monto debe ser estrictamente positivo (> 0)'),
  currency: z.enum(['USD', 'BOB', 'EUR'], {
    errorMap: () => ({ message: 'Moneda no autorizada. Monedas permitidas: USD, BOB, EUR' }),
  }).default('USD'),
  exchangeRate: z.number().positive('El tipo de cambio debe ser mayor a 0').default(1),
  projectId: z.number().int().positive('ID de proyecto inválido'),
  budgetLineId: z.number().int().positive('ID de partida presupuestaria inválido'),
  description: z.string().optional(),
  category: z.string().optional().default('General'),
  date: z.string().or(z.date()).optional(),
});

export type CreateExpenseDto = z.infer<typeof createExpenseSchema>;

export const approveExpenseSchema = z.object({
  status: z.enum(['approved', 'rejected']).default('approved'),
});

export type ApproveExpenseDto = z.infer<typeof approveExpenseSchema>;

export const reverseExpenseSchema = z.object({
  reason: z.string().min(5, 'El motivo de reversión debe tener al menos 5 caracteres'),
});

export type ReverseExpenseDto = z.infer<typeof reverseExpenseSchema>;
