# PROYECTY — Sprint Status Board

> Última actualización: 2026-08-24  
> Propósito: registro canónico de avance por sprint y resolución de auditoría AUD-PROY-001.

---

## Auditoría AUD-PROY-001 — Fase 3 (Ola 2: Integridad Financiera y Presupuestaria)

| Campo | Detalle |
|---|---|
| **Estado** | ✅ COMPLETADO, ESTABILIZADO Y ETIQUETADO (`v1.2.1-wave-2-fix`) |
| **Módulos Canónicos** | `M-05` (Convenios y Financiadores), `M-06` (Desembolsos), `M-08` (Partidas Presupuestarias Base), `M-09` (Versionado y Adendas), `M-10` (Registro y Aprobación de Gastos), `M-11` (Comprobantes y Rendiciones Multi-divisa) |
| **Control M-05 (Convenios)** | Montos estrictamente positivos (`amount > 0`), validación temporal estricta (`signedDate <= startDate <= endDate`), RBAC positivo/negativo y aislamiento cross-tenant verificado (**8/8 tests**). |
| **Control M-06 (Desembolsos)** | Control acumulado vs límite de convenio (`totalDisbursed <= agreement.amount`), RBAC y rechazo cross-tenant (**8/8 tests**). |
| **Control M-08 (Partidas Base)** | Creación y consulta de partidas presupuestarias base con aislamiento tenant (**2/2 tests**). |
| **Control M-09 (Versionado)** | Versiones presupuestarias correlativas (`V1`, `V2`, `V3`), inmutabilidad estricta de versiones archivadas/aprobadas, resistencia a concurrencia (bloqueo FOR UPDATE), RBAC de formulación/aprobación y aislamiento cross-tenant (**8/8 tests**). |
| **Control M-10 (Gastos & FIN-01)** | • Segregación de funciones FIN-01: Prohibición de auto-aprobación del creador.<br>• **Concurrencia Real de Saldo:** Demostración con 2 aprobaciones simultáneas de $80 contra $100 (exactamente 1 éxito, 1 409 conflicto, saldo final $20, nunca negativo).<br>• RBAC y bloqueo cross-tenant (**6/6 tests**). |
| **Control M-11 (Comprobantes & Multi-divisa)** | • Unicidad fiscal bajo concurrencia y aislada por tenant (sin colisión inter-tenant).<br>• Multi-divisa: Conversión obligatoria con tasa, fecha y fuente, rechazo de tasas <= 0, normalización a 1 en paridad y redondeo a 2 decimales.<br>• RBAC y cross-tenant (**10/10 tests**). |
| **Descontaminación Tenant Demo** | Reseteo y validación de 0 fixtures residuales en el tenant demo (`PRJ-DEMO-2026` exclusivo) (**1/1 test**). |
| **Verificación Técnica** | • Suite `tests/ola2-financial-integrity.test.ts` (**43/43 PASSED**).<br>• Suite de regresión `tests/ola1-security-structure.test.ts` (**34/34 PASSED**).<br>• Compilación limpia `npm run build` y tag oficial `v1.2.1-wave-2-fix`. |

---

## Auditoría AUD-PROY-001 — Fase 3 (Ola 1: Seguridad y Estructura Base)

| Campo | Detalle |
|---|---|
| **Estado** | ✅ COMPLETADO, ESTABILIZADO Y ETIQUETADO (`v1.1.1-wave-1-fix`) |
| **Módulos Cubiertos** | `M-01` (Auth), `M-03` (Portafolio), `M-04` (Detalle Proyecto), `M-15` (Bitácora Auditoría), `M-16` (Usuarios y RBAC) |
| **Control M-01** | JWTs HMAC-SHA256 con claims canónicos (`user_id`, `role`, `tenant_id`, `session_id`, `exp: 900s`). Rechazo de manipulaciones, roles inexistentes y tokens expirados. |
| **Control M-03 & M-04** | Aislamiento multi-tenant estricto (0 filtración cross-tenant). Creación/edición por rol y partidas activas únicas por proyecto (sin duplicados). |
| **Control M-15** | Bitácora de auditoría alineada con matriz canónica: **DIRECTOR (200)** y **AUDITOR (200)**; bloqueo **HTTP 403** para Manager, Finance, Responsable y Financiador. Inmutabilidad SQL estricta en PostgreSQL probada y activada. |
| **Control M-16** | • Catálogo `GET /api/users`: **DIRECTOR (200)** y **AUDITOR (200)**; bloqueo **HTTP 403** para Manager, Finance y otros.<br>• Nuevo endpoint `GET /api/users/me`: Acceso **HTTP 200** para todos los roles con `roleCode` canónico.<br>• Invalidación reactiva de caché `CacheService.invalidate(userId)` en cambios de rol. |
| **Control DOC-01** | Política *Fail-Closed* activa en backend: descarga y análisis IA bloqueados con **HTTP 423 (Locked)** salvo estado `CLEAN`. |
| **Verificación Técnica** | Suite `tests/ola1-security-structure.test.ts` (**34/34 PASSED**), build limpio, tag `v1.1.1-wave-1-fix` desplegado a Render. |

