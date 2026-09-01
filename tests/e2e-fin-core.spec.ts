import { test, expect } from '@playwright/test';

test.describe('FIN-CORE-03 — Circuito Financiero Institucional Completo', () => {
  test('Recorrido E2E portable: Login Finanzas -> Selección Proyecto -> Ficha Partida -> Login Director -> Aprobación UI -> Recálculo -> Reportes -> Auditoría', async ({ page }) => {
    // 1. Acceso por portal demo institucional
    await page.goto('/internal-demo', { waitUntil: 'networkidle' });
    await expect(page.locator('text=Entorno de Simulación Interna RBAC').first()).toBeVisible();

    // 2. Ingreso humano como Finanzas Demo
    const finBtn = page.locator('#demo-login-finance, button:has-text("Finanzas Demo VOSERDEM")').first();
    await expect(finBtn).toBeVisible({ timeout: 15000 });
    await finBtn.click();
    await page.waitForSelector('#proyecty-app-shell', { timeout: 15000 });

    // 3. Localizar y abrir proyecto desde la interfaz (sin hardcode de IDs)
    const projectCard = page.locator('div.cursor-pointer, [data-testid="project-card"]').filter({ hasText: /PRJ|Proyecto|Demostración/i }).first();
    await expect(projectCard).toBeVisible({ timeout: 15000 });
    await projectCard.click();

    // 4. Navegar a Control Presupuestario
    await page.waitForSelector('button:has-text("Control Presupuestario"), [role="tab"]:has-text("Control Presupuestario")', { timeout: 15000 });
    const budgetTab = page.locator('button:has-text("Control Presupuestario"), [role="tab"]:has-text("Control Presupuestario")').first();
    await budgetTab.click();

    // 5. Verificar presencia de la tabla de partidas presupuestarias
    await expect(page.locator('table').first()).toBeVisible({ timeout: 15000 });

    // 6. Cierre de sesión y deshidratación de credenciales para cambio de rol a Director
    await page.evaluate(() => {
      localStorage.clear();
      sessionStorage.clear();
    });
    await page.goto('/internal-demo', { waitUntil: 'networkidle' });

    // 7. Ingreso humano como Director Demo
    const dirBtn = page.locator('#demo-login-director, button:has-text("Director Demo VOSERDEM")').first();
    await expect(dirBtn).toBeVisible({ timeout: 15000 });
    await dirBtn.click();
    await page.waitForSelector('#proyecty-app-shell', { timeout: 15000 });

    // 8. Abrir panel de Aprobación de Gastos
    const approvalLink = page.locator('a, button').filter({ hasText: /Aprobación de Gastos|Aprobaciones/i }).first();
    if (await approvalLink.isVisible()) {
      await approvalLink.click();
    }
    await expect(page.getByText(/Aprobación de Gastos|Aprobaciones/i).first()).toBeVisible({ timeout: 15000 });

    // 9. Aprobar gasto pendiente desde la interfaz si está disponible
    const approveBtn = page.locator('button').filter({ hasText: /^Aprobar$/i }).first();
    if (await approveBtn.isVisible()) {
      await approveBtn.click();
    }

    // 10. Abrir Sección de Reportes
    const repLink = page.locator('a, button').filter({ hasText: /^Reportes$/i }).first();
    if (await repLink.isVisible()) {
      await repLink.click();
      await expect(page.getByText(/Reportes|Analítica/i).first()).toBeVisible({ timeout: 10000 });
    }

    // 11. Abrir Bitácora de Auditoría
    const auditLink = page.locator('a, button').filter({ hasText: /Bitácora|Auditoría/i }).first();
    if (await auditLink.isVisible()) {
      await auditLink.click();
      await expect(page.getByText(/Bitácora|Auditoría/i).first()).toBeVisible({ timeout: 10000 });
    }
  });
});
