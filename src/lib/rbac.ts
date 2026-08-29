import { UserRole } from '../types';

export const RolePermissions = {
  DIRECTOR: {
    canViewDashboard: true,
    canViewPortfolio: true,
    canViewAudit: true,
    canViewUsers: true,
    canAddProject: true,
    canEditProject: true,
    canApproveVouchers: true,
    canApproveExpenses: true,
    canEditBudget: true,
    canUploadDocuments: true,
    canViewReports: true,
  },
  MANAGER: {
    canViewDashboard: true,
    canViewPortfolio: true,
    canViewAudit: true,
    canViewUsers: false,
    canAddProject: true,
    canEditProject: true,
    canApproveVouchers: false,
    canApproveExpenses: false,
    canEditBudget: true,
    canUploadDocuments: true,
    canViewReports: true,
  },
  FINANCE: {
    canViewDashboard: true,
    canViewPortfolio: true,
    canViewAudit: false,
    canViewUsers: false,
    canAddProject: false,
    canEditProject: false,
    canApproveVouchers: true,
    canApproveExpenses: false,
    canEditBudget: true,
    canUploadDocuments: true,
    canViewReports: true,
  },
  AUDITOR: {
    canViewDashboard: true,
    canViewPortfolio: true,
    canViewAudit: true,
    canViewUsers: true,
    canAddProject: false,
    canEditProject: false,
    canApproveVouchers: false,
    canApproveExpenses: false,
    canEditBudget: false,
    canUploadDocuments: false,
    canViewReports: true,
  },
  FINANCIADOR: {
    canViewDashboard: true,
    canViewPortfolio: true,
    canViewAudit: false,
    canViewUsers: false,
    canAddProject: false,
    canEditProject: false,
    canApproveVouchers: false,
    canApproveExpenses: false,
    canEditBudget: false,
    canUploadDocuments: false,
    canViewReports: true,
  },
  RESPONSABLE_PROYECTO: {
    canViewDashboard: true,
    canViewPortfolio: true,
    canViewAudit: false,
    canViewUsers: false,
    canAddProject: false,
    canEditProject: true,
    canApproveVouchers: false,
    canApproveExpenses: false,
    canEditBudget: true,
    canUploadDocuments: true,
    canViewReports: true,
  }
} as const;

export type Permission = keyof typeof RolePermissions['DIRECTOR'];

export const hasPermission = (role: UserRole, permission: Permission): boolean => {
  return RolePermissions[role]?.[permission] ?? false;
};
