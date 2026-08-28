import { test, expect } from '@playwright/test';

test.describe('Identity Hydration and Authorization', () => {

  test('INITIAL_SESSION nula + token app válido', async ({ page, request }) => {
    // Generate a valid demo token via the mock backend login
    const res = await request.post('/api/auth/demo-session', {
      data: { role: 'MANAGER' }
    });
    const { token } = await res.json();
    
    await page.goto('/');
    await page.evaluate((t) => localStorage.setItem('proyecty_token', t), token);
    await page.reload();

    // The frontend should hydrate from /api/auth/me and not logout
    await expect(page.locator('#proyecty-app-shell')).toBeVisible();
    await expect(page.locator('text=MANAGER').first()).toBeVisible();
  });

  test('INITIAL_SESSION nula + token vencido', async ({ page }) => {
    // Inject expired invalid demo token
    await page.goto('/');
    await page.evaluate(() => {
      localStorage.setItem('proyecty_token', 'demo-jwt-expired-token');
      localStorage.setItem('proyecty_user', JSON.stringify({ role: 'MANAGER', name: 'Test' }));
    });
    await page.reload();

    // The backend /api/auth/me should reject it and clear session
    await expect(page.locator('text=Continuar con Google')).toBeVisible();
    
    await expect.poll(async () => {
      return await page.evaluate(() => localStorage.getItem('proyecty_token'));
    }).toBeNull();
  });

  test('user_metadata con rol manipulado', async ({ page, request }) => {
    const res = await request.post('/api/auth/demo-session', {
      data: { role: 'MANAGER' }
    });
    const { token } = await res.json();
    
    await page.goto('/');
    await page.evaluate((t) => {
      localStorage.setItem('proyecty_token', t);
      // Fabricar un localStorage manipulado (con rol de DIRECTOR)
      localStorage.setItem('proyecty_user', JSON.stringify({ role: 'DIRECTOR', name: 'Hacker' }));
    }, token);
    
    // Al recargar, App.tsx llama a /api/auth/me que devuelve MANAGER
    await page.reload();

    await expect(page.locator('#proyecty-app-shell')).toBeVisible();
    await expect(page.locator('text=MANAGER').first()).toBeVisible();

    // El backend es fuente de verdad, debe ser MANAGER y sobreescribir DIRECTOR
    await expect.poll(async () => {
      const updatedUserStr = await page.evaluate(() => localStorage.getItem('proyecty_user'));
      const updatedUser = JSON.parse(updatedUserStr || '{}');
      return updatedUser.role;
    }).toBe('MANAGER');
  });

  test('SIGNED_OUT limpia la sesión completamente', async ({ page, request }) => {
    const res = await request.post('/api/auth/demo-session', {
      data: { role: 'MANAGER' }
    });
    const { token } = await res.json();

    await page.goto('/');
    await page.evaluate((t) => {
      localStorage.setItem('proyecty_token', t);
      localStorage.setItem('proyecty_user', JSON.stringify({ role: 'MANAGER' }));
    }, token);
    
    // Modificar el token a algo invalido
    await page.evaluate(() => {
      localStorage.setItem('proyecty_token', 'demo-jwt-invalid');
    });

    await page.reload();
    
    // Al intentar cargar con token inválido, se desloguea
    await expect(page.locator('text=Continuar con Google')).toBeVisible();
    
    await expect.poll(async () => {
      return await page.evaluate(() => localStorage.getItem('proyecty_token'));
    }).toBeNull();
    
    await expect.poll(async () => {
      return await page.evaluate(() => localStorage.getItem('proyecty_user'));
    }).toBeNull();
  });

});
