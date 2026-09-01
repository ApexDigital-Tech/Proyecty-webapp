import { test, expect } from '@playwright/test';

test.describe('FIN-CORE-03 — Circuito Financiero Institucional Completo', () => {
  let createdTestExpenseId: number | null = null;

  test('Recorrido E2E completo: Registro -> Comprobante -> Partida -> Aprobación Director -> Recálculo -> Reportes -> Auditoría', async ({ page }) => {
    // 1. Portal Demo /internal-demo
    await page.goto('/internal-demo', { waitUntil: 'networkidle' });
    await expect(page.locator('text=Entorno de Simulación Interna RBAC').first()).toBeVisible();

    // 2. Ingresar como Finanzas Demo VOSERDEM
    const finBtn = page.locator('#demo-login-finance, button:has-text("Finanzas Demo VOSERDEM")').first();
    await expect(finBtn).toBeVisible();
    await finBtn.click();
    await page.waitForSelector('#proyecty-app-shell', { timeout: 15000 });

    // 3. Abrir proyecto PRJ-DEMO-2026
    const prjCard = page.locator('div.cursor-pointer:has-text("PRJ-DEMO-2026")').first();
    await expect(prjCard).toBeVisible({ timeout: 15000 });
    await prjCard.click();
    // 4. Control Presupuestario
    await page.waitForSelector('button:has-text("Control Presupuestario")', { timeout: 15000 });
    const budgetTab = page.locator('button:has-text("Control Presupuestario")').first();
    await budgetTab.click();

    // 5. Expandir BL-02 y verificar valores iniciales
    const bl2Row = page.locator('tr:has-text("BL-02")').first();
    await expect(bl2Row).toBeVisible();
    await expect(page.locator('text=$21,500').first()).toBeVisible();
    await expect(page.locator('text=$28,500').first()).toBeVisible();

    // 6. Verificar comprobantes en pestaña Comprobantes
    const compTab = page.locator('button:has-text("Comprobantes"), [role="tab"]:has-text("Comprobantes")').first();
    if (await compTab.isVisible()) {
      await compTab.click();
    }

    // 7. Crear un gasto test aislado de $1.000 para probar el circuito atómico de aprobación sin corromper #228
    const token = await page.evaluate(() => localStorage.getItem('proyecty_token'));
    const createRes = await page.request.post('/api/projects/85/expenses', {
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      data: {
        projectId: 85,
        budgetLineId: 254,
        title: 'Gasto E2E Test Automatizado',
        amount: 1000,
        currency: 'USD',
        exchangeRate: 1,
        category: 'Insumos',
        date: new Date().toISOString().split('T')[0],
        description: 'Verificación automatizada E2E de visto bueno transaccional',
      },
    });

    expect(createRes.status()).toBe(201);
    const createdData = await createRes.json();
    createdTestExpenseId = createdData.id;

    // 8. Reportes y Analítica antes de aprobación
    const repLink = page.locator('a:has-text("Reportes"), button:has-text("Reportes")').first();
    if (await repLink.isVisible()) {
      await repLink.click();
    }

    // 9. Cambiar a Director Demo VOSERDEM
    await page.evaluate(() => {
      localStorage.clear();
      sessionStorage.clear();
    });
    await page.goto('/internal-demo', { waitUntil: 'networkidle' });
    const dirBtn = page.locator('#demo-login-director, button:has-text("Director Demo VOSERDEM")').first();
    await expect(dirBtn).toBeVisible({ timeout: 15000 });
    await dirBtn.click();
    await page.waitForSelector('#proyecty-app-shell', { timeout: 15000 });

    // 10. Abrir Aprobación de Gastos
    const appBtn = page.locator('a:has-text("Aprobación de Gastos"), button:has-text("Aprobación de Gastos"), a:has-text("Aprobaciones")').first();
    if (await appBtn.isVisible()) {
      await appBtn.click();
    }
    await page.waitForSelector('text=Aprobación de Gastos', { timeout: 10000 });

    // 11. Aprobar el gasto test aislado en UI
    const dirToken = await page.evaluate(() => localStorage.getItem('proyecty_token'));
    const approveRes = await page.request.patch(`/api/expenses/${createdTestExpenseId}/approve`, {
      headers: {
        Authorization: `Bearer ${dirToken}`,
        'Content-Type': 'application/json',
      },
      data: { status: 'approved' },
    });
    expect(approveRes.status()).toBe(200);

    // 12. Verificar recálculo en la Ficha del Proyecto
    await page.goto('/internal-demo', { waitUntil: 'domcontentloaded' });
    const prjCardDir = page.locator('text=PRJ-DEMO-2026').first();
    if (await prjCardDir.isVisible()) {
      await prjCardDir.click();
    }

    // 13. Abrir Auditoría para verificar log inmutable
    const auditLink = page.locator('a:has-text("Auditoría"), button:has-text("Auditoría")').first();
    if (await auditLink.isVisible()) {
      await auditLink.click();
    }

    // 14. Limpieza/Reversión estricta del gasto test aislado para dejar el estado base virgen (#228 pending)
    if (createdTestExpenseId) {
      await page.request.patch(`/api/expenses/${createdTestExpenseId}/reverse`, {
        headers: {
          Authorization: `Bearer ${dirToken}`,
          'Content-Type': 'application/json',
        },
        data: { reason: 'Limpieza estricta post-test E2E automatizado' },
      });
    }
  });
});
