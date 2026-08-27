# PROYECTY - Project Memory & Context

> **Este documento preserva el contexto arquitectónico, el estado de desarrollo y las decisiones técnicas de PROYECTY para garantizar la continuidad inmediata en futuras sesiones.**

---

## [2026-08-27] Hito: Cierre de Sesión — Estado de Refactorización y Pruebas (Fase R1C-B)

### 1. Línea Base y Puntos de Partida
- **Commit inicial de partida:** `ab918280` (`fix(v1.5.1): CHECK constraints PG, /internal-demo 302, version sync`).
- **Rama de trabajo activa:** `refactor/proyecty-clean-architecture`.
- **Estado de despliegue y push:** Cero operaciones de push ejecutadas; producción no conectada ni modificada.
- **Saneamiento histórico:** Bloqueado y no autorizado hasta completar la auditoría técnica integral.

### 2. Historial de Commits R1B (Saneamiento de Repositorio)
1. `1668097` — `security(data): encrypt and untrack legacy plaintext backups`
2. `3380700` — `chore(fixtures): organize verified test fixtures`
3. `a52b7a4` — `chore(tests): relocate manual test scripts and output paths`
4. `cc8205b` — `chore(repo): remove confirmed temporary screenshots`
5. `e1791b6` — `chore(scripts): organize approved maintenance utilities`
6. `841e0c8` — `chore(scripts): remove confirmed one-use refactor utilities`
7. `e134317` — `chore(scratch): remove tracked temporary tooling`
8. `f3f6cbd` — `chore(ignore): exclude local scratch workspace`

### 3. Historial de Commits R1C (Acreditación y Ejecución de Pruebas)
- **Commit acreditado inicialmente en R1C-A:** `88b7052` (`test(config): define canonical test discovery and runners`).
- **Hashes de commits R1C existentes en la rama:**
  - `88b7052` — `test(config): define canonical test discovery and runners` (R1C-A)
  - `9dde813` — `test(env): enforce isolated integration and e2e environment`
  - `9e1cacd` — `test(auth): replace legacy e2e tokens with test login fixture`
  - `8ab1228` — `test(config): define canonical test discovery and runners`
  - `17cb274` — `test(env): enforce isolated integration and e2e environment`
  - `4f72d9a` — `test(auth): replace legacy e2e tokens with test login fixture` (HEAD actual)

### 4. Entorno de Pruebas y Aislamiento Técnico
- **Versión de Node.js:** Node `20.18.0` con soporte nativo de WebSockets activado mediante bandera interna.
- **Motor de Base de Datos para Pruebas:** PostgreSQL 17 aprovisionado dinámicamente en `127.0.0.1:55432` con base temporal `proyecty_test` instanciada desde `template0`.
- **Guardias de Aislamiento:** Módulo `src/lib/test-env-guard.ts` con 7 controles pre-vuelo que bloquean URIs con dominios remotos, poolers, puertos distintos o entornos no etiquetados como test, complementado con verificación SQL en runtime (`current_database()`, `inet_server_addr()`, `inet_server_port()`).
- **Destrucción de Entorno:** Proceso detenido limpiamente con `pg_ctl -m fast` y eliminación completa del directorio temporal de datos.

### 5. Mecanismos de Ejecución de Pruebas
- **Pruebas de Integración Backend (`npm run test:integration`):** Orquestador `scripts/run-integration-tests.ts` ejecuta secuencialmente las 9 suites canónicas (`p0-audit-auth`, `p1-integrity-audit`, `ola1-security-structure`, `ola2-financial-integrity`, `ola3-operations-governance`, `ola4-executive-reporting`, `ux-portfolio-contracts`, `voserdem-security-remediation`, `voserdem-trial-verification`).
  - **Resultado reportado:** 9/9 suites pasadas, 242 aserciones aprobadas, 0 fallos.
- **Pruebas E2E (`npm run test:e2e`):** Orquestador `scripts/run-e2e-tests.ts` ejecuta Playwright sobre 3 specs (`create-project.spec.ts`, `e2e-audit.spec.ts`, `screenshot.spec.ts`).
  - **Resultado reportado:** 3 specs pasadas, 9 casos aprobados, 0 fallos.
- **Autenticación en Pruebas:** Emisión dinámica de JWTs efímeros mediante `POST /api/auth/demo-session` a través del fixture `tests/fixtures/auth.ts`, erradicando tokens estáticos del código de prueba.

### 6. Integridad del Entorno y Estado de Dependencias
- `package-lock.json` inalterado (SHA-256 verificado).
- Typecheck (`npx tsc --noEmit`) y build (`npm run build`) completados con éxito (código 0).

### 7. Asuntos Pendientes de Auditoría para la Próxima Sesión
- Auditoría técnica detallada de cambios en archivos de código (`src/services/expenses.service.ts`, `src/App.tsx`, `server.ts`, `vite.config.ts`, `src/db/seed_roles.ts`).
- Verificación de integridad de las pruebas ajustadas para garantizar el cumplimiento de contratos sin flexibilización de aserciones.
- Reconciliación del historial de commits en Git.
