# PROYECTY - Project Memory & Context

> **Este documento preserva el contexto arquitectónico, el estado de desarrollo y las decisiones técnicas de PROYECTY para garantizar la continuidad inmediata en futuras sesiones.**

## [2026-08-25] Hito: Cierre Subsanación v1.5.1 — CHECK Constraints PG, /internal-demo 302, Versión Unificada

### Resumen Consolidado y Decisiones Arquitectónicas
1. **Subsanación de Seguridad Servidor (`AUTH-DEMO-02`) — CERRADO:**
   - **Middleware `requireDemoModeEnabled` (`src/middleware/demoGuard.ts`):** En entornos de producción (o cuando `ENABLE_INTERNAL_DEMO !== 'true'`), las rutas `/api/auth/demo-users`, `/api/auth/demo-session` y `/api/auth/demo-reset` son bloqueadas a nivel de servidor respondiendo **HTTP 404** (`DEMO_MODE_DISABLED`).
   - **Ruta `/internal-demo` (`server.ts`):** Redirige **HTTP 302** hacia `/` en producción cuando `ENABLE_INTERNAL_DEMO !== 'true'`. Contratos documentales corregidos.
   - **Saneamiento Frontend (`Login.tsx`):** Eliminada cualquier evaluación por parámetro de consulta URL (`?mode=internal-demo`) y purgado el catálogo de perfiles fallback predeterminado en cliente.
2. **Whitelist Monetaria Estricta en Backend y Base de Datos (HTTP 422):**
   - Controladores blindados con `UnprocessableEntityError` (422) para `POST /api/projects`, `PATCH /api/projects/:id`, `POST /api/projects/:id/agreements` y `POST /api/projects/:id/expenses`.
   - **CHECK constraints en PostgreSQL** aplicados mediante `scripts/migrate-currency-check.ts`:
     - `chk_projects_base_currency_whitelist` — `projects.base_currency IN ('BOB','USD','EUR')`
     - `chk_agreements_currency_whitelist` — `agreements.currency IN ('BOB','USD','EUR')`
     - `chk_expenses_currency_whitelist` — `expenses.currency IN ('BOB','USD','EUR')`
     - `chk_expenses_original_currency_whitelist` — `expenses.original_currency IS NULL OR IN ('BOB','USD','EUR')`
     - `chk_receipts_vouchers_currency_whitelist` — `receipts_vouchers.currency IN ('BOB','USD','EUR')`
   - Migración idempotente con pre-vuelo de violaciones y verificación funcional automatizada.
3. **Sincronización de Versión `1.5.1`:**
   - `package.json` → `1.5.1`
   - `/api/health` → `version: '1.5.1'`
   - `Login.tsx` footer → `PROYECTY v1.5.1`
4. **Verificación Automatizada Consolidada:**
   - Suite de Subsanación `tests/voserdem-security-remediation.test.ts`: **8/8 PASSED**.
   - Suite VOSERDEM `tests/voserdem-trial-verification.test.ts`: **26/26 PASSED**.
   - 5/5 CHECK constraints verificadas en `pg_constraint`.
   - Tag oficial: `v1.5.1-voserdem-security-patch` (SHA: `b3cb24cd5479dcaac7da961e4635cba3d22cad70`).
5. **Pendiente:**
   - Prueba controlada de revinculación OAuth (`rolangutiali.rg@gmail.com`) — requiere acción de Dirección.

---


## [2026-08-25] Hito: Observaciones Preliminares de Prueba VOSERDEM — Portada Profesional, Monedas Autorizadas (BOB/USD/EUR) y Reseteo OAuth

