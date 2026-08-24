# PROYECTY - Project Memory & Context

> **Este documento preserva el contexto arquitectónico, el estado de desarrollo y las decisiones técnicas de PROYECTY para garantizar la continuidad inmediata en futuras sesiones.**

## [2026-08-24] Hito: Ejecución de Fase 1 (Estabilización P0) — Auditoría AUD-PROY-001

### Resumen Consolidado
Se implementó y verificó al 100% la resolución de todos los hallazgos críticos P0 y de branding/accesibilidad del informe de auditoría AUD-PROY-001:
1. **`AUTH-01` & `AUTH-02` (Tokens Criptográficos Demo):** Generación de JWTs efímeros (15 min) en backend (`POST /api/auth/demo-session`) firmados con HMAC-SHA256 y claims auditables (`iss: 'proyecty-auth'`, `aud: 'proyecty-app'`, `tenant_id`, `role`, `session_id`). Verificación y rechazo estricto de tokens no firmados o manipulados en `src/middleware/auth.ts`.
2. **`DATA-01` (Sanitización del Catálogo Demo):** `GET /api/auth/demo-users` devuelve exclusivamente perfiles sanitizados con nombres y correos ficticios (`@proyecty.org`) sin exponer UIDs ni datos de producción.
3. **Tenant Demo Aislado & Auto-Reset 24h:** Creado tenant independiente `ORG-DEMO-PROYECTY` en base de datos, con soporte para reseteo automático diario (`initDemoAutoResetScheduler`) y manual (`POST /api/auth/demo-reset`).
4. **`BRAND-01` & `A11Y-01`:** Actualizado `index.html` con `<html lang="es">`, `<title>PROYECTY - Control de Proyectos, Convenios y Presupuestos</title>`, favicon SVG corporativo y metadatos SEO.
5. **`ARCH-01` & `UX-01`:** Componente `Login.tsx` saneado (eliminadas menciones a Cloud SQL / Firebase), timeouts de conexión de 5s, auto-recuperación de controles y botón de reintento ante fallos.
6. **Verificación Automatizada:** Suite `tests/p0-audit-auth.test.ts` con 19/19 pruebas superadas y compilación TypeScript limpia (`npx tsc --noEmit` = 0 errores).

---

## [2026-08-11] Hito: Cierre Definitivo de Sprints 0, 1 y 2 — Seguridad Multi-Tenant Completa y Auditada

### Resumen Consolidado
Se ha completado y auditado rigurosamente la infraestructura de seguridad de datos (RLS) y el control de acceso por roles (RBAC) en Drizzle, eliminando por completo los enums hardcodeados y los chequeos condicionales string-based en los controladores.

### Decisiones Arquitectónicas y Hallazgos Clave
1. **Roles globales, no por tenant.** El catálogo de roles (`Director`, `Manager`, `Finance`, `Responsable Proyecto`, `Auditor`) es global para el sistema.
2. **Caché de permisos in-memory y Riesgo Operativo.** `CacheService` almacena permisos resueltos por `user_id` en memoria local con TTL de 15 min. El flujo normal de la app invalida la caché automáticamente (`CacheService.invalidate(userId)`). **Hallazgo Crítico:** Las alteraciones manuales en base de datos (ej. scripts de mantenimiento como `fix-manager.ts`) requieren reiniciar el proceso de Node.js o invalidar manualmente. Si se escala horizontalmente, migrar a Redis es mandatorio por seguridad.
3. **Shadowing de JWT y RBAC Estricto.** El middleware `requirePermission` extrae exclusivamente el `user_id` del token y resuelve los permisos consultando la BD/caché. El toggle de frontend "Simular Rol" solo altera la UI y un sufijo en el token de prueba, pero el backend verifica consistentemente el `roleId` real almacenado en la base de datos, garantizando seguridad real (comprobado vía `rbac-backend-test.mjs`).
4. **`withTenantContext` transaccional.** Todas las mutaciones ejecutan dentro de una transacción que establece `SET LOCAL ROLE app_user` + `set_config('app.tenant_id', ...)`. Validado: el overhead P95 es < 5ms mediante pruebas dirigidas con `EXPLAIN ANALYZE`.
5. **Limpieza de Controladores.** Se purgaron lógicas condicionales legacy (ej. `if (role !== 'DIRECTOR' && role !== 'MANAGER')` en `expenses.controller.ts`) en favor de una autorización pura delegada al middleware RBAC en las rutas.

### Estado de Sprints
- **Sprint 0 (Auditoría Tenant):** ✅ Cerrado.
- **Sprint 1 (RLS):** ✅ Cerrado (Test de brecha cross-tenant = 0 filas).
- **Sprint 2 (RBAC):** ✅ Cerrado (Tests backend superados para DIRECTOR, MANAGER y AUDITOR comprobando 403s, 404s y 200s con control positivo).

