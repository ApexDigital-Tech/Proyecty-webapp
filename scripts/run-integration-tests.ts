import { spawnSync } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

const suites = [
  'tests/p0-audit-auth.test.ts',
  'tests/p1-integrity-audit.test.ts',
  'tests/ola1-security-structure.test.ts',
  'tests/ola2-financial-integrity.test.ts',
  'tests/ola3-operations-governance.test.ts',
  'tests/ola4-executive-reporting.test.ts',
  'tests/ux-portfolio-contracts.test.ts',
  'tests/voserdem-security-remediation.test.ts',
  'tests/voserdem-trial-verification.test.ts',
];

console.log('====================================================');
console.log('🧪 CORREDOR CANÓNICO DE INTEGRACIÓN (9 SUITES TSX)');
console.log('====================================================\n');

let failedSuite: string | null = null;
let totalPassed = 0;

for (let i = 0; i < suites.length; i++) {
  const suite = suites[i];
  const suitePath = path.join(rootDir, suite);
  console.log(`[${i + 1}/${suites.length}] Ejecutando suite: ${suite}...`);
  
  const result = spawnSync('npx', ['tsx', suitePath], {
    cwd: rootDir,
    stdio: 'inherit',
    shell: true,
    env: process.env,
  });

  if (result.status !== 0) {
    failedSuite = suite;
    console.error(`\n❌ ERROR: La suite '${suite}' falló con código de salida ${result.status}.`);
    console.error('Deteniendo ejecución secuencial inmediatamente.');
    process.exit(result.status || 1);
  }

  totalPassed++;
  console.log(`✅ Suite '${suite}' completada con éxito.\n`);
}

console.log('====================================================');
console.log(`🎉 TODAS LAS SUITES DE INTEGRACIÓN PASARON (${totalPassed}/${suites.length})`);
console.log('====================================================');
process.exit(0);
