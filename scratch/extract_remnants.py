import os
import re

with open('server.ts', 'r', encoding='utf-8') as f:
    content = f.read()

# Define the start and end of the block we want to extract
# We know the endpoints start at: app.patch('/api/projects/:id'
# And end right before: app.use(errorHandler);

start_marker = "app.patch('/api/projects/:id'"
end_marker = "app.use(errorHandler);"

start_idx = content.find(start_marker)
end_idx = content.rfind(end_marker)

if start_idx == -1 or end_idx == -1:
    print("Could not find markers")
    exit(1)

# Extract the block
endpoints_block = content[start_idx:end_idx]

# Keep the remaining parts for server.ts
new_server_content = content[:start_idx] + "\n" + content[end_idx:]

# Now, parse the endpoints from endpoints_block
# It might contain helper functions like recalculateBudgetLineExecutedAmount
# So we will just process the entire block and convert `app.get('/api/xxx', ...)` to `export const xxx = ...`

# Replace app.METHOD('/api/PATH', requireAuth, async (req: AuthRequest, res) => {
def replace_endpoint(match):
    method = match.group(1)
    path = match.group(2)
    # create a function name based on method and path
    # e.g., get /api/tasks -> getTasks
    parts = [p for p in path.split('/') if p and not p.startswith(':')]
    name = method + ''.join(p.capitalize() for p in parts)
    if 'projects' in path and method == 'patch':
        name = 'updateProject'
    elif 'agreements' in path and 'clauses' in path:
        name = 'addClause'
    elif 'agreements' in path and 'disbursements' in path:
        name = 'addDisbursement'
    elif 'budget-items' in path:
        name = 'updateBudgetItem'
    elif 'receiptsVouchers' in path and 'verify' in path:
        name = 'verifyVoucher'
    elif 'expenses' in path and 'approve' in path:
        name = 'approveExpense'
    elif 'budget-versions' in path and 'approve' in path:
        name = 'approveBudgetVersion'
        
    return f"export const {name} = async (req: AuthRequest, res: Response, next: NextFunction) => {{"

# We will just write the block to a new file `scratch/remnants.ts` to inspect and manually add to controllers.
with open('scratch/remnants.ts', 'w', encoding='utf-8') as f:
    f.write(endpoints_block)

print("Saved remnants to scratch/remnants.ts")
