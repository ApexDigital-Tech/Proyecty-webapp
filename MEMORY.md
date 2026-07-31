# PROYECTY - Project Memory & Context

> **Este documento preserva el contexto arquitectónico, el estado de desarrollo y las decisiones técnicas de PROYECTY para garantizar la continuidad inmediata en futuras sesiones.**

## 1. Estado Actual del Proyecto
- **Fase Actual:** `Sprint 1 (Refactorización Modular & Hardening de Seguridad) COMPLETADO` -> `Transición a Sprint 2`
- **Último Hito Alcanzado:** Modularización completa del Backend y limpieza de `server.ts`.
  - Extracción exitosa de los módulos: Auth, Users, Projects, Reports & AI, Uploads usando el patrón Strangler Fig.
  - Implementación de Middlewares Globales de Error Handling y Validación estricta con Zod.
  - Integración de herramientas Cloud-Native: Rate Limiting con Redis, Observabilidad con Sentry y Logging Estructurado con Winston.
- **Validación Exitosa:** Se repararon exhaustivamente los conflictos de dependencias, variables globales y exportaciones. El análisis estático de TypeScript (`tsc --noEmit`) ahora compila con Zero Errors de forma exitosa.

## 2. Stack Tecnológico Principal
- **Frontend:** React, Vite, TypeScript, Tailwind CSS, React Router, Lucide Icons.
- **Backend:** Node.js, Express.js (Arquitectura de Controladores y Rutas aisladas).
- **Base de Datos & ORM:** PostgreSQL (Supabase Cloud SQL) + Drizzle ORM.
- **Autenticación y Almacenamiento:** Supabase Auth & Storage.
- **Inteligencia Artificial:** Google AI (Gemini 2.0 Flash API).
- **Observabilidad y Seguridad (SaaS):** Zod, Sentry, Winston, Redis (Upstash / Render).
- **Facturación y Mailing (Sprint 2):** LemonSqueezy, Resend.

## 3. Decisiones Arquitectónicas y de Seguridad (Hardening)
1. **Multi-Tenancy y Modularidad:** La API ahora está desacoplada por dominios (`/api/users`, `/api/projects`, `/api/reports`, etc.). Todo mantiene el aislamiento de tenant de forma estricta.
2. **Defensa contra Ataques:** Se ha implementado Rate Limiting distribuido con Redis, protegiendo los endpoints públicos y la autenticación contra ataques de fuerza bruta y abusos de API.
3. **Manejo Centralizado de Errores:** Todos los errores ahora fluyen de manera predecible hacia un Global Error Handler, evitando caídas de la aplicación y reportando excepciones no controladas automáticamente a Sentry.
4. **Validación First:** Todo el input de la red cruza por esquemas de Zod antes de tocar la lógica de negocio, blindando la Base de Datos contra datos mal formados e inyecciones.
5. **Decisiones de Infra SaaS:** Se ha seleccionado LemonSqueezy como MoR (Merchant of Record) para la gestión automatizada de impuestos y facturación B2B a nivel global, y Resend para la entrega transaccional de correos de alta entregabilidad.

## 4. Estado del Despliegue en Producción (Render)
El entorno de Render está listo para recibir el código refactorizado del Sprint 1:
1. **Variables Aprovisionadas Requeridas para el Próximo Deploy:**
   - `REDIS_URL`: URL del add-on de Redis para habilitar el Rate Limiting.
   - `SENTRY_DSN`: Endpoint del proyecto en Sentry para la captura de logs y trazas de error.

