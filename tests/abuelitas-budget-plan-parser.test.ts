import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import {
  ABUELITAS_PLAN_ROWS,
  getAbuelitasPlanTemplateCsv,
  parseCsv,
  validateBudgetPlanCsv,
} from '../src/services/importPlan.service.ts';

const fixtureUrl = new URL('./fixtures/demo/plan_presupuestario_abuelitas_2026.csv', import.meta.url);
const fixture = await readFile(fileURLToPath(fixtureUrl), 'utf8');
const result = validateBudgetPlanCsv(fixture, 'PRJ-VS-2000');

assert.equal(result.rows.length, 11, 'debe conservar las 11 partidas del PDF');
assert.equal(result.totalAmount, 333400, 'el total debe ser Bs 333.400');
assert.equal(result.currency, 'BOB', 'la moneda base debe ser BOB');
assert.equal(result.errors.length, 0, 'el archivo de referencia no debe tener errores');
assert.equal(result.warnings.length, 4, 'los cuatro códigos observados deben requerir revisión');
assert.equal(result.rows[3].data.description, 'Lavado de alimentos, vajilla e higiene', 'debe interpretar comas dentro de campos citados');
assert.deepEqual(result.rows.map((row) => row.data.approvedAmount), ABUELITAS_PLAN_ROWS.map((row) => row[7]));

const generated = validateBudgetPlanCsv(getAbuelitasPlanTemplateCsv('PRJ-VS-2000'), 'PRJ-VS-2000');
assert.equal(generated.totalAmount, 333400, 'la plantilla descargable debe reproducir el total exacto');
assert.equal(parseCsv('a,b\r\n"x,y",z\r\n')[1][0], 'x,y', 'el parser debe admitir CSV RFC con comas');

console.log('OK: plan Abuelitas validado — 11 partidas, Bs 333.400, 4 advertencias.');