### Resumen Consolidado y Decisiones Arquitectónicas
1. **Portada de Acceso Profesional (`src/components/Login.tsx`):**
   - **Saneamiento Público:** Eliminados de la vista principal todos los perfiles ficticios/demo (Gonzalo Alfaro, Rodrigo Gómez, Karla Martínez, Andrés Peña, Representante USAID), el panel "Probar con un rol demo" y leyendas técnicas desactualizadas.
   - **Elementos Autorizados en Portada:** Identidad y branding PROYECTY, botón destacado "Continuar con Google", opción de acceso seguro "Continuar con correo" (Magic Link / OTP de un solo uso), modal de Aviso de Privacidad y modal del Centro de Soporte Institucional (`soporte@proyecty.org`).
   - **Versión Oficial:** `PROYECTY v1.5.1 • Plataforma Institucional SaaS`.
   - **Aislamiento de Modo Demo:** El catálogo y botones de inicio de sesión de roles demo institucionales quedan estrictamente confinados a la ruta interna protegida `/internal-demo` (o parámetro `mode=internal-demo`).
2. **Monedas Autorizadas (BOB, USD, EUR):**
   - Eliminación estricta de monedas no autorizadas (`MXN`, `COP`, `ARS`, `BRL`, `CLP`, `PEN`, `UYU`).
   - Monedas autorizadas canónicas exportadas en `src/types.ts` (`AUTHORIZED_CURRENCIES`):
     - `BOB — Boliviano` (predeterminada para nuevos gastos en VOSERDEM)
     - `USD — Dólar estadounidense` (financiamientos y convenios internacionales)
     - `EUR — Euro`
   - Validación y conversión: Exigencia de tasa de cambio positiva, fuente y fecha de cotización cuando la moneda original difiere de la moneda de consolidación del proyecto. Redondeo y precisión matemática a dos decimales.
3. **Reinicio Controlado de Identidad OAuth (`scripts/reset-oauth-identity.ts`):**
   - Procedimiento automatizado para permitir pruebas limpias de incorporación en modo incógnito.
   - Snapshot inmutable `before_state` capturado en auditoría.
   - Desvinculación de UID Google previo (`uid` restablecido a `preauth-rolangutiali.rg@gmail.com`) sin borrar el registro de usuario.
   - Preservación de la preautorización en `ORG-TRIAL-VOSERDEM` con rol `DIRECTOR`.
   - Registro de la operación en `audit_logs` con trazabilidad completa.
4. **Registro de Revisión de Módulo Financiero (`UX-FIN-01`):**
   - Registrado como ítem pendiente de validación continua por Dirección (presupuesto, partidas, convenios, desembolsos, gastos, comprobantes, tasas de cambio, autoaprobación, saldos y reportes financieros).
5. **Estado de Entrega:**
   - No se ha enviado el acceso a Miroslava Romero ni ejecutado el rollback definitivo de Rolando Gutiérrez; el entorno se mantiene disponible para continuar las evaluaciones de Dirección.

---

## [2026-08-25] Hito: Estabilización, Normalización de Usuarios y Habilitación del Entorno Privado VOSERDEM (v1.5.0-voserdem-trial)

### Resumen Consolidado y Decisiones Arquitectónicas
1. **Respaldo Cifrado y Privacidad de Datos:**
   - Respaldo de 128 usuarios cifrado con AES-256-GCM (`respaldo_usuarios_2026-08-25T16-01-41-968Z.json.enc`) y verificado con hash SHA-256 (`A0BDD7589FF5A27F10968E7DD32CB794D57310A2F1912DD2CE20EFA0C86E0FCF`). Excluido de Git, Docker y logs.
   - Teléfonos privados de directivos excluidos de catálogos y esquemas públicos.
2. **Normalización Reversible de Usuarios:**
   - Cero `DELETE` en BD: Fixtures de prueba suspendidos con `isActive: false` y auditados.
   - Roles canónicos normalizados: `DIRECTOR`, `MANAGER`, `FINANCE`, `RESPONSABLE_PROYECTO`, `AUDITOR`, `FINANCIADOR` (eliminado `TECNICO_PROYECTO`).
   - Resolución de usuarios normalizada a minúsculas (`email.toLowerCase().trim()`) preservando el tenant_id preautorizado sin sobreescrituras en login Google.
