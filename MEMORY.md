# PROYECTY - Project Memory & Context

> **Este documento preserva el contexto arquitectónico, el estado de desarrollo y las decisiones técnicas de PROYECTY para garantizar la continuidad inmediata en futuras sesiones.**

## 1. Estado Actual del Proyecto
- **Fase Actual:** `Fase 5 (Expediente Digital & Análisis AI) Completada` -> `Transición a Siguiente Fase`
- **Último Hito Alcanzado:** Validación funcional al 100% de la Fase 5:
  - Subida, listado, descarga y eliminación de documentos en Supabase Storage (Fase 5A).
  - Implementación del modal de Análisis de IA con Gemini 2.0 Flash (`gemini-2.0-flash`) y parseo seguro de respuestas (Fase 5B).
- **Validación Exitosa:** Las vistas y endpoints de almacenamiento están consistentes en producción. Se corrigió exitosamente el middleware de autenticación (`requireAuth`) para procesar correctamente los tokens demo simplificados (ej. `demo-director`) mediante mocks locales, previniendo los rechazos 401 de Supabase.

## 2. Stack Tecnológico Principal
- **Frontend:** React, Vite, TypeScript, Tailwind CSS, React Router, Lucide Icons.
- **Backend:** Node.js, Express.js.
- **Base de Datos & ORM:** PostgreSQL (Supabase Cloud SQL) + Drizzle ORM.
- **Autenticación:** Supabase Auth (Integrado en cliente y verificado en backend mediante JWT).
- **Almacenamiento:** Supabase Storage (Módulo Documental).
- **Inteligencia Artificial:** Google AI (Gemini 2.0 Flash API).

## 3. Decisiones Arquitectónicas y de Seguridad (Hardening)
1. **Multi-Tenancy Estricto:** Toda consulta, escritura y operación backend cruza por el middleware `verifyProjectTenant`, garantizando el aislamiento de datos por `tenantId`.
2. **Autorización Híbrida JWT & Demo:** El middleware `requireAuth` acepta tokens Supabase JWT estándar (3 segmentos) y tokens de entorno demo (`demo-...`). Los tokens demo puros son mapeados en memoria al `tenantId: 1` para permitir pruebas sin romper la validación JWT remota.
3. **Manejo de Almacenamiento:** Los archivos se suben al bucket `documents` usando URLs firmadas generadas por el Service Role en el backend para preservar la seguridad RLS sin exponer credenciales en el cliente.
4. **Resiliencia API IA:** El análisis de documentos está encapsulado con Timeouts, Fallbacks y parseo robusto (limpieza de Markdown para extraer JSON crudo) protegiendo la UI de respuestas malformadas del LLM.

## 4. Estado del Despliegue en Producción (Render)
Se ha estabilizado el entorno productivo en Render (`proyecty-webapp.onrender.com`):
1. **Frontend & Backend en un mismo App:** Se resolvió el conflicto de `import.meta.env` compilando el backend a CJS.
2. **Resolución de Dependencias:** Ajuste completo de importaciones de componentes compartidos.
3. **Manejo de Errores de BD & Auth en Producción:** Las variables de entorno `SUPABASE_SERVICE_ROLE_KEY` y `DATABASE_URL` (IPv4 Pooler port 6543) están correctamente configuradas y funcionales en Render.

## 5. Próximas Tareas y Pendientes (Siguiente Fase)
Para la próxima sesión (demo con VOSERDEM y cierre iterativo), se priorizarán los siguientes frentes:
1. **Dashboard de Financiador:**
   - Construir vistas de solo lectura y métricas de impacto para que los donantes puedan ver el estado general sin capacidades de edición.
2. **Reportes Globales:**
   - Consolidación de gastos financieros, avance de indicadores de cumplimiento y generación de reportes ejecutivos.
3. **Ajustes Visuales / Preparación de Demo:**
   - Limpieza de data residual (se recomendó al usuario borrar usuarios duplicados como "Rodrigo G." desde Supabase Studio).
   - Pulir detalles de UI/UX, espaciados y consistencia para una demostración impecable.
