import os

with open('src/controllers/projects.controller.ts', 'r', encoding='utf-8') as f:
    lines = f.readlines()

def extract_block(lines, start_line_idx):
    brace_count = 0
    in_block = False
    end_line_idx = start_line_idx
    for i in range(start_line_idx, len(lines)):
        l = lines[i]
        if '{' in l:
            brace_count += l.count('{')
            in_block = True
        if '}' in l:
            brace_count -= l.count('}')
        if in_block and brace_count == 0:
            if l.strip().endswith('});') or l.strip().endswith('})'):
                pass
            end_line_idx = i
            break
    return start_line_idx, end_line_idx

try:
    voucher_idx = next(i for i, l in enumerate(lines) if "app.post('/api/projects/:projectId/receiptsVouchers'" in l)
    v_start, v_end = extract_block(lines, voucher_idx)
except:
    v_start, v_end = -1, -1

try:
    doc_idx = next(i for i, l in enumerate(lines) if "app.post('/api/projects/:projectId/documents'" in l)
    d_start, d_end = extract_block(lines, doc_idx)
except:
    d_start, d_end = -1, -1

voucher_block = ''.join(lines[v_start:v_end+1]) if v_start != -1 else ""
doc_block = ''.join(lines[d_start:d_end+1]) if d_start != -1 else ""

# Remove from projects
new_lines = []
for i, l in enumerate(lines):
    if (v_start <= i <= v_end) or (d_start <= i <= d_end):
        continue
    new_lines.append(l)

with open('src/controllers/projects.controller.ts', 'w', encoding='utf-8') as f:
    f.writelines(new_lines)

# Create uploads.controller.ts
voucher_code = voucher_block.replace("app.post('/api/projects/:projectId/receiptsVouchers', requireAuth, upload.single('file'), async (req: AuthRequest, res) => {", 'export const uploadVoucher = async (req: AuthRequest, res: Response, next: NextFunction) => {')
voucher_code = voucher_code.replace('});', '};')

doc_code = doc_block.replace("app.post('/api/projects/:projectId/documents', requireAuth, upload.single('file'), async (req: AuthRequest, res) => {", 'export const uploadDocument = async (req: AuthRequest, res: Response, next: NextFunction) => {')
doc_code = doc_code.replace('});', '};')

uploads_controller = f"""import {{ Request, Response, NextFunction }} from 'express';
import {{ db }} from '../db/index.ts';
import {{ projects, receiptsVouchers, documents, budgetLines, auditLogs }} from '../db/schema.ts';
import {{ eq, and }} from 'drizzle-orm';
import {{ AuthRequest }} from '../middleware/auth.ts';
import {{ logActivity }} from '../db/audit.ts';
import {{ createClient }} from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '';
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY || '';
const supabase = supabaseUrl && supabaseKey ? createClient(supabaseUrl, supabaseKey) : null;

// Helper function from projects
async function verifyProjectTenant(projectId: number, tenantId: number): Promise<boolean> {{
  const p = await db.select({{ id: projects.id }}).from(projects).where(and(eq(projects.id, projectId), eq(projects.tenantId, tenantId))).limit(1);
  return p.length > 0;
}}

{voucher_code}

{doc_code}
"""

with open('src/controllers/uploads.controller.ts', 'w', encoding='utf-8') as f:
    f.write(uploads_controller)

routes_code = """import { Router } from 'express';
import { requireAuth } from '../middleware/auth.ts';
import multer from 'multer';
import { uploadVoucher, uploadDocument } from '../controllers/uploads.controller.ts';

const router = Router();

// Initialize Multer with 10MB limit and memory storage
const upload = multer({ 
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 } 
});

router.post('/projects/:projectId/receiptsVouchers', requireAuth, upload.single('file'), uploadVoucher);
router.post('/projects/:projectId/documents', requireAuth, upload.single('file'), uploadDocument);

export default router;
"""

with open('src/routes/uploads.routes.ts', 'w', encoding='utf-8') as f:
    f.write(routes_code)

print('Extracted to uploads.controller.ts and created uploads.routes.ts')
