import { Router } from "express";
import { verifyProjectTenant } from "../controllers/projects.controller.ts";
import { logActivity } from "../db/audit.ts";

import path from "path";
import { fileURLToPath } from "url";
import { db } from "../db";
import { requireAuth, AuthRequest } from "../middleware/auth";
import { eq, sql, and, desc, asc, inArray } from "drizzle-orm";
import {
  projects,
  projectMembers,
  agreements,
  disbursements,
  budgetLines,
  budgetVersions,
  receiptsVouchers,
  documents,
  auditLogs,
  events,
  tasks,
  donors,
  expenses,
  users,
} from "../db/schema.ts";

const router = Router();
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const clientDist = path.resolve(__dirname, "../../client/dist");

import {
  createExpenseHandler,
  approveExpenseHandler,
  getProjectExpensesHandler,
} from '../controllers/expenses.controller.ts';

// Delegación canónica para compatibilidad de rutas legacy
router.post("/api/projects/:projectId/expenses", createExpenseHandler);
router.patch("/api/expenses/:id/approve", approveExpenseHandler);
router.get("/api/projects/:projectId/expenses", getProjectExpensesHandler);


// ==========================================
// FASE 4: BUDGET VERSIONS (REFORMULADOS)
// ==========================================
// Approve a budget version
router.patch(
  "/api/budget-versions/:versionId/approve",
  requireAuth,
  async (req: AuthRequest, res) => {
    try {
      const { versionId } = req.params;
      const tenantId = req.user!.tenantId;
      const userRole = req.user!.role; // It's a string from auth.ts

      if (!["DIRECTOR", "FINANCE"].includes(userRole as string)) {
        return res
          .status(403)
          .json({ error: "Role not authorized to approve budget versions" });
      }

      const versionRecord = await db
        .select()
        .from(budgetVersions)
        .where(
          and(
            eq(budgetVersions.id, parseInt(versionId)),
            eq(budgetVersions.tenantId, tenantId),
          ),
        )
        .limit(1);
      if (!versionRecord.length)
        return res.status(404).json({ error: "Budget version not found" });
      const targetVersion = versionRecord[0];

      await db.transaction(async (tx) => {
        // Archive current approved version
        await tx
          .update(budgetVersions)
          .set({ status: "ARCHIVED" })
          .where(
            and(
              eq(budgetVersions.projectId, targetVersion.projectId),
              eq(budgetVersions.status, "APPROVED"),
            ),
          );

        // Approve new version
        await tx
          .update(budgetVersions)
          .set({ status: "APPROVED", approvedBy: req.user!.id })
          .where(eq(budgetVersions.id, parseInt(versionId)));
      });

      res.json({ message: "Budget version approved successfully" });
    } catch (err) {
      console.error("Error approving budget version:", err);
      res.status(500).json({ error: "Failed to approve budget version" });
    }
  },
);

// ==========================================
// VITE OR STATIC FILE SERVING
// ==========================================
export default router;
