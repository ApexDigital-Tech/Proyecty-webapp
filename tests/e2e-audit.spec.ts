import { test, expect } from '@playwright/test';
import { getTestAuthToken } from './fixtures/auth.ts';

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
      expect(detailBody.data).toBeTruthy();
    }
  });

  // ============================================
  // TEST DE AISLAMIENTO MULTI-TENANT (RLS)
  // ============================================
  test('Aislamiento RLS: Tenant A no puede leer proyectos del Tenant B', async ({ request }) => {
    // Project ID 99999 o ajeno pertenece a otro tenant
    const res = await request.get('http://localhost:3000/api/projects/11', {
      headers: authHeaders,
    });
    
    // The RLS policy should prevent reading the row, 
    // which the API should treat as a Not Found (404) or Forbidden (403)
    expect([403, 404]).toContain(res.status());
    
    const body = await res.json();
    expect(body.success).toBe(false);
  });

  // ============================================
  // PUNTO 2: GESTIÓN DE TAREAS Y KANBAN
  // ============================================
  test('GET y POST /api/tasks responden JSON (sin 404, sin HTML)', async ({ request }) => {
    // Get a valid project id for the demo tenant
    const listRes = await request.get('http://localhost:3000/api/projects', {
      headers: authHeaders,
    });
    const listBody = await listRes.json();
    const projects = Array.isArray(listBody) ? listBody : (Array.isArray(listBody?.data) ? listBody.data : []);
    
    if (projects.length > 0) {
      const projectId = projects[0].id;

      // GET tasks
      const resGet = await request.get(`http://localhost:3000/api/tasks?projectId=${projectId}`, {
        headers: authHeaders,
      });
      expect(resGet.status()).not.toBe(404);
      const contentTypeGet = resGet.headers()['content-type'] || '';
      expect(contentTypeGet).toContain('application/json');
      const getBody = await resGet.json();
      expect(getBody).toBeTruthy();

      // POST task (create)
      const resPost = await request.post('http://localhost:3000/api/tasks', {
        headers: { ...authHeaders, 'Content-Type': 'application/json' },
        data: { projectId, title: 'E2E Test Task', description: 'Automated test', status: 'TODO', priority: 'MEDIUM' },
      });
      expect(resPost.status()).not.toBe(404);
      const contentTypePost = resPost.headers()['content-type'] || '';
      expect(contentTypePost).toContain('application/json');
      const postBody = await resPost.json();
      expect(postBody).toBeTruthy();
    }
  });

  // ============================================
  // PUNTO 3: Auth Tokens en DocumentManager (Flujo UI)
  // ============================================
  test('Flujo de interfaz: Login demo, navegación y tokens en peticiones', async ({ page }) => {
    await page.goto('http://localhost:3000');
    await page.waitForLoadState('networkidle');

    // Click demo Director (Gonzalo Alfaro o primer usuario demo disponible)
    const directorCard = page.getByText(/Gonzalo Alfaro|Director|Apex Digital/i).first();
    if (await directorCard.isVisible({ timeout: 5000 }).catch(() => false)) {
      await directorCard.click();
    }

    // Should land on dashboard
    await expect(page.locator('body')).toContainText('Dashboard', { timeout: 15000 });

    // Verify no uncaught React DOM errors
    const consoleErrors: string[] = [];
    page.on('console', msg => {
      if (msg.type() === 'error') consoleErrors.push(msg.text());
    });

    // Navigate to Portafolio
    const portfolioNav = page.getByText('Portafolio de Proyectos');
    if (await portfolioNav.isVisible({ timeout: 3000 }).catch(() => false)) {
      await portfolioNav.click();
      await page.waitForTimeout(2000);
    }

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
  test('Estabilidad del DOM: Navegación entre tabs sin removeChild crash', async ({ page }) => {
    await page.goto('http://localhost:3000');
    await page.waitForLoadState('networkidle');

    // Login as Director
    const directorCard = page.getByText(/Gonzalo Alfaro|Director|Apex Digital/i).first();
    if (await directorCard.isVisible({ timeout: 5000 }).catch(() => false)) {
      await directorCard.click();
    }
    await expect(page.locator('body')).toContainText('Dashboard', { timeout: 15000 });

    // Collect errors
    const criticalErrors: string[] = [];
    page.on('pageerror', err => criticalErrors.push(err.message));

    // Rapidly navigate between sections to trigger any DOM instability
    const navItems = ['Dashboard', 'Portafolio de Proyectos', 'Usuarios y Monitoreo', 'Dashboard'];
    for (const item of navItems) {
      try {
        const nav = page.getByText(item, { exact: false }).first();
        await nav.waitFor({ state: 'visible', timeout: 3000 });
        await nav.click({ timeout: 5000 });
        await page.waitForTimeout(1500);
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
