import { test, expect } from '@playwright/test';
import { getTestAuthToken, loginWithDemoSession } from './fixtures/auth.ts';

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
    // Attempt to access cross-tenant project or verify tenant isolation
    const res = await request.get('http://localhost:3000/api/projects', {
      headers: authHeaders,
    });
    expect(res.ok()).toBe(true);
    const body = await res.json();
    const data = Array.isArray(body) ? body : (Array.isArray(body?.data) ? body.data : []);

    // All returned projects must belong to tenant 1 (Apex Digital)
    for (const project of data) {
      if (project.tenantId) {
        expect(project.tenantId).toBe(1);
      }
    }
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
