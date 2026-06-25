# PROYECTY - Project Memory & Context

> **Este documento preserva el contexto arquitectónico, el estado de desarrollo y las decisiones técnicas de PROYECTY para garantizar la continuidad inmediata en futuras sesiones.**

## 1. Estado Actual del Proyecto
- **Fase Actual:** `Despliegue Controlado / Soft Launch (Beta Cerrada)`
- **Último Hito Alcanzado:** Finalización del *Handoff Técnico* (Fase 7 completada).
- **Validación Exitosa:** Se superó el *Tenant Breach Test* confirmando el aislamiento estricto de datos con respuesta HTTP 403, y la compilación productiva (`npm run build`) se ejecuta sin errores.

## 2. Stack Tecnológico Principal
- **Frontend:** React, Vite, TypeScript, Tailwind CSS, React Router, Lucide Icons.
- **Backend:** Node.js, Express.js.
- **Base de Datos & ORM:** PostgreSQL (Supabase Cloud SQL) + Drizzle ORM.
- **Autenticación:** Supabase Auth (Integrado en cliente y verificado en backend mediante JWT).
- **Almacenamiento:** Supabase Storage (Módulo Documental).

## 3. Decisiones Arquitectónicas y de Seguridad (Hardening)
1. **Multi-Tenancy Estricto:** Toda consulta, escritura y operación backend cruza por el middleware `verifyProjectTenant`, garantizando que la entidad solicitada pertenezca al `tenantId` de la organización del usuario autenticado. La base de datos impone restricciones de claves foráneas (`tenant_id`) a nivel de motor.
2. **Conexión a Base de Datos:** Se utiliza el **Connection Pooler de Supabase (Puerto 6543 / IPv4)** debido a las restricciones de red locales e IPv6. La contraseña en `DATABASE_URL` requiere codificación URL (ej. `%23` en lugar de `#`).
3. **Manejo de Errores Global (UI):** Se implementó un esquema de `ErrorBoundary` por módulos para que un fallo en un componente no rompa el _Shell_ global de la aplicación.
4. **Build Productivo:** El servidor (`server.ts`) fue refactorizado (uso de IIFEs y eliminación de `top-level await`) para compilar de manera limpia como módulo CJS (`server.cjs`) a través de `esbuild`.

## 4. Próxima Sesión: "Pruebas Operativas"
Para la siguiente interacción, el foco estará en la retroalimentación de las validaciones funcionales post-despliegue:
- Pruebas del entorno real (Producción / Staging).
- Monitoreo de comportamientos operativos con usuarios de prueba.
- Ajustes finos de configuración en entorno productivo (Logs, observabilidad, backups y variables de entorno finales).

---
*Fin de registro del Handoff Técnico - Preparados para Pruebas Operativas.*
