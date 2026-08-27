import { test } from '@playwright/test';

test('Tomar screenshot', async ({ page }) => {
  await page.goto('http://localhost:3000');
  await page.waitForLoadState('networkidle');
  await page.screenshot({ path: 'test-results/screenshot.png', fullPage: true });
});
