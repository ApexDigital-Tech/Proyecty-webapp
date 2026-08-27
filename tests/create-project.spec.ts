import { test, expect } from '@playwright/test';
import { loginWithDemoSession } from './fixtures/auth.ts';

test('create a new project', async ({ page, request }) => {
  // Iniciar sesión dinámica mediante JWT demo oficial
  await loginWithDemoSession(page, request, 'DIRECTOR');

  // Navegar a Portafolio
  const portfolioBtn = page.locator('#sidebar-tab-portfolio');
  await expect(portfolioBtn).toBeVisible({ timeout: 15000 });
  await portfolioBtn.click();

  // Hacer click en crear proyecto
  const newProjectBtn = page.locator('#open-add-project-modal');
  await expect(newProjectBtn).toBeVisible({ timeout: 15000 });
  await newProjectBtn.click();
  
  // Llenar formulario
  await page.fill('input[placeholder="Ej. PRJ-2024-089"]', `PRJ-UI-${Date.now()}`);
  await page.fill('input[placeholder="Ej. Construcción de Pozos de Agua de Lluvia"]', 'Proyecto E2E UI Automatizado');
  await page.fill('input[placeholder="Ej. USAID, UNICEF, Cooperación Española"]', 'Donante E2E');
  await page.fill('input[placeholder="Ej. 150000"]', '60000');
  
  // Guardar
  await page.click('button:has-text("Registrar Proyecto")');
  
  // Verificar que aparezca en la lista
  await expect(page.locator('text=Proyecto E2E UI Automatizado').first()).toBeVisible({ timeout: 15000 });
});