---

## Auditoría AUD-PROY-001 — Fase 2 (Integridad P1)

| Campo | Detalle |
|---|---|
| **Estado** | ✅ COMPLETADO, ESTABILIZADO Y VERIFICADO EN PRODUCCIÓN (29/29 Tests Passed) |
| **Hallazgos Resueltos** | `FIN-01`, `BUD-01`, `AUD-01`, `DOC-01`, `AI-01`, `SEC-01`, `PERF-01` |
| **Segregación FIN-01** | • Contexto de sesión restablecido con `user_id` / `id` en JWT demo y `requirePermission`.<br>• Acceso probado en producción para DIRECTOR (200), MANAGER (200), FINANCE (200) y bloqueo RBAC para AUDITOR (403).<br>• Bloqueo estricto de auto-aprobación del creador con `ConflictError`. Bloqueo de sobre-ejecución presupuestaria. |
| **Versionado BUD-01** | • Correlativo estricto y consistente de versiones (`V1`, `V2`, `V3`).<br>• Partidas presupuestarias filtradas por versión activa en `getProjectById`, erradicando la duplicidad visual en la interfaz.<br>• Línea base V1 preservada inmutable en base de datos. |
| **Auditoría AUD-01** | Bitácora inmutable `audit_logs` con snapshots completos de diffs (`before_state`, `after_state`) en mutaciones transaccionales y timestamps UTC. |
| **Gobierno DOC-01** | Whitelist MIME, límite 10MB, Hash SHA-256 criptográfico, estado honesto `PENDING_SCAN` (sin falsos `CLEAN`), retención a 5 años (`5_YEARS_LEGAL_ARCHIVE`), papelera recuperable (soft-delete + restore) y bloqueo de descarga en cuarentena. |
| **IA Citable AI-01** | Trazabilidad obligatoria de fuentes por ID de gasto (`[Gasto #ID]`) en reportes generados con IA, flag `requiresHumanReview: true` y fallback auditado. |
| **Seguridad & Rendimiento** | • CSP en Helmet sin `unsafe-eval` (SEC-01).<br>• Erradicadas todas las menciones a "Cloud SQL Conectado" en Topbar, UsersManager y AuditTrail, reemplazadas por "PostgreSQL Conectado".<br>• `/api/health` enriquecido con latencia de BD en ms (`latencyMs: 3ms`), memoria del proceso y uptime (PERF-01). |
| **Verificación Técnica** | Suite `tests/p1-integrity-audit.test.ts` (**29/29 PASSED**), `tsc --noEmit` limpio (0 errores), `npm run build` exitoso, commit `6da6408` desplegado y verificado en Render. |

---

## Auditoría AUD-PROY-001 — Fase 1 (Estabilización P0)

| Campo | Detalle |
|---|---|
| **Estado** | ✅ COMPLETADO Y VERIFICADO (19/19 Tests Passed) |
| **Hallazgos Resueltos** | `AUTH-01`, `AUTH-02`, `DATA-01`, `ARCH-01`, `UX-01`, `BRAND-01`, `A11Y-01` |
| **Tokens Criptográficos** | JWTs HMAC-SHA256 efímeros (15m) emitidos exclusivamente por backend (`POST /api/auth/demo-session`) con claims (`iss`, `aud`, `tenant_id`, `role`, `session_id`). Rechazo de tokens no firmados. |
| **Aislamiento Demo** | Tenant aislado `ORG-DEMO-PROYECTY` en BD, con identidades ficticias (`@proyecty.org`) y reinicio automático de 24h (`initDemoAutoResetScheduler`) + manual (`POST /api/auth/demo-reset`). |
| **Sanitización Pública** | `GET /api/auth/demo-users` sanitizado sin exponer correos reales ni UIDs. |
| **Branding & UX** | `index.html` con `<html lang="es">`, título oficial, favicon SVG. `Login.tsx` con timeout 5s, auto-recuperación de controles y botón de reintento. |
| **TypeScript** | `npx tsc --noEmit` compilación 100% limpia sin errores. |

