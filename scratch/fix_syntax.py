import os
import re

def fix_file(filepath):
    if not os.path.exists(filepath): return
    with open(filepath, 'r', encoding='utf-8') as f:
        lines = f.readlines()
    
    new_lines = []
    for line in lines:
        # Fix }; back to }); if it's indented (meaning it's inside the function)
        if '};' in line and not line.startswith('};'):
            # But only for specific patterns to be safe
            if '.json(' in line or '.set(' in line or '.values(' in line or '.where(' in line or 'return' in line:
                line = line.replace('};', '});')
        
        # Fix }); to }; if it's at the start of a line (end of function)
        if line.startswith('});'):
            line = '};\n'
            
        # Fix addBudget-items
        if 'addBudget-items' in line:
            line = line.replace('addBudget-items', 'addBudgetItems')
            
        new_lines.append(line)
        
    with open(filepath, 'w', encoding='utf-8') as f:
        f.writelines(new_lines)

# Fix controllers
fix_file('src/controllers/projects.controller.ts')
fix_file('src/controllers/reports.controller.ts')
fix_file('src/controllers/uploads.controller.ts')

# Fix legacy routes
legacy_path = 'src/routes/legacy.routes.ts'
if os.path.exists(legacy_path):
    with open(legacy_path, 'r', encoding='utf-8') as f:
        content = f.read()
    
    # Remove initializeViteAndListen from legacy routes
    content = re.sub(r'async function initializeViteAndListen\(\) \{.*', '', content, flags=re.DOTALL)
    
    # Fix addBudget-items
    content = content.replace('addBudget-items', 'addBudgetItems')
    
    with open(legacy_path, 'w', encoding='utf-8') as f:
        f.write(content)

# Fix projects routes
projects_routes = 'src/routes/projects.routes.ts'
if os.path.exists(projects_routes):
    with open(projects_routes, 'r', encoding='utf-8') as f:
        content = f.read()
    content = content.replace('addBudget-items', 'addBudgetItems')
    with open(projects_routes, 'w', encoding='utf-8') as f:
        f.write(content)

# Fix server.ts (remove extra })
with open('server.ts', 'r', encoding='utf-8') as f:
    lines = f.readlines()

new_lines = []
for i, line in enumerate(lines):
    if line.startswith('}') and 'initializeViteAndListen().catch' in ''.join(lines[i:]):
        # Only remove if it's an extra one before initializeViteAndListen
        if i < len(lines) - 5 and lines[i+1].strip() == '' and lines[i+2].startswith('async function initializeViteAndListen()'):
            continue # Keep this one? Wait, initializeViteAndListen doesn't need a } before it.
        # Actually, let's just find the exact line
        pass

# A better way to fix server.ts is just removing line 178 if it's the extra `}`.
try:
    if lines[177].strip() == '}':
        del lines[177]
    elif lines[176].strip() == '}':
        del lines[176]
    elif lines[178].strip() == '}':
        del lines[178]
except:
    pass

with open('server.ts', 'w', encoding='utf-8') as f:
    f.writelines(lines)

print("Syntax fixed")
