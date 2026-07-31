import { test, expect } from '@playwright/test';

test('create a new project', async ({ page }) => {
  // Ir al home y simular login (dependerá de cómo se maneje el login en la app)
  await page.goto('http://127.0.0.1:3000');
  
  // Como usa un token de demo o auth de Supabase, 
  // inyectaremos el token en localStorage para saltar la pantalla de login si es posible
  await page.evaluate(() => {
    localStorage.setItem('sb-access-token', 'demo-director');
  });

  await page.reload();

  // Esperar a que cargue el dashboard
  await expect(page.locator('text=Proyectos')).toBeVisible({ timeout: 10000 });

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
  await expect(page.locator('text=Proyecto E2E UI').first()).toBeVisible({ timeout: 10000 });
});