---

---

## Sprint 0 — Auditoría de Aislamiento Multi-Tenant

| Campo | Detalle |
|-------|---------|
| **Estado** | ✅ CERRADO |
| **Alcance** | Auditoría completa del aislamiento de datos entre tenants en todas las tablas críticas. |
| **Resultado** | Sin brechas detectadas. Filtros `tenant_id` / `organization_id` confirmados en todas las queries de lectura y escritura. |

---

## Sprint 1 — Row-Level Security (RLS)

| Campo | Detalle |
|-------|---------|
| **Estado** | ✅ CERRADO |
| **Políticas RLS** | 23 políticas activas (1-hop directo y 2-hop para tablas dependientes como `budget_lines → projects`). |
| **GRANTs** | Restringidos por rol de BD (`app_user`). Permisos `TRUNCATE` explícitamente revocados. |
| **Índices** | B-Tree creados en todas las FKs utilizadas en cascadas RLS para evitar Seq Scans. |
| **Test de brecha** | Test Tenant-A / Tenant-B pasando (intento de lectura cross-tenant devuelve 0 filas). |
| **Performance** | Benchmark de consultas críticas validado mediante `EXPLAIN ANALYZE` dirigido con datos reales; overhead de RLS < 5ms por query en P95. (Aclaración: medición específica, no prueba de carga formal). |

---

## Sprint 2 — RBAC + Migración de Roles

| Campo | Detalle |
|-------|---------|
| **Estado** | ✅ CERRADO (infraestructura + backend verificado con evidencia completa) |

### Infraestructura Completada

- **Middleware RBAC** (`requirePermission`): aplicado a todas las rutas de mutación con firma explícita (middleware antes del controller en cada `router.METHOD()`).
- **CacheService (in-memory)**: caché de permisos por `user_id` con `invalidate(userId)` para revocación inmediata.
  - ⚠️ **Limitación documentada 1 (Escalabilidad)**: funciona correctamente con la instancia única actual en Render. Si se escala horizontalmente (múltiples réplicas), **migrar a Redis** para garantizar invalidación global. Esta decisión es de seguridad, no de latencia.
  - ⚠️ **Limitación documentada 2 (Ediciones DB directas)**: El flujo normal de la app (ej. `PATCH /api/users`) invalida la caché automáticamente. Sin embargo, **intervenciones directas en la base de datos** (como el script `fix-manager.ts`) requieren intervención manual (reiniciar la instancia de Render o forzar el invalidate() vía endpoint) porque el proceso Node.js no se entera del cambio externo.
- **Manejo diferenciado de errores**:
  - `affectedRows === 0` + recurso confirmado vía `checkExists()` → `TenantIsolationError` → **404**.
  - `affectedRows === 0` + condición de negocio no cumplida (ej. `WHERE status = 'pending'` ya aprobado) → **409 Conflict**.
  - Violación de política RLS en INSERT (código Postgres `42501`) → capturado en `errorHandler.ts` → **403 Forbidden** + logging a Sentry con detalle del error original.
- **`checkExists()`**: ejecuta dentro de la misma transacción (`tx`) con contexto RLS activo. Verificado en todos los endpoints envueltos.

### Migración de Roles a Drizzle

- Esquema relacional: tablas `roles`, `permissions`, `role_permissions` (many-to-many).
- **Decisión arquitectónica**: roles son **globales** (no por tenant). Cada organización usa el mismo catálogo de roles del sistema.
- Seed con UPSERT atómico (transacción única) para los 5 roles base: `Director`, `Manager`, `Finance`, `Responsable Proyecto`, `Auditor`.
- Shadowing de JWT: el middleware extrae `user_id` del JWT y resuelve `role_id` + permisos **consultando BD/caché**, nunca derivando permisos del string de rol embebido en el token legacy.
- Purga de enums legacy completada. Validación: `SELECT id, email, role_id FROM users WHERE role_id IS NULL` → **0 filas**.

### Smoke Test (Evidencia)

#### Verificación de UI (Frontend)

