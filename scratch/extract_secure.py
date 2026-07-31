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
        
        # Skip the ones we already extracted
        if path.startswith('/api/auth') or \
           path.startswith('/api/users') or \
           path.startswith('/api/projects') or \
           path.startswith('/api/reports') or \
           path.startswith('/api/upload') or \
           path.startswith('/api/public/') or \
           path == '/api/dashboard/metrics':
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
                        # Found the end of the block.
                        # Wait, the endpoint is `app.get(..., (req, res) => { ... });`
                        # So it's `});` at the end!
                        # Let's find the closing `)` and `;`
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
                    in_multiline_comment = True # Wait! Should be False!
                    in_multiline_comment = False
                    i += 1
            i += 1
            
        if end_idx != -1:
            endpoints.append(text[start_idx:end_idx])
            
    return endpoints

endpoints = extract_endpoints('server_original.ts')

with open('src/routes/legacy.routes.ts', 'w', encoding='utf-8') as f:
    f.write('import { Router } from "express";\n')
    f.write('import { db } from "../db";\n')
    f.write('import { requireAuth, AuthRequest } from "../middleware/auth";\n')
    f.write('import { eq, sql, and, desc, asc } from "drizzle-orm";\n')
    f.write('import * as schema from "../db/schema";\n\n')
    f.write('const router = Router();\n\n')
    
    for ep in endpoints:
        ep = re.sub(r'^app\.', 'router.', ep)
        f.write(ep + '\n\n')
        
    f.write('export default router;\n')

print(f"Extracted {len(endpoints)} endpoints securely")
