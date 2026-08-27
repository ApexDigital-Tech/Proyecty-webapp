import { test, expect } from '@playwright/test';
import { loginWithDemoSession } from './fixtures/auth.ts';

test('create a new project', async ({ page, request }) => {
  // Iniciar sesión dinámica mediante JWT demo oficial
  await loginWithDemoSession(page, request, 'DIRECTOR');

  // Esperar a que cargue el dashboard
  await expect(page.locator('text=Proyectos').first()).toBeVisible({ timeout: 15000 });

  // Hacer click en crear proyecto
  await page.click('text=Nuevo Proyecto');
  
  // Llenar formulario
  await page.fill('input[name="code"]', `UI-TEST-${Date.now()}`);
  await page.fill('input[name="name"]', 'Proyecto E2E UI');
  await page.fill('input[name="donor"]', 'Donante E2E');
  await page.fill('input[name="approvedBudget"]', '60000');
  
  // Guardar
  await page.click('button:has-text("Guardar")');
  
  // Verificar mensaje de éxito o que aparezca en la lista
  await expect(page.locator('text=Proyecto E2E UI').first()).toBeVisible({ timeout: 15000 });
});
