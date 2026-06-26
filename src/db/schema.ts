import { integer, pgTable, serial, text, timestamp, boolean, doublePrecision, jsonb, pgEnum } from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';

// --- TENANT & ORG ---
export const organizations = pgTable('organizations', {
  id: serial('id').primaryKey(),
  name: text('name').notNull(),
  subscriptionPlan: text('subscription_plan').notNull().default('FREE'),
  isActive: boolean('is_active').notNull().default(true),
  createdAt: timestamp('created_at').defaultNow(),
});

// --- RBAC: Roles & Permissions ---
export const roles = pgTable('roles', {
  id: serial('id').primaryKey(),
  name: text('name').notNull(), // 'SuperAdmin', 'Director', 'Project Manager', 'Finance', 'Auditor'
  description: text('description'),
  isSystemRole: boolean('is_system_role').notNull().default(false), // true for built-in roles
});

export const permissions = pgTable('permissions', {
  id: serial('id').primaryKey(),
  roleId: integer('role_id').references(() => roles.id, { onDelete: 'cascade' }).notNull(),
  module: text('module').notNull(), // 'projects', 'budgets', 'vouchers', 'users'
  action: text('action').notNull(), // 'create', 'read', 'update', 'delete', 'approve'
});

// --- USERS ---
export const users = pgTable('users', {
  id: serial('id').primaryKey(),
  tenantId: integer('tenant_id').references(() => organizations.id, { onDelete: 'cascade' }).notNull(),
  uid: text('uid').notNull().unique(), // Supabase Auth UID
  email: text('email').notNull(),
  name: text('name').notNull(),
  roleId: integer('role_id').references(() => roles.id).notNull(),
  avatarUrl: text('avatar_url'),
  isActive: boolean('is_active').notNull().default(true),
  createdAt: timestamp('created_at').defaultNow(),
});

// --- DONORS ---
export const donors = pgTable('donors', {
  id: serial('id').primaryKey(),
  tenantId: integer('tenant_id').references(() => organizations.id, { onDelete: 'cascade' }).notNull(),
  name: text('name').notNull(),
  type: text('type'), // 'Internacional', 'Gubernamental', 'Privado'
  contactEmail: text('contact_email'),
  createdAt: timestamp('created_at').defaultNow(),
});

// --- PROJECTS ---
export const projects = pgTable('projects', {
  id: serial('id').primaryKey(),
  tenantId: integer('tenant_id').references(() => organizations.id, { onDelete: 'cascade' }).notNull(),
  code: text('code').notNull().unique(), // e.g. PRJ-2024-089
  name: text('name').notNull(),
  donorId: integer('donor_id').references(() => donors.id),
  status: text('status').notNull(), // 'EJECUCIÓN', 'ACTIVO', 'PLANIFICACIÓN'
  riskLevel: text('risk_level').notNull(), // 'Bajo', 'Medio', 'Alto'
  approvedBudget: doublePrecision('approved_budget').notNull(),
  physicalProgress: integer('physical_progress').notNull().default(0),
  financialProgress: integer('financial_progress').notNull().default(0),
  nextMilestoneDate: text('next_milestone_date'), 
  nextMilestoneTitle: text('next_milestone_title'),
  score: integer('score').notNull().default(100), 
  description: text('description'),
  createdAt: timestamp('created_at').defaultNow(),
});

