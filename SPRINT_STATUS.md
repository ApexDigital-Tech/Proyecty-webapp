# ESTADO CANÓNICO DEL SISTEMA — PROYECTY / DEMO VOSERDEM

Estado de fases:
- R0: CERRADO.
- R1A: CERRADO.
- R1B: CERRADO.
- R1C: CERRADO.
- DEMO VOSERDEM: SUSPENDIDA temporalmente.
- FIN-P0: IMPLEMENTADO — CERTIFICACIÓN INDEPENDIENTE PENDIENTE.
- Producción modificada: NO.
- Push: NO.
- Merge: NO.
- Despliegue: NO.

HEAD Final: `eb0c1fc3801fa7431f508a354740fa3056fccc46`
Fecha de Cierre: 2026-08-31

## Commits de la Sesión FIN-P0
1. `897abab` fix(runtime): aislamiento local, storage en disco y arranque no bloqueante
2. `707c0bb` fix(finance): modelo canónico de gastos, recálculo atómico y rutas
3. `26d0834` fix(documents): relación comprobante-documento y descarga local
4. `a632d9c` feat(finance-ui): detalle por partida, modal con validación y comprobantes
5. `eb0c1fc` test(finance): seed VOSERDEM derivado y suite de verificación Playwright/E2E

## Estado de Verificación Técnica
- Build (`npm run build`): PASS (evidencia entregada, exit code 0).
- Health check (`/api/health`): PASS (16–20 ms de latencia media, status healthy).
- Ciclo automatizado FIN-P0 (`tests/fin-p0-lifecycle.test.ts`): PASS (9/9 pasos comprobados con exit code 0).
- Estados financieros normalizados: `'pending'`, `'approved'`, `'rejected'`, `'reversed'`.
- Recálculo derivado y transaccional: Implementado vía `recalculateFinancialState`.
- Segregación de funciones FIN-01: Implementada (Finanzas registra / Director aprueba; respuesta HTTP 403 comprobada).
- Comprobantes relacionados: Vinculación atómica a `expense_id`, `budget_line_id` y `project_id`.
- Almacenamiento local aislado: `LocalStorageAdapter` activo en `C:\temp\proyecty-storage` sin llamadas a Supabase Storage.
- Working tree final: LIMPIO (`git status --short` sin modificaciones pendientes).

## Restricciones Vigentes
- Prohibición absoluta de tocar o modificar el entorno de producción.
- Sin push, sin merge y sin despliegue activo.
- Estado general: CERTIFICACIÓN INDEPENDIENTE PENDIENTE.
