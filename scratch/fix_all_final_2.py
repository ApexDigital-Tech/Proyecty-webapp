import re

def final_final_fix():
    # 1. users.controller.ts: remove mapRoleNameToEnum imports
    with open('src/controllers/users.controller.ts', 'r', encoding='utf-8') as f:
        text = f.read()
    text = re.sub(r"import \{ .*mapRoleNameToEnum.* \} from '\.\./\.\./server\.ts';\n", "", text)
    # also it might be just import { mapEnumToRoleName, mapRoleNameToEnum } 
    # Let's just remove mapRoleNameToEnum and mapEnumToRoleName from any server.ts import
    lines = text.split('\n')
    new_lines = []
    for line in lines:
        if 'server.ts' in line and ('mapRoleNameToEnum' in line or 'mapEnumToRoleName' in line):
            continue
        new_lines.append(line)
    with open('src/controllers/users.controller.ts', 'w', encoding='utf-8') as f:
        f.write('\n'.join(new_lines))

    # 2. server.ts: authLimiter
    with open('server.ts', 'r', encoding='utf-8') as f:
        text = f.read()
    text = text.replace('authLimiter', 'apiLimiter') # replace usages of authLimiter
    with open('server.ts', 'w', encoding='utf-8') as f:
        f.write(text)

    # 3. legacy.routes.ts: remove everything from async function initializeViteAndListen down to export default router
    with open('src/routes/legacy.routes.ts', 'r', encoding='utf-8') as f:
        text = f.read()
    vite_idx = text.find('async function initializeViteAndListen() {')
    if vite_idx != -1:
        text = text[:vite_idx] + 'export default router;\n'
    with open('src/routes/legacy.routes.ts', 'w', encoding='utf-8') as f:
        f.write(text)

    # 4. uploads.routes.ts: fix exports
    with open('src/routes/uploads.routes.ts', 'r', encoding='utf-8') as f:
        text = f.read()
    text = text.replace('addReceiptsvouchers', 'uploadVoucher').replace('addDocuments', 'uploadDocument')
    with open('src/routes/uploads.routes.ts', 'w', encoding='utf-8') as f:
        f.write(text)

final_final_fix()
print('Final fixes applied.')
