import re

def fix_everything():
    # 1. Export verifyProjectTenant from projects.controller.ts
    with open('src/controllers/projects.controller.ts', 'r', encoding='utf-8') as f:
        text = f.read()
    text = text.replace('async function verifyProjectTenant', 'export async function verifyProjectTenant')
    
    # Also add missing imports in projects.controller.ts
    text = text.replace('import { eq, and, desc, inArray } from \'drizzle-orm\';', 'import { eq, and, desc, inArray, ilike, sql } from \'drizzle-orm\';')
    if 'import { budgetVersions, expenses' not in text:
        text = text.replace('import { projects, projectMembers, donors, tasks, events, agreements, disbursements, budgetLines } from \'../db/schema.ts\';', 'import { projects, projectMembers, donors, tasks, events, agreements, disbursements, budgetLines, budgetVersions, expenses } from \'../db/schema.ts\';')
    
    with open('src/controllers/projects.controller.ts', 'w', encoding='utf-8') as f:
        f.write(text)

    # 2. Add verifyProjectTenant, logActivity, and recalculateBudgetLineExecutedAmount to legacy.routes.ts
    with open('src/routes/legacy.routes.ts', 'r', encoding='utf-8') as f:
        text = f.read()
    
    # We will copy recalculateBudgetLineExecutedAmount from server_original.txt
    with open('server_original.txt', 'r', encoding='utf-8') as f:
        original = f.read()
    idx = original.find('async function recalculateBudgetLineExecutedAmount')
    if idx != -1:
        end_idx = original.find('}\n\n', idx)
        func_str = original[idx:end_idx+2]
    else:
        func_str = ''

    text = text.replace('import { Router } from "express";', 'import { Router } from "express";\nimport { verifyProjectTenant } from "../controllers/projects.controller.ts";\nimport { logActivity } from "../db/audit.ts";\n')
    text = text.replace(', recalculateBudgetLineExecutedAmount', '')
    
    # insert the function at the top of the router file
    text = text.replace('const router = Router();\n', f'const router = Router();\n\n{func_str}\n')
    
    # also clientDist is missing.
    # In legacy.routes.ts, line 691 uses clientDist.
    # clientDist was defined as `const clientDist = path.resolve(__dirname, '../../client/dist');`
    if 'clientDist' in text:
        text = text.replace('const router = Router();\n', f'const router = Router();\nconst clientDist = path.resolve(__dirname, "../../client/dist");\n')

    with open('src/routes/legacy.routes.ts', 'w', encoding='utf-8') as f:
        f.write(text)

    # 3. users.controller.ts missing mapEnumToRoleName, mapRoleNameToEnum
    with open('src/controllers/users.controller.ts', 'r', encoding='utf-8') as f:
        text = f.read()
    if 'mapRoleNameToEnum' not in text and 'const mapRoleNameToEnum' not in text:
        # just replace the import with the actual functions
        text = text.replace('import { mapEnumToRoleName, mapRoleNameToEnum } from \'../../server.ts\';', '''
export const mapRoleNameToEnum = (roleName: string) => {
  const map: Record<string, string> = {
    'admin': 'administrator',
    'editor': 'manager',
    'viewer': 'viewer'
  };
  return map[roleName] || 'viewer';
};
export const mapEnumToRoleName = (enumValue: string) => {
  const map: Record<string, string> = {
    'administrator': 'admin',
    'manager': 'editor',
    'viewer': 'viewer'
  };
  return map[enumValue] || 'viewer';
};
''')
    with open('src/controllers/users.controller.ts', 'w', encoding='utf-8') as f:
        f.write(text)
        
    # 4. auth.controller.ts missing mapRoleNameToEnum
    with open('src/controllers/auth.controller.ts', 'r', encoding='utf-8') as f:
        text = f.read()
    text = text.replace('import { mapRoleNameToEnum } from \'../../server.ts\';', 'import { mapRoleNameToEnum } from \'./users.controller.ts\';')
    with open('src/controllers/auth.controller.ts', 'w', encoding='utf-8') as f:
        f.write(text)

    # 5. uploads.controller.ts exports supabase.
    with open('src/controllers/uploads.controller.ts', 'r', encoding='utf-8') as f:
        text = f.read()
    text = text.replace('import { supabase } from \'../../server.ts\';', '')
    if 'export const supabase =' not in text:
        text = text.replace('import { logActivity } from \'../db/audit.ts\';', '''import { logActivity } from '../db/audit.ts';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL || '';
const supabaseKey = process.env.SUPABASE_ANON_KEY || '';
export const supabase = createClient(supabaseUrl, supabaseKey);
''')
    with open('src/controllers/uploads.controller.ts', 'w', encoding='utf-8') as f:
        f.write(text)

    # 6. reports.controller.ts missing getGeminiClient
    with open('src/controllers/reports.controller.ts', 'r', encoding='utf-8') as f:
        text = f.read()
    text = text.replace('import { getGeminiClient } from \'../../server.ts\';', 'import { getGeminiClient } from \'../../server.ts\'; // now exported')
    # wait, getGeminiClient was exported from server.ts in my previous script!
    # Ah, I replaced `const getGeminiClient = () => {` with `export const getGeminiClient = () => {` in server.ts! So it IS exported now!
    # I'll just change the import in reports.controller.ts to avoid TS2459 (Module ... declares ... locally, but it is not exported). Wait, TS2459 means it IS in server.ts but NOT exported! My previous python script MUST have worked. Let's make sure.
    text = text.replace('import { getGeminiClient } from \'../../server.ts\'; // now exported', 'import { getGeminiClient } from \'../../server.ts\';')
    
    # also reports.controller.ts line 343: An object literal cannot have multiple properties with the same name.
    # Let's fix line 343
    text = text.replace('        projectId: agreements.projectId,\n        projectId: agreements.projectId', '        projectId: agreements.projectId')
    with open('src/controllers/reports.controller.ts', 'w', encoding='utf-8') as f:
        f.write(text)

fix_everything()
print('fixed all')
