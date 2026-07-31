import os
import re

with open('server.ts', 'r', encoding='utf-8') as f:
    content = f.read()

# Pattern to match app.get|post|put|delete('/api/projects...
# It's tricky to use regex for arbitrary nested blocks, so I will parse it using brace counting in python.

endpoints = []
lines = content.split('\n')
i = 0
while i < len(lines):
    line = lines[i]
    if line.startswith('app.get(\'/api/projects') or line.startswith('app.post(\'/api/projects') or line.startswith('app.put(\'/api/projects') or line.startswith('app.delete(\'/api/projects'):
        # Found an endpoint starting here.
        start_line = i
        brace_count = 0
        in_block = False
        
        while i < len(lines):
            l = lines[i]
            if '{' in l:
                brace_count += l.count('{')
                in_block = True
            if '}' in l:
                brace_count -= l.count('}')
            
            if in_block and brace_count == 0:
                # End of block!
                # It might end with `});`
                if l.strip().endswith('});') or l.strip().endswith('})'):
                    pass
                # Just capture up to i
                end_line = i
                endpoints.append((start_line, end_line))
                break
            i += 1
    i += 1

print(f"Found {len(endpoints)} project endpoints")

controllers = []
routes = []

for start, end in endpoints:
    block = '\n'.join(lines[start:end+1])
    
    # Extract method and path
    match = re.search(r"app\.(get|post|put|delete)\('(/api/projects[^']*)'", block)
    if not match: continue
    
    method = match.group(1)
    path = match.group(2)
    
    # Generate function name
    # e.g., /api/projects/:id/agreements/:agreementId/clauses -> createProjectAgreementClause
    parts = path.replace('/api/projects', '').split('/')
    parts = [p for p in parts if p]
    
    func_name = ''
    if method == 'get':
        if len(parts) == 0: func_name = 'getProjects'
        elif len(parts) == 1 and parts[0] == ':id': func_name = 'getProjectById'
        elif len(parts) == 2 and parts[1] == 'logs': func_name = 'getProjectLogs'
        else: func_name = f"get{''.join([p.capitalize() for p in parts if not p.startswith(':')])}"
    elif method == 'post':
        if len(parts) == 0: func_name = 'createProject'
        elif len(parts) == 2: func_name = f"add{''.join([p.capitalize() for p in parts if not p.startswith(':')])}"
        elif len(parts) == 4: func_name = f"add{''.join([p.capitalize() for p in parts if not p.startswith(':')])}"
        elif len(parts) == 3 and parts[2] == 'verify': func_name = 'verifyVoucher'
        else: func_name = f"create{''.join([p.capitalize() for p in parts if not p.startswith(':')])}"
    elif method == 'put':
        if len(parts) == 2 and parts[1] == 'status': func_name = 'updateProjectStatus'
        elif len(parts) == 3: func_name = f"update{''.join([p.capitalize() for p in parts if not p.startswith(':')])}"
        else: func_name = f"update{''.join([p.capitalize() for p in parts if not p.startswith(':')])}"
    elif method == 'delete':
        func_name = f"remove{''.join([p.capitalize() for p in parts if not p.startswith(':')])}"

    if not func_name:
        func_name = f"handle{method.capitalize()}{''.join([p.capitalize() for p in parts if not p.startswith(':')])}"
        
    if func_name in [c[1] for c in controllers]:
        func_name += '2' # lazy deduplication

    # Replace signature
    signature = re.search(r"app\.(get|post|put|delete)\('[^']+',\s*requireAuth,\s*async\s*\(([^)]+)\)\s*=>\s*\{", block)
    if signature:
        new_sig = f"export const {func_name} = async ({signature.group(2)}, next: NextFunction) => {{"
        block = block[:signature.start()] + new_sig + block[signature.end():]
        # if req: Request replace with AuthRequest if not there, wait, typically they are req: AuthRequest, res
        if 'res)' in new_sig or 'res: Response)' in new_sig:
            block = block.replace(new_sig, new_sig.replace('res)', 'res: Response').replace('res: Response, next', 'res: Response, next'))
    
    controllers.append((block, func_name))
    
    # Add to routes
    route_path = path.replace('/api/projects', '')
    if not route_path: route_path = '/'
    routes.append(f"router.{method}('{route_path}', requireAuth, {func_name});")

controller_code = f"""import {{ Request, Response, NextFunction }} from 'express';
import {{ db }} from '../db/index.ts';
import {{ projects, projectMembers, agreements, disbursements, budgetLines, receiptsVouchers, documents, auditLogs, events, tasks, donors, users, projectLogs, clauses }} from '../db/schema.ts';
import {{ eq, and, inArray, desc, gte, lte, asc }} from 'drizzle-orm';
import {{ AuthRequest }} from '../middleware/auth.ts';
import {{ logActivity }} from '../db/audit.ts';

// Helper function from server.ts
async function verifyProjectTenant(projectId: number, tenantId: number): Promise<boolean> {{
  const p = await db.select({{ id: projects.id }}).from(projects).where(and(eq(projects.id, projectId), eq(projects.tenantId, tenantId))).limit(1);
  return p.length > 0;
}}

"""

for block, func in controllers:
    controller_code += block + "\n\n"

with open('src/controllers/projects.controller.ts', 'w', encoding='utf-8') as f:
    f.write(controller_code)

routes_code = f"""import {{ Router }} from 'express';
import {{ requireAuth }} from '../middleware/auth.ts';
import {{
  {', '.join([c[1] for c in controllers])}
}} from '../controllers/projects.controller.ts';

const router = Router();

"""

for r in routes:
    routes_code += r + "\n"
    
routes_code += "\nexport default router;\n"

with open('src/routes/projects.routes.ts', 'w', encoding='utf-8') as f:
    f.write(routes_code)

# Now remove from server.ts
for start, end in reversed(endpoints):
    del lines[start:end+1]

# Re-add route mount in server.ts
mounts = "import projectsRouter from './src/routes/projects.routes.ts';\n"
for i, l in enumerate(lines):
    if "import reportsRouter" in l:
        lines.insert(i, mounts)
        break

for i, l in enumerate(lines):
    if "app.use('/api', reportsRouter);" in l:
        lines.insert(i, "app.use('/api/projects', projectsRouter);\n")
        break

with open('server.ts', 'w', encoding='utf-8') as f:
    f.write('\\n'.join(lines))

print("Projects extraction complete")
