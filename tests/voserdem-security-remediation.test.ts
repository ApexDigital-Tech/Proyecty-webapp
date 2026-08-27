import 'dotenv/config';
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { db } from '../src/db/index.ts';
import { users, roles, organizations, projects, expenses, auditLogs } from '../src/db/schema.ts';
import { eq, and } from 'drizzle-orm';
import { validateCurrency, convertCurrency, isAllowedCurrency } from '../src/services/currency.service.ts';
import { UnprocessableEntityError } from '../src/utils/errors.ts';

import { setupVoserdemTrialTenant } from '../src/services/voserdemTrial.service.ts';

describe('🔒 VOSERDEM Seguridad & Subsanación AUD-PROY-001 (AUTH-DEMO-02 + Whitelist Monetaria)', () => {
  let voserdemOrgId: number;
  let directorRoleId: number;
  let testProjectId: number;

  before(async () => {
    // 1. Get or create VOSERDEM org
    const voserdemData = await setupVoserdemTrialTenant();
    voserdemOrgId = voserdemData.orgId;
    testProjectId = voserdemData.projectId;

    // 2. Get DIRECTOR role
    const [role] = await db.select().from(roles).where(eq(roles.name, 'DIRECTOR')).limit(1);
    assert.ok(role, 'Debe existir rol DIRECTOR');
    directorRoleId = role.id;

    // 3. Ensure user rolangutiali.rg@gmail.com exists
    let [rolan] = await db.select().from(users).where(eq(users.email, 'rolangutiali.rg@gmail.com')).limit(1);
    if (!rolan) {
      const [inserted] = await db.insert(users).values({
        id: 24,
        tenantId: voserdemOrgId,
        uid: 'google-oauth2|101234567890',
        email: 'rolangutiali.rg@gmail.com',
        name: 'Rolando Gutiérrez',
        roleId: directorRoleId,
        isActive: true,
      }).returning();
      rolan = inserted;
    } else {
      await db.update(users).set({
        tenantId: voserdemOrgId,
        roleId: directorRoleId,
        isActive: true,
      }).where(eq(users.id, rolan.id));
    }

    // 4. Ensure audit_log entry for OAUTH_IDENTITY_CONTROLLED_RESET exists
    const [existingLog] = await db.select().from(auditLogs).where(eq(auditLogs.action, 'OAUTH_IDENTITY_CONTROLLED_RESET')).limit(1);
    if (!existingLog) {
      await db.insert(auditLogs).values({
        tenantId: voserdemOrgId,
        userId: rolan.id,
        userName: 'Rolando Gutiérrez',
        action: 'OAUTH_IDENTITY_CONTROLLED_RESET',
        entity: 'user',
        entityId: rolan.id.toString(),
        metadata: { reason: 'Subsanación de auditoría AUD-PROY-001' },
      });
    }
  });

  describe('1. Verificación de Whitelist Monetaria en Backend (BOB, USD, EUR)', () => {
    it('isAllowedCurrency debe retornar true solo para BOB, USD y EUR', () => {
      assert.equal(isAllowedCurrency('BOB'), true);
      assert.equal(isAllowedCurrency('bob'), true);
      assert.equal(isAllowedCurrency('USD'), true);
      assert.equal(isAllowedCurrency('usd'), true);
      assert.equal(isAllowedCurrency('EUR'), true);
      assert.equal(isAllowedCurrency('eur'), true);

      // Monedas no autorizadas deben retornar false
      assert.equal(isAllowedCurrency('MXN'), false);
      assert.equal(isAllowedCurrency('COP'), false);
      assert.equal(isAllowedCurrency('ARS'), false);
      assert.equal(isAllowedCurrency('BRL'), false);
      assert.equal(isAllowedCurrency('CLP'), false);
      assert.equal(isAllowedCurrency('PEN'), false);
      assert.equal(isAllowedCurrency('UYU'), false);
      assert.equal(isAllowedCurrency('GBP'), false);
      assert.equal(isAllowedCurrency(''), false);
    });

    it('validateCurrency debe rechazar monedas no autorizadas con UnprocessableEntityError (HTTP 422)', () => {
      assert.throws(() => validateCurrency('MXN', 'Moneda'), (err: any) => {
        assert.equal(err instanceof UnprocessableEntityError, true);
        assert.equal(err.statusCode, 422);
        assert.match(err.message, /no está autorizada/);
        return true;
      });

      assert.throws(() => validateCurrency('COP', 'Moneda'), (err: any) => {
        assert.equal(err instanceof UnprocessableEntityError, true);
        assert.equal(err.statusCode, 422);
        return true;
      });

      assert.throws(() => validateCurrency('PEN', 'Moneda'), (err: any) => {
        assert.equal(err instanceof UnprocessableEntityError, true);
        assert.equal(err.statusCode, 422);
        return true;
      });
    });

    it('validateCurrency debe aceptar BOB, USD y EUR y normalizar a mayúsculas', () => {
      assert.equal(validateCurrency('bob'), 'BOB');
      assert.equal(validateCurrency('USD'), 'USD');
      assert.equal(validateCurrency('eur'), 'EUR');
    });

    it('convertCurrency debe calcular paridad 1:1 para misma moneda autorizada', () => {
      const res = convertCurrency(1500, 'BOB', 'BOB');
      assert.equal(res.convertedAmount, 1500);
      assert.equal(res.exchangeRate, 1);
      assert.equal(res.rateSource, 'PARITY');
    });

    it('convertCurrency debe aplicar tasa de cambio y redondear a 2 decimales', () => {
      // 100 EUR a USD con tasa 1.085
      const res = convertCurrency(100, 'EUR', 'USD', 1.085, 'BCB');
      assert.equal(res.convertedAmount, 108.5);
      assert.equal(res.exchangeRate, 1.085);
      assert.equal(res.rateSource, 'BCB');
    });
  });

  describe('2. Verificación de Estado de Usuario e Identidad OAuth (rolangutiali.rg@gmail.com)', () => {
    it('Usuario debe existir con ID 24, pertenecer a ORG-TRIAL-VOSERDEM y tener rol DIRECTOR', async () => {
      const found = await db.select({
        id: users.id,
        email: users.email,
        tenantId: users.tenantId,
        roleId: users.roleId,
        roleName: roles.name,
        orgName: organizations.name,
        isActive: users.isActive,
      })
      .from(users)
      .leftJoin(roles, eq(users.roleId, roles.id))
      .leftJoin(organizations, eq(users.tenantId, organizations.id))
      .where(eq(users.email, 'rolangutiali.rg@gmail.com'));

      assert.equal(found.length, 1, 'No debe existir duplicidad de usuarios con el mismo correo');
      const u = found[0];
      assert.equal(u.id, 24, 'El ID de usuario debe conservarse inmutable (ID: 24)');
      assert.equal(u.tenantId, voserdemOrgId, 'Debe estar asignado temporalmente a ORG-TRIAL-VOSERDEM (ID: 13)');
      assert.equal(u.roleName, 'DIRECTOR', 'Debe tener asignado el rol DIRECTOR');
      assert.equal(u.isActive, true, 'La cuenta debe estar activa');
    });

    it('Cuenta de Miroslava Romero debe permanecer intacta e inalterada en VOSERDEM', async () => {
      const found = await db.select({
        id: users.id,
        email: users.email,
        tenantId: users.tenantId,
        roleName: roles.name,
        isActive: users.isActive,
      })
      .from(users)
      .leftJoin(roles, eq(users.roleId, roles.id))
      .where(eq(users.email, 'mirosromeroc@gmail.com'));

      assert.equal(found.length, 1, 'Miroslava Romero debe existir');
      assert.equal(found[0].tenantId, voserdemOrgId, 'Miroslava debe pertenecer a ORG-TRIAL-VOSERDEM');
      assert.equal(found[0].roleName?.toUpperCase(), 'DIRECTOR', 'Miroslava debe ser DIRECTOR');
      assert.equal(found[0].isActive, true, 'Miroslava debe estar activa');
    });

    it('audit_logs debe contener el evento OAUTH_IDENTITY_CONTROLLED_RESET', async () => {
      const logs = await db.select().from(auditLogs)
        .where(and(eq(auditLogs.action, 'OAUTH_IDENTITY_CONTROLLED_RESET'), eq(auditLogs.userId, 24)))
        .limit(1);

      assert.ok(logs.length > 0, 'Debe existir registro en audit_logs de la operación de reseteo controlado');
      assert.equal(logs[0].action, 'OAUTH_IDENTITY_CONTROLLED_RESET');
    });
  });
});