3. **Cliente API Centralizado y Saneamiento de UI:**
   - Implementado `src/lib/api-client.ts` con inyección de Bearer tokens y timeout estricto de 5 segundos (`AbortController`).
   - Gestión limpia de sesiones: Cierre de sesión y purga de almacenamiento exclusivamente ante HTTP 401 y HTTP 403 `USER_SUSPENDED`. Errores 403 de RBAC ordinario mantienen la sesión activa.
   - Reemplazados todos los `alert()` nativos bloqueantes por banners y toasts informativos de sesión (`sessionNotice`).
   - Banner informativo en `Login.tsx` para evaluación privada VOSERDEM (advertencia de no ingresar PII sensible ni datos bancarios).
4. **Tenant Privado VOSERDEM (`ORG-TRIAL-VOSERDEM`):**
   - Configurado con 30 días de vigencia (vence 24/09/2026), límite de 6 proyectos (HTTP 409 `TRIAL_PROJECT_LIMIT_REACHED`), excluido del scheduler de reseteo demo (`RESET-VO-01`).
   - Usuario preautorizado: Miroslava Romero (`mirosromeroc@gmail.com`, rol `DIRECTOR`).
   - Proyecto introductorio `PRJ-VOS-EJEMPLO`: Presupuesto $45,000 USD, 3 partidas base, 2 tareas (peso 60 al 100%, peso 40 al 50% => avance físico exactamente 80.0%), avance financiero 0.0%.
   - Segregación financiera FIN-01: Bloqueo estricto de autoaprobación de gastos creados por Miroslava (HTTP 409 `ConflictError`).
   - Gobierno documental DOC-01: Documento demostrativo escaneado y certificado en estado `CLEAN`.
5. **Verificación Automatizada Consolidada:**
   - Suite VOSERDEM `tests/voserdem-trial-verification.test.ts`: **26/26 PASSED (100%)**.
   - Suite Seguridad Fase 1 `tests/p0-audit-auth.test.ts`: **19/19 PASSED (100%)**.
   - Suite UX Contratos `tests/ux-portfolio-contracts.test.ts`: **6/6 PASSED (100%)**.
   - Suite Ola 1 `tests/ola1-security-structure.test.ts`: **35/35 PASSED (100%)**.
   - Suite Ola 2 `tests/ola2-financial-integrity.test.ts`: **43/43 PASSED (100%)**.
   - Suite Ola 3 `tests/ola3-operations-governance.test.ts`: **35/35 PASSED (100%)**.
   - Suite Ola 4 `tests/ola4-executive-reporting.test.ts`: **50/50 PASSED (100%)**.
   - **Total Tests Automatizados: 214/214 PASSED (100%)**.
   - Compilación TypeScript (`tsc --noEmit`): **0 errores**.
   - Build de producción Vite + Node (`npm run build`): **100% exitoso**.

---

### Causa Raíz y Solución
1. **Problema Detectado:** El endpoint productivo `GET /api/projects` entrega la estructura paginada `{ data: [...], pagination: { totalItems, currentPage, totalPages, limit } }`. En frontend, invocaciones directas a `.filter()` sobre respuestas no planas disparaban `TypeError: a.filter is not a function` bloqueando la vista de Portafolio.
2. **Solución Implementada:**
   - **Tipos Canónicos:** Se crearon `PaginationInfo` y `PaginatedResponse<T>` en `src/types.ts`.
   - **Normalizador Defensivo Central:** `src/lib/api-helpers.ts` expone `normalizePaginatedResponse<T>` y `normalizeArrayResponse<T>` tolerantes a arreglos planos, objetos paginados, envolturas (`projects`, `items`), nulos o respuestas vacías.
   - **Blindaje de Componentes:** Actualizados `Portfolio.tsx`, `TabTareas.tsx`, `TabCronograma.tsx`, `Reports.tsx`, `Dashboard.tsx`, `GlobalAgenda.tsx` y `DocumentManager.tsx` con validación estructural previa a `.filter()`, `.map()` o `.sort()`.
   - **Verificación:** Suite automatizada `tests/ux-portfolio-contracts.test.ts` (**6/6 PASSED**), `npm run build` limpio y sin regresión.

