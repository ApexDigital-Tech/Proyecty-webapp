import { test, expect } from '@playwright/test';

test.describe('Identity Hydration and Authorization', () => {

  test('INITIAL_SESSION nula + token app válido', async ({ page }) => {
    // Generate a valid demo token via the mock backend login
    const res = await page.request.post('/api/auth/login', {
      data: { email: 'apexdigital70@gmail.com', password: 'mock' }
    });
    const { token } = await res.json();
    
    await page.goto('/');
    await page.evaluate((t) => localStorage.setItem('proyecty_token', t), token);
    await page.reload();

    // The frontend should hydrate from /api/auth/me and not logout
    await expect(page.locator('#proyecty-app-shell')).toBeVisible();
    await expect(page.locator('text=apexdigital70')).toBeVisible();
  });

  test('INITIAL_SESSION nula + token vencido', async ({ page }) => {
    await page.goto('/');
    await page.evaluate(() => localStorage.setItem('proyecty_token', 'demo-expired-token'));
    await page.reload();

    // The backend /api/auth/me should reject it and clear session
    await expect(page.locator('text=Tu sesión ha expirado')).toBeVisible();
    const token = await page.evaluate(() => localStorage.getItem('proyecty_token'));
    expect(token).toBeNull();
  });

  test('user_metadata con rol manipulado', async ({ page }) => {
    // Simulate Supabase returning a fake session where user_metadata has 'DIRECTOR'
    // but the backend /api/auth/me enforces 'MANAGER'.
    // We can test this by mocking the Supabase client or intercepting /api/auth/me.
    
    await page.route('/api/auth/me', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          uid: 'manager-123',
          email: 'manipulador@gmail.com',
          name: 'Manipulador',
          role: 'MANAGER', // Backend truth
          tenantId: 1
        })
      });
    });

    await page.goto('/');
    // Set a dummy token
    await page.evaluate(() => localStorage.setItem('proyecty_token', 'demo-manager'));
    await page.reload();

    // Although the token might imply something else, the backend response says MANAGER.
    // Check if the user is treated as MANAGER (e.g., they cannot see settings if it's restricted)
    // Wait for the app to load
    await expect(page.locator('#proyecty-app-shell')).toBeVisible();
    
    const userRoleStr = await page.evaluate(() => {
      const userStr = localStorage.getItem('proyecty_user');
      return userStr ? JSON.parse(userStr).role : null;
    });

    expect(userRoleStr).toBe('MANAGER');
  });

});
