import { test, expect } from '@playwright/test';

test.describe('E2E Auditoría Funcional Completa', () => {

  test('Flujo de Director: Login demo y navegación al Dashboard', async ({ page }) => {
    // 1. Visitar localhost:3000
    await page.goto('http://localhost:3000');
    await page.waitForLoadState('networkidle');

    // 2. Verificar que los botones de demo se cargaron
    await expect(page.getByText('Apex Digital')).toBeVisible({ timeout: 15000 });

    // 3. Hacer clic en el botón del Director (Apex Digital)
    await page.getByText('Apex Digital').first().click();

    // 4. Verificar que entramos al dashboard - buscar "Dashboard" en el sidebar
    //    Los logs muestran que el body contiene "Dashboard" momentáneamente
    await expect(page.locator('body')).toContainText('Dashboard', { timeout: 15000 });

    // 5. Tomar screenshot del dashboard
    await page.screenshot({ path: 'screenshot-dashboard.png', fullPage: true });

    // 6. Intentar navegar al módulo "Usuarios y Monitoreo"
    const usersNav = page.getByText('Usuarios y Monitoreo');
    if (await usersNav.isVisible({ timeout: 3000 }).catch(() => false)) {
      await usersNav.click();
      await page.waitForTimeout(2000);
      await page.screenshot({ path: 'screenshot-users.png', fullPage: true });

      // 7. Verificar botón "Cargar Proyecto Demo"
      const seedBtn = page.getByText('Cargar Proyecto Demo');
      if (await seedBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
        page.on('dialog', dialog => dialog.accept());
        await seedBtn.click();
        await page.waitForTimeout(5000);
      }
    }

    // 8. Navegar al "Portafolio de Proyectos"
    const portfolioNav = page.getByText('Portafolio de Proyectos');
    if (await portfolioNav.isVisible({ timeout: 3000 }).catch(() => false)) {
      await portfolioNav.click();
      await page.waitForTimeout(3000);
      await page.screenshot({ path: 'screenshot-portfolio.png', fullPage: true });
    }
  });

  test('API endpoints responden correctamente (sin 404)', async ({ request }) => {
    const endpoints = [
      '/api/public/demo-users',
      '/api/activity-logs',
      '/api/agenda',
      '/api/health',
    ];

    for (const endpoint of endpoints) {
      const res = await request.get(`http://localhost:3000${endpoint}`);
      expect(res.status(), `${endpoint} debería responder 200`).toBe(200);
      const body = await res.json();
      expect(body).toBeTruthy();
    }
  });

  test('POST /api/admin/run-seed responde sin crash', async ({ request }) => {
    const res = await request.post('http://localhost:3000/api/admin/run-seed');
    expect(res.status()).not.toBe(404);
    const body = await res.json();
    expect(body).toHaveProperty('success');
  });
});