---

## [2026-08-25] Hito: Ejecución, Subsanación y Cierre Funcional de Fase 3 (Ola 4: Reportabilidad Ejecutiva, Dashboard y Exportaciones) — Auditoría AUD-PROY-001

### Resumen Consolidado
Se completó y verificó el **Cierre Funcional de la Ola 4 (Reportabilidad Ejecutiva, Dashboard y Exportaciones)** (`v1.4.2-wave-4-fix`), quedando el cierre integral formalmente condicionado por `PERF-02`:
1. **`M-02` (Dashboard Ejecutivo y Métricas Globales):**
   - **Conciliación Financiera Directa:** `totalExecuted` suma exclusivamente gastos con estado `APPROVED`. `availableBalance = max(0, totalBudget - totalExecuted)`. `avgFinancial = (totalExecuted / totalBudget) * 100`.
   - **Avance Físico Global Ponderado:** `avgPhysical = sum(physicalProgress * approvedBudget) / totalApprovedBudget`.
   - **Alerta de Brecha Operativa Estricta:** Detección de proyectos con `|físico - financiero| > 15%` y riesgo alto.
   - **`M02-DISB-01` (Desembolsos Pendientes Canónicos):** `pendingDisbursementsAmount = max(0, totalCommittedAgreements - totalPaidDisbursed)`. Verificado para desembolso cero ($150k), parcial ($100k) y completo ($0).
   - **Alcance por Rol:** `assigned` para Responsable de Proyecto y Financiador vinculado; global para Director, Manager, Finance y Auditor.
   - **Rendimiento `PERF-02` y Decisión Arquitectónica:** El benchmark interno del servicio no deberá presentarse como equivalente al rendimiento HTTP productivo. `PERF-02` se divide en: a) rendimiento interno/caché, cumplido (P95 < 0.2 ms); b) rate limiting, cumplido (100/100 HTTP 200, 0 HTTP 429 con `max: 1000`); y c) latencia HTTP end-to-end, pendiente de cumplimiento (P95 5.507 ms sobre Render Free) o recalibración formal según el nivel de infraestructura contratado.
2. **`M-14` (Ciclo de Vida de Reportes, Seguridad CSV y PDF Estándar):**
   - **Versionado y Segregación:** Borradores correlativos (`V1`, `V2`), bloqueo de autoaprobación (`created_by != approved_by`), inmutabilidad de reportes `APPROVED` y transición automática a `SUPERSEDED`.
   - **`M14-PDF-02` (Generación de PDF Estándar con `pdf-lib`):** Generación de documentos binarios conformes a especificación estándar con árbol `/Catalog -> /Pages -> /Page`, metadatos completos (título, autor, productor), paginación A4, texto extraíble y validación por parser estructural `PDFDocument.load()`.
   - **Seguridad CSV (RFC 4180 + Mitigación de Fórmulas):** Neutralización de prefijos `=`, `+`, `-`, `@`, `\t`, `\r` y espacios iniciales con apóstrofe, codificación UTF-8 con BOM (`\uFEFF`) y hash SHA-256 inmutable.
   - **Trazabilidad IA:** Citas obligatorias `[Gasto #ID]`, etiquetado `requiresHumanReview: true` y fallback determinista auditado (**32/32 tests**).
3. **Descontaminación y Conciliación del Tenant Demo Institucional:**
   - Tenant demo restaurado exclusivamente al proyecto institucional `PRJ-DEMO-2026` con 4 partidas presupuestarias activas ($150,000 presupuesto, $57,000 ejecutado en 4 gastos aprobados, $93,000 saldo disponible, 38% financiero, 75% físico, $150,000 desembolso pendiente y 0 fixtures residuales) (**4/4 tests**).
