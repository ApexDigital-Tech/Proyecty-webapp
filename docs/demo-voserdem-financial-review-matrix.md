# MATRIZ DE REVISIÓN Y CONTROL FINANCIERO-ADMINISTRATIVO — VOSERDEM
**Documento de Trabajo:** Evaluación Preliminar de Controles Internos y Flujos Financieros  
**Plataforma Evaluada:** PROYECTY v1.5.1  
**Entidad / Organización:** VOSERDEM (Entorno Demostrativo)  
**Destinatarios:** Administradora General de VOSERDEM, Dirección Ejecutiva, Contador y Asesor Legal  
**Fecha de Emisión:** 28 de agosto de 2026  

---

> [!IMPORTANT]
> **Aviso Legal y de Cumplimiento:** PROYECTY se presenta como una plataforma integral de gestión de proyectos, seguimiento físico-financiero y control de convenios para cooperación internacional. **No sustituye un sistema contable oficial de partida doble ni un software de facturación tributaria certificada** hasta que la Administradora, el contador y los asesores competentes de VOSERDEM validen esta matriz y determinen los puntos de integración contable.

---

## 1. Criterios de Calificación y Escala de Evaluación

Para cada uno de los 30 controles financieros y administrativos, la Administradora podrá dictaminar:
* **[C] Cumple:** La funcionalidad está disponible, probada y satisface plenamente el control operativo.
* **[CP] Cumple Parcialmente:** La funcionalidad básica existe, pero requiere parametrización o complementación de campos.
* **[NC] No Cumple (Brecha):** La acción no existe actualmente en el software y requiere desarrollo o integración externa.
* **[NA] No Aplica:** El control no es requerido para el tipo de convenio o marco normativo del donante.
* **[RA] Requiere Ajuste:** La lógica actual debe ajustarse según las políticas internas específicas de VOSERDEM.

---

## 2. Matriz de 30 Puntos de Control Financiero y Administrativo