| Rol | Login | Transición Simular | Restricción visual | Estado |
|-----|-------|--------------------|---------------------|--------|
| DIRECTOR | ✅ Producción + localhost | ✅ | N/A (acceso total) | Validado |
| MANAGER | ✅ localhost (demo) | ✅ | Sidebar muestra módulos de gestión, oculta admin | Validado |
| AUDITOR | ✅ localhost (demo) | ✅ | Botón "Nuevo Proyecto" ausente; sidebar restringido a read-only | Validado |

> **Nota importante (hallazgo del Asesor Técnico):** La función "Simular Rol" en el Sidebar es un **toggle de frontend** que cambia `currentUser.role` en el state de React y el sufijo del token demo. **NO cambia el `roleId` del usuario en la BD**, por lo que el middleware RBAC del backend sigue evaluando permisos contra el `roleId` real del usuario autenticado vía `CacheService.getUserPermissions(user.id)`. Esto significa que la restricción visual del frontend es complementaria, pero la seguridad real está en el backend.

#### Verificación de Backend (RBAC Middleware) — `scripts/rbac-backend-test.mjs`

Prueba ejecutada con peticiones HTTP directas al backend usando el token del usuario AUDITOR real (id=18, uid=`demo-auditor`, roleId=5), sin intervención del frontend:

| Test | Endpoint | Status | Esperado | Resultado |
|------|----------|--------|----------|-----------|
| AUDITOR crea proyecto | `POST /api/projects` | **403** | 403 | ✅ |
| AUDITOR aprueba gasto | `PATCH /api/expenses/1/approve` | **403** | 403 | ✅ |
| AUDITOR crea gasto | `POST /api/expenses` | **403** | 403 | ✅ |
| AUDITOR lee proyectos | `GET /api/projects` | **200** | 200 | ✅ |
| MANAGER aprueba gasto (permitida por rol) | `PATCH /api/expenses/1/approve` | **404** (aislamiento tenant) | ≠403 | ✅ |
| MANAGER gestiona miembros (bloqueada por rol) | `POST /api/projects/1/members` | **403** | 403 | ✅ |
| DIRECTOR crea proyecto (control positivo, no-403) | `POST /api/projects` | **400** (validación de campos) | ≠403 | ✅ |

> El DIRECTOR recibe 400 (faltan campos obligatorios), **no 403**, confirmando que el middleware RBAC lo deja pasar y la validación de negocio opera correctamente después.

**Archivos de evidencia:**
- `docs/evidence/sprint2_auditor_ui_blocked.png` — captura del Portafolio sin botón "Nuevo Proyecto" en rol AUDITOR.
- `docs/evidence/sprint2_rbac_backend_test_output.txt` — salida completa del script de verificación de backend.
- `scripts/rbac-backend-test.mjs` — script reproducible para re-ejecutar la verificación.

### Incidente OAuth (Resuelto)

- **Causa raíz:** Client ID de Google OAuth fue eliminado/alterado en Google Cloud Console.
- **Resolución:** Se creó un nuevo Client ID (`Proyecty Supabase Auth`, ID `397244009294-...`) y se vinculó en el panel de Supabase → Authentication → Providers → Google.
- **Impacto:** Producción y localhost restaurados. El `.env` local no requiere cambios (usa el mismo proyecto Supabase).

---

## Sprint 3 — Modularización de `server.ts`

| Campo | Detalle |
|-------|---------|
| **Estado** | 🔲 NO INICIADO |
| **Alcance previsto** | Separar controladores, servicios y rutas por dominio funcional. Eliminar lógica inline y helpers huérfanos del archivo monolítico `server.ts`. |
| **Prioridad** | Priorizado sobre el cierre de Fase 2 de UX por decisión de arquitectura ya acordada (la deuda técnica en `server.ts` es un riesgo de mantenibilidad creciente). |
| **Prerequisitos** | Sprint 2 cerrado. |

---

## Fases Futuras (Roadmap de Alto Nivel)

| Fase | Descripción | Estado |
|------|-------------|--------|
| Fase 1 | SaaS Core Blindado (Auth, CRUD, Billing, Deploy) | ✅ Completada |
| Fase 2 | Refinamiento UX/UI + Permisos Avanzados | 🔄 En progreso (Sprint 2 cerrado, Sprint 3 pendiente) |
| Fase 3 | Escalabilidad (Redis, queues, horizontal scaling) | 🔲 No iniciada |