4. **Verificación Automatizada Consolidada:**
   - Suite Ola 4 `tests/ola4-executive-reporting.test.ts`: **50/50 PASSED (100%)**.
   - Regresión Ola 3 `tests/ola3-operations-governance.test.ts`: **35/35 PASSED (100%)**.
   - Regresión Ola 2 `tests/ola2-financial-integrity.test.ts`: **43/43 PASSED (100%)**.
   - Regresión Ola 1 `tests/ola1-security-structure.test.ts`: **35/35 PASSED (100%)**.
   - Total Suite Consolidada (4 Olas): **163/163 PASSED (100%)**.
   - Tag oficial: `v1.4.2-wave-4-fix` (Commit funcional: `098b945b66fbb75fc29a4521a182a9ee37d29bca`).

---

## [2026-08-24] Hito: Ejecución, Integración End-to-End y Cierre de Fase 3 (Ola 3: Operaciones de Proyecto y Gobierno Documental) — Auditoría AUD-PROY-001

### Resumen Consolidado
Se completó, verificó y desplegó la **Ola 3 (Operaciones de Proyecto y Gobierno Documental)** con numeración canónica exacta y corrección integral de observaciones de auditoría (`v1.3.1-wave-3-fix`):
1. **`M-07` (Planificación Operativa, Cronograma Gantt y Avance Físico):**
   - **Persistencia End-to-End:** Campos `weight` y `progress` integrados en la tabla `tasks` y tabla `task_dependencies` expuestas en endpoints productivos.
   - **Detección de Ciclos en DAG:** Detección y rechazo estricto de dependencias circulares (A -> B -> C, intento C -> A) con `ConflictError` (HTTP 409).
   - **Validación Cronológica:** `startDate <= dueDate` y `predecessor.dueDate <= task.startDate`.
   - **Avance Físico Ponderado:** Cálculo matemático reproducible `sum(w * p) / sum(w)` y actualización automática de `projects.physicalProgress`. Manejo seguro de denominador 0 y normalización de pesos.
   - Control de acceso `assigned` para Responsable de Proyecto y matriz RBAC (**10/10 tests**).
2. **`M-12` (Gobierno Documental DOC-01):**
   - **Cobertura MIME Completa:** Sniffing de Magic Bytes para PDF (`%PDF-`), PNG, JPEG, WEBP (`RIFF....WEBP`), DOCX OOXML (`[Content_Types].xml` + `word/`), XLSX OOXML (`[Content_Types].xml` + `xl/`), ZIP genérico y rechazo estricto de ejecutables binarios MZ.
   - **Hash SHA-256:** Hash criptográfico inmutable de 64 caracteres generado y verificado.
   - **Matriz de Autenticación de Escáner:** Comparación segura `timingSafeEqual`, bloqueo HTTP 403 ante clave ausente o incorrecta.
   - **Máquina de Estados Fail-Closed:** Bloqueo HTTP 423 para descargas de estados no `CLEAN` o archivos en papelera. Prohibición de transición inválida `INFECTED -> CLEAN` (HTTP 409).
   - Papelera de reciclaje recuperable (Soft Delete/Restore) con auditoría y retención legal de 5 años (**20/20 tests**).
3. **`M-13` (Análisis Documental con IA de Documentos CLEAN):**
   - Análisis con IA estrictamente condicionado a documentos con estado `CLEAN` (bloqueo HTTP 423 para otros estados).
   - Extracción estructurada: Cláusulas con nivel de riesgo y cita textual, entidades categorizadas, fechas y resumen ejecutivo.
   - **Fallback Explícito:** Salida etiquetada con `analysisMode: 'DETERMINISTIC_NLP_FALLBACK'`, `providerAvailable: false`, `requiresHumanReview: true` y `confidence: 'LOW'` (**4/4 tests**).
4. **Descontaminación y Limpieza:**
   - Tenant demo verificado con 0 fixtures residuales y exclusivamente el proyecto oficial `PRJ-DEMO-2026` (**1/1 test**).
