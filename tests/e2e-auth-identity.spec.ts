import { test, expect } from '@playwright/test';

test.describe('Identity Hydration and Authorization — Canonical Session Flow', () => {

  test('Acceso humano real desde /internal-demo a través de clic de botón', async ({ page }) => {
    await page.goto('/internal-demo');
    await expect(page.locator('#demo-login-director')).toBeVisible();

    // Click real en el botón del Director
    const [sessionResponse, meResponse] = await Promise.all([
      page.waitForResponse(res => res.url().includes('/api/auth/demo-session') && res.status() === 200),
      page.waitForResponse(res => res.url().includes('/api/auth/me') && res.status() === 200),
      page.click('#demo-login-director')
    ]);

    expect(sessionResponse.ok()).toBeTruthy();
    expect(meResponse.ok()).toBeTruthy();

    // El login debe desaparecer y el App Shell debe renderizarse
    await expect(page.locator('#proyecty-app-shell')).toBeVisible({ timeout: 10000 });
    await expect(page.locator('#login-card')).not.toBeVisible();
    await expect(page.locator('text=Director Demo VOSERDEM').first()).toBeVisible();
  });

  test('INITIAL_SESSION nula + sin token -> Muestra Login', async ({ page }) => {
    await page.goto('/');
    await page.evaluate(() => {
      localStorage.clear();
      sessionStorage.clear();
    });
    await page.reload();

    await expect(page.locator('#login-card')).toBeVisible();
    await expect(page.locator('#proyecty-app-shell')).not.toBeVisible();
  });

  test('INITIAL_SESSION nula + token demo válido -> Hidratación backend 200', async ({ page, request }) => {
    const res = await request.post('/api/auth/demo-session', {
      data: { role: 'MANAGER' }
    });
    const { token } = await res.json();
    
    await page.goto('/');
    await page.evaluate((t) => localStorage.setItem('proyecty_token', t), token);
    await page.reload();

    await expect(page.locator('#proyecty-app-shell')).toBeVisible();
    await expect(page.locator('text=Coordinador Demo VOSERDEM').first()).toBeVisible();
  });

  test('INITIAL_SESSION nula + token vencido -> Expulsión y limpieza de sesión', async ({ page }) => {
    await page.goto('/');
    await page.evaluate(() => {
      localStorage.setItem('proyecty_token', 'demo.invalid.expired.token');
      localStorage.setItem('proyecty_user', JSON.stringify({ role: 'MANAGER', name: 'Test' }));
    });
    await page.reload();

    await expect(page.locator('#login-card')).toBeVisible();
    await expect.poll(async () => {
      return await page.evaluate(() => localStorage.getItem('proyecty_token'));
    }).toBeNull();
  });

  test('user_metadata / localStorage manipulado -> Backend /api/auth/me sobreescribe con verdad', async ({ page, request }) => {
    const res = await request.post('/api/auth/demo-session', {
      data: { role: 'FINANCE' }
    });
    const { token } = await res.json();
    
    await page.goto('/');
    await page.evaluate((t) => {
      localStorage.setItem('proyecty_token', t);
      // Fabricar un localStorage manipulado (con rol de DIRECTOR)
      localStorage.setItem('proyecty_user', JSON.stringify({ role: 'DIRECTOR', name: 'Hacker' }));
    }, token);
    
    await page.reload();

    await expect(page.locator('#proyecty-app-shell')).toBeVisible();
    // El backend es fuente de verdad, debe ser FINANCE y sobreescribir DIRECTOR
    await expect.poll(async () => {
      const updatedUserStr = await page.evaluate(() => localStorage.getItem('proyecty_user'));
      const updatedUser = JSON.parse(updatedUserStr || '{}');
      return updatedUser.role;
    }).toBe('FINANCE');
  });

  test('Cierre de sesión manual -> Limpieza sin ciclo recursivo', async ({ page, request }) => {
    const res = await request.post('/api/auth/demo-session', {
      data: { role: 'DIRECTOR' }
    });
    const { token } = await res.json();

    await page.goto('/');
    await page.evaluate((t) => {
      localStorage.setItem('proyecty_token', t);
    }, token);
    await page.reload();
    await expect(page.locator('#proyecty-app-shell')).toBeVisible();

    // Clic en botón de salir en Topbar/Sidebar
    await page.click('button:has-text("Cerrar sesión"), button[title="Cerrar sesión"], button:has-text("Salir")');

    await expect(page.locator('#login-card')).toBeVisible();
    await expect.poll(async () => {
      return await page.evaluate(() => localStorage.getItem('proyecty_token'));
    }).toBeNull();
  });

  test('Descarga humana real de documentos PDF desde UI por rol FINANCE', async ({ page }) => {
    // 1. Iniciar sesión mediante el botón real de Finanzas
    await page.goto('/internal-demo');
    await expect(page.locator('button:has-text("Finanzas Demo VOSERDEM"), #demo-login-finance').first()).toBeVisible();

    await Promise.all([
      page.waitForResponse(res => res.url().includes('/api/auth/demo-session') && res.status() === 200),
      page.waitForResponse(res => res.url().includes('/api/auth/me') && res.status() === 200),
      page.click('button:has-text("Finanzas Demo VOSERDEM"), #demo-login-finance')
    ]);

    await expect(page.locator('#proyecty-app-shell')).toBeVisible({ timeout: 10000 });

    // 2. Abrir Proyecto A desde el Dashboard
    await page.click('text=PRJ-DEMO-2026');
    await expect(page.locator('text=Presupuesto total aprobado:').first()).toBeVisible({ timeout: 10000 });

    // 3. Entrar en pestaña Expediente Digital
    await page.click('button:has-text("Expediente Digital")');
    await expect(page.locator('text=Expediente Digital').first()).toBeVisible({ timeout: 10000 });

    // 4. Capturar evento de descarga para el primer documento
    const downloadPromise1 = page.waitForEvent('download');
    const downloadButtons = page.locator('button[title="Descargar"]');
    await expect(downloadButtons.first()).toBeVisible();
    await downloadButtons.first().click();

    const download1 = await downloadPromise1;
    const downloadPath1 = await download1.path();
    expect(downloadPath1).toBeTruthy();

    const fs = await import('fs');
    if (downloadPath1) {
      const buffer1 = fs.readFileSync(downloadPath1);
      expect(buffer1.subarray(0, 4).toString('utf-8')).toBe('%PDF');
      expect(buffer1.length).toBeGreaterThan(700);
    }

    // 5. Capturar evento de descarga para el segundo documento
    if (await downloadButtons.count() >= 2) {
      const downloadPromise2 = page.waitForEvent('download');
      await downloadButtons.nth(1).click();
      const download2 = await downloadPromise2;
      const downloadPath2 = await download2.path();
      expect(downloadPath2).toBeTruthy();
      if (downloadPath2) {
        const buffer2 = fs.readFileSync(downloadPath2);
        expect(buffer2.subarray(0, 4).toString('utf-8')).toBe('%PDF');
        expect(buffer2.length).toBe(706);
      }
    }
  });

});
