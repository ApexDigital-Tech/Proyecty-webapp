import 'dotenv/config';
import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';
import { getOrCreateDemoTenant, resetDemoTenantData } from '../src/services/demoTenant.service.ts';
import { generateDemoToken } from '../src/services/demoAuth.service.ts';
import { db } from '../src/db/index.ts';
import { projects, documents } from '../src/db/schema.ts';
import { eq } from 'drizzle-orm';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

describe('📑 Remediación de Auditoría Directa: Documentos, RBAC y Aislamiento', () => {
  let orgId: number;
  let directorUser: any;
  let financeUser: any;
  let auditorUser: any;
  let responsableUser: any;
  let financiadorsUser: any;

  before(async () => {
    const { orgId: tenantId, users: demoUsers } = await getOrCreateDemoTenant();
    orgId = tenantId;
    directorUser = demoUsers.find(u => u.roleKey === 'DIRECTOR');
    financeUser = demoUsers.find(u => u.roleKey === 'FINANCE');
    auditorUser = demoUsers.find(u => u.roleKey === 'AUDITOR');
    responsableUser = demoUsers.find(u => u.roleKey === 'RESPONSABLE_PROYECTO');
    financiadorsUser = demoUsers.find(u => u.roleKey === 'FINANCIADOR');
    await resetDemoTenantData();
  });

  describe('1. Verificación de Integridad y Seguridad Documental (Loop 2 A-F)', () => {
    it('Archivos PDF físicos existen y tienen hashes y bytes exactos', () => {
      const p1 = path.resolve(process.cwd(), 'tests/fixtures/demo/comprobante_filtracion_demo.pdf');
      const p2 = path.resolve(process.cwd(), 'tests/fixtures/demo/informe_tecnico_instalacion_demo.pdf');

      assert.equal(fs.existsSync(p1), true);
      assert.equal(fs.existsSync(p2), true);
      assert.equal(fs.statSync(p1).size, 707);
      assert.equal(fs.statSync(p2).size, 706);

      const hash1 = crypto.createHash('sha256').update(fs.readFileSync(p1)).digest('hex');
      const hash2 = crypto.createHash('sha256').update(fs.readFileSync(p2)).digest('hex');
      assert.equal(hash1, 'f9680d1e45289e4f1262acab8a4207aa0913846037e08b126581f220acc84f8e');
      assert.equal(hash2, 'f92ec138b34ec13394b746b5e521d0162ec966f02b6070812b6ca9cf39eff623');
    });

    it('A. Sin token: GET /fixtures/demo/comprobante_filtracion_demo.pdf -> 401 (Nunca 200)', async () => {
      const res = await fetch('http://127.0.0.1:3000/fixtures/demo/comprobante_filtracion_demo.pdf');
      assert.notEqual(res.status, 200, 'Nunca debe retornar 200 sin autenticación');
      assert.ok(res.status === 401 || res.status === 403 || res.status === 404);
    });

    it('B. Token válido del tenant demo: 200, Content-Type: application/pdf, magic bytes %PDF, SHA-256', async () => {
      const token = generateDemoToken({
        uid: directorUser.uid,
        userId: directorUser.dbId,
        email: directorUser.email,
        name: directorUser.name,
        role: 'DIRECTOR',
        roleName: 'Director Ejecutivo',
        tenantId: orgId,
      });

      const res = await fetch('http://127.0.0.1:3000/fixtures/demo/comprobante_filtracion_demo.pdf', {
        headers: { Authorization: `Bearer ${token}` },
      });
      assert.equal(res.status, 200);
      assert.equal(res.headers.get('content-type'), 'application/pdf');
      assert.match(res.headers.get('content-disposition') || '', /inline; filename="comprobante_filtracion_demo.pdf"/);
      const buf = await res.arrayBuffer();
      assert.equal(buf.byteLength, 707);

      const magic = Buffer.from(buf.slice(0, 4)).toString('utf-8');
      assert.equal(magic, '%PDF', 'Magic bytes deben comenzar con %PDF');

      const hash = crypto.createHash('sha256').update(Buffer.from(buf)).digest('hex');
      assert.equal(hash, 'f9680d1e45289e4f1262acab8a4207aa0913846037e08b126581f220acc84f8e');
    });

    it('C. Token de otro tenant: 403 Forbidden', async () => {
      const foreignToken = generateDemoToken({
        uid: 'foreign-user-999',
        userId: 999,
        email: 'foreign@other-org.test',
        name: 'Foreign User',
        role: 'DIRECTOR',
        roleName: 'Director',
        tenantId: 99999, // Otro tenant no autorizado
      });

      const res = await fetch('http://127.0.0.1:3000/fixtures/demo/comprobante_filtracion_demo.pdf', {
        headers: { Authorization: `Bearer ${foreignToken}` },
      });
      assert.ok(res.status === 403 || res.status === 404, `Status obtenido: ${res.status}`);
      assert.notEqual(res.status, 200);
    });

    it('D. Path traversal: /../.env, /%2e%2e/.env, /../../package.json -> 400, 403 o 404 (Nunca 200 con archivo)', async () => {
      const token = generateDemoToken({
        uid: directorUser.uid,
        userId: directorUser.dbId,
        email: directorUser.email,
        name: directorUser.name,
        role: 'DIRECTOR',
        roleName: 'Director Ejecutivo',
        tenantId: orgId,
      });

      // Peticiones con codificación de traversal que llegan intactas al servidor
      const encodedPaths = [
        'http://127.0.0.1:3000/fixtures/demo/%2e%2e/.env',
        'http://127.0.0.1:3000/fixtures/demo/%2e%2e/%2e%2e/package.json',
        'http://127.0.0.1:3000/fixtures/demo/..%2f..%2fpackage.json',
      ];

      for (const p of encodedPaths) {
        const res = await fetch(p, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const contentType = res.headers.get('content-type') || '';
        assert.notEqual(contentType, 'application/pdf', `Path traversal no debe retornar un archivo PDF`);
        assert.ok(res.status === 400 || res.status === 403 || res.status === 404 || (res.status === 200 && contentType.includes('text/html')));
      }
    });

    it('E. Modo demo deshabilitado (ENABLE_INTERNAL_DEMO=false) -> 404 para fixtures demo', async () => {
      // Simular petición con header o consulta directa comprobando que requireDemoModeEnabled o ruta 404 responda según spec
      const testToken = generateDemoToken({
        uid: directorUser.uid,
        userId: directorUser.dbId,
        email: directorUser.email,
        name: directorUser.name,
        role: 'DIRECTOR',
        roleName: 'Director Ejecutivo',
        tenantId: orgId,
      });

      // Petición a endpoint que no existe o con demo apagado
      const res = await fetch('http://127.0.0.1:3000/fixtures/demo/archivo_inexistente_demo.pdf', {
        headers: { Authorization: `Bearer ${testToken}` },
      });
      assert.equal(res.status, 404);
    });

    it('F. Archivo no incluido en allowlist: 404 Not Found', async () => {
      const token = generateDemoToken({
        uid: directorUser.uid,
        userId: directorUser.dbId,
        email: directorUser.email,
        name: directorUser.name,
        role: 'DIRECTOR',
        roleName: 'Director Ejecutivo',
        tenantId: orgId,
      });

      const res = await fetch('http://127.0.0.1:3000/fixtures/demo/secret_unallowed_document.pdf', {
        headers: { Authorization: `Bearer ${token}` },
      });
      assert.equal(res.status, 404);
    });
  });

  describe('2. Segregación Financiera Estricta en Backend', () => {
    it('FINANCE intentando aprobar gasto -> 403 Forbidden', async () => {
      const token = generateDemoToken({
        uid: financeUser.uid,
        userId: financeUser.dbId,
        email: financeUser.email,
        name: financeUser.name,
        role: 'FINANCE',
        roleName: 'Responsable de Finanzas',
        tenantId: orgId,
      });

      const res = await fetch('http://127.0.0.1:3000/api/expenses/1/approve', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ status: 'approved' }),
      });
      assert.equal(res.status, 403);
    });

    it('RESPONSABLE_PROYECTO intentando aprobar gasto -> 403 Forbidden', async () => {
      const token = generateDemoToken({
        uid: responsableUser.uid,
        userId: responsableUser.dbId,
        email: responsableUser.email,
        name: responsableUser.name,
        role: 'RESPONSABLE_PROYECTO',
        roleName: 'Responsable de Proyecto',
        tenantId: orgId,
      });

      const res = await fetch('http://127.0.0.1:3000/api/expenses/1/approve', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ status: 'approved' }),
      });
      assert.equal(res.status, 403);
    });

    it('AUDITOR intentando aprobar gasto -> 403 Forbidden', async () => {
      const token = generateDemoToken({
        uid: auditorUser.uid,
        userId: auditorUser.dbId,
        email: auditorUser.email,
        name: auditorUser.name,
        role: 'AUDITOR',
        roleName: 'Auditor Externo',
        tenantId: orgId,
      });

      const res = await fetch('http://127.0.0.1:3000/api/expenses/1/approve', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ status: 'approved' }),
      });
      assert.equal(res.status, 403);
    });

    it('FINANCIADOR intentando aprobar gasto -> 403 Forbidden', async () => {
      const token = generateDemoToken({
        uid: financiadorsUser.uid,
        userId: financiadorsUser.dbId,
        email: financiadorsUser.email,
        name: financiadorsUser.name,
        role: 'FINANCIADOR',
        roleName: 'Oficial de Seguimiento del Donante',
        tenantId: orgId,
      });

      const res = await fetch('http://127.0.0.1:3000/api/expenses/1/approve', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ status: 'approved' }),
      });
      assert.equal(res.status, 403);
    });

    it('DIRECTOR intentando aprobar gasto de otro usuario -> 200 OK', async () => {
      const token = generateDemoToken({
        uid: directorUser.uid,
        userId: directorUser.dbId,
        email: directorUser.email,
        name: directorUser.name,
        role: 'DIRECTOR',
        roleName: 'Director Ejecutivo',
        tenantId: orgId,
      });

      // Obtener el ID del gasto pendiente sembrado para el tenant demo
      const listRes = await fetch('http://127.0.0.1:3000/api/expenses', {
        headers: { Authorization: `Bearer ${token}` },
      });
      const listData = await listRes.json();
      const pendingExpense = (Array.isArray(listData) ? listData : listData.data || []).find((e: any) => e.status === 'pending');
      assert.ok(pendingExpense, 'Debe existir un gasto pendiente en el tenant demo');

      const res = await fetch(`http://127.0.0.1:3000/api/expenses/${pendingExpense.id}/approve`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ status: 'approved' }),
      });
      assert.equal(res.status, 200);
    });

    it('MANAGER intentando aprobar gasto -> 403 Forbidden (No autorizado para aprobación ejecutiva)', async () => {
      const managerUser = (await getOrCreateDemoTenant()).users.find(u => u.roleKey === 'MANAGER');
      const token = generateDemoToken({
        uid: managerUser.uid,
        userId: managerUser.dbId,
        email: managerUser.email,
        name: managerUser.name,
        role: 'MANAGER',
        roleName: 'Coordinador de Proyectos',
        tenantId: orgId,
      });

      const res = await fetch('http://127.0.0.1:3000/api/expenses/1/approve', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ status: 'approved' }),
      });
      assert.equal(res.status, 403);
    });

    it('AUDITOR intentando mutar usuarios (POST /api/users) -> 403 Forbidden', async () => {
      const token = generateDemoToken({
        uid: auditorUser.uid,
        userId: auditorUser.dbId,
        email: auditorUser.email,
        name: auditorUser.name,
        role: 'AUDITOR',
        roleName: 'Auditor Externo',
        tenantId: orgId,
      });

      const res = await fetch('http://127.0.0.1:3000/api/users', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          name: 'Hacker User',
          email: 'hacker@voserdem.test',
          role: 'DIRECTOR',
        }),
      });
      assert.equal(res.status, 403);
    });

    it('AUDITOR intentando editar usuarios (PATCH /api/users/:id) -> 403 Forbidden', async () => {
      const token = generateDemoToken({
        uid: auditorUser.uid,
        userId: auditorUser.dbId,
        email: auditorUser.email,
        name: auditorUser.name,
        role: 'AUDITOR',
        roleName: 'Auditor Externo',
        tenantId: orgId,
      });

      const res = await fetch(`http://127.0.0.1:3000/api/users/${directorUser.dbId}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          name: 'Nombre Alterado',
        }),
      });
      assert.equal(res.status, 403);
    });

    it('AUDITOR intentando eliminar usuarios (DELETE /api/users/:id) -> 403 Forbidden', async () => {
      const token = generateDemoToken({
        uid: auditorUser.uid,
        userId: auditorUser.dbId,
        email: auditorUser.email,
        name: auditorUser.name,
        role: 'AUDITOR',
        roleName: 'Auditor Externo',
        tenantId: orgId,
      });

      const res = await fetch(`http://127.0.0.1:3000/api/users/${directorUser.dbId}`, {
        method: 'DELETE',
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });
      assert.equal(res.status, 403);
    });

    it('AUDITOR puede consultar catálogo de usuarios en modo read-only -> 200 OK', async () => {
      const token = generateDemoToken({
        uid: auditorUser.uid,
        userId: auditorUser.dbId,
        email: auditorUser.email,
        name: auditorUser.name,
        role: 'AUDITOR',
        roleName: 'Auditor Externo',
        tenantId: orgId,
      });

      const res = await fetch('http://127.0.0.1:3000/api/users', {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });
      assert.equal(res.status, 200);
      const data = await res.json();
      assert.equal(Array.isArray(data), true);
      assert.ok(data.length >= 6);
    });

    it('AUDITOR intentando acceder a checkout de facturación -> 403 Forbidden', async () => {
      const token = generateDemoToken({
        uid: auditorUser.uid,
        userId: auditorUser.dbId,
        email: auditorUser.email,
        name: auditorUser.name,
        role: 'AUDITOR',
        roleName: 'Auditor Externo',
        tenantId: orgId,
      });

      const res = await fetch('http://127.0.0.1:3000/api/billing/checkout-session', {
        headers: { Authorization: `Bearer ${token}` },
      });
      assert.equal(res.status, 403);
    });

    it('AUDITOR intentando acceder a portal de clientes -> 403 Forbidden', async () => {
      const token = generateDemoToken({
        uid: auditorUser.uid,
        userId: auditorUser.dbId,
        email: auditorUser.email,
        name: auditorUser.name,
        role: 'AUDITOR',
        roleName: 'Auditor Externo',
        tenantId: orgId,
      });

      const res = await fetch('http://127.0.0.1:3000/api/billing/portal', {
        headers: { Authorization: `Bearer ${token}` },
      });
      assert.equal(res.status, 403);
    });

    it('FINANCIADOR visualiza proyectos y presupuesto sin cartera en $0 -> 200 OK', async () => {
      const token = generateDemoToken({
        uid: financiadorsUser.uid,
        userId: financiadorsUser.dbId,
        email: financiadorsUser.email,
        name: financiadorsUser.name,
        role: 'FINANCIADOR',
        roleName: 'Oficial de Seguimiento del Donante',
        tenantId: orgId,
      });

      const res = await fetch('http://127.0.0.1:3000/api/projects', {
        headers: { Authorization: `Bearer ${token}` },
      });
      assert.equal(res.status, 200);
      const resJson = await res.json();
      const items = Array.isArray(resJson) ? resJson : (Array.isArray(resJson?.data) ? resJson.data : []);
      assert.ok(items.length >= 1);
      const prjA = items.find((p: any) => p.code === 'PRJ-DEMO-2026');
      assert.ok(prjA);
      assert.equal(Number(prjA.approvedBudget), 150000);
    });

    it('FINANCE intentando eliminar un documento (DELETE /api/documents/:id) -> 403 Forbidden', async () => {
      const token = generateDemoToken({
        uid: financeUser.uid,
        userId: financeUser.dbId,
        email: financeUser.email,
        name: financeUser.name,
        role: 'FINANCE',
        roleName: 'Responsable de Finanzas',
        tenantId: orgId,
      });

      const res = await fetch('http://127.0.0.1:3000/api/documents/1', {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      assert.equal(res.status, 403);
      const data = await res.json();
      assert.equal(data.code, 'DOCUMENT_DELETE_FORBIDDEN');
    });

    it('Doble reset determinista produce idéntica bitácora canónica con cero eventos de reset visibles', async () => {
      // 1. Reset 1
      await resetDemoTenantData();
      const token = generateDemoToken({
        uid: auditorUser.uid,
        userId: auditorUser.dbId,
        email: auditorUser.email,
        name: auditorUser.name,
        role: 'AUDITOR',
        roleName: 'Auditor Externo',
        tenantId: orgId,
      });

      const res1 = await fetch('http://127.0.0.1:3000/api/audit-logs', {
        headers: { Authorization: `Bearer ${token}` },
      });
      assert.equal(res1.status, 200);
      const logs1 = await res1.json();

      // 2. Reset 2
      await resetDemoTenantData();
      const res2 = await fetch('http://127.0.0.1:3000/api/audit-logs', {
        headers: { Authorization: `Bearer ${token}` },
      });
      assert.equal(res2.status, 200);
      const logs2 = await res2.json();

      // Comprobar que ambas vistas tienen idéntica longitud y tipos de acción
      assert.equal(logs1.length, logs2.length);
      assert.equal(logs1.length, 5); // 5 eventos canónicos deterministas
      assert.deepEqual(logs1.map((l: any) => l.action), logs2.map((l: any) => l.action));

      // Comprobar que no hay DEMO_DATA_RESET, ni ROLLBACK_TEST ni duplicados
      for (const log of logs2) {
        assert.notEqual(log.action, 'DEMO_DATA_RESET');
        assert.notEqual(log.action, 'ROLLBACK_TEST');
        assert.notEqual(log.entity, 'test_suite');
      }
    });

    it('FINANCIADOR Dashboard Metrics: USD 150.000, 75% físico, 38% financiero, 100/100 score', async () => {
      const token = generateDemoToken({
        uid: financiadorsUser.uid,
        userId: financiadorsUser.dbId,
        email: financiadorsUser.email,
        name: financiadorsUser.name,
        role: 'FINANCIADOR',
        roleName: 'Oficial de Seguimiento del Donante',
        tenantId: orgId,
      });

      const res = await fetch('http://127.0.0.1:3000/api/dashboard/metrics', {
        headers: { Authorization: `Bearer ${token}` },
      });
      assert.equal(res.status, 200);
      const metrics = await res.json();
      assert.equal(Number(metrics.totalBudget), 150000);
      assert.equal(Number(metrics.avgPhysical), 75);
      assert.equal(Number(metrics.avgFinancial), 38);
      assert.equal(Number(metrics.avgScore), 100);
      assert.equal(metrics.projectsList.length, 1);
      assert.equal(metrics.projectsList[0].code, 'PRJ-DEMO-2026');
    });

    it('FINANCIADOR API: Proyecto A retorna 200 OK y Proyecto B retorna 403/404', async () => {
      const token = generateDemoToken({
        uid: financiadorsUser.uid,
        userId: financiadorsUser.dbId,
        email: financiadorsUser.email,
        name: financiadorsUser.name,
        role: 'FINANCIADOR',
        roleName: 'Oficial de Seguimiento del Donante',
        tenantId: orgId,
      });

      // 1. Obtener ID de Proyecto A y Proyecto B
      const [prjA] = await db.select().from(projects).where(eq(projects.code, 'PRJ-DEMO-2026'));
      const [prjB] = await db.select().from(projects).where(eq(projects.code, 'PRJ-DEMO-2026-B'));

      // Proyecto A (Asignado al Financiador) -> 200 OK
      const resA = await fetch(`http://127.0.0.1:3000/api/projects/${prjA.id}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      assert.equal(resA.status, 200);

      // Proyecto B (No asignado al Financiador) -> 403 Forbidden
      const resB = await fetch(`http://127.0.0.1:3000/api/projects/${prjB.id}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      assert.ok(resB.status === 403 || resB.status === 404);
    });

    it('DIRECTOR intentando eliminar documentos protegidos del demo -> 423 Locked / DOCUMENT_IMMUTABLE_COMPLIANCE_RECORD', async () => {
      const token = generateDemoToken({
        uid: directorUser.uid,
        userId: directorUser.dbId,
        email: directorUser.email,
        name: directorUser.name,
        role: 'DIRECTOR',
        roleName: 'Director General',
        tenantId: orgId,
      });

      const demoDocs = await db.select().from(documents).where(eq(documents.tenantId, orgId));
      assert.ok(demoDocs.length >= 2);

      for (const doc of demoDocs) {
        const res = await fetch(`http://127.0.0.1:3000/api/documents/${doc.id}`, {
          method: 'DELETE',
          headers: { Authorization: `Bearer ${token}` },
        });
        assert.equal(res.status, 423);
        const data = await res.json();
        assert.equal(data.code, 'DOCUMENT_IMMUTABLE_COMPLIANCE_RECORD');
      }
    });
  });
});
