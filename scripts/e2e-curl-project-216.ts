import 'dotenv/config';
import { generateDemoToken } from '../src/services/demoAuth.service.ts';

async function testProject216Http() {
  console.log('--- GENERATING AUTH TOKEN FOR ROLANDO GUTIERREZ (DIRECTOR) ---');
  const token = generateDemoToken({
    uid: 'bd79d3e1-b5f7-4b95-958d-87e8303be693',
    userId: 24,
    id: 24,
    email: 'rolangutiali.rg@gmail.com',
    name: 'Rolando Gutierrez',
    role: 'DIRECTOR',
    roleName: 'Director',
    tenantId: 13
  });

  console.log('Token generado. Probando GET http://127.0.0.1:3000/api/projects/216...');
  const response = await fetch('http://127.0.0.1:3000/api/projects/216', {
    headers: {
      'Authorization': `Bearer ${token}`
    }
  });

  console.log('Status HTTP:', response.status);
  const data = await response.json();
  if (response.status === 200) {
    console.log('✅ ÉXITO TOTAL: /api/projects/216 respondió 200 OK');
    console.log('Proyecto recuperado:', {
      id: data.data.id,
      code: data.data.code,
      name: data.data.name,
      approvedBudget: data.data.approvedBudget,
      budgetVersions: data.data.budgetVersions?.length,
      budgetLines: data.data.budgetLines?.length
    });
  } else {
    console.error('❌ FALLÓ /api/projects/216:', data);
  }
}

testProject216Http().catch(console.error).finally(() => process.exit(0));
