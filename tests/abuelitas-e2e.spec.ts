import { test, expect } from '@playwright/test';
import path from 'path';

test.describe('FIN-CORE-03 — Integración Abuelitas V2 E2E', () => {
  test('Flujo E2E de Importación, Aprobación de Partidas y Registro de Gastos', async ({ page }) => {
    // 1. Acceso al portal demo
    await page.goto('/internal-demo', { waitUntil: 'networkidle' });
    
    // Login inicial como Finanzas Demo para importar
    const finBtn = page.locator('#demo-login-finance, button:has-text("Finanzas Demo VOSERDEM")').first();
    await expect(finBtn).toBeVisible({ timeout: 15000 });
    await finBtn.click();
    await page.waitForSelector('#proyecty-app-shell', { timeout: 15000 });

    // 2. Localizar y abrir proyecto PRJ-VS-2000
    const projectCard = page.locator('div.cursor-pointer, [data-testid="project-card"]').filter({ hasText: /PRJ-VS-2000/i }).first();
    await expect(projectCard).toBeVisible({ timeout: 15000 });
    await projectCard.click();

    // 3. Navegar a Control Presupuestario
    const budgetTab = page.locator('button:has-text("Control Presupuestario"), [role="tab"]:has-text("Control Presupuestario")').first();
    await budgetTab.click();

    // 4. Importar el archivo CSV
    const csvPath = path.resolve(__dirname, 'fixtures', 'demo', 'plan_presupuestario_abuelitas_2026.csv');
    
    // Buscamos el input[type="file"] y enviamos el archivo
    const fileInput = page.locator('input[type="file"]');
    await expect(fileInput).toBeAttached();
    await fileInput.setInputFiles(csvPath);

    // Esperar y confirmar la importación
    const importBtn = page.locator('button').filter({ hasText: /^Importar Plan/i }).first();
    if (await importBtn.isVisible()) {
      await importBtn.click();
    }
    
    // Verificar que las partidas se importaron
    await expect(page.locator('text=11 partidas').first()).toBeVisible({ timeout: 10000 });
    await expect(page.locator('text=333,400.00').first()).toBeVisible({ timeout: 10000 });

    // Cerrar sesión y deshidratar credenciales
    await page.evaluate(() => {
      localStorage.clear();
      sessionStorage.clear();
    });
    await page.goto('/internal-demo', { waitUntil: 'networkidle' });

    // 5. Login como Director Demo para aprobar importación
    const dirBtn = page.locator('#demo-login-director, button:has-text("Director Demo VOSERDEM")').first();
    await expect(dirBtn).toBeVisible({ timeout: 15000 });
    await dirBtn.click();
    await page.waitForSelector('#proyecty-app-shell', { timeout: 15000 });

    // Localizar proyecto PRJ-VS-2000 y aprobar
    const projectCardDir = page.locator('div.cursor-pointer, [data-testid="project-card"]').filter({ hasText: /PRJ-VS-2000/i }).first();
    await projectCardDir.click();
    
    const budgetTabDir = page.locator('button:has-text("Control Presupuestario"), [role="tab"]:has-text("Control Presupuestario")').first();
    await budgetTabDir.click();
    
    const approvePlanBtn = page.locator('button').filter({ hasText: /Aprobar Plan/i }).first();
    if (await approvePlanBtn.isVisible()) {
      await approvePlanBtn.click();
    }
    
    // Confirmación de aprobación (estado ACTIVO)
    await expect(page.locator('text=ACTIVO').first()).toBeVisible({ timeout: 10000 });
    
    // 6. Volver a Finanzas para registrar gasto
    await page.evaluate(() => {
      localStorage.clear();
      sessionStorage.clear();
    });
    await page.goto('/internal-demo', { waitUntil: 'networkidle' });
    await finBtn.click();
    await page.waitForSelector('#proyecty-app-shell', { timeout: 15000 });

    const projectCardFin2 = page.locator('div.cursor-pointer, [data-testid="project-card"]').filter({ hasText: /PRJ-VS-2000/i }).first();
    await projectCardFin2.click();
    
    const budgetTabFin2 = page.locator('button:has-text("Control Presupuestario"), [role="tab"]:has-text("Control Presupuestario")').first();
    await budgetTabFin2.click();
    
    // Registrar Gasto
    const registerExpenseBtn = page.locator('button').filter({ hasText: /Registrar Gasto/i }).first();
    await registerExpenseBtn.click();
    
    const montoInput = page.locator('input[type="number"], input[name="amount"]').first();
    await montoInput.fill('1000');
    
    const descInput = page.locator('input[type="text"], textarea').filter({ hasText: /Descripción|Concepto/i }).first();
    if (await descInput.isVisible()) {
        await descInput.fill('Compra de medicamentos prueba E2E');
    } else {
        const anyText = page.locator('input[type="text"]').first();
        await anyText.fill('Compra de medicamentos prueba E2E');
    }

    const saveExpenseBtn = page.locator('button').filter({ hasText: /Guardar|Registrar/i }).first();
    await saveExpenseBtn.click();

    // 7. Aprobación del gasto por Director
    await page.evaluate(() => {
      localStorage.clear();
      sessionStorage.clear();
    });
    await page.goto('/internal-demo', { waitUntil: 'networkidle' });
    await dirBtn.click();
    await page.waitForSelector('#proyecty-app-shell', { timeout: 15000 });

    const approvalLink = page.locator('a, button').filter({ hasText: /Aprobación de Gastos|Aprobaciones/i }).first();
    if (await approvalLink.isVisible()) {
      await approvalLink.click();
    } else {
        const projectCardDir2 = page.locator('div.cursor-pointer, [data-testid="project-card"]').filter({ hasText: /PRJ-VS-2000/i }).first();
        await projectCardDir2.click();
        const expensesTab = page.locator('button:has-text("Gastos"), [role="tab"]:has-text("Gastos")').first();
        if (await expensesTab.isVisible()) {
            await expensesTab.click();
        }
    }
    
    const approveExpenseBtn = page.locator('button').filter({ hasText: /^Aprobar$/i }).first();
    await expect(approveExpenseBtn).toBeVisible({ timeout: 15000 });
    await approveExpenseBtn.click();

    // 8. Verificar Reportes y Saldos
    const repLink = page.locator('a, button').filter({ hasText: /^Reportes$/i }).first();
    if (await repLink.isVisible()) {
      await repLink.click();
      await expect(page.getByText(/Reportes|Analítica/i).first()).toBeVisible({ timeout: 10000 });
      // Verificar actualización de saldos (333400 - 1000 = 332400)
      await expect(page.getByText(/332,400/i).first()).toBeVisible({ timeout: 10000 });
    }
  });
});
