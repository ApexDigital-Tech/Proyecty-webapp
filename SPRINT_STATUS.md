# PROYECTY — Sprint Status Board

> Última actualización: 2026-08-24  
> Propósito: registro canónico de avance por sprint y resolución de auditoría AUD-PROY-001.

---

## Auditoría AUD-PROY-001 — Fase 2 (Integridad P1)

| Campo | Detalle |
|---|---|
| **Estado** | ✅ COMPLETADO Y VERIFICADO (14/14 Tests Passed) |
| **Hallazgos Resueltos** | `FIN-01`, `BUD-01`, `AUD-01`, `DOC-01`, `AI-01`, `SEC-01`, `PERF-01` |
| **Segregación FIN-01** | Bloqueo estricto de auto-aprobación del creador con `ConflictError` en backend e inhabilitación visual en UI. Bloqueo de sobre-ejecución presupuestaria. |
| **Versionado BUD-01** | Rutas `/:id/budget-versions` con creación inmutable de nuevas versiones (`V2`, `V3`) preservando historial inalterable de la línea base `V1`. |
| **Auditoría AUD-01** | `audit_logs` con snapshots completos de diffs (`before_state`, `after_state`) en mutaciones transaccionales. |
| **Gobierno DOC-01** | Whitelist MIME, límite 10MB, Hash SHA-256 criptográfico, escaneo antivirus stub y papelera recuperable (soft-delete y restore). |
| **IA Citable AI-01** | Trazabilidad obligatoria de fuentes por ID de gasto en reportes generados con IA, flag `requiresHumanReview: true` y fallback auditado. |
| **Seguridad & Rendimiento** | CSP en Helmet sin `unsafe-eval` (SEC-01); `/api/health` enriquecido con latencia de BD en ms, memoria del proceso y uptime (PERF-01). |
| **Verificación Técnica** | Suite `tests/p1-integrity-audit.test.ts` (14/14 PASSED), `tsc --noEmit` limpio, `npm run build` exitoso, commit `1b8b79b` desplegado a Render. |

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
