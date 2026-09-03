import 'dotenv/config';
import { generateDemoToken } from '../src/services/demoAuth.service.ts';

async function testCreateProject() {
  console.log('--- TEST CREATE PROJECT (SIMULATING USER PAYLOAD) ---');
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

  const payload = {
    code: 'VS-PROY/001-2026',
    name: 'Unidad Académica Sacaca (UAS - UCB) / UPPAE Sacaca.',
    donor: 'Voserdem',
    approvedBudget: '245600',
    baseCurrency: 'BOB', // O lo que envíe el form
    description: 'es de carácter estrictamente académico. Población: Pobladores del Municipio de Sacaca y zonas aledañas a la jurisdicción eclesial de Potosi que carecen de acceso a educación de calidad.'
  };

  console.log('Enviando payload a POST http://127.0.0.1:3000/api/projects...');
  const res = await fetch('http://127.0.0.1:3000/api/projects', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    },
    body: JSON.stringify(payload)
  });

  console.log('Status HTTP:', res.status);
  const data = await res.json();
  console.log('Respuesta:', JSON.stringify(data, null, 2));
}

testCreateProject().catch(console.error).finally(() => process.exit(0));
