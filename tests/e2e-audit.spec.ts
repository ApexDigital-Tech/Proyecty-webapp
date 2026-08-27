import { test, expect } from '@playwright/test';
import { getTestAuthToken, loginWithDemoSession } from './fixtures/auth.ts';
import { generateDemoToken } from '../src/services/demoAuth.service.ts';
import { db } from '../src/db/index.ts';
import { organizations, users } from '../src/db/schema.ts';

test.describe('E2E Auditoría Funcional Completa (Fase 1)', () => {
  let authHeaders: Record<string, string> = {};

  test.beforeAll(async ({ request }) => {
    const token = await getTestAuthToken(request, 'DIRECTOR');
    authHeaders = { 'Authorization': `Bearer ${token}` };
  });

  // ============================================
  // PUNTO 1: RUTAS DINÁMICAS DE PROYECTO (404 JSON, nunca HTML)
  // ============================================
  test('GET /api/projects/:id inexistente devuelve 404 JSON (No HTML fallback)', async ({ request }) => {
    const res = await request.get('http://localhost:3000/api/projects/99999', {
      headers: authHeaders,
    });
    expect(res.status()).toBe(404);

    const contentType = res.headers()['content-type'] || '';
    expect(contentType).toContain('application/json');

    const text = await res.text();
    expect(text).not.toContain('<!DOCTYPE');
    const body = JSON.parse(text);
    expect(body.success).toBe(false);
    expect(body.message).toBeTruthy();
  });

  test('GET /api/projects/:id existente devuelve 200 JSON', async ({ request }) => {
    // First, get a valid project for the demo tenant
    const listRes = await request.get('http://localhost:3000/api/projects', {
      headers: authHeaders,
    });
    expect(listRes.ok()).toBe(true);
    const listBody = await listRes.json();
    const projects = Array.isArray(listBody) ? listBody : (Array.isArray(listBody?.data) ? listBody.data : []);

    if (projects.length > 0) {
      const projectId = projects[0].id;
      const detailRes = await request.get(`http://localhost:3000/api/projects/${projectId}`, {
        headers: authHeaders,
      });
      expect(detailRes.ok()).toBe(true);

      const contentType = detailRes.headers()['content-type'] || '';
      expect(contentType).toContain('application/json');

      const detailBody = await detailRes.json();
      expect(detailBody.success).toBe(true);
      expect(detailBody.data).toBeDefined();
    }
  });

  // ============================================
  // PUNTO 2: Aislamiento RLS / Multi-tenant en APIs
  // ============================================
  test('Aislamiento RLS: Consulta entre organizaciones rechazada o vacía', async ({ request }) => {
    // 1. Generar organizaciones reales independientes para Tenant A y Tenant B
    const [orgA] = await db.insert(organizations).values({
      name: `Tenant A (Synth ${Date.now()})`,
      slug: `tenant-a-${Date.now()}`,
      country: 'BO'
    }).returning({ id: organizations.id });

    const [orgB] = await db.insert(organizations).values({
      name: `Tenant B (Synth ${Date.now()})`,
      slug: `tenant-b-${Date.now()}`,
      country: 'BO'
    }).returning({ id: organizations.id });

    // Generar usuarios reales en la DB (para evadir violaciones FK en logs de auditoría, etc.)
    const [userA] = await db.insert(users).values({
      tenantId: orgA.id,
      uid: `user-tenant-a-synth-${Date.now()}`,
      email: 'director.a@synth-tenant-a.org',
      name: 'Director Tenant A',
      roleId: 1, // DIRECTOR
      isActive: true,
      lastLoginAt: new Date()
    }).returning({ id: users.id });

    const [userB] = await db.insert(users).values({
      tenantId: orgB.id,
      uid: `user-tenant-b-synth-${Date.now()}`,
      email: 'director.b@synth-tenant-b.org',
      name: 'Director Tenant B',
      roleId: 1, // DIRECTOR
      isActive: true,
      lastLoginAt: new Date()
    }).returning({ id: users.id });

    const tenantAToken = generateDemoToken({
      uid: `user-tenant-a-synth-${Date.now()}`,
      userId: userA.id,
      id: userA.id,
      email: 'director.a@synth-tenant-a.org',
      name: 'Director Tenant A',
      role: 'DIRECTOR',
      roleName: 'Director',
      tenantId: orgA.id,
    });
    const headersTenantA = { 'Authorization': `Bearer ${tenantAToken}`, 'Content-Type': 'application/json' };

    const tenantBToken = generateDemoToken({
      uid: `user-tenant-b-synth-${Date.now()}`,
      userId: userB.id,
      id: userB.id,
      email: 'director.b@synth-tenant-b.org',
      name: 'Director Tenant B',
      role: 'DIRECTOR',
      roleName: 'Director',
      tenantId: orgB.id,
    });
    const headersTenantB = { 'Authorization': `Bearer ${tenantBToken}`, 'Content-Type': 'application/json' };

    // 2. Tenant B crea un proyecto en su propio tenant
    const createBRes = await request.post('http://localhost:3000/api/projects', {
      headers: headersTenantB,
      data: {
        code: `PRJ-SYNTH-B-${Date.now()}`,
        name: 'Proyecto Privado Tenant B',
        donor: 'Donante Confidencial B',
        approvedBudget: '75000',
        baseCurrency: 'USD',
      },
    });
    expect(createBRes.status()).toBe(201);
    const projectB = await createBRes.json();
    const projectBId = projectB.id;

    // 3. Tenant A crea un proyecto en su propio tenant
    const createARes = await request.post('http://localhost:3000/api/projects', {
      headers: headersTenantA,
      data: {
        code: `PRJ-SYNTH-A-${Date.now()}`,
        name: 'Proyecto Privado Tenant A',
        donor: 'Donante Confidencial A',
        approvedBudget: '50000',
        baseCurrency: 'USD',
      },
    });
    expect(createARes.status()).toBe(201);

    // 4. Colección: Tenant A consulta /api/projects -> no contiene projectB
    const listARes = await request.get('http://localhost:3000/api/projects', { headers: headersTenantA });
    expect(listARes.ok()).toBe(true);
    const listABody = await listARes.json();
    const projectsA = Array.isArray(listABody) ? listABody : (Array.isArray(listABody?.data) ? listABody.data : []);

    expect(projectsA.some((p: any) => p.id === projectBId)).toBe(false);
    for (const p of projectsA) {
      expect(p.tenantId).toBe(orgA.id);
    }

    // 5. Lectura directa cross-tenant: Tenant A intenta leer projectB -> Rechazado 404/403
    const directReadRes = await request.get(`http://localhost:3000/api/projects/${projectBId}`, { headers: headersTenantA });
    expect([403, 404]).toContain(directReadRes.status());

    // 6. Actualización cross-tenant: Tenant A intenta modificar projectB -> Rechazado 404/403
    const crossUpdateRes = await request.put(`http://localhost:3000/api/projects/${projectBId}`, {
      headers: headersTenantA,
      data: {
        code: 'HACKED-CODE',
        name: 'Intento de Inyección Cross-Tenant',
        donor: 'Hacker',
        approvedBudget: '999999',
      },
    });
    expect([403, 404]).toContain(crossUpdateRes.status());

    // 7. Eliminación cross-tenant: Tenant A intenta eliminar projectB -> Rechazado 404/403
    const crossDeleteRes = await request.delete(`http://localhost:3000/api/projects/${projectBId}`, { headers: headersTenantA });
    expect([403, 404]).toContain(crossDeleteRes.status());

    // 8. Verificación de integridad: Tenant B puede leer su proyecto intacto
    const verifyBRes = await request.get(`http://localhost:3000/api/projects/${projectBId}`, { headers: headersTenantB });
    expect(verifyBRes.ok()).toBe(true);
    const verifyBBody = await verifyBRes.json();
    expect(verifyBBody.data.name).toBe('Proyecto Privado Tenant B');
  });

  test('GET y POST /api/tasks respetan autenticación y tenant', async ({ request }) => {
    // First obtain projects list to get valid projectId
    const prjRes = await request.get('http://localhost:3000/api/projects', {
      headers: authHeaders,
    });
    expect(prjRes.ok()).toBe(true);
    const prjBody = await prjRes.json();
    const projects = Array.isArray(prjBody) ? prjBody : (Array.isArray(prjBody?.data) ? prjBody.data : []);
    const validProjectId = projects.length > 0 ? projects[0].id : 1;

    // Get tasks
    const listRes = await request.get(`http://localhost:3000/api/tasks?projectId=${validProjectId}`, {
      headers: authHeaders,
    });
    expect(listRes.ok()).toBe(true);

    // Unauthenticated request should be rejected (401)
    const unauthRes = await request.get(`http://localhost:3000/api/tasks?projectId=${validProjectId}`);
    expect(unauthRes.status()).toBe(401);
  });

  // ============================================
  // PUNTO 3: Auth Tokens en DocumentManager (Flujo UI)
  // ============================================
  test('Flujo de interfaz: Login demo, navegación y tokens en peticiones', async ({ page, request }) => {
    await loginWithDemoSession(page, request, 'DIRECTOR');

    // Should land on dashboard
    await expect(page.locator('#sidebar-tab-dashboard')).toBeVisible({ timeout: 15000 });

    // Verify no uncaught React DOM errors
    const consoleErrors: string[] = [];
    page.on('console', msg => {
      if (msg.type() === 'error') consoleErrors.push(msg.text());
    });

    // Navigate to Portafolio
    const portfolioNav = page.locator('#sidebar-tab-portfolio');
    await expect(portfolioNav).toBeVisible({ timeout: 15000 });
    await portfolioNav.click();
    await page.waitForTimeout(1000);

    // Check no removeChild errors accumulated
    const domErrors = consoleErrors.filter(e => e.includes('removeChild') || e.includes('NotFoundError'));
    expect(domErrors.length).toBe(0);
  });

  // ============================================
  // PUNTO 4: Prevención de Duplicados (UPSERT)
  // ============================================
  test('API: Email UNIQUE constraint responde JSON, no crash', async ({ request }) => {
    // Attempt to create a user that might already exist — should not crash the server
    const res = await request.post('http://localhost:3000/api/users', {
      headers: { ...authHeaders, 'Content-Type': 'application/json' },
      data: {
        email: 'e2e-test-unique@proyecty.org',
        name: 'E2E Test Unique',
        role: 'FINANCE',
      },
    });
    // Should respond with JSON regardless of success/failure
    const contentType = res.headers()['content-type'] || '';
    expect(contentType).toContain('application/json');
    expect(res.status()).not.toBe(500); // No server crash
  });

  // ============================================
  // PUNTO 5: Estabilidad del DOM en React (key-based rendering)
  // ============================================
  test('Estabilidad del DOM: Navegación entre tabs sin removeChild crash', async ({ page, request }) => {
    await loginWithDemoSession(page, request, 'DIRECTOR');
    await expect(page.locator('#sidebar-tab-dashboard')).toBeVisible({ timeout: 15000 });

    // Collect errors
    const criticalErrors: string[] = [];
    page.on('pageerror', err => criticalErrors.push(err.message));

    // Rapidly navigate between sections to trigger any DOM instability
    const navTabs = ['#sidebar-tab-dashboard', '#sidebar-tab-portfolio', '#sidebar-tab-global-agenda', '#sidebar-tab-reports', '#sidebar-tab-dashboard'];
    for (const tabSelector of navTabs) {
      try {
        const nav = page.locator(tabSelector);
        if (await nav.isVisible({ timeout: 3000 }).catch(() => false)) {
          await nav.click({ timeout: 5000 });
          await page.waitForTimeout(500);
        }
      } catch {
        // Navigation item not found or not clickable — skip gracefully
      }
    }

    // Check for React DOM errors
    const domCrashes = criticalErrors.filter(e =>
      e.includes('removeChild') ||
      e.includes('NotFoundError') ||
      e.includes('Cannot read properties of null')
    );
    expect(domCrashes, 'React DOM crashes detected: ' + domCrashes.join('; ')).toHaveLength(0);
  });
});
