export type Action = 'create' | 'read' | 'update' | 'delete' | 'approve' | 'manage';
export type Module = 'projects' | 'budgets' | 'budget_lines' | 'expenses' | 'disbursements' | 'vouchers' | 'users' | 'reports' | 'donors' | 'agreements';

export interface PermissionSet {
  module: Module;
  actions: Action[]; // e.g. ['read', 'update']
}

export interface RbacRole {
  id: number;
  name: string;
  isSystemRole: boolean;
  permissions: PermissionSet[];
}
