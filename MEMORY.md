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

## 4. Estado del Despliegue en Producción (Render)
Se ha estabilizado el entorno productivo en Render (`proyecty-webapp.onrender.com`):
1. **Frontend & Assets:** Se resolvió el conflicto de `import.meta.env` (CJS vs ESM) aislando el build de cliente (Vite) del de backend y configurando Express para servir los assets estáticos correctamente sin romper los tipos MIME.
2. **Corrección Module Resolution:** Se eliminaron las extensiones `.tsx` en importaciones de componentes compartidos (`Skeletons`) previniendo fallas de empaquetado y de tiempo de ejecución (ej. `TableSkeleton is not defined`).
3. **Autenticación Demo & Real:**
   - La API de usuarios demo está protegida mediante un feature flag `ENABLE_DEMO_LOGIN`.
   - Se ha consolidado la función `mapRoleToEnum` en `auth.ts` para que los inicios de sesión mediante Google Auth resuelvan correctamente roles de DB (ej. `"Director"`) hacia los Enum de validación (`"DIRECTOR"`), corrigiendo accesos `403` en endpoints administrativos.
4. **Data Seed (Idempotente):** Se implementaron `scripts/seed-prod-data.ts` y `scripts/rollback-demo-data.ts` accesibles vía `npm run` en el entorno Render, diseñados para inyectar datos demo `[DEMO VOSERDEM]` de forma segura sin contaminar a los usuarios reales y garantizando la limpieza de usuarios demo duplicados.

## 5. Próximas Tareas y Pendientes (Priorizados)
1. **Verificación Operativa de Usuarios:**
   - Confirmar comportamiento en UI real: Creación de un usuario `pending`, su edición, suspensión, reactivación y trazas de auditoría correspondientes.
   - Asegurar que no existan comportamientos indeseados (auto-eliminación/desactivación del propio usuario).
2. **Edición de Nombres de Proyecto:**
   - Confirmar y/o habilitar la capacidad de modificar el nombre de los proyectos directamente desde el UI del detalle de proyecto (PUT `/api/projects/:id`).
3. **Validación Visual de Datos Demo:**
   - Correr en Render Shell el comando `npm run db:seed:demo` y validar los datos en los módulos del portafolio, bitácora y presupuesto (dashboard).
