# GUION OPERATIVO Y RUNBOOK DE PRESENTACIÓN EJECUTIVA — VOSERDEM (FINANCE-FIRST)
**Plataforma:** PROYECTY v1.5.1  
**Escenarios Demostrativos:**  
* **Proyecto A (Principal):** `PRJ-DEMO-2026` — *Fortalecimiento Comunitario, Agua y Sostenibilidad* (USD 150.000)  
* **Proyecto B (Aislamiento):** `PRJ-DEMO-2026-B` — *Capacitación y Fortalecimiento Productivo Comunitario* (USD 45.000)  
**Organización Demostrativa:** `VOSERDEM — Entorno demostrativo`  
**Enfoque Prioritario:** Revisión Financiera de la Administradora e Independencia Operativa de Proyectos  
**Duración Total Estimada:** 25 minutos (+ 10 minutos de Q&A)

---

## 1. Perfil de la Audiencia y Objetivos de Negocio
* **Audiencia Objetivo:** Administradora General de VOSERDEM, Dirección Ejecutiva, Coordinadores de Proyecto y Responsables de Finanzas.
* **Propósito Principal:** Acreditar que PROYECTY garantiza independencia estricta entre múltiples proyectos y convenios de cooperación internacional, y proporciona a la Administradora visibilidad en tiempo real de techos presupuestarios, elegibilidad de gastos, trazabilidad documental y segregación de funciones.
* **Resultado Deseado:** Aprobación del piloto controlado de 30 días para 2 proyectos estratégicos de VOSERDEM.

---

## 2. Preparación Técnica Previa (T-30 minutos)
1. **Verificación de Entorno Local / Staging:**
   * Ejecutar en terminal: `npx tsx scripts/demo-preflight.ts`
   * Confirmar que todas las comprobaciones marquen `✅ [PASS]` y el resultado sea `GO`.
2. **Reinicio al Estado Base:**
   * Ejecutar: `npx tsx scripts/demo-reset.ts` o presionar `Reiniciar Datos Demo` desde `/internal-demo`.
3. **Navegador Limpio:**
   * Ventana única sin pestañas personales ni notificaciones activas.
   * Navegar a `/internal-demo`. Zoom al 100%.

---

## 3. Guion Ejecutivo Paso a Paso (25 Minutos)

### Paso 1: Apertura y Control de Identidad Segura (Min 00:00 – 03:00)
* **Pantalla:** `/internal-demo` (Portal de Simulación Interna RBAC).
* **Acción:** Mostrar el catálogo de las 6 identidades institucionales pre-configuradas.
* **Discurso Clave:**
  > *"Buenos días. Hoy veremos cómo PROYECTY centraliza la administración financiera y operativa de VOSERDEM. Aquí tenemos los perfiles clave de la institución: Dirección, Coordinación, Administración/Finanzas, Responsable de Proyecto, Donante y Auditoría Externa."*
* **Acción en vivo:** Hacer clic en **`Director Demo VOSERDEM`** (`DIRECTOR`).

---

### Paso 2: Portafolio Multi-Proyecto e Independencia de Convenios (Min 03:00 – 06:00)
* **Pantalla:** Dashboard Principal y Portafolio (`/projects`).
* **Elemento a mostrar:**
  * **Proyecto A (`PRJ-DEMO-2026`):** Presupuesto $150k USD, Ejecución financiera 38%, Avance físico 75%, Donante: Agencia Internacional de Cooperación.
  * **Proyecto B (`PRJ-DEMO-2026-B`):** Presupuesto $45k USD, Ejecución 0%, Estado Planificación, Donante: Fondo de Desarrollo Sostenible.
* **Discurso Clave:**
  > *"Como Dirección, visualizamos el portafolio consolidado. Cada proyecto opera como una unidad financiera completamente independiente: sus convenios, partidas, fondos y documentos no se mezclan entre sí."*

---

### Paso 3: Aislamiento Operativo del Responsable de Proyecto (Min 06:00 – 09:00)
* **Pantalla:** Cambio de sesión a **`Responsable Proyecto Demo VOSERDEM`** (`RESPONSABLE_PROYECTO`).
* **Acción:**
  * Ingresar al Portafolio: Observar que **únicamente aparece el Proyecto A** asignado a su cargo. El Proyecto B no es visible ni accesible.
  * Ingresar a la Ficha de Proyecto A: Ver tareas bajo su responsabilidad y cronograma de actividades.
* **Discurso Clave:**
  > *"El Responsable de Proyecto solo tiene visibilidad sobre los convenios en los que ha sido designado. No puede ver datos financieros de otros proyectos ni editar presupuestos maestros."*

---

