# PROYECTY - Project Memory & Context

> **Este documento preserva el contexto arquitectónico, el estado de desarrollo y las decisiones técnicas de PROYECTY para garantizar la continuidad inmediata en futuras sesiones.**

## 1. Estado Actual del Proyecto
- **Fase Actual:** `Fase 3 (Planeación y Control del Tiempo) Completada` -> `Transición a Fase 4`
- **Último Hito Alcanzado:** Validación funcional al 100% de la Fase 3: Integración de Calendario Operativo, CRUD de Eventos, Diagrama Gantt (Cronograma) con asilamiento de datos y Agenda Ejecutiva Global.
- **Validación Exitosa:** Las vistas temporales están consistentes. Se documentó y aplicó explícitamente la regla de negocio de aislamiento de eventos globales (`projectId = null`) frente a los eventos del proyecto. Build productivo compilando correctamente.

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

## 4. Estado del Despliegue en Producción (Render)
Se ha estabilizado el entorno productivo en Render (`proyecty-webapp.onrender.com`):
1. **Frontend & Assets:** Se resolvió el conflicto de `import.meta.env` (CJS vs ESM) aislando el build de cliente (Vite) del de backend y configurando Express para servir los assets estáticos correctamente sin romper los tipos MIME.
2. **Corrección Module Resolution:** Se eliminaron las extensiones `.tsx` en importaciones de componentes compartidos (`Skeletons`) previniendo fallas de empaquetado y de tiempo de ejecución (ej. `TableSkeleton is not defined`).
3. **Autenticación Demo & Real:**
   - La API de usuarios demo está protegida mediante un feature flag `ENABLE_DEMO_LOGIN`.
   - Se ha consolidado la función `mapRoleToEnum` en `auth.ts` para que los inicios de sesión mediante Google Auth resuelvan correctamente roles de DB (ej. `"Director"`) hacia los Enum de validación (`"DIRECTOR"`), corrigiendo accesos `403` en endpoints administrativos.
4. **Data Seed (Idempotente):** Se implementaron `scripts/seed-prod-data.ts` y `scripts/rollback-demo-data.ts` accesibles vía `npm run` en el entorno Render, diseñados para inyectar datos demo `[DEMO VOSERDEM]` de forma segura sin contaminar a los usuarios reales y garantizando la limpieza de usuarios demo duplicados.

## 5. Próximas Tareas y Pendientes (Fase 4)
1. **Kick-off Fase 4:** 
   - Definir formalmente el alcance de la Fase 4 del roadmap.
   - Establecer la arquitectura y los modelos de datos que serán requeridos.
2. **Despliegue para Pruebas (Fase 3):**
   - El código actual (Fase 3 completa) será fusionado a `main` para que Render realice el despliegue automático.
   - Pruebas UAT en ambiente Cloud para confirmar que las interacciones del Calendario y Gantt funcionen fluidas bajo latencia real.