### Próximo Paso Inmediato
**Sprint 3: Modularización de `server.ts`** — Separar controladores, servicios y rutas por dominio funcional. Se requiere un plan de implementación detallado (tareas, dependencias, riesgos) previo a iniciar, dado que afectará directamente el enrutamiento donde residen los middlewares de seguridad recién blindados.

---

## [2026-07-31] Hito: Cierre de Fase 1 (SaaS Core Blindado) - Proyecty
- **Estado:** Completado (100% PASSED en Playwright - 6/6 tests).
- **Rutas y API:** 
  - `GET /api/projects/:id` retorna JSON 404 seguro (sin fallback HTML).
  - `/api/tasks` implementado con router y controlador funcional.
  - Subida de documentos blindada con headers `Authorization: Bearer <token>`.
- **Autenticación y DB:** UPSERT activo en login de Google para evitar duplicados por email.
- **Estabilidad de UI:** Eliminados los crashes de React (`removeChild` / `NotFoundError`).
- **Próximo Paso:** Espera de feedback tras pruebas operativas de campo antes de iniciar Fase 2 (Refinamiento UX/UI y Permisos Avanzados).

## 1. Estado Actual del Proyecto
- **Fase Actual:** `Proyecty B2B SaaS (Fase 1 al 8) oficialmente desplegado y consolidado en producción`.
- **URL de Producción:** [proyecty-webapp.onrender.com](https://proyecty-webapp.onrender.com)
- **Hito Alcanzado:** Finalización del Sprint 8 (Despliegue a Producción & Hardening de Infraestructura). El SaaS cuenta con módulos de Autenticación, Gestión de Proyectos, Facturación (Billing), Aprobación de Gastos, Logs de Auditoría y Reportes de IA consolidados y funcionando end-to-end.

## 2. Infraestructura & CI/CD
- **Orquestación en la Nube:** Desplegado en **Render** operando mediante contenedor Docker (Node.js ESM optimizado).
- **Base de Datos:** **Supabase (PostgreSQL)** sincronizada y gestionada mediante **Drizzle ORM** (`drizzle-kit push`).
- **Autenticación:** **Google OAuth 2.0** integrado nativamente y activo en producción.

## 3. Seguridad & Autenticación (Hardening)
- **Content Security Policy (CSP):** Configuración personalizada de Helmet para permitir conexiones externas seguras. Directiva `connect-src` habilitada explícitamente para los dominios de Supabase (`https://*.supabase.co` y subdominios específicos) previniendo bloqueos de red en producción.
- **Validación First:** Todo el input de la red cruza por esquemas de Zod.
- **Rate Limiting:** Tolerancia a fallos configurada para `rate-limit-redis`. En caso de ausencia de Redis en producción, el sistema hace fallback automático a memoria (MemoryStore) para evitar crasheos (ECONNREFUSED).

## 4. Matriz RBAC & Tenants
- **Tenant Activo (Producción):** `ORG-PROYECTY.ORG`
- **Usuario Administrador Global (DIRECTOR):** `apexdigital70@gmail.com` con acceso total al sistema y permisos de aprobación de gastos.
- **Seed de Datos de VOSERDEM:** Poblado con éxito. Incluye:
  - Proyectos de demostración (`[DEMO VOSERDEM]`).
  - Convenios (Agreements) en estado activo.
  - Presupuestos Base y Líneas de gasto (`Budget Lines` y `Budget Versions`).
  - Indicadores financieros (Gastos y Recibos) inicializados para reportería.

## 5. Decisiones Arquitectónicas (Sprint 1 al 8)
1. **Multi-Tenancy:** Aislamiento estricto por tenant en todas las consultas a BD, aplicando filtros mandatorios de `organizationId` o `tenantId`.
2. **Feature Gating (Monetización):** Middleware que valida si el Tenant tiene acceso a módulos bloqueados (ej. Reportes IA) devolviendo código de error interceptado por el Frontend para sugerir Upgrade (LemonSqueezy).
3. **Módulo de Gastos:** RBAC inyectado directamente en el controlador y la interfaz. Solo usuarios MANAGER o DIRECTOR pueden aprobar/rechazar presupuestos.
4. **Audit Logs:** Registro inmutable de acciones críticas (aprobaciones, upgrades de plan, cambios de permisos) guardando snapshot JSON en la columna `metadata`.
5. **AI Reports:** Integración del Google Gen AI SDK (Gemini Flash) para transformar data de BD cruda en un análisis ejecutivo financiero renderizado en Markdown en el frontend.

## 6. Próxima Etapa
**Fase de Auditoría y Pruebas Operativas:** Pruebas reales con los usuarios clave en producción (VOSERDEM) previo a la evaluación y codificación de nuevas funcionalidades.
