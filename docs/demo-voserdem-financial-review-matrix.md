# MATRIZ DE REVISIÓN Y CONTROL FINANCIERO-ADMINISTRATIVO — VOSERDEM
**Documento de Trabajo:** Evaluación Preliminar de Controles Internos, Flujos Financieros y Decisiones Funcionales  
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

| # | Control / Etapa Financiera | Estado en PROYECTY v1.5.1 | Evidencia en Plataforma | Calificación | Decisión VOSERDEM | Prioridad | Comentario de la Administradora |
| :-: | :--- | :--- | :--- | :---: | :--- | :---: | :--- |
| **1** | **Convenio Marco y Donante** | **Disponible** | `agreements` table, endpoint `GET /api/agreements/:id` | `[C]` | Mantener control por convenio | `ALTA` | Validar si se requieren campos adicionales de contraparte local. |
| **2** | **Desembolsos por Hitos** | **Disponible** | `disbursements` table, tramos por fecha y condición | `[C]` | Controlar tramos por hitos | `ALTA` | Vincular tramos a informes técnicos aprobados. |
| **3** | **Presupuesto Maestro** | **Disponible** | `projects.approvedBudget`, validación de techo global | `[C]` | Techo presupuestario estricto | `CRÍTICA` | Bloqueo absoluto de sobregiro a nivel de proyecto. |
| **4** | **Versiones Presupuestarias** | **Disponible** | `budget_versions` table (`DRAFT`, `APPROVED`) | `[C]` | Historial de versiones activo | `MEDIA` | Registrar fecha y resolución de reformulación. |
| **5** | **Estructura de Partidas (BL)** | **Disponible** | `budget_lines` (BL-01 a BL-04) con saldos en vivo | `[C]` | Árbol de partidas aprobado | `CRÍTICA` | Desglose por subcategorías operativas y de consultoría. |
| **6** | **Disponibilidad Presupuestaria**| **Disponible** | `expenses.service.ts` (`balance >= amount` FOR UPDATE) | `[C]` | Validación en tiempo real | `CRÍTICA` | Impide crear o aprobar compromisos sin saldo. |
| **7** | **Registro de Gasto en Terreno**| **Disponible** | `POST /api/expenses` (`status: 'pending'`, `registeredBy`) | `[C]` | Responsable captura en campo | `ALTA` | Registro descentralizado con imputación a partida. |
| **8** | **Documento de Respaldo** | **Disponible** | `documents` table, `fileUrl`, hash SHA-256 | `[C]` | Respaldo digital obligatorio | `CRÍTICA` | Carga de facturas, recibos y planillas en PDF. |
| **9** | **Datos del Proveedor** | **Parcial** | Almacenado en `title` y metadatos del gasto | `[CP]` | Requiere tabla de proveedores | `MEDIA` | Definir si se requiere catálogo maestro de proveedores/NIT. |
| **10** | **Fecha y Periodo de Elegibilidad**| **Disponible**| `expenses.date`, `agreements.startDate/endDate` | `[C]` | Validación de vigencia | `ALTA` | Gastos fuera de fecha son marcados como no elegibles. |
| **11** | **Multimoneda (USD / BOB / EUR)**| **Disponible** | `projects.baseCurrency`, `currency.service.ts` | `[C]` | Registro bimoneda (USD/BOB) | `ALTA` | Manejo de moneda de convenio y moneda de pago. |
| **12** | **Tipo de Cambio Oficial** | **Parcial** | Campo de tasa de cambio en metadatos | `[CP]` | Tipo de cambio BCB | `MEDIA` | Definir si se fija tasa oficial de desembolso o flotante. |
| **13** | **Factura Fiscal / Recibo Legal** | **Parcial** | Metadatos de comprobante y clasificación | `[CP]` | Clasificación fiscal | `ALTA` | Identificar Factura con QR vs Recibo con Retención. |
| **14** | **Retenciones Tributarias (IUE/IT)**| **Brecha** | No implementado cálculo automático en backend | `[NC]` | Liquidar en contabilidad | `MEDIA` | **Brecha P2:** Retenciones se aplican en libros oficiales. |
| **15** | **Revisión Financiera Previa** | **Brecha** | Finanzas revisa visualmente en UI (sin estado DB) | `[NC]` | Incorporar visto bueno | `ALTA` | **Brecha P2:** Finanzas revisa antes de pasar a Dirección. |
| **16** | **Observación de Comprobante** | **Brecha** | Transición `OBSERVED` no disponible en backend | `[NC]` | Habilitar estado Observado | `ALTA` | **Brecha P2:** Permitir retroalimentación técnica al campo. |
| **17** | **Devolución al Responsable** | **Brecha** | Transición `RETURNED` no disponible en backend | `[NC]` | Habilitar estado Devuelto | `MEDIA` | **Brecha P2:** Devolver gastos para corrección de factura. |
| **18** | **Aprobación Transaccional** | **Disponible** | `PATCH /api/expenses/:id/approve` (`status: approved`)| `[C]` | Aprobación por Dirección | `CRÍTICA` | Débito atómico del saldo y actualización de ejecución. |
| **19** | **Segregación de Funciones (FIN-01)**| **Disponible**| `expenses.service.ts` (Auto-aprobación bloqueada) | `[C]` | SoD estricta e inviolable | `CRÍTICA` | El creador del gasto jamás puede auto-aprobarse. |
| **20** | **Actualización de Ejecución** | **Disponible** | `budgetLines.executedAmount`, `projects.financialProgress`| `[C]` | Cálculo automático 100% | `ALTA` | Actualización inmediata en dashboards e informes. |
| **21** | **Control de Saldo Disponible** | **Disponible** | `budgetLines.balance` con `SELECT FOR UPDATE` | `[C]` | Consistencia ACID en PG | `CRÍTICA` | Evita condiciones de carrera y sobregiros. |
| **22** | **Rendición de Cuentas al Donante**| **Disponible**| Módulo de Reportes (`GET /api/reports`) | `[C]` | Reporte por partida y mes | `ALTA` | Generación de cuadros de rendición por donante. |
| **23** | **Conciliación Bancaria** | **Brecha** | No existe módulo de conciliación en plataforma | `[NC]` | Conciliación en bancos | `MEDIA` | **Brecha P2:** Cotejo con extractos en sistema contable. |
| **24** | **Archivo y Custodia Digital** | **Disponible** | `documents.metadata` (`5_YEARS_AUDIT`, SHA-256) | `[C]` | Custodia digital auditada | `ALTA` | Descarga de expedientes con hash verificado. |
| **25** | **Bitácora Inmutable (AUD-01)** | **Disponible** | `audit_logs` con Trigger PostgreSQL | `[C]` | Auditoría inalterable | `CRÍTICA` | Prohibición de UPDATE/DELETE a nivel de motor DB. |
| **26** | **Cierre Periódico de Cuentas** | **Parcial** | Bloqueo por cambio de estado de proyecto/versión | `[CP]` | Cierre mensual de gastos | `ALTA` | Definir si se requiere botón de "Cerrar Mes Contable". |
| **27** | **Reportes Ejecutivos y Gráficos**| **Disponible** | Dashboard y Ficha de Proyecto en tiempo real | `[C]` | Semáforo físico-financiero| `ALTA` | Detección visual de desvíos en presupuesto. |
| **28** | **Exportación a Formatos Estándar**| **Disponible**| Descarga en CSV / PDF estructurado | `[C]` | Exportación a Excel/CSV | `ALTA` | Facilita migración a libros contables oficiales. |
| **29** | **Controles de Acceso (RBAC)** | **Disponible** | `src/lib/rbac.ts`, `src/middleware/rbac.ts` | `[C]` | Perfiles diferenciados | `CRÍTICA` | Aislamiento entre Responsable, Finanzas y Dirección. |
| **30** | **Alineación Normativa Donantes** | **Parcial** | Soporte de trazabilidad y elegibilidad de gastos | `[CP]` | Cumplimiento donantes | `ALTA` | Adecuación a guías financieras de USAID/AECID/UE. |