| # | Control / Etapa Financiera | Descripción Técnica y Operativa | Estado en PROYECTY v1.5.1 | Evidencia en Plataforma / Código | Calificación Sugerida | Observación / Decisión de la Administradora |
| :-: | :--- | :--- | :--- | :--- | :---: | :--- |
| **1** | **Convenio Marco y Donante** | Registro del monto total acordado ($150k), plazo (12 meses) y contraparte donante. | **Disponible** | `agreements` table, endpoint `GET /api/agreements/:id` | `[C]` | Registrar donantes ficticios para la simulación. |
| **2** | **Desembolsos por Hitos** | Registro de transferencias de fondos por tramos (ej. $60k = 40% inicial). | **Disponible** | `disbursements` table | `[C]` | Permite vincular desembolsos a hitos del convenio. |
| **3** | **Presupuesto Maestro** | Techo presupuestario global por proyecto con validación estricta de saldo. | **Disponible** | `projects.approvedBudget`, `budgetLines` | `[C]` | Evita sobregiros a nivel de proyecto. |
| **4** | **Versiones Presupuestarias** | Control de versiones de presupuesto (`ORIGINAL`, `REFORMULADO_V1`). | **Disponible** | `budget_versions` table | `[C]` | Historial de techos presupuestarios. |
| **5** | **Estructura de Partidas (BL)** | Desglose por partidas maestras (BL-01 Talento, BL-02 Infraestructura, etc.). | **Disponible** | `budget_lines` (BL-01 a BL-04) | `[C]` | Monto aprobado, ejecutado y saldo en tiempo real. |
| **6** | **Disponibilidad Presupuestaria** | Verificación en tiempo real de saldo antes de comprometer o aprobar gastos. | **Disponible** | `expenses.service.ts` (`balance >= amount`) | `[C]` | Bloqueo estricto `FOR UPDATE` en PostgreSQL. |
| **7** | **Registro de Gasto en Terreno** | Captura del gasto por el Responsable de Proyecto con imputación a partida. | **Disponible** | `POST /api/expenses` (`status: 'pending'`) | `[C]` | Registra `registeredBy: userId`. |
| **8** | **Documento de Respaldo** | Carga de archivos digitales adjuntos (PDF, imagen) con hash SHA-256. | **Disponible** | `documents` table, `fileUrl` | `[C]` | Descarga y visualización directa. |
| **9** | **Datos del Proveedor** | Registro de Razón Social / Nombre y NIT / Cédula del beneficiario del pago. | **Parcial** | Almacenado en `title` y metadatos del gasto | `[CP]` | Se recomienda formalizar tabla `suppliers` en R2. |
| **10** | **Fecha y Periodo de Elegibilidad**| Validación de que la fecha del gasto esté dentro del periodo del convenio. | **Disponible** | `expenses.date`, `agreements.startDate/endDate` | `[C]` | Verificación de temporalidad de actividades. |
| **11** | **Multimoneda (USD / BOB / EUR)**| Registro del gasto en moneda pactada (USD) y moneda local (BOB). | **Disponible** | `projects.baseCurrency`, `currency.service.ts` | `[C]` | Validación ISO 4217 implementada. |
| **12** | **Tipo de Cambio Oficial** | Tipo de cambio fijo o flotante respaldado según el Banco Central de Bolivia. | **Parcial** | Campo numérico de tasa en metadata | `[CP]` | Requiere tabla histórica de tasas de cambio. |
| **13** | **Factura Fiscal / Recibo Legal** | Clasificación del tipo de comprobante (Factura con Código QR, Recibo con Retención). | **Parcial** | `receipts_vouchers` / metadatos | `[CP]` | Se recomienda formulario de captura detallado. |
| **14** | **Retenciones Tributarias (IUE/IT)**| Cálculo automático de retenciones (Bienes 8%, Servicios 15.5%, Alquileres 16%). | **Brecha** | No implementado en el backend | `[NC]` | **Brecha Funcional P2:** Gestionado externamente. |
| **15** | **Revisión Financiera Previa** | Etapa de revisión documental y técnica por Finanzas antes de someter a Dirección. | **Brecha** | Estado `UNDER_REVIEW` no nativo | `[NC]` | **Brecha Funcional P2:** Finanzas revisa en UI. |
| **16** | **Observación de Comprobante** | Acción explícita para marcar un gasto como "Observado" con comentario técnico. | **Brecha** | Transición `OBSERVED` no disponible | `[NC]` | **Brecha Funcional P2:** Requiere estado en DB. |
| **17** | **Devolución al Responsable** | Retorno del comprobante a terreno para subsanación de facturas o respaldos. | **Brecha** | Transición `RETURNED` no disponible | `[NC]` | **Brecha Funcional P2:** Requiere estado en DB. |
| **18** | **Aprobación Transaccional** | Autorización definitiva del gasto que debita el saldo y eleva el monto ejecutado. | **Disponible** | `PATCH /api/expenses/:id/approve` | `[C]` | Ejecución y débito atómico garantizado. |
| **19** | **Segregación de Funciones (FIN-01)**| Prohibición absoluta de auto-aprobación del creador del gasto. | **Disponible** | `expenses.service.ts` (Regla FIN-01) | `[C]` | Bloqueado a nivel de backend y base de datos. |
| **20** | **Actualización de Ejecución** | Cálculo automático del % ejecutado a nivel de partida y a nivel de proyecto. | **Disponible** | `budgetLines.executedAmount`, `projects.financialProgress` | `[C]` | 100% determinista y en tiempo real. |
| **21** | **Control de Saldo Disponible** | Resta inmediata en la partida impidiendo que gastos concurrentes sobregiren. | **Disponible** | `budgetLines.balance` con `SELECT FOR UPDATE` | `[C]` | Consistencia transaccional ACID en PostgreSQL. |
| **22** | **Rendición de Cuentas al Donante**| Agrupación de comprobantes aprobados para generar informe de liquidación. | **Disponible** | Módulo de Reportes (`GET /api/reports`) | `[C]` | Reporte por partida y periodo. |
| **23** | **Conciliación Bancaria** | Cotejo entre gastos liquidados en la plataforma y extractos de cuenta bancaria. | **Brecha** | No existe módulo de conciliación | `[NC]` | **Brecha Funcional P2:** Realizado en software contable. |
| **24** | **Archivo y Custodia Digital** | Resguardo digital de documentos con política de retención de 5 años para auditoría. | **Disponible** | `documents.metadata` (`5_YEARS_AUDIT`) | `[C]` | Descarga y verificación por hash SHA-256. |
| **25** | **Bitácora Inmutable (AUD-01)** | Registro forense protegido contra modificación o borrado (`prevent_audit_logs_mutation`). | **Disponible** | `audit_logs` con Trigger PostgreSQL | `[C]` | Nadie puede borrar logs de auditoría. |
| **26** | **Cierre Periódico de Cuentas** | Bloqueo de adición o edición de gastos tras el cierre mensual o semestral. | **Parcial** | Cambio de estado de proyecto / versión | `[CP]` | Se recomienda botón de "Cierre de Mes" en R2. |
| **27** | **Reportes Ejecutivos y Gráficos**| Semáforos de avance físico vs financiero y desvíos presupuestarios. | **Disponible** | Dashboard y Ficha de Proyecto | `[C]` | Gráficos SVG/HTML interactivos. |
| **28** | **Exportación a Formatos Estándar**| Descarga de datos consolidados a PDF, CSV o Excel para cruce contable. | **Disponible** | Endpoints de exportación | `[C]` | Descarga de tablas presupuestarias y gastos. |
| **29** | **Controles de Acceso (RBAC)** | Restricción por perfiles: Responsable, Finanzas, Dirección, Auditor, Donante. | **Disponible** | `src/lib/rbac.ts`, `src/middleware/rbac.ts` | `[C]` | Matriz de permisos auditada. |
| **30** | **Alineación Normativa** | Cumplimiento con directrices de elegibilidad de fondos de cooperación internacional. | **Parcial** | Soporte de reglas SoD y trazabilidad | `[CP]` | Sujeto a validación final de VOSERDEM. |

