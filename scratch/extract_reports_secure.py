import re

def extract_endpoints(file_path):
    with open(file_path, 'r', encoding='utf-8') as f:
        text = f.read()

    endpoints = []
    
    # We look for app.(get|post|put|patch|delete)('path', ...)
    pattern = re.compile(r'app\.(get|post|patch|put|delete)\(\'(.*?)\'')
    
    for match in pattern.finditer(text):
        method = match.group(1)
        path = match.group(2)
        
        # Only extract the reports ones
        if path not in ['/api/dashboard/metrics', '/api/reports/generate', '/api/reports/data']:
            continue
            
        start_idx = match.start()
        
        # Brace matching with string/comment ignorance
        open_braces = 0
        in_string = False
        string_char = ''
        in_comment = False
        in_multiline_comment = False
        
        end_idx = -1
        i = start_idx
        while i < len(text):
            char = text[i]
            
            if not in_comment and not in_multiline_comment and not in_string:
                if char == "'" or char == '"' or char == '`':
                    in_string = True
                    string_char = char
                elif char == '/' and i + 1 < len(text) and text[i+1] == '/':
                    in_comment = True
                    i += 1
                elif char == '/' and i + 1 < len(text) and text[i+1] == '*':
                    in_multiline_comment = True
                    i += 1
                elif char == '{':
                    open_braces += 1
                elif char == '}':
                    open_braces -= 1
                    if open_braces == 0:
                        j = i + 1
                        while j < len(text) and text[j] in ' \t\n\r);':
                            j += 1
                        end_idx = j
                        break
            elif in_string:
                if char == '\\':
                    i += 1 # skip escaped char
                elif char == string_char:
                    in_string = False
            elif in_comment:
                if char == '\n':
                    in_comment = False
            elif in_multiline_comment:
                if char == '*' and i + 1 < len(text) and text[i+1] == '/':
                    in_multiline_comment = False
                    i += 1
            i += 1
            
        if end_idx != -1:
            ep = text[start_idx:end_idx]
            
            # Now replace the app.get(...) with export const ...
            if path == '/api/dashboard/metrics':
                ep = re.sub(r'^app\.get\(\'/api/dashboard/metrics\',\s*requireAuth,\s*async\s*\(req:\s*AuthRequest,\s*res\)\s*=>\s*\{', 'export const getDashboardMetrics = async (req: AuthRequest, res: Response, next: NextFunction) => {', ep)
            elif path == '/api/reports/generate':
                ep = re.sub(r'^app\.post\(\'/api/reports/generate\',\s*requireAuth,\s*async\s*\(req:\s*AuthRequest,\s*res\)\s*=>\s*\{', 'export const generateReport = async (req: AuthRequest, res: Response, next: NextFunction) => {', ep)
            elif path == '/api/reports/data':
                ep = re.sub(r'^app\.get\(\'/api/reports/data\',\s*requireAuth,\s*async\s*\(req:\s*AuthRequest,\s*res\)\s*=>\s*\{', 'export const getReportsData = async (req: AuthRequest, res: Response, next: NextFunction) => {', ep)
            
            # replace terminal }); with }; since it's an export const now
            if ep.endswith('});') or ep.endswith('});\\n') or ep.endswith('});\\r\\n'):
                # wait, since it could have whitespaces
                ep = re.sub(r'\}\);\s*$', '};\n', ep)
            endpoints.append(ep)
            
    return endpoints

endpoints = extract_endpoints('server_original.ts')

with open('src/controllers/reports.controller.ts', 'w', encoding='utf-8') as f:
    f.write('''import { Request, Response, NextFunction } from 'express';
import { db } from '../db/index.ts';
import { projects, projectMembers, agreements, disbursements, budgetLines, receiptsVouchers, documents, auditLogs, events, tasks, donors } from '../db/schema.ts';
import { eq, and, inArray, desc, gte, lte, asc } from 'drizzle-orm';
import { AuthRequest } from '../middleware/auth.ts';
import { getGeminiClient } from '../../server.ts';
import { logActivity } from '../db/audit.ts';

''')
    for ep in endpoints:
        f.write(ep + '\n\n')

print(f"Extracted {len(endpoints)} endpoints for reports")
