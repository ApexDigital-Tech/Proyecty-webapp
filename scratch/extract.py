import os
import re

with open('server.ts', 'r', encoding='utf-8') as f:
    content = f.read()

# Extract dashboard/metrics
metrics_match = re.search(r'(app\.get\(\'/api/dashboard/metrics\'.*?res\.status\(500\)\.json\({ error: \'Failed to fetch dashboard metrics\' }\);\n  }\n\}\);)', content, re.DOTALL)
metrics_code = metrics_match.group(1) if metrics_match else ''
metrics_code = metrics_code.replace('app.get(\'/api/dashboard/metrics\', requireAuth, async (req: AuthRequest, res) => {', 'export const getDashboardMetrics = async (req: AuthRequest, res: Response, next: NextFunction) => {')
metrics_code = metrics_code.replace('});', '};')

# Extract reports/generate
generate_match = re.search(r'(app\.post\(\'/api/reports/generate\'.*?Ocurrió un error al procesar el reporte inteligente con Gemini AI.*?\}\);)', content, re.DOTALL)
generate_code = generate_match.group(1) if generate_match else ''
generate_code = generate_code.replace('app.post(\'/api/reports/generate\', requireAuth, async (req: AuthRequest, res) => {', 'export const generateReport = async (req: AuthRequest, res: Response, next: NextFunction) => {')
generate_code = generate_code.replace('});', '};')

# Extract reports/data
data_match = re.search(r'(app\.get\(\'/api/reports/data\'.*?Error al generar los datos del reporte.*?\}\);)', content, re.DOTALL)
data_code = data_match.group(1) if data_match else ''
data_code = data_code.replace('app.get(\'/api/reports/data\', requireAuth, async (req: AuthRequest, res) => {', 'export const getReportsData = async (req: AuthRequest, res: Response, next: NextFunction) => {')
data_code = data_code.replace('});', '};')

controller_code = f"""import {{ Request, Response, NextFunction }} from 'express';
import {{ db }} from '../db/index.ts';
import {{ projects, projectMembers, agreements, disbursements, budgetLines, receiptsVouchers, documents, auditLogs, events, tasks, donors }} from '../db/schema.ts';
import {{ eq, and, inArray, desc, gte, lte, asc }} from 'drizzle-orm';
import {{ AuthRequest }} from '../middleware/auth.ts';
import {{ getGeminiClient }} from '../../server.ts';
import {{ logActivity }} from '../db/audit.ts';

{metrics_code}

{generate_code}

{data_code}
"""

with open('src/controllers/reports.controller.ts', 'w', encoding='utf-8') as f:
    f.write(controller_code)

print(f"Extracted metrics: {bool(metrics_code)}")
print(f"Extracted generate: {bool(generate_code)}")
print(f"Extracted data: {bool(data_code)}")

if metrics_code and generate_code and data_code:
    new_content = content.replace(metrics_match.group(1), '')
    new_content = new_content.replace(generate_match.group(1), '')
    new_content = new_content.replace(data_match.group(1), '')
    with open('server.ts', 'w', encoding='utf-8') as f:
        f.write(new_content)
    print("Removed extracted endpoints from server.ts")

routes_code = """import { Router } from 'express';
import { requireAuth } from '../middleware/auth.ts';
import { getDashboardMetrics, generateReport, getReportsData } from '../controllers/reports.controller.ts';

const router = Router();

router.get('/dashboard/metrics', requireAuth, getDashboardMetrics);
router.post('/reports/generate', requireAuth, generateReport);
router.get('/reports/data', requireAuth, getReportsData);

export default router;
"""

with open('src/routes/reports.routes.ts', 'w', encoding='utf-8') as f:
    f.write(routes_code)
print("Created routes")
