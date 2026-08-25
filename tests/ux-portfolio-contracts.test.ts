import 'dotenv/config';
import assert from 'node:assert';
import { db } from '../src/db/index.ts';
import { projects, donors, users, tenants } from '../src/db/schema.ts';
import { eq, and } from 'drizzle-orm';
import { normalizePaginatedResponse, normalizeArrayResponse } from '../src/lib/api-helpers.ts';
import { Project, PaginatedResponse, PaginationInfo } from '../src/types.ts';

let passed = 0;
let failed = 0;

function it(name: string, fn: () => void | Promise<void>) {
  return Promise.resolve()
    .then(fn)
    .then(() => {
      console.log(`  ✅ ${name}`);
      passed++;
    })
    .catch((err) => {
      console.error(`  ❌ ${name}:`, err.message);
      failed++;
    });
}

async function runTests() {
  console.log('\n======================================================');
  console.log('🧪 SUITE: UX-PORT-01 Contrato PaginatedResponse & Normalización');
  console.log('======================================================\n');

  console.log('--- 1. Normalización de PaginatedResponse<Project> ---');

  await it('Debe normalizar payload canónico { data: [...], pagination: {...} } conservando paginación', () => {
    const payload = {
      data: [
        { id: 1, code: 'PRJ-DEMO-2026', name: 'Proyecto Demo', donor: 'USAID', approvedBudget: 150000, physicalProgress: 75, financialProgress: 38, score: 100 },
        { id: 2, code: 'PRJ-DEMO-02', name: 'Proyecto Secundario', donor: 'BID', approvedBudget: 80000, physicalProgress: 40, financialProgress: 20, score: 90 }
      ],
      pagination: {
        totalItems: 2,
        currentPage: 1,
        totalPages: 1,
        limit: 10
      }
    };

    const { data, pagination } = normalizePaginatedResponse<Project>(payload);
    assert.strictEqual(Array.isArray(data), true, 'data debe ser un arreglo');
    assert.strictEqual(data.length, 2, 'debe contener 2 proyectos');
    assert.strictEqual(pagination.totalItems, 2);
    assert.strictEqual(pagination.currentPage, 1);
    assert.strictEqual(pagination.totalPages, 1);
    assert.strictEqual(pagination.limit, 10);

    // Validar que operaciones de filtrado, búsqueda, ordenamiento y mapeo funcionan sin lanzar excepciones
    const filtered = data.filter(p => p.approvedBudget > 100000);
    assert.strictEqual(filtered.length, 1);
    assert.strictEqual(filtered[0].code, 'PRJ-DEMO-2026');

    const mapped = data.map(p => p.name);
    assert.deepStrictEqual(mapped, ['Proyecto Demo', 'Proyecto Secundario']);

    const sorted = [...data].sort((a, b) => b.score - a.score);
    assert.strictEqual(sorted[0].score, 100);
  });

  await it('Debe normalizar arreglo plano directo [...] (retrocompatibilidad defensiva)', () => {
    const flatArray: Partial<Project>[] = [
      { id: 10, code: 'PRJ-FLAT', name: 'Proyecto Plano', approvedBudget: 50000 }
    ];

    const { data, pagination } = normalizePaginatedResponse<Project>(flatArray);
    assert.strictEqual(Array.isArray(data), true);
    assert.strictEqual(data.length, 1);
    assert.strictEqual(data[0].code, 'PRJ-FLAT');
    assert.strictEqual(pagination.totalItems, 1);
    assert.strictEqual(pagination.currentPage, 1);
  });

  await it('Debe normalizar envolturas alternativas { projects: [...] } o { items: [...] }', () => {
    const wrappedProjects = {
      projects: [{ id: 20, code: 'PRJ-WRAPPED', name: 'Wrapped' }]
    };
    const res1 = normalizePaginatedResponse<Project>(wrappedProjects);
    assert.strictEqual(res1.data.length, 1);
    assert.strictEqual(res1.data[0].code, 'PRJ-WRAPPED');

    const wrappedItems = {
      items: [{ id: 30, code: 'PRJ-ITEMS', name: 'Items' }]
    };
    const res2 = normalizePaginatedResponse<Project>(wrappedItems);
    assert.strictEqual(res2.data.length, 1);
    assert.strictEqual(res2.data[0].code, 'PRJ-ITEMS');
  });

  await it('Debe manejar defensivamente payloads vacíos, nulos, undefined o con errores sin crashear', () => {
    const payloads = [
      null,
      undefined,
      {},
      { data: null },
      { data: 'invalido' },
      { error: 'Error interno 500' },
      'cadena corrupta',
      99999
    ];

    for (const p of payloads) {
      const { data, pagination } = normalizePaginatedResponse<Project>(p);
      assert.strictEqual(Array.isArray(data), true);
      assert.strictEqual(data.length, 0);
      assert.strictEqual(pagination.totalItems, 0);
      assert.strictEqual(pagination.currentPage, 1);

      // Verificación de que filter, map y reduce no arrojan TypeError
      const filtered = data.filter(item => item && item.code);
      assert.deepStrictEqual(filtered, []);
    }
  });

  console.log('\n--- 2. Normalización de normalizeArrayResponse ---');

  await it('Debe extraer arreglos desde cualquier formato plano o estructurado', () => {
    assert.deepStrictEqual(normalizeArrayResponse([1, 2, 3]), [1, 2, 3]);
    assert.deepStrictEqual(normalizeArrayResponse({ data: ['a', 'b'] }), ['a', 'b']);
    assert.deepStrictEqual(normalizeArrayResponse({ tasks: [{ id: 1 }] }), [{ id: 1 }]);
    assert.deepStrictEqual(normalizeArrayResponse({ items: ['x'] }), ['x']);
    assert.deepStrictEqual(normalizeArrayResponse(null), []);
    assert.deepStrictEqual(normalizeArrayResponse({}), []);
    assert.deepStrictEqual(normalizeArrayResponse({ error: 'fail' }), []);
  });

  console.log('\n--- 3. Verificación de Integridad de Datos en BD ---');

  await it('Debe consultar la base de datos y validar la estructura de proyectos y donantes', async () => {
    const dbProjects = await db.select().from(projects).limit(5);
    assert.strictEqual(Array.isArray(dbProjects), true);

    const { data: normalized, pagination } = normalizePaginatedResponse<Project>({
      data: dbProjects,
      pagination: {
        totalItems: dbProjects.length,
        currentPage: 1,
        totalPages: 1,
        limit: 10
      }
    });

    assert.strictEqual(Array.isArray(normalized), true);
    assert.strictEqual(normalized.length, dbProjects.length);

    // Validar que operaciones de interfaz sobre proyectos recuperados de BD no crashean
    const active = normalized.filter(p => p.status === 'ACTIVO' || p.status === 'EJECUCIÓN');
    assert.strictEqual(Array.isArray(active), true);
  });

  console.log('\n======================================================');
  console.log(`📊 RESULTADOS: ${passed} PASSED | ${failed} FAILED`);
  console.log('======================================================\n');

  process.exit(failed > 0 ? 1 : 0);
}

runTests().catch(err => {
  console.error('Error fatal en ejecución:', err);
  process.exit(1);
});
