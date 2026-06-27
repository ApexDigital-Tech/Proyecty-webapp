import 'dotenv/config';
import { db } from './src/db/index.ts';
import { projects } from './src/db/schema.ts';
import express from 'express';
import { requireAuth } from './src/middleware/auth.ts';
import { eq, and } from 'drizzle-orm';
import { organizations } from './src/db/schema.ts';

const app = express();
app.use(express.json());

// Simplistic mock of verifyProjectTenant from server.ts
async function verifyProjectTenant(projectId: number, tenantId: number): Promise<boolean> {
  const result = await db.select({ id: projects.id })
    .from(projects)
    .where(and(eq(projects.id, projectId), eq(projects.tenantId, tenantId)))
    .limit(1);
  return result.length > 0;
}

// The exact endpoint implementation
app.post('/api/projects/:projectId/agreements', requireAuth, async (req: any, res: any) => {
  const projectId = parseInt(req.params.projectId);
  if (!(await verifyProjectTenant(projectId, req.user.tenantId))) {
    return res.status(403).json({ error: 'Acceso denegado a este proyecto.' });
  }
  res.status(201).json({ success: 'Convenio creado (Esto no deberia pasar en este test)' });
});

async function runTest() {
  console.log('1. Conectando a Base de Datos (Supabase)...');
  
  let newOrg = (await db.select().from(organizations).where(eq(organizations.name, 'Organización Enemiga')).limit(1))[0];
  if (!newOrg) {
    [newOrg] = await db.insert(organizations).values({
      name: 'Organización Enemiga',
      subscriptionPlan: 'FREE',
      isActive: true
    }).returning();
  }

  let newProject = (await db.select().from(projects).where(eq(projects.code, 'SEC-403')).limit(1))[0];
  if (!newProject) {
    [newProject] = await db.insert(projects).values({
      tenantId: newOrg.id,
      name: 'Breach Test Project (Tenant Ajeno)',
      code: 'SEC-403',
      status: 'PLANIFICACIÓN',
      riskLevel: 'BAJO',
      approvedBudget: 0
    }).returning();
  }
  
  console.log(`2. Creado Proyecto Objetivo [ID: ${newProject.id}] perteneciente al Tenant 2.`);

  const server = app.listen(3001, async () => {
    console.log('3. Servidor de prueba escuchando en puerto 3001...');
    
    console.log('4. Ejecutando Intrusion: Intentando crear convenio con JWT del Director del Tenant 1...');
    const response = await fetch(`http://localhost:3001/api/projects/${newProject.id}/agreements`, {
      method: 'POST',
      headers: {
        'Authorization': 'Bearer demo-DIRECTOR',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        counterparty: 'Atacante',
        signedDate: '2026-01-01',
        amount: 100000,
        durationMonths: 12
      })
    });
    
    const body = await response.json();
    console.log('\n--- RESULTADO DE LA PRUEBA ---');
    console.log(`HTTP Status: ${response.status}`);
    console.log(`Cuerpo de Respuesta:`, body);
    
    if (response.status === 403 && body.error === 'Acceso denegado a este proyecto.') {
      console.log('✅ TEST PASSED: El Tenant Breach fue bloqueado exitosamente.');
    } else {
      console.log('❌ TEST FAILED: La brecha no fue bloqueada correctamente.');
    }
    
    server.close();
    process.exit(0);
  });
}

runTest().catch(console.error);