## 5. Próximas Tareas y Pendientes (Sprint 2: Billing, Email & Feature Gating)
El próximo Sprint se enfocará en habilitar la capa de monetización, comunicación y control de accesos del SaaS B2B:
1. **LemonSqueezy & Base de Datos:**
   - ~~Crear campos de billing en la tabla `organizations` de Drizzle.~~ ✅ COMPLETADO
   - ~~Implementar esquemas Zod de validación para webhooks de LemonSqueezy (`subscription_created`, `subscription_updated`, `subscription_payment_failed`).~~ ✅ COMPLETADO
   - ~~Implementar el Webhook Handler de LemonSqueezy para sincronizar el estado del pago con la base de datos de Tenants.~~ ✅ COMPLETADO
   - ~~Crear Billing Service con SDK `@lemonsqueezy/lemonsqueezy.js` (Checkout URL + Customer Portal).~~ ✅ COMPLETADO
   - ~~Crear Billing Controller & Router (`/api/billing/checkout-session`, `/api/billing/portal`).~~ ✅ COMPLETADO
   - ~~Registrar `webhooksRouter` y `billingRouter` en `server.ts`.~~ ✅ COMPLETADO
2. **Feature Gating & Limits:**
   - ~~Crear Middlewares (`requireFeature`, `checkUsageLimits`) para limitar proyectos, capacidad de IA, o reportes avanzados según el plan del tenant (Free, Pro, Enterprise).~~ ✅ COMPLETADO
   - ~~Aplicar `requireFeature('ai_reports')` en `reports.routes.ts`.~~ ✅ COMPLETADO
3. **Mailing Transaccional con Resend:**
   - Envío de invitaciones de usuarios, reportes generados y recibos de pago utilizando la API de Resend y plantillas en React Email.
4. **Actualización de Vistas en UI:**
   - Añadir la pantalla de "Suscripción & Facturación" (Customer Portal de LemonSqueezy) en la configuración de la organización.

## 6. Decisiones Arquitectónicas Sprint 2
1. **Billing Fields en `organizations` (no tabla separada):** Los campos de LemonSqueezy (`lemonsqueezy_customer_id`, `subscription_id`, `subscription_status`, `variant_id`, `renews_at`) se colocaron directamente en la tabla `organizations` porque la relación es 1:1 (un tenant = una suscripción). Esto evita JOINs innecesarios en el middleware de Feature Gating que se ejecutará en cada request autenticado. Si en el futuro se requiere historial de suscripciones, se creará una tabla `subscription_history` separada.
2. **Webhook Validation con Zod:** Los esquemas de billing (`src/schemas/billing.schema.ts`) validan la estructura exacta del payload de LemonSqueezy antes de tocar lógica de negocio, manteniendo la filosofía "Validation First" del Sprint 1. Se usa un schema base único (no discriminatedUnion) porque el discriminador `event_name` está anidado en `meta`, no en el root.
3. **HMAC Signature Verification:** El webhook endpoint verifica la firma `X-Signature` con `crypto.timingSafeEqual` para prevenir ataques de timing. Se usa un middleware `verify` en `express.json()` para capturar `rawBody` solo en rutas `/api/webhooks`, minimizando overhead de memoria.
4. **Service Layer (`src/services/`):** Se introdujo `billing.service.ts` como primer servicio del proyecto. Toda la lógica de negocio y acceso a BD está en el service, no en controllers. Los controllers solo validan input y delegan. Esto cumple con la restricción de `.agentrules`: "No direct database logic inside controllers".
5. **Feature Gating Middleware (`requireFeature`):** El middleware de restricción de funcionalidades consulta el `subscriptionStatus` y `variantId` del tenant en cada request a una ruta protegida. Bloquea el acceso (403 Forbidden) si la suscripción no está activa o el plan (Variant ID) no incluye la funcionalidad solicitada, devolviendo un error estructurado (`code: 'UPGRADE_REQUIRED'`) para que el frontend pueda interceptarlo y mostrar un modal de upgrade.
6. **Variables de Entorno Sprint 2 (Billing):**
   - `LEMONSQUEEZY_API_KEY`: API key del dashboard de LemonSqueezy.
   - `LEMONSQUEEZY_STORE_ID`: ID de la tienda.
   - `LEMONSQUEEZY_VARIANT_ID`: ID del variant/plan por defecto.
   - `LEMONSQUEEZY_WEBHOOK_SECRET`: Clave secreta para verificación HMAC de webhooks.
   - `APP_URL`: URL base de la app (para redirect post-checkout).
