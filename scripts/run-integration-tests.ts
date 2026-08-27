import { spawnSync, spawn, execFileSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { validateTestEnvStrict, validateTestDatabaseRuntime } from '../src/lib/test-env-guard.ts';

function sleep(ms: number) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

const pgBin = 'C:\\temp\\proyecty-toolchain\\postgresql17\\pgsql\\bin';
const pgDataTest = 'C:\\temp\\proyecty-toolchain\\pgdata-test';

const suites = [
  'tests/resolveClientDist.test.ts',
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

console.log('============================================================');
console.log('🛡️ INICIANDO ARNES AISLADO DE PRUEBAS DE INTEGRACIÓN (R1C-B)');
console.log('============================================================\n');

// 1. Verificación de Guardias Negativas
console.log('--- 1. Ejecutando Batería de Validación de Guardias Negativas ---');
const negativeCases = [
  { name: 'DATABASE_URL ausente', url: '', env: 'test', expectError: true },
  { name: 'Host de Supabase', url: 'postgresql://postgres:pass@db.supabase.co:5432/postgres', env: 'test', expectError: true },
  { name: 'Host de Pooler Supabase', url: 'postgresql://postgres:pass@aws-0-us-east-1.pooler.supabase.com:55432/proyecty_test', env: 'test', expectError: true },
  { name: 'Localhost con puerto incorrecto', url: 'postgresql://postgres@127.0.0.1:5432/proyecty_test', env: 'test', expectError: true },
  { name: 'Base de datos incorrecta', url: 'postgresql://postgres@127.0.0.1:55432/postgres', env: 'test', expectError: true },
  { name: 'NODE_ENV distinto de test', url: 'postgresql://postgres@127.0.0.1:55432/proyecty_test', env: 'production', expectError: true },
  { name: 'Configuración válida (127.0.0.1:55432/proyecty_test)', url: 'postgresql://postgres@127.0.0.1:55432/proyecty_test', env: 'test', expectError: false },
];

let guardChecksPassed = 0;
for (const testCase of negativeCases) {
  let threw = false;
  try {
    validateTestEnvStrict(testCase.url, testCase.env);
  } catch (e) {
    threw = true;
  }

  if (threw === testCase.expectError) {
    guardChecksPassed++;
    console.log(`  ✅ Guardia: ${testCase.name} -> ${threw ? 'Bloqueado con éxito' : 'Aceptado con éxito'}`);
  } else {
    console.error(`  ❌ Fallo en control de guardia: ${testCase.name}`);
    process.exit(1);
  }
}
console.log(`Guardias verificadas: ${guardChecksPassed}/${negativeCases.length} superadas.\n`);

// 2. Aprovisionamiento de Instancia Local Temporal PG17
console.log('--- 2. Aprovisionando PostgreSQL 17 Local Aislado (Puerto 55432) ---');
if (fs.existsSync(pgDataTest)) fs.rmSync(pgDataTest, { recursive: true, force: true });

execFileSync(path.join(pgBin, 'initdb.exe'), ['-D', pgDataTest, '-U', 'postgres', '--auth=trust'], { encoding: 'utf8' });
fs.appendFileSync(path.join(pgDataTest, 'postgresql.conf'), "\nport = 55432\nlisten_addresses = '127.0.0.1'\n");

const pgProc = spawn(path.join(pgBin, 'postgres.exe'), ['-D', pgDataTest], { detached: true, stdio: 'ignore' });
pgProc.unref();
sleep(3000);

let allSuitesPassed = false;

try {
  console.log('Creando roles de simulación anon, authenticated, service_role...');
  execFileSync(path.join(pgBin, 'psql.exe'), ['-h', '127.0.0.1', '-p', '55432', '-U', 'postgres', '-d', 'postgres', '-c', `
    CREATE ROLE anon NOLOGIN;
    CREATE ROLE authenticated NOLOGIN;
    CREATE ROLE service_role NOLOGIN;
    CREATE ROLE supabase_admin NOLOGIN;
  `], { encoding: 'utf8' });

  console.log('Creando base de datos temporal proyecty_test desde template0...');
  execFileSync(path.join(pgBin, 'createdb.exe'), ['-h', '127.0.0.1', '-p', '55432', '-U', 'postgres', '-T', 'template0', 'proyecty_test'], { encoding: 'utf8' });

  const testDbUrl = 'postgresql://postgres@127.0.0.1:55432/proyecty_test';
  process.env.NODE_ENV = 'test';
  process.env.DATABASE_URL = testDbUrl;

  console.log('Empujando esquema Drizzle a la base de datos aislada...');
  const pushRes = spawnSync('npx.cmd', ['drizzle-kit', 'push'], {
    cwd: rootDir,
    stdio: 'inherit',
    shell: true,
    env: { ...process.env, DATABASE_URL: testDbUrl, NODE_ENV: 'test' },
  });

  if (pushRes.status !== 0) {
    throw new Error(`Fallo al aplicar esquema con drizzle-kit push (código ${pushRes.status})`);
  }

  console.log('Sembrando catálogo de roles y permisos canónicos...');
  const seedRolesRes = spawnSync('npx.cmd', ['tsx', 'src/db/seed_roles.ts'], {
    cwd: rootDir,
    stdio: 'inherit',
    shell: true,
    env: { ...process.env, DATABASE_URL: testDbUrl, NODE_ENV: 'test' },
  });

  if (seedRolesRes.status !== 0) {
    throw new Error(`Fallo al sembrar roles (código ${seedRolesRes.status})`);
  }

  console.log('Concediendo permisos a roles de simulación en public...');
  execFileSync(path.join(pgBin, 'psql.exe'), ['-h', '127.0.0.1', '-p', '55432', '-U', 'postgres', '-d', 'proyecty_test', '-c', `
    GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
    GRANT ALL ON ALL TABLES IN SCHEMA public TO anon, authenticated, service_role;
    GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO anon, authenticated, service_role;
    GRANT ALL ON ALL ROUTINES IN SCHEMA public TO anon, authenticated, service_role;
    ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO anon, authenticated, service_role;
    ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO anon, authenticated, service_role;
  `], { encoding: 'utf8' });

  console.log('Aplicando triggers de inmutabilidad en audit_logs...');
  spawnSync('npx.cmd', ['tsx', 'scripts/apply-audit-immutability.ts'], {
    cwd: rootDir,
    stdio: 'inherit',
    shell: true,
    env: { ...process.env, DATABASE_URL: testDbUrl, NODE_ENV: 'test' },
  });

  // 3. Verificación de Aislamiento SQL en Runtime
  console.log('\n--- 3. Verificación SQL en Runtime ---');
  await validateTestDatabaseRuntime(testDbUrl);

  // 4. Ejecución Secuencial de las 9 Suites
  console.log('\n--- 4. Ejecución Secuencial de las 9 Suites de Integración ---');
  let totalPassed = 0;

  for (let i = 0; i < suites.length; i++) {
    const suite = suites[i];
    console.log(`\n============================================================`);
    console.log(`[${i + 1}/${suites.length}] Ejecutando: ${suite}`);
    console.log(`============================================================`);

    const result = spawnSync('npx.cmd', ['tsx', suite], {
      cwd: rootDir,
      stdio: 'inherit',
      shell: true,
      env: {
        ...process.env,
        DATABASE_URL: testDbUrl,
        NODE_ENV: 'test',
      },
    });

    if (result.status !== 0) {
      console.error(`\n❌ ERROR: La suite '${suite}' falló con código ${result.status}.`);
      throw new Error(`Fallo en suite: ${suite}`);
    }

    totalPassed++;
    console.log(`✅ Suite '${suite}' completada con éxito.`);
  }

  allSuitesPassed = true;
  console.log('\n============================================================');
  console.log(`🎉 TODAS LAS 9 SUITES DE INTEGRACIÓN PASARON (${totalPassed}/9)`);
  console.log('============================================================\n');

} finally {
  console.log('--- 5. Destrucción Segura del Entorno Local Temporal ---');
  try {
    execFileSync(path.join(pgBin, 'pg_ctl.exe'), ['stop', '-D', pgDataTest, '-m', 'fast'], { encoding: 'utf8' });
    console.log('Servidor PostgreSQL 17 detenido limpiamente con pg_ctl.');
  } catch (e) {
    console.warn('Advertencia al detener pg_ctl:', e);
  }

  if (fs.existsSync(pgDataTest)) {
    fs.rmSync(pgDataTest, { recursive: true, force: true });
    console.log('Directorio temporal pgdata-test eliminado.');
  }
}

if (!allSuitesPassed) {
  process.exit(1);
}
