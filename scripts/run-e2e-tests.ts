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

console.log('============================================================');
console.log('🎭 INICIANDO ARNES AISLADO DE PRUEBAS E2E (PLAYWRIGHT)');
console.log('============================================================\n');

const testDbUrl = 'postgresql://postgres@127.0.0.1:55432/proyecty_test';

// 1. Aprovisionamiento de PostgreSQL 17 Local Aislado
console.log('--- 1. Aprovisionando PostgreSQL 17 Local Aislado (Puerto 55432) ---');
if (fs.existsSync(pgDataTest)) fs.rmSync(pgDataTest, { recursive: true, force: true });

execFileSync(path.join(pgBin, 'initdb.exe'), ['-D', pgDataTest, '-U', 'postgres', '--auth=trust'], { encoding: 'utf8' });
fs.appendFileSync(path.join(pgDataTest, 'postgresql.conf'), "\nport = 55432\nlisten_addresses = '127.0.0.1'\n");

const pgProc = spawn(path.join(pgBin, 'postgres.exe'), ['-D', pgDataTest], { detached: true, stdio: 'ignore' });
pgProc.unref();
sleep(3000);

let e2ePassed = false;

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

  process.env.NODE_ENV = 'test';
  process.env.DATABASE_URL = testDbUrl;

  console.log('Empujando esquema Drizzle a la base de datos aislada...');
  spawnSync('npx.cmd', ['drizzle-kit', 'push'], {
    cwd: rootDir,
    stdio: 'inherit',
    shell: true,
    env: { ...process.env, DATABASE_URL: testDbUrl, NODE_ENV: 'test' },
  });

  console.log('Sembrando catálogo de roles y permisos canónicos...');
  spawnSync('npx.cmd', ['tsx', 'src/db/seed_roles.ts'], {
    cwd: rootDir,
    stdio: 'inherit',
    shell: true,
    env: { ...process.env, DATABASE_URL: testDbUrl, NODE_ENV: 'test' },
  });

  console.log('Concediendo permisos a roles de simulación en public...');
  execFileSync(path.join(pgBin, 'psql.exe'), ['-h', '127.0.0.1', '-p', '55432', '-U', 'postgres', '-d', 'proyecty_test', '-c', `
    GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
    GRANT ALL ON ALL TABLES IN SCHEMA public TO anon, authenticated, service_role;
    GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO anon, authenticated, service_role;
    GRANT ALL ON ALL ROUTINES IN SCHEMA public TO anon, authenticated, service_role;
    ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO anon, authenticated, service_role;
    ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO anon, authenticated, service_role;
  `], { encoding: 'utf8' });

  console.log('Sembrando datos demo iniciales...');
  const { resetDemoTenantData } = await import('../src/services/demoTenant.service.ts');
  await resetDemoTenantData();

  console.log('Aplicando triggers de inmutabilidad en audit_logs...');
  spawnSync('npx.cmd', ['tsx', 'scripts/apply-audit-immutability.ts'], {
    cwd: rootDir,
    stdio: 'inherit',
    shell: true,
    env: { ...process.env, DATABASE_URL: testDbUrl, NODE_ENV: 'test' },
  });

  // 2. Verificación SQL en Runtime
  console.log('\n--- 2. Verificación SQL en Runtime ---');
  await validateTestDatabaseRuntime(testDbUrl);

  // 3. Ejecución de Playwright Test
  console.log('\n--- 3. Ejecutando Playwright E2E Tests ---');
  const pwResult = spawnSync('npx.cmd', ['playwright', 'test'], {
    cwd: rootDir,
    stdio: 'inherit',
    shell: true,
    env: {
      ...process.env,
      DATABASE_URL: testDbUrl,
      NODE_ENV: 'test',
      CI: 'true',
    },
  });

  if (pwResult.status !== 0) {
    throw new Error(`Fallo en pruebas Playwright (código ${pwResult.status})`);
  }

  e2ePassed = true;
  console.log('\n============================================================');
  console.log('🎉 TODAS LAS PRUEBAS E2E (PLAYWRIGHT) PASARON CON ÉXITO');
  console.log('============================================================\n');

} finally {
  console.log('--- 4. Destrucción Segura del Entorno Local Temporal ---');
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

if (!e2ePassed) {
  process.exit(1);
}
