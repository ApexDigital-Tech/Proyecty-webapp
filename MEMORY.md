# MEMORIA DE PROYECTO — PROYECTY / FINANCIERO (FIN-CORE-02)

## A. Decisión de Producto

PROYECTY será una plataforma de planificación, administración, ejecución y rendición financiera de proyectos sociales.

**Incluye**:
- Financiadores
- Convenios
- Desembolsos
- Planes anuales/semestrales
- Importación de planes
- Importación histórica
- Partidas
- Gastos
- Comprobantes
- Aprobación
- Reportes
- Exportaciones
- Auditoría
- Interoperabilidad contable

**No incluye**:
- Libro diario
- Libro mayor
- Impuestos
- Conciliación bancaria
- Activos fijos
- Contabilidad empresarial completa

---

## B. Causa Raíz Identificada

El formulario de comprobantes (`TabComprobantes.tsx` via `ProjectDetail.tsx`) utiliza todavía:
`POST /api/projects/:projectId/receiptsVouchers`

Este endpoint legacy crea `receipts_vouchers` con `expense_id = NULL` y no utiliza el servicio atómico nuevo (`createExpense`).

Por ello, los comprobantes registrados desde la interfaz no ingresan automáticamente en:
- `expenses`
- partidas (`budget_lines`)
- bandeja de aprobación (`ApprovalQueue`)
- reportes (`ReportsDashboard`)
- auditoría financiera (`audit_logs`)

---

## C. Estado de las Entregas

- `b950324`: Conservar provisionalmente; backend atómico parcial.
- `0f1882c`: Conservar provisionalmente; backend de financiamiento parcial.
- `e05daeb`: Incompleto; tablas no existen físicamente en PostgreSQL.
- `b670cf3`: Incompleto; sin endpoint multipart ni interfaz UI.
- `0789827`: Servicio aislado.
- `3371147` y `a010f6c`: Exportación parcial; no genera `.xlsx` OpenXML ni PDF real.
- `d2acb8c`: Prueba no descubierta por Playwright y sin interacción humana real.

---

## D. Regla para la Próxima Sesión

**No comenzar Entregas 2–6 hasta cerrar completamente la Entrega 1 mediante interfaz real.**

---

## E. Pendientes Priorizados para la Próxima Sesión

1. Verificar el servidor ejecutando exactamente el HEAD actual.
2. Reiniciar el servidor por PID exacto y comprobar `GET /api/expenses`.
3. Determinar si el 404 era servidor desactualizado o montaje incorrecto de ruta.
4. Conectar `TabComprobantes` con el flujo atómico (`createExpense`).
5. Evitar definitivamente comprobantes financieros huérfanos.
6. Mostrar gasto #228 en `BL-02`.
7. Mostrar gasto #228 en la bandeja del Director (`ApprovalQueue`).
8. Restaurar Reportes y Analítica con datos reales.
9. Probar aprobación y rechazo desde la interfaz UI.
10. Verificar recálculo y auditoría.
11. Crear un Playwright `.spec.ts` con clics y formularios reales.
12. Certificar la Entrega 1.
13. Solo después, completar Financiamiento.
14. Crear migraciones físicas de planes e importaciones en PostgreSQL.
15. Implementar rutas e interfaces de importación.
16. Generar archivos XLSX, CSV y PDF reales.
17. Validar persistencia después de reinicio.
18. Actualizar documentación final únicamente con evidencia.