5. **Verificación Automatizada Consolidada:**
   - Suite Ola 3 `tests/ola3-operations-governance.test.ts`: **34/34 PASSED (100%)**.
   - Regresión Ola 2 `tests/ola2-financial-integrity.test.ts`: **43/43 PASSED (100%)**.
   - Regresión Ola 1 `tests/ola1-security-structure.test.ts`: **35/35 PASSED (100%)**.
   - Total Suite Consolidada: **112/112 PASSED (100%)**.
   - Build de producción limpio y tag oficial `v1.3.1-wave-3-fix`.

---

## [2026-08-24] Hito: Ejecución y Cierre Definitivo de Fase 3 (Ola 2: Integridad Financiera y Presupuestaria) — Auditoría AUD-PROY-001

### Resumen Consolidado
Se completó, verificó y desplegó la **Ola 2 (Integridad Financiera y Presupuestaria)** con mapeo canónico exacto:
1. **`M-05` (Convenios y Financiadores):**
   - Validación estricta de montos positivos (`amount > 0`), coherencia cronológica (`signedDate <= startDate <= endDate`), RBAC positivo/negativo y aislamiento cross-tenant (**8/8 tests**).
2. **`M-06` (Desembolsos e Ingresos Trazables):**
   - Control de límites acumulados (`totalDisbursed <= agreement.amount`), RBAC y rechazo cross-tenant (**8/8 tests**).
3. **`M-08` (Partidas Presupuestarias Base):**
   - Creación, consulta y aislamiento cross-tenant de partidas presupuestarias (**2/2 tests**).
4. **`M-09` (Versionado Presupuestario y Adendas):**
   - Versiones correlativas (`V1`, `V2`, `V3`), inmutabilidad estricta de versiones archivadas/aprobadas, resistencia a concurrencia (bloqueo FOR UPDATE), RBAC y aislamiento cross-tenant (**8/8 tests**).
5. **`M-10` (Registro y Aprobación de Gastos - Segregación FIN-01 y Saldo Concurrente):**
   - Segregación estricta de funciones: Bloqueo de auto-aprobación del creador con `ConflictError`.
   - **Resistencia a Concurrencia Real:** Prueba simultánea con `Promise.all` de dos gastos de $80 contra un saldo de $100 (exactamente 1 aprobado, 1 rechazado con 409, saldo final $20, nunca negativo).
   - RBAC y bloqueo cross-tenant (**6/6 tests**).
6. **`M-11` (Comprobantes, Rendiciones y Control Multi-divisa):**
   - Unicidad fiscal bajo concurrencia y aislada por tenant.
   - Multi-divisa: Conversión obligatoria con tasa, fecha y fuente, rechazo de tasas <= 0, normalización a 1 en paridad y redondeo a 2 decimales.
   - RBAC y cross-tenant (**10/10 tests**).
7. **Descontaminación y Limpieza del Tenant Demo:**
   - Tenant demo restaurado al proyecto institucional `PRJ-DEMO-2026` exclusivo (**1/1 test**).
8. **Verificación Automatizada y Regresión:**
   - Suite de Ola 2 `tests/ola2-financial-integrity.test.ts`: **43/43 PASSED (100%)**.
   - Suite de regresión de Ola 1 `tests/ola1-security-structure.test.ts`: **34/34 PASSED (100%)**.
   - Build de producción limpio y tag oficial `v1.2.1-wave-2-fix`.

---

## [2026-08-24] Hito: Ejecución y Cierre Definitivo de Fase 3 (Ola 1: Seguridad y Estructura Base) — Auditoría AUD-PROY-001

### Resumen Consolidado
Se completó, verificó y desplegó la **Ola 1 (Seguridad y Estructura Base)** que abarca los módulos **M-01, M-03, M-04, M-15 y M-16**:
1. **`M-01` (Autenticación y Sesiones Demo):**
   - JWTs HMAC-SHA256 con claims canónicos (`user_id`, `role`, `tenant_id`, `session_id`, `exp: 900s`).
   - Rechazo riguroso de firmas manipuladas, roles inexistentes y tokens expirados.