---

## 3. Diez Preguntas Estratégicas para la Sesión con la Administradora

1. **¿Finanzas revisa o aprueba definitivamente?**  
   *Opciones:* (A) Finanzas emite visto bueno previo y Dirección aprueba; (B) Finanzas aprueba gastos operativos y Dirección aprueba inversiones mayores a $X USD.
2. **¿El Coordinador / Manager puede aprobar gastos menores?**  
   *Opciones:* (A) No, toda aprobación es de Finanzas/Dirección; (B) Sí, gastos de caja chica o viáticos hasta $500 USD.
3. **¿El Responsable de Proyecto puede modificar partidas o presupuesto?**  
   *Opciones:* (A) No, solo solicita reformulación; (B) Sí, puede reasignar entre subpartidas del mismo rubro.
4. **¿Quién tiene la facultad de autorizar reformulaciones presupuestarias?**  
   *Opciones:* (A) Exclusivamente la Dirección Ejecutiva con carta de no objeción del donante; (B) Finanzas y Dirección conjuntamente.
5. **¿Es indispensable incorporar formalmente en el sistema los estados `OBSERVADO`, `DEVUELTO` y `CONFORME`?**  
   *Opciones:* (A) Sí, es crítico para la trazabilidad antes de aprobar; (B) No, la coordinación interna se realiza por comentarios/mensajería.
6. **¿Cuáles respaldos digitales son obligatorios por cada tipo de gasto?**  
   *Opciones:* Factura fiscal con QR, orden de compra, cuadro comparativo (compras > $1,000 USD), informe técnico de recepción y recibo de pago.
7. **¿Qué esquema de retenciones tributarias bolivianas debe considerarse para los reportes de rendición?**  
   *Opciones:* (A) Servicios 15.5% (IUE 12.5% + IT 3%), Bienes 8% (IUE 5% + IT 3%), Alquileres 16% (RC-IVA 13% + IT 3%); (B) No aplicar retenciones en plataforma (solo montos netos pagados).
8. **¿Cómo se realiza el proceso de conciliación bancaria y liquidación de anticipos?**  
   *Opciones:* (A) Conciliación manual mensual con extractos bancarios oficiales; (B) Importación de extractos bancarios en formato CSV/Excel.
9. **¿Qué formato de exportación requiere el área contable para su integración con el software de contabilidad?**  
   *Opciones:* (A) CSV con plan de cuentas y centros de costo; (B) Excel con detalle de comprobantes, NIT, proveedor y partida.
10. **¿Cuáles son los formatos y periodicidades de reporte exigidos por cada donante activo?**  
    *Opciones:* Informes trimestrales de ejecución por partida (USAID), semestrales de justificación de gastos (AECID) y anuales consolidados.

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
