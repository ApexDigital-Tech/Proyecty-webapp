with open('src/routes/projects.routes.ts', 'r', encoding='utf-8') as f:
    lines = f.read().split('\n')
lines = [l for l in lines if 'addReceiptsvouchers' not in l and 'addDocuments' not in l]
with open('src/routes/projects.routes.ts', 'w', encoding='utf-8') as f:
    f.write('\n'.join(lines))

with open('src/routes/legacy.routes.ts', 'r', encoding='utf-8') as f:
    text = f.read()

text = text.replace('import * as schema from "../db/schema";', 'import { projects, projectMembers, agreements, disbursements, budgetLines, budgetVersions, receiptsVouchers, documents, auditLogs, events, tasks, donors, expenses, users, recalculateBudgetLineExecutedAmount } from "../db/schema.ts";')
text = text.replace('import { eq, sql, and, desc, asc } from "drizzle-orm";', 'import { eq, sql, and, desc, asc, inArray } from "drizzle-orm";')
text = text.replace('import { Router } from "express";', 'import { Router } from "express";\nimport path from "path";\nimport { clientDist } from "../../server.ts";')

with open('src/routes/legacy.routes.ts', 'w', encoding='utf-8') as f:
    f.write(text)

print('fixed imports')
