# MEMORIA DE PROYECTO — PROYECTY / DEMO VOSERDEM

Estado de fases:
- R0: CERRADO.
- R1A: CERRADO.
- R1B: CERRADO.
- R1C-A: CERRADO.
- R1C: CERTIFICADO Y CERRADO.
- DEMO-D0/D1/D1A: CERRADOS.
- DEMO-D2V técnico: CERTIFICADO Y CERRADO.
- AUDITORÍA DIRECTA VOSERDEM: CERTIFICADA Y CERRADA.
- DEMO VOSERDEM: SUSPENDIDA temporalmente.
- FIN-P0: IMPLEMENTADO — CERTIFICACIÓN INDEPENDIENTE PENDIENTE.

## 1. Causa Raíz del Incidente Financiero (Auditoría Forense P0)
- Inconsistencia de estados (`'approved'`, `'pending'`, `'APPROVED'`, `'PENDING_APPROVAL'`) que impedía el cálculo unificado.
- Escritura directa de valores hardcodeados en `budget_lines.executed_amount` y `projects.financial_progress` sin consultar los gastos aprobados reales.
- Gastos aprobados antiguos con `base_amount = NULL` y `receipts_vouchers` vacío (0 registros), desconectados de la gobernanza documental.
- Servidor local bloqueado en arranque por llamadas de red a Supabase Storage remoto no configurado localmente.

## 2. Decisiones Arquitectónicas y Consolidación Canónica (FIN-P0)
1. **Estados Financieros Canónicos**: Se imponen únicamente en minúsculas: `'pending' | 'approved' | 'rejected' | 'reversed'`.
2. **Fórmulas Financieras Canónicas**:
   - `executed_amount = SUM(COALESCE(base_amount, amount)) WHERE status = 'approved'` (para `tenant_id`, `project_id` y `budget_line_id`).
   - `balance = reformulated_amount - executed_amount` (bloqueo transaccional contra saldo negativo).
   - `financial_progress = (SUM(executed_amount) / approved_budget) * 100` (redondeado derivado).
3. **Relación Gasto – Partida – Comprobante – Auditoría**: Vinculación atómica en `receipts_vouchers` (`expense_id`, `budget_line_id`, `project_id`, `file_url`, `is_verified`, hash SHA-256) evitando registros huérfanos.
4. **Separación de Almacenamiento**: `LocalStorageAdapter` en `C:\temp\proyecty-storage` para entorno de test local; `SupabaseStorageAdapter` reservado para producción.
5. **Segregación FIN-01 & RBAC**: El usuario que registra un gasto no puede aprobarlo (HTTP 403). `FINANCE` / `MANAGER` registran; `DIRECTOR` aprueba, rechaza y revierte.

## 3. Baseline VOSERDEM (Proyecto A: PRJ-DEMO-2026)
- **Presupuesto Aprobado**: USD 150.000.
- **Ejecutado Derivado**: USD 57.000.
- **Avance Financiero**: 38%.
- **Desglose de Partidas Derivadas**:
  - **BL-01**: ejecutado 24.000; saldo 36.000 (40%).
  - **BL-02**: ejecutado 21.500; saldo 28.500 (43%) [gasto pendiente de 6.000 excluido de ejecutado].
  - **BL-03**: ejecutado 8.500; saldo 16.500 (34%).
  - **BL-04**: ejecutado 3.000; saldo 12.000 (20%).

## 4. Pendientes Obligatorios para la Próxima Sesión
1. Auditar el contenido exacto de los cinco commits FIN-P0 (`897abab`, `707c0bb`, `26d0834`, `a632d9c`, `eb0c1fc`).
2. Ejecutar `tsc --noEmit` con Node 20 portable.
3. Ejecutar el pipeline integral desde un clon limpio.
4. Realizar el recorrido humano desde `/internal-demo`.
5. Visualizar el detalle de gastos en cada partida.
6. Registrar un gasto con PDF desde la interfaz.
7. Confirmar persistencia y descarga del comprobante.
8. Aprobar como Director y verificar el recálculo.
9. Revertir el gasto y comprobar la restauración exacta.
10. Verificar auditoría inmutable y segregación de funciones.
11. Reiniciar servidor y PostgreSQL y comprobar persistencia.
12. Ejecutar Playwright mediante clics reales, sin inyección de sesión ni llamadas directas que omitan la UI.
13. Certificar que ninguna prueba utiliza producción.

## 5. Regla Inflexible
- Prohibición absoluta de conectar, modificar o desplegar en producción.