// --- PROJECT MEMBERS (Access Control per Project) ---
export const projectMembers = pgTable('project_members', {
  id: serial('id').primaryKey(),
  projectId: integer('project_id').references(() => projects.id, { onDelete: 'cascade' }).notNull(),
  userId: integer('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
  roleInProject: text('role_in_project').notNull(), // 'Manager', 'Viewer', 'Contributor'
});

// --- AGREEMENTS ---
export const agreements = pgTable('agreements', {
  id: serial('id').primaryKey(),
  projectId: integer('project_id').references(() => projects.id, { onDelete: 'cascade' }).notNull(),
  counterparty: text('counterparty').notNull(),
  signedDate: timestamp('signed_date').notNull(),
  amount: doublePrecision('amount').notNull(),
  currency: text('currency').notNull().default('USD'),
  durationMonths: integer('duration_months').notNull(),
  startDate: timestamp('start_date').notNull(),
  endDate: timestamp('end_date').notNull(),
  remainingDays: integer('remaining_days').notNull().default(0),
  status: text('status').notNull(), // 'Activo', 'Cerrado'
  createdAt: timestamp('created_at').defaultNow(),
});

export const disbursements = pgTable('disbursements', {
  id: serial('id').primaryKey(),
  agreementId: integer('agreement_id').references(() => agreements.id, { onDelete: 'cascade' }).notNull(),
  milestoneTitle: text('milestone_title').notNull(),
  estimatedDate: timestamp('estimated_date').notNull(),
  amount: doublePrecision('amount').notNull(),
  condition: text('condition').notNull(),
  status: text('status').notNull(), // 'PAGADO', 'PENDIENTE', 'ATRASADO'
  createdAt: timestamp('created_at').defaultNow(),
});

export const clauses = pgTable('clauses', {
  id: serial('id').primaryKey(),
  agreementId: integer('agreement_id').references(() => agreements.id, { onDelete: 'cascade' }).notNull(),
  title: text('title').notNull(),
  description: text('description').notNull(),
  priority: text('priority').notNull(),
  category: text('category').notNull(),
});

// --- BUDGETS ---
export const budgetVersions = pgTable('budget_versions', {
  id: serial('id').primaryKey(),
  projectId: integer('project_id').references(() => projects.id, { onDelete: 'cascade' }).notNull(),
  versionName: text('version_name').notNull(), // 'V1 - Inicial', 'V2 - Reformulado'
  isApproved: boolean('is_approved').notNull().default(false),
  approvedBy: integer('approved_by').references(() => users.id),
  createdAt: timestamp('created_at').defaultNow(),
});

export const budgetLines = pgTable('budget_lines', {
  id: serial('id').primaryKey(),
  projectId: integer('project_id').references(() => projects.id, { onDelete: 'cascade' }).notNull(),
  budgetVersionId: integer('budget_version_id').references(() => budgetVersions.id, { onDelete: 'cascade' }).notNull(),
  code: text('code').notNull(),
  category: text('category').notNull(),
  subcategory: text('subcategory').notNull(),
  approvedAmount: doublePrecision('approved_amount').notNull(),
  reformulatedAmount: doublePrecision('reformulated_amount').notNull().default(0),
  executedAmount: doublePrecision('executed_amount').notNull().default(0),
  balance: doublePrecision('balance').notNull().default(0),
  progress: integer('progress').notNull().default(0),
  status: text('status').notNull().default('NORMAL'),
});

// --- EXPENSES & VOUCHERS ---
export const expenses = pgTable('expenses', {
  id: serial('id').primaryKey(),
  projectId: integer('project_id').references(() => projects.id, { onDelete: 'cascade' }).notNull(),
  budgetLineId: integer('budget_line_id').references(() => budgetLines.id).notNull(),
  amount: doublePrecision('amount').notNull(),
  currency: text('currency').notNull().default('USD'),
  date: timestamp('date').notNull(),
  description: text('description'),
  status: text('status').notNull().default('PENDING_APPROVAL'), // 'APPROVED', 'REJECTED'
  approvedBy: integer('approved_by').references(() => users.id),
});

export const receiptsVouchers = pgTable('receipts_vouchers', {
  id: serial('id').primaryKey(),
  expenseId: integer('expense_id').references(() => expenses.id, { onDelete: 'cascade' }),
  projectId: integer('project_id').references(() => projects.id, { onDelete: 'cascade' }).notNull(),
  budgetLineId: integer('budget_line_id').references(() => budgetLines.id), // Agregado para compatibilidad
  type: text('type').notNull(), // 'Factura', 'Recibo de Honorarios'
  amount: doublePrecision('amount').notNull(),
  currency: text('currency').notNull().default('USD'),
  provider: text('provider').notNull(),
  issueDate: timestamp('issue_date').notNull(),
  milestone: text('milestone'), // Agregado
  description: text('description'),
  fileName: text('file_name').notNull(),
  fileUrl: text('file_url'),
  isVerified: boolean('is_verified').notNull().default(false),
  verifiedBy: integer('verified_by').references(() => users.id),
  createdAt: timestamp('created_at').defaultNow(),
});

// --- DOCUMENTS ---
export const documents = pgTable('documents', {
  id: serial('id').primaryKey(),
  projectId: integer('project_id').references(() => projects.id, { onDelete: 'cascade' }).notNull(),
  uploadedBy: integer('uploaded_by').references(() => users.id),
  name: text('name').notNull(),
  size: text('size').notNull(),
  type: text('type').notNull(),
  uploadDate: text('upload_date'),
  fileUrl: text('file_url'),
  metadata: jsonb('metadata'),
  createdAt: timestamp('created_at').defaultNow(),
});

// --- REPORTS ---
export const reports = pgTable('reports', {
  id: serial('id').primaryKey(),
  projectId: integer('project_id').references(() => projects.id, { onDelete: 'cascade' }).notNull(),
  generatedBy: integer('generated_by').references(() => users.id),
  title: text('title').notNull(),
  type: text('type').notNull(), // 'Narrativo', 'Financiero', 'Auditoría'
  fileUrl: text('file_url'),
  createdAt: timestamp('created_at').defaultNow(),
});

// --- INDICATORS ---
export const indicators = pgTable('indicators', {
  id: serial('id').primaryKey(),
  projectId: integer('project_id').references(() => projects.id, { onDelete: 'cascade' }).notNull(),
  name: text('name').notNull(),
  targetValue: doublePrecision('target_value').notNull(),
  currentValue: doublePrecision('current_value').notNull().default(0),
  unit: text('unit').notNull(),
  updatedAt: timestamp('updated_at').defaultNow(),
});

// --- AUDIT LOGS ---
export const auditLogs = pgTable('audit_logs', {
  id: serial('id').primaryKey(),
  tenantId: integer('tenant_id').references(() => organizations.id, { onDelete: 'cascade' }).notNull(),
  userId: integer('user_id').references(() => users.id),
  action: text('action').notNull(), // 'CREATE', 'UPDATE', 'DELETE', 'APPROVE'
  entityType: text('entity_type').notNull(), // 'Project', 'BudgetLine', 'Voucher'
  entityId: integer('entity_id').notNull(),
  oldValues: jsonb('old_values'),
  newValues: jsonb('new_values'),
  ipAddress: text('ip_address'),
  createdAt: timestamp('created_at').defaultNow(),
});

// --- NOTIFICATIONS ---
export const notifications = pgTable('notifications', {
  id: serial('id').primaryKey(),
  userId: integer('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
  title: text('title').notNull(),
  message: text('message').notNull(),
  isRead: boolean('is_read').notNull().default(false),
  createdAt: timestamp('created_at').defaultNow(),
});

// --- RELATIONS DEFINITIONS ---
export const organizationsRelations = relations(organizations, ({ many }) => ({
  users: many(users),
  projects: many(projects),
}));

export const usersRelations = relations(users, ({ one, many }) => ({
  organization: one(organizations, { fields: [users.tenantId], references: [organizations.id] }),
  role: one(roles, { fields: [users.roleId], references: [roles.id] }),
  projectMembers: many(projectMembers),
}));

export const rolesRelations = relations(roles, ({ many }) => ({
  users: many(users),
  permissions: many(permissions),
}));

export const projectsRelations = relations(projects, ({ one, many }) => ({
  organization: one(organizations, { fields: [projects.tenantId], references: [organizations.id] }),
  donor: one(donors, { fields: [projects.donorId], references: [donors.id] }),
  agreements: many(agreements),
  budgetVersions: many(budgetVersions),
  documents: many(documents),
  members: many(projectMembers),
  indicators: many(indicators),
  expenses: many(expenses),
  receipts: many(receiptsVouchers),
}));

// Added relationships for the rest can be defined here similarly...

// --- SAAS PHASE 1: ENUMS ---
export const taskStatusEnum = pgEnum('task_status', ['TODO', 'IN_PROGRESS', 'REVIEW', 'DONE']);
export const taskPriorityEnum = pgEnum('task_priority', ['LOW', 'MEDIUM', 'HIGH', 'URGENT']);
export const logTypeEnum = pgEnum('log_type', ['DECISION', 'ISSUE', 'MILESTONE', 'NOTE']);
export const eventTypeEnum = pgEnum('event_type', ['MEETING', 'FIELD_VISIT', 'DEADLINE']);

// --- SAAS PHASE 1: TASKS & EXECUTION ---
export const tasks = pgTable('tasks', {
  id: serial('id').primaryKey(),
  tenantId: integer('tenant_id').references(() => organizations.id, { onDelete: 'cascade' }).notNull(),
  projectId: integer('project_id').references(() => projects.id, { onDelete: 'cascade' }).notNull(),
  parentId: integer('parent_id'), // Para subtareas (Self-reference)
  title: text('title').notNull(),
  description: text('description'),
  status: taskStatusEnum('status').notNull().default('TODO'),
  priority: taskPriorityEnum('priority').notNull().default('MEDIUM'),
  assigneeId: integer('assignee_id').references(() => users.id),
  createdBy: integer('created_by').references(() => users.id).notNull(),
  startDate: timestamp('start_date'),
  dueDate: timestamp('due_date'),
  completedAt: timestamp('completed_at'),
  estimatedHours: doublePrecision('estimated_hours'),
  position: integer('position').notNull().default(0), // Orden dentro de la columna Kanban
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
});

export const taskDependencies = pgTable('task_dependencies', {
  taskId: integer('task_id').references(() => tasks.id, { onDelete: 'cascade' }),
  dependsOnId: integer('depends_on_id').references(() => tasks.id, { onDelete: 'cascade' }),
});

export const taskComments = pgTable('task_comments', {
  id: serial('id').primaryKey(),
  taskId: integer('task_id').references(() => tasks.id, { onDelete: 'cascade' }).notNull(),
  userId: integer('user_id').references(() => users.id).notNull(),
  content: text('content').notNull(),
  createdAt: timestamp('created_at').defaultNow(),
});

// --- SAAS PHASE 1: BITÁCORA OPERATIVA ---
export const projectLogs = pgTable('project_logs', {
  id: serial('id').primaryKey(),
  tenantId: integer('tenant_id').references(() => organizations.id, { onDelete: 'cascade' }).notNull(),
  projectId: integer('project_id').references(() => projects.id, { onDelete: 'cascade' }).notNull(),
  authorId: integer('author_id').references(() => users.id).notNull(),
  type: logTypeEnum('type').notNull(), // 'DECISION', 'ISSUE', 'MILESTONE', 'NOTE'
  content: text('content').notNull(),
  date: timestamp('date').defaultNow().notNull(),
});

// --- SAAS PHASE 1: CALENDAR & EVENTS ---
export const events = pgTable('events', {
  id: serial('id').primaryKey(),
  tenantId: integer('tenant_id').references(() => organizations.id, { onDelete: 'cascade' }).notNull(),
  projectId: integer('project_id').references(() => projects.id, { onDelete: 'set null' }),
  ownerId: integer('owner_id').references(() => users.id).notNull(),
  title: text('title').notNull(),
  description: text('description'),
  startTime: timestamp('start_time').notNull(),
  endTime: timestamp('end_time').notNull(),
  location: text('location'),
  type: eventTypeEnum('type').notNull().default('MEETING'),
});

export const eventAttendees = pgTable('event_attendees', {
  eventId: integer('event_id').references(() => events.id, { onDelete: 'cascade' }),
  userId: integer('user_id').references(() => users.id, { onDelete: 'cascade' }),
  status: text('status').default('PENDING'), // 'ACCEPTED', 'DECLINED', 'PENDING'
});

