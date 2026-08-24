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

async function recalculateBudgetLineExecutedAmount(
  budgetLineId: number,
  tx: any,
) {
  // Sum all APPROVED expenses for this budget line
  const result = await tx
    .select({
      total: sql`COALESCE(SUM(${expenses.baseAmount}), 0)`,
    })
    .from(expenses)
    .where(
      and(
        eq(expenses.budgetLineId, budgetLineId),
        eq(expenses.status, "APPROVED"),
      ),
    );

  const totalExecuted = result[0].total;

  // Update budget line
  await tx
    .update(budgetLines)
    .set({ executedAmount: Number(totalExecuted) })
    .where(eq(budgetLines.id, budgetLineId));
}
// List Expenses (for Approval Dashboard)
router.get("/api/expenses", requireAuth, async (req: AuthRequest, res) => {
  try {
    const tenantId = req.user!.tenantId;
    const { status, projectId } = req.query;

    let conditions = [eq(expenses.tenantId, tenantId)];

    if (
      req.user!.role === "RESPONSABLE_PROYECTO" ||
      req.user!.role === "TECNICO_PROYECTO"
    ) {
      const userProjects = await db
        .select({ projectId: projectMembers.projectId })
        .from(projectMembers)
        .where(eq(projectMembers.userId, req.user!.id!));

      if (userProjects.length > 0) {
        conditions.push(
          inArray(
            expenses.projectId,
            userProjects.map((p) => p.projectId),
          ),
        );
      } else {
        conditions.push(eq(expenses.projectId, -1));
      }
    }

    if (status) conditions.push(eq(expenses.status, status as string));
    if (projectId)
      conditions.push(eq(expenses.projectId, parseInt(projectId as string)));

    const allExpenses = await db
      .select({
        id: expenses.id,
        amount: expenses.amount,
        currency: expenses.currency,
        originalAmount: expenses.originalAmount,
        originalCurrency: expenses.originalCurrency,
        exchangeRate: expenses.exchangeRate,
        baseAmount: expenses.baseAmount,
        exchangeRateSource: expenses.exchangeRateSource,
        exchangeRateDate: expenses.exchangeRateDate,
        date: expenses.date,
        description: expenses.description,
        status: expenses.status,
        projectCode: projects.code,
        projectName: projects.name,
        budgetCode: budgetLines.code,
        budgetCategory: budgetLines.category,
        registeredByName: users.name,
      })
      .from(expenses)
      .leftJoin(projects, eq(expenses.projectId, projects.id))
      .leftJoin(budgetLines, eq(expenses.budgetLineId, budgetLines.id))
      .leftJoin(users, eq(expenses.registeredBy, users.id))
      .where(and(...conditions))
      .orderBy(desc(expenses.date));

    res.json(allExpenses);
  } catch (err) {
    console.error("Error fetching expenses:", err);
    res.status(500).json({ error: "Failed to fetch expenses" });
  }
});

// Create Expense
router.post(
  "/api/projects/:projectId/expenses",
  requireAuth,
  async (req: AuthRequest, res) => {
    try {
      const { projectId } = req.params;
      const tenantId = req.user!.tenantId;

      if (!(await verifyProjectTenant(parseInt(projectId), tenantId))) {
        return res.status(403).json({ error: "Access denied to this project" });
      }

      const {
        budgetLineId,
        originalAmount,
        originalCurrency,
        exchangeRate,
        baseAmount,
        exchangeRateSource,
        exchangeRateDate,
        date,
        description,
      } = req.body;

      const newExpense = await db
        .insert(expenses)
        .values({
          tenantId,
          projectId: parseInt(projectId),
          budgetLineId: parseInt(budgetLineId),
          amount: originalAmount, // legacy fallback for now
          currency: originalCurrency, // legacy fallback for now
          originalAmount,
          originalCurrency,
          exchangeRate: exchangeRate || 1,
          baseAmount,
          exchangeRateSource,
          exchangeRateDate: exchangeRateDate
            ? new Date(exchangeRateDate)
            : new Date(),
          date: new Date(date),
          description,
          status: "PENDING_APPROVAL",
          registeredBy: req.user!.id,
        })
        .returning();

      res.json(newExpense[0]);
    } catch (err) {
      console.error("Error creating expense:", err);
      res.status(500).json({ error: "Failed to create expense" });
    }
  },
);

// Approve/Reject/Revoke Expense
router.patch(
  "/api/expenses/:expenseId/approve",
  requireAuth,
  async (req: AuthRequest, res) => {
    try {
      const { expenseId } = req.params;
      const { status } = req.body; // 'APPROVED' or 'REJECTED' or 'PENDING_APPROVAL' (revoke)
      const tenantId = req.user!.tenantId;
      const userRole = req.user!.role; // It's a string from auth.ts

      if (!["MANAGER", "DIRECTOR", "FINANCE"].includes(userRole as string)) {
        return res
          .status(403)
          .json({ error: "Role not authorized to approve expenses" });
      }

      // Verify tenant
      const expenseRecord = await db
        .select()
        .from(expenses)
        .where(
          and(
            eq(expenses.id, parseInt(expenseId)),
            eq(expenses.tenantId, tenantId),
          ),
        )
        .limit(1);
      if (!expenseRecord.length)
        return res.status(404).json({ error: "Expense not found" });
      const expense = expenseRecord[0];

      // Transactional status update and executedAmount recalculation
      await db.transaction(async (tx) => {
        await tx
          .update(expenses)
          .set({ status, approvedBy: req.user!.id })
          .where(eq(expenses.id, parseInt(expenseId)));

        await recalculateBudgetLineExecutedAmount(expense.budgetLineId, tx);

        // Log audit
        await tx.insert(auditLogs).values({
          tenantId,
          userId: req.user!.id,
          action: "UPDATE_STATUS",
          entity: "expense",
          entityId: String(expense.id),
          metadata: { newValues: { status } },
        });
      });

      res.json({ message: "Expense status updated successfully" });
    } catch (err) {
      console.error("Error approving expense:", err);
      res.status(500).json({ error: "Failed to approve expense" });
    }
  },
);

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