### Paso 4: Registro de Gasto en Terreno con Respaldo Digital (Min 09:00 – 12:00)
* **Pantalla:** Pestaña **Comprobantes / Gastos** de Proyecto A (Sesión Responsable).
* **Acción:**
  * Mostrar el gasto registrado: *“Adquisición de Lote 2 — Sistemas de Filtración Comunitarios”* por **$6,000.00 USD** imputado a `BL-02`.
  * Mostrar el comprobante digital adjunto (`comprobante_filtracion_demo.pdf`) con su hash de integridad SHA-256.
  * Comprobar que el Responsable no tiene botón de "Aprobar Gasto" (cumplimiento de segregación SoD).
* **Discurso Clave:**
  > *"El equipo técnico en terreno captura el gasto adjuntando la factura o comprobante. Mientras no sea procesado, queda en estado 'Pendiente' y el saldo de la partida no se altera."*

---

### Paso 5: Revisión de la Administradora (Finanzas) (Min 12:00 – 16:00)
* **Pantalla:** Cambio de sesión a **`Finanzas Demo VOSERDEM`** (`FINANCE`).
* **Acción:**
  * Ingresar a la Ficha del Proyecto A, pestaña **Presupuesto**.
  * Revisar partida `BL-02 Infraestructura`: Presupuesto aprobado $50,000 USD, ejecutado actual $21,500 USD, saldo disponible $28,500 USD.
  * Validar que el gasto pendiente de $6,000 USD cuenta con saldo suficiente ($28,500 > $6,000), corresponde al periodo del convenio y tiene respaldo documental íntegro.
* **Discurso Clave:**
  > *"Aquí la Administradora ejerce el control previo: valida disponibilidad presupuestaria, elegibilidad del concepto y consistencia documental antes de que la Dirección emita la autorización final."*

---

### Paso 6: Aprobación Transaccional y Consistencia en Tiempo Real (Min 16:00 – 20:00)
* **Pantalla:** Cambio de sesión a **`Director Demo VOSERDEM`** (`DIRECTOR`), bandeja **Aprobaciones**.
* **Acción:**
  * Hacer clic en **`Aprobar Gasto`** para la solicitud de $6,000 USD.
  * Volver inmediatamente a la pestaña **Presupuesto**: Comprobar que en vivo `BL-02` pasa a **$27,500.00 USD ejecutados** (55%) y saldo de **$22,500.00 USD**, elevando la ejecución global del proyecto al **42% ($63,000.00 USD)**.
  * Navegar al **Proyecto B**: Verificar que el Proyecto B permanece intacto al 0% y con saldo de $45,000 USD (independencia garantizada).
* **Discurso Clave:**
  > *"La transacción es atómica en la base de datos: el gasto se aprueba, la partida se actualiza y el saldo se descuenta inmediatamente, sin riesgo de sobregiro ni afectación a otros convenios."*

---

### Paso 7: Auditoría Forense y Modo Consulta del Financiador (Min 20:00 – 24:00)
* **Pantalla:**
  1. Sesión **`Auditor Demo VOSERDEM`** (`AUDITOR`): Mostrar módulo **Bitácora / Auditoría** con el evento inmutable `EXPENSE_APPROVED` (actor, IP, timestamp y montos).
  2. Sesión **`Financiador Demo`** (`FINANCIADOR`): Mostrar módulo **Reportes** en modo solo lectura para exportación ejecutiva.
* **Discurso Clave:**
  > *"Cualquier auditor externo o donante internacional puede verificar la bitácora inmutable en PostgreSQL. Nadie puede alterar los registros históricos ni borrar aprobaciones pasadas."*

---

### Paso 8: Cierre Ejecutivo y Propuesta de Piloto (Min 24:00 – 28:00)
* **Discurso de Cierre Comercial:**
  > *"PROYECTY brinda a VOSERDEM control total sobre cada centavo de cooperación internacional. Proponemos iniciar un piloto de 30 días para 2 proyectos activos de la institución con acompañamiento técnico directo."*

---

## 4. Matriz de Contingencias Operativas

| Imprevisto | Protocolo de Acción Inmediata |
| :--- | :--- |
| **Gasto aprobado por error antes del guion** | Abrir `/internal-demo`, hacer clic en `Reiniciar Datos Demo` (1.2 s) y continuar. |
| **Pregunta sobre retenciones fiscales (IUE/IT)** | Explicar que PROYECTY gestiona el control presupuestario líquido de convenios y que el cálculo tributario específico se concilia con la matriz administrativa de VOSERDEM. |
| **Pregunta sobre conciliación bancaria** | Indicar que la plataforma audita los compromisos y gastos de proyecto, integrándose con los extractos bancarios de la administración. |