2. **`M-03` (Portafolio de Proyectos y Aislamiento):**
   - Creación y edición por `DIRECTOR` y `MANAGER`.
   - Bloqueo de creación para `AUDITOR` con HTTP 403.
   - Aislamiento multi-tenant estricto verificado: 0 filtración de registros entre organizaciones.
3. **`M-04` (Ficha Detallada de Proyecto):**
   - Filtrado de líneas presupuestarias de la versión activa/aprobada (`activeBudgetVersion`), eliminando duplicidad visual de códigos de partida.
4. **`M-15` (Bitácora de Auditoría e Inmutabilidad SQL Estricta en PostgreSQL):**
   - Registro de diffs estructurados (`before_state`, `after_state`), autor, IP y timestamps UTC.
   - **Inmutabilidad en Motor de Base de Datos:** Triggers PostgreSQL `prevent_audit_logs_mutation()` activos que bloquean con `permission denied` cualquier intento de `UPDATE`, `DELETE` o `TRUNCATE` sobre `audit_logs`.
   - Consulta permitida para `DIRECTOR` (200) y `AUDITOR` (200); bloqueada con HTTP 403 para Manager, Finance, Responsable y Financiador.
5. **`M-16` (Gestión de Usuarios, Roles, /api/users/me e Invalidación de Caché):**
   - Catálogo `GET /api/users`: Restringido exclusivamente a `DIRECTOR` (200) y `AUDITOR` (200); bloqueado para Manager y Finance (403).
   - Perfil Propio `GET /api/users/me`: Habilitado para todos los roles autenticados (200), devolviendo `roleCode` canónico (ej. `FINANCE`, `DIRECTOR`) y `roleName` descriptivo.
   - Invalidación reactiva e inmediata de caché de permisos en `CacheService.invalidate(userId)` tras cambios de rol.
6. **`DOC-01` (Política Fail-Closed Activa):**
   - Endpoint `GET /api/documents/:id/download` responde **HTTP 423 (Locked)** si el archivo no está en estado `CLEAN` o está en cuarentena.
   - Endpoint `POST /api/documents/:id/analyze` bloquea análisis IA en HTTP 423 si el documento no está `CLEAN`.
7. **Trazabilidad y Verificación Automatizada:**
   - Suite `tests/ola1-security-structure.test.ts` pasando **34/34 pruebas (100% PASS)**.
   - **Commit Funcional y de Despliegue:** `639d1b73e2f1e4ed5b8e5494b49f3bd230af8add`.
   - **Tag Git Canónico:** `v1.1.1-wave-1-fix` apuntando exactamente al commit `639d1b7`. Desplegado en Render.

---

## [2026-08-24] Hito: Ejecución y Estabilización de Fase 2 (Integridad P1) — Auditoría AUD-PROY-001

### Resumen Consolidado
Se completó e implementó la totalidad de los requerimientos de integridad P1 y se subsanaron todas las observaciones de auditoría:
1. **`FIN-01` (Segregación Estricta de Funciones y Contexto de Sesión):**
   - Resuelta la falla de contexto de usuario (`401: Falta contexto de usuario`) incorporando `user_id` / `id` numérico en el payload firmado del JWT demo (`src/services/demoAuth.service.ts` y `src/middleware/auth.ts`).
   - `src/middleware/rbac.ts` cuenta con resolución de permisos de sesión limpia y bypass administrativo para `DIRECTOR` / `ADMIN`.
   - Bloqueo de auto-aprobación del creador con `ConflictError` y bloqueo de sobre-ejecución presupuestaria si el monto supera el saldo disponible.
   - UI en `ExpensesDashboard.tsx` inhabilita las acciones y muestra badge *"Registrado por ti — Revisor independiente requerido"*.
2. **`BUD-01` (Versionado Inmutable y No Duplicidad):**
   - Servicio `src/services/budget.service.ts` genera correlativos consistentes (`V1`, `V2`, `V3`) con normalización automática de `versionName`.
   - `getProjectById` en `src/controllers/projects.controller.ts` filtra exclusivamente las partidas de la versión activa/aprobada, erradicando la duplicidad visual de líneas en la interfaz.
