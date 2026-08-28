## Punto de control — Refactorización R1C

Fecha: 2026-08-28

### Fases cerradas

- R0: respaldo PostgreSQL 17 cifrado, restaurado y comparado.
- R1A: dependencias y elementos reconstruibles saneados.
- R1B: archivos residuales organizados y respaldos sensibles retirados.
- R1C-A: corredor TSX y descubrimiento Playwright configurados.

### Estado R1C

R1C contiene correcciones de runtime, aislamiento, autenticación, auditoría y observabilidad. Se reportaron 13 casos Playwright aprobados, pero la certificación integral continúa pendiente porque las últimas modificaciones no fueron seguidas por una corrida única y reproducible de todo el pipeline.

### Arquitectura de pruebas

- Node objetivo: 20.18.0 portable.
- PostgreSQL: 17 local en 127.0.0.1:55432.
- Base: proyecty_test, creada desde template0.
- Integración: npm run test:integration.
- E2E: npm run test:e2e.
- Vitest no pertenece al proyecto.
- Playwright descubre únicamente archivos *.spec.ts.
- Las pruebas deben rechazar hosts productivos de Supabase.

### Seguridad

- El backend utiliza transporte ws explícito para Supabase bajo Node 20.
- La configuración Supabase backend debe provenir exclusivamente de variables de entorno.
- El frontend debe obtener rol y tenant desde /api/auth/me.
- user_metadata no es fuente autorizada para roles.
- approveExpense y el log obligatorio deben compartir transacción.
- El profiler nativo de Sentry debe ser opcional y no cargarse en test.
- No usar Stop-Process por nombre, taskkill global ni git add ..

### Commits pendientes de auditoría

- fea11fe — observabilidad/Sentry.
- 7a9e240 — prueba de rollback financiero.
- abd2334 — ciclo de sesión.
- 8409be3 — bloqueo de hostnames productivos.
- 90096a8 — estabilización E2E.

### Estado Git y despliegue

- Estrategia: forward-only.
- Push: no realizado.
- Merge: no realizado.
- Despliegue: no realizado.
- Producción: sin modificaciones.
- Working tree: contiene una modificación pendiente en la prueba de rollback.
- Próxima certificación: ejecutar desde clon limpio antes de autorizar entrega.

### Restricciones vigentes

- No conectar pruebas a producción.
- No usar Node global.
- No reescribir historial.
- No hacer push, merge o despliegue.
- No iniciar nuevas funcionalidades.