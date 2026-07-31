import os

with open('scratch/remnants.ts', 'r', encoding='utf-8') as f:
    content = f.read()

# Replace 'app.' with 'router.'
content = content.replace('app.patch', 'router.patch')
content = content.replace('app.post', 'router.post')
content = content.replace('app.get', 'router.get')
content = content.replace('app.delete', 'router.delete')
content = content.replace('app.put', 'router.put')

code = f"""import express from 'express';
import {{ db }} from '../db/index.ts';
import {{ 
  projects, agreements, clauses, disbursements, budgetLines, receiptsVouchers,
  activityLogs, tasks, events, expenses, projectMembers, users, budgetVersions,
  auditLogs 
}} from '../db/schema.ts';
import {{ eq, and, sql, desc, inArray }} from 'drizzle-orm';
import {{ requireAuth, AuthRequest }} from '../middleware/auth.ts';
import {{ logActivity }} from '../db/audit.ts';

const router = express.Router();

{content}

export default router;
"""

with open('src/routes/legacy.routes.ts', 'w', encoding='utf-8') as f:
    f.write(code)

print('Created src/routes/legacy.routes.ts')