3. **`AUD-01` (Auditoría Inmutable con Diffs y UTC):**
   - `logAuditEvent` registra snapshots estructurados (`before_state`, `after_state`, usuario, IP, tenant y timestamp UTC).
4. **`DOC-01` (Gobierno Documental Honesto y Completo):**
   - Whitelist MIME estricta y límite de 10MB en `src/routes/documents.ts`.
   - Hash criptográfico SHA-256 generado por archivo.
   - Estado de escaneo antivirus honesto (`scanStatus: 'PENDING_SCAN'`, sin asignar falsos `CLEAN`).
   - Política y plazo de retención legal fijada a 5 años (`5_YEARS_LEGAL_ARCHIVE`).
   - Papelera recuperable (soft-delete + restore auditado) y bloqueo de descarga si el archivo está en cuarentena.
5. **`AI-01` (Trazabilidad de Afirmaciones IA):**
   - Reportes ejecutivos con citas obligatorias a fuentes transaccionales (`[Gasto #ID]`), flag `requiresHumanReview: true` y fallback auditado.
6. **`SEC-01` & `PERF-01` (Seguridad, Rendimiento y Arquitectura Saneada):**
   - Erradicada la directiva `'unsafe-eval'` de la CSP en `server.ts`.
   - Erradicadas todas las menciones a *"Cloud SQL Conectado"* en `Topbar.tsx`, `UsersManager.tsx` y `AuditTrail.tsx`, reemplazándolas por la arquitectura real *"PostgreSQL Conectado"*.
   - `/api/health` enriquecido con latencia de BD en ms (`latencyMs`), memoria RSS/Heap y uptime.
7. **Verificación Automatizada:**
   - Suite `tests/p1-integrity-audit.test.ts` con **29/29 tests pasando (100% de cobertura de los 7 controles P1)**. Compilación `tsc --noEmit` y `npm run build` limpias (0 errores). Commit `6da6408` desplegado a Render.

---

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

---

## 6. Roadmap de Maduración y Comercialización SaaS B2B (Backlog Vendible)
1. **Onboarding & Self-Service:** Wizard de registro de organizaciones (`/signup`), verificación por email con tokens de 24h, invitaciones de equipo y guía interactiva.
2. **Billing Engine & Tier Enforcement:** Webhooks bidireccionales con Stripe / LemonSqueezy, enforcement de cuotas por plan (Starter, Growth, Enterprise) y Customer Portal.
3. **Cloud Storage & Antivirus (DOC-01):** Migración a AWS S3 / Cloudflare R2 con URLs prefirmadas, pipeline de escaneo antivirus asíncrono y cifrado AES-256 en reposo.
4. **Comunicaciones Transaccionales:** Proveedor de email (Resend / SendGrid), alertas automatizadas de vencimiento de hitos/cláusulas y centro de notificaciones in-app.
5. **Infraestructura Dedicada & SLA Enterprise (PERF-02):** Cómputo dedicado (Render Starter/Standard, P95 < 150 ms), Redis + BullMQ para colas de background jobs y observabilidad APM.
6. **Interoperabilidad Enterprise:** Integración contable (QuickBooks/Xero/SAP B1), API pública con API Keys para donantes internacionales y SSO SAML 2.0.
7. **Compliance & Legal:** Términos de Servicio (ToS), DPA conforme a GDPR, backup completo descargable de la organización y firma digital de reportes.

5. **AI Reports:** Integración del Google Gen AI SDK (Gemini Flash) para transformar data de BD cruda en un análisis ejecutivo financiero renderizado en Markdown en el frontend.

## 6. Próxima Etapa
**Fase de Auditoría y Pruebas Operativas:** Pruebas reales con los usuarios clave en producción (VOSERDEM) previo a la evaluación y codificación de nuevas funcionalidades.
