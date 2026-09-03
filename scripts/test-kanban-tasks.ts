import 'dotenv/config';
import { generateDemoToken } from '../src/services/demoAuth.service.ts';

async function testKanbanTaskFlow() {
  console.log('--- TEST KANBAN TASK CRUD & DRAG-AND-DROP (PATCH) ---');
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

  const BASE_URL = 'http://127.0.0.1:3000';
  const projectId = 258; // Proyecto de prueba recién creado

  // 1. Crear Tarea en Kanban
  console.log('\n1. Creando tarea en TODO...');
  const createRes = await fetch(`${BASE_URL}/api/tasks`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    },
    body: JSON.stringify({
      projectId,
      title: 'Reunion de equipo docentes (QA)',
      status: 'TODO',
      priority: 'MEDIUM',
      weight: 2
    })
  });

  console.log('Create Status:', createRes.status);
  const createdData = await createRes.json();
  console.log('Created Task:', createdData);
  if (!createdData.data?.id) throw new Error('Falló creación de tarea');
  const taskId = createdData.data.id;

  // 2. Mover Tarea a IN_PROGRESS usando PATCH (Simula Kanban Drag & Drop)
  console.log(`\n2. Moviendo tarea ${taskId} a IN_PROGRESS vía PATCH...`);
  const patchRes1 = await fetch(`${BASE_URL}/api/tasks/${taskId}`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    },
    body: JSON.stringify({
      status: 'IN_PROGRESS',
      position: 1000
    })
  });

  console.log('PATCH IN_PROGRESS Status:', patchRes1.status);
  const patchData1 = await patchRes1.json();
  console.log('PATCH Result 1:', patchData1);
  if (patchRes1.status !== 200 || patchData1.data?.status !== 'IN_PROGRESS') {
    throw new Error('Falló PATCH a IN_PROGRESS');
  }

  // 3. Mover Tarea a DONE usando PATCH (Simula Kanban Drag & Drop a Completado)
  console.log(`\n3. Moviendo tarea ${taskId} a DONE vía PATCH...`);
  const patchRes2 = await fetch(`${BASE_URL}/api/tasks/${taskId}`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    },
    body: JSON.stringify({
      status: 'DONE',
      position: 2000
    })
  });

  console.log('PATCH DONE Status:', patchRes2.status);
  const patchData2 = await patchRes2.json();
  console.log('PATCH Result 2:', patchData2);
  if (patchRes2.status !== 200 || patchData2.data?.status !== 'DONE') {
    throw new Error('Falló PATCH a DONE');
  }

  console.log('\n✅ TODAS LAS PRUEBAS DE KANBAN (DRAG & DROP PATCH) PASARON AL 100%');
}

testKanbanTaskFlow().catch(console.error).finally(() => process.exit(0));
