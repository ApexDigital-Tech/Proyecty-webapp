import crypto from 'node:crypto';

export interface DemoJWTPayload {
  iss: string;
  aud: string;
  sub: string;
  user_id: number;
  id?: number;
  email: string;
  name: string;
  role: string;
  roleName: string;
  tenant_id: number;
  session_id: string;
  iat: number;
  exp: number;
}

const DEMO_SECRET = process.env.DEMO_JWT_SECRET || 'proyecty-demo-isolated-hmac-secret-2026-audit';
const DEMO_ISSUER = 'proyecty-auth';
const DEMO_AUDIENCE = 'proyecty-app';

function base64UrlEncode(str: string): string {
  return Buffer.from(str)
    .toString('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
}

function base64UrlDecode(str: string): string {
  let base64 = str.replace(/-/g, '+').replace(/_/g, '/');
  while (base64.length % 4) {
    base64 += '=';
  }
  return Buffer.from(base64, 'base64').toString('utf-8');
}

export function generateDemoToken(user: {
  uid: string;
  userId?: number;
  id?: number;
  email: string;
  name: string;
  role: string;
  roleName: string;
  tenantId: number;
}, expiresInMinutes: number = 120): string {
  const header = {
    alg: 'HS256',
    typ: 'JWT',
  };

  const nowSeconds = Math.floor(Date.now() / 1000);
  const resolvedUserId = user.userId || user.id || 1;

  const payload: DemoJWTPayload = {
    iss: DEMO_ISSUER,
    aud: DEMO_AUDIENCE,
    sub: user.uid,
    user_id: resolvedUserId,
    id: resolvedUserId,
    email: user.email,
    name: user.name,
    role: user.role.toUpperCase(),
    roleName: user.roleName,
    tenant_id: user.tenantId,
    session_id: crypto.randomUUID(),
    iat: nowSeconds,
    exp: nowSeconds + expiresInMinutes * 60,
  };

  const encodedHeader = base64UrlEncode(JSON.stringify(header));
  const encodedPayload = base64UrlEncode(JSON.stringify(payload));
  const dataToSign = `${encodedHeader}.${encodedPayload}`;

  const signature = crypto
    .createHmac('sha256', DEMO_SECRET)
    .update(dataToSign)
    .digest('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');

  return `demo.${dataToSign}.${signature}`;
}

export function verifyDemoToken(token: string): DemoJWTPayload {
  if (!token.startsWith('demo.')) {
    throw new Error('Token does not have required demo prefix');
  }

  const rawJwt = token.substring(5); // strip "demo."
  const parts = rawJwt.split('.');
  if (parts.length !== 3) {
    throw new Error('Invalid JWT structure in demo token');
  }

  const [encodedHeader, encodedPayload, signature] = parts;
  const dataToSign = `${encodedHeader}.${encodedPayload}`;

  const expectedSignature = crypto
    .createHmac('sha256', DEMO_SECRET)
    .update(dataToSign)
    .digest('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');

  const sigBuffer = Buffer.from(signature);
  const expectedSigBuffer = Buffer.from(expectedSignature);

  if (sigBuffer.length !== expectedSigBuffer.length || !crypto.timingSafeEqual(sigBuffer, expectedSigBuffer)) {
    throw new Error('Invalid demo token cryptographic signature');
  }

  const headerStr = base64UrlDecode(encodedHeader);
  const header = JSON.parse(headerStr);
  if (header.alg !== 'HS256' || header.typ !== 'JWT') {
    throw new Error('Unauthorized or invalid algorithm in demo token header');
  }

  const payloadStr = base64UrlDecode(encodedPayload);
  const payload: DemoJWTPayload = JSON.parse(payloadStr);

  const nowSeconds = Math.floor(Date.now() / 1000);
  if (payload.exp && payload.exp < nowSeconds) {
    throw new Error('Demo token has expired');
  }

  if (payload.iss !== DEMO_ISSUER) {
    throw new Error(`Invalid issuer: expected ${DEMO_ISSUER}, got ${payload.iss}`);
  }

  if (payload.aud !== DEMO_AUDIENCE) {
    throw new Error(`Invalid audience: expected ${DEMO_AUDIENCE}, got ${payload.aud}`);
  }

  if (!payload.tenant_id || !payload.role || !payload.sub || !payload.session_id) {
    throw new Error('Demo token payload missing mandatory claims');
  }

  return payload;
}
