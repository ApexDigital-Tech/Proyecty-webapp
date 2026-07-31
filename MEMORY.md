# PROYECTY - Project Memory & Context

> **Este documento preserva el contexto arquitectónico, el estado de desarrollo y las decisiones técnicas de PROYECTY para garantizar la continuidad inmediata en futuras sesiones.**

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
