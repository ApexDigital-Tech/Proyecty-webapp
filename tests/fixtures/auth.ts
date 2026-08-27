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
 * Injects a dynamically fetched demo session token and user payload into the page's localStorage.
 */
export async function loginWithDemoSession(page: Page, request: APIRequestContext, role: string = 'DIRECTOR'): Promise<string> {
  const token = await getTestAuthToken(request, role);
  
  // Decodificar el tenant_id y user_id real del token
  const payloadBase64 = token.split('.')[1];
  const payloadStr = Buffer.from(payloadBase64, 'base64').toString('utf-8');
  const payload = JSON.parse(payloadStr);
  const realTenantId = payload.tenant_id || 1;
  const realUserId = payload.user_id || 1;

  await page.goto('http://127.0.0.1:3000');
  await page.evaluate(({ jwt, roleName, tenantId }) => {
    localStorage.setItem('proyecty_token', jwt);
    localStorage.setItem('proyecty_user', JSON.stringify({
      name: 'Gonzalo Alfaro (Test)',
      email: 'apexdigital70@gmail.com',
      role: roleName,
      tenantId: tenantId
    }));
  }, { jwt: token, roleName: role, tenantId: realTenantId });
  await page.goto('http://127.0.0.1:3000');
  await page.waitForLoadState('domcontentloaded');
  return token;
}
