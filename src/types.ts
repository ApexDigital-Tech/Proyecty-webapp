export type UserRole = 'DIRECTOR' | 'MANAGER' | 'FINANCE' | 'AUDITOR' | 'FINANCIADOR' | 'RESPONSABLE_PROYECTO';

export const AUTHORIZED_CURRENCIES = [
  { code: 'BOB', name: 'Boliviano', label: 'BOB — Boliviano' },
  { code: 'USD', name: 'Dólar estadounidense', label: 'USD — Dólar estadounidense' },
  { code: 'EUR', name: 'Euro', label: 'EUR — Euro' },
] as const;

export type AuthorizedCurrency = 'BOB' | 'USD' | 'EUR';

export interface PaginationInfo {
  totalItems: number;
  currentPage: number;
  totalPages: number;
  limit: number;
}

export interface PaginatedResponse<T> {
  data: T[];
  pagination?: PaginationInfo | null;
}

export interface User {
  id?: number;
  uid: string;
  email: string;
  name: string;
  role: UserRole;
  avatarUrl?: string;
}

export interface Project {
  id: number;
  code: string;
  name: string;
  donor: string;
  status: 'EJECUCIÓN' | 'ACTIVO' | 'PLANIFICACIÓN';
  riskLevel: 'Bajo' | 'Medio' | 'Alto';
  approvedBudget: number;
  baseCurrency?: 'BOB' | 'USD' | 'EUR';
  physicalProgress: number;
  financialProgress: number;
  nextMilestoneDate?: string;
  nextMilestoneTitle?: string;
  score: number;
  description?: string;
  createdAt?: string;
}

export interface Clause {
  id: number;
  agreementId: number;
  title: string;
  description: string;
  priority: 'ALTA PRIORIDAD' | 'COMPLIANCE' | 'LEGAL' | 'Crítico';
  category: string;
}

export interface Disbursement {
  id: number;
  agreementId: number;
  milestoneTitle: string;
  estimatedDate: string;
  amount: number;
  condition: string;
  status: 'PAGADO' | 'PENDIENTE' | 'ATRASADO' | 'PROGRAMADO';
}

export interface Agreement {
  id: number;
  projectId: number;
  counterparty: string;
  signedDate: string;
  amount: number;
  durationMonths: number;
  startDate: string;
  endDate: string;
  remainingDays: number;
  status: 'Activo' | 'Cerrado';
  disbursements?: Disbursement[];
  clauses?: Clause[];
}

export interface BudgetItem {
  id: number;
  projectId: number;
  code: string;
  category: string;
  subcategory: string;
  approved: number;
  reformulated: number;
  executed: number;
  balance: number;
  progress: number;
  status: 'NORMAL' | 'EN LÍMITE' | 'EXCEDIDO';
}

export interface Voucher {
  id: number;
  projectId: number;
  budgetItemId: number;
  type: string;
  amount: number;
  currency: string;
  provider: string;
  issueDate: string;
  milestone: string;
  description?: string;
  fileName: string;
  fileUrl?: string;
  isVerified: boolean;
  createdAt?: string;
}

export interface DocumentFile {
  id: number;
  projectId: number;
  name: string;
  size: string;
  type: string;
  uploadDate: string;
  fileUrl?: string;
}

export interface ActivityLog {
  id: number;
  projectId?: number;
  userName: string;
  actionDescription: string;
  timeAgo: string;
  entityType?: string;
  createdAt?: string;
}

export type ExpenseStatus = 'pending' | 'approved' | 'rejected' | 'reversed';

export interface Expense {
  id: number;
  tenantId: number;
  projectId: number;
  budgetLineId: number;
  amount: number;
  currency: string;
  exchangeRate: number;
  baseAmount: number;
  exchangeRateSource?: string;
  exchangeRateDate?: string;
  date: string;
  title: string;
  description?: string;
  category?: string;
  status: ExpenseStatus;
  registeredBy: number;
  approvedBy?: number | null;
  createdAt?: string;
  vouchers?: Voucher[];
}