---

## 3. Resumen Ejecutivo de Brechas Funcionales Identificadas (P2)

Las siguientes funciones constituyen **brechas actuales** respecto al flujo operativo ideal de la Administradora y **no deben presentarse como operativas** hasta que se apruebe su desarrollo formal:
1. **Flujo de Observación y Devolución Intermedia:** El software actual pasa de `pending` a `approved` o `rejected`. Las acciones intermedias de *Observar*, *Devolver para subsanación* y *Marcar conformidad previa* deben registrarse como hoja de ruta para la Fase R2.
2. **Cálculo de Retenciones Fiscales (IUE / IT):** No existe un calculador automático de retenciones impositivas bolivianas. El monto ingresado en el sistema es el valor nominal líquido aprobado.
3. **Módulo de Conciliación Bancaria Automática:** PROYECTY registra los gastos y compromisos presupuestarios; la conciliación con las cuentas corrientes bancarias se ejecuta en los libros contables oficiales de la institución.

---

## 4. Firma y Dictamen de la Administradora

* **Nombre de la Administradora:** _____________________________________________
* **Cargo:** Responsable de Administración y Finanzas — VOSERDEM
* **Fecha de Revisión:** ____ / ____ / 2026
* **Dictamen:**  
  [ &nbsp; ] **Aprobado para Demostración Ejecutiva**  
  [ &nbsp; ] **Aprobado con Observaciones Documentadas**  
  [ &nbsp; ] **Requiere Ajustes Previos a la Demostración**  
* **Firma:** _____________________________________________
