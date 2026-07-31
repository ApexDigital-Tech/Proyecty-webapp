import 'dotenv/config';

async function runTest() {
  console.log('--- Iniciando Prueba de Integración: Crear Proyecto Completo ---');
  
  const token = 'demo-director';
  const baseUrl = 'http://127.0.0.1:3000';
  
  const projectData = {
    code: `TEST-VOSERDEM-${Date.now()}`,
    name: 'Proyecto de Prueba VOSERDEM',
    donor: 'Donante Test Integración',
    approvedBudget: 50000,
    description: 'Prueba de integración automatizada',
    physicalProgress: 10,
    financialProgress: 5,
    nextMilestoneDate: '2026-12-31',
    nextMilestoneTitle: 'Hito de prueba',
    score: 95
  };

  try {
    // 1. Crear el proyecto
    console.log('1. Creando proyecto (POST /api/projects)...');
    const res = await fetch(`${baseUrl}/api/projects`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify(projectData)
    });

    const data = await res.json();
    
    if (!res.ok) {
      console.error('Error al crear proyecto:', data);
      process.exit(1);
    }
    
    console.log('✅ Proyecto creado exitosamente:', data);
    const projectId = data.id;

    // 2. Crear segunda partida presupuestaria (el POST de proyecto ya crea 1 por defecto)
    console.log('2. Añadiendo segunda partida presupuestaria (POST /api/projects/.../budget-items)...');
    const budgetRes = await fetch(`${baseUrl}/api/projects/${projectId}/budget-items`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({
        code: '1001',
        category: 'Operación Especial',
        subcategory: 'Equipamiento',
        approved: 25000
      })
    });

    const budgetData = await budgetRes.json();
    
    if (!budgetRes.ok) {
      console.error('Error al añadir partida:', budgetData);
      process.exit(1);
    }

    console.log('✅ Segunda partida añadida:', budgetData);
    console.log('🎉 Prueba de integración completada exitosamente.');
    process.exit(0);

  } catch (error) {
    console.error('Fallo en la prueba:', error);
    process.exit(1);
  }
}

runTest();
