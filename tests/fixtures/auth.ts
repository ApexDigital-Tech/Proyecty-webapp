import { Page, APIRequestContext } from '@playwright/test';

/**
 * Obtains a dynamically generated signed JWT token from the local test server via /api/auth/demo-session.
 * Never hardcodes tokens or secrets in the browser or repo.
 */
export async function getTestAuthToken(request: APIRequestContext, role: string = 'DIRECTOR'): Promise<string> {
  const response = await request.post('http://127.0.0.1:3000/api/auth/demo-session', {
    data: { role },
  });

  if (!response.ok()) {
    throw new Error(`Failed to create demo session for role ${role}: ${response.status()} ${await response.text()}`);
  }

  const data = await response.json();
  return data.token;
}

/**
 * Injects a dynamically fetched demo session token into the page's localStorage.
 */
export async function loginWithDemoSession(page: Page, request: APIRequestContext, role: string = 'DIRECTOR'): Promise<string> {
  const token = await getTestAuthToken(request, role);
  await page.goto('http://127.0.0.1:3000');
  await page.evaluate((jwt) => {
    localStorage.setItem('sb-access-token', jwt);
  }, token);
  await page.reload();
  return token;
}
