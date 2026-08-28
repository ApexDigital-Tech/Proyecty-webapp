# GUION OPERATIVO Y RUNBOOK DE PRESENTACIÓN EJECUTIVA — VOSERDEM
**Plataforma:** PROYECTY v1.5.1  
**Escenario Demostrativo:** `PRJ-DEMO-2026` — *Proyecto Piloto de Fortalecimiento Comunitario, Agua y Sostenibilidad*  
**Organización Demostrativa:** `VOSERDEM — Entorno demostrativo`  
**Duración Total Estimada:** 25 minutos (+ 10 minutos de Q&A)

---

## 1. Perfil de la Audiencia y Objetivos de Negocio
* **Audiencia Objetivo:** Dirección Ejecutiva, Coordinación de Programas, Responsables de Finanzas y Oficiales de Cooperación Internacional de VOSERDEM.
* **Propósito Principal:** Acreditar que PROYECTY resuelve el descontrol operativo y la fricción en rendición de cuentas ante donantes (USAID, AECID, etc.) mediante integridad físico-financiera, segregación de funciones y auditoría inmutable.
* **Resultado Deseado:** Aprobación de la puesta en marcha de un piloto controlado de 30 días.

---

## 2. Preparación Técnica Previa (T-30 minutos)
1. **Verificación de Entorno Local / Staging:**
   * Ejecutar en terminal: `npx tsx scripts/demo-preflight.ts`
   * Confirmar que todas las comprobaciones marquen `✅ [PASS]` y el resultado sea `GO`.
2. **Reinicio al Estado Base:**
   * Ejecutar: `npx tsx scripts/demo-reset.ts` o presionar `Reiniciar Datos Demo` desde `/internal-demo`.
3. **Navegador Limpio:**
   * Abrir ventana única de Google Chrome / Edge sin pestañas personales ni notificaciones activas.
   * Navegar a `/internal-demo`. Zoom al 100%.

---

## 3. Guion Ejecutivo Paso a Paso (25 Minutos)

### Paso 1: Apertura y Control de Identidad Segura (Min 00:00 – 03:00)
* **Pantalla:** `/internal-demo` (Portal de Simulación Interna RBAC).
* **Acción:** Mostrar el catálogo de las 6 identidades institucionales pre-configuradas.
* **Discurso Clave:**
  > *"Buenos días. Hoy veremos cómo PROYECTY centraliza la gestión integral de convenios y proyectos sociales. En organizaciones con múltiples fuentes de financiamiento, la seguridad y la segregación de roles son fundamentales. Aquí tenemos los perfiles clave de VOSERDEM: desde la Dirección General hasta los Auditores Externos y Oficiales de Cooperación."*
* **Acción en vivo:** Hacer clic en **`Director Demo VOSERDEM`** (`DIRECTOR`).

---

### Paso 2: Visión Ejecutiva y Portafolio Consolidado (Min 03:00 – 07:00)
* **Pantalla:** Dashboard Principal y Portafolio.
* **Elemento a mostrar:** Semáforo de proyectos, KPIs de presupuesto global ($150,000 USD), ejecución financiera agregada (38%) y avance físico consolidado (75%).
* **Discurso Clave:**
  > *"Como Director, al ingresar a la plataforma obtengo una radiografía inmediata de todos los convenios activos. No requiero solicitar consolidaciones en Excel ni esperar al cierre de mes. La plataforma detecta automáticamente desvíos entre lo que se gasta y lo que realmente avanza en terreno."*
* **Acción en vivo:** Seleccionar el proyecto **`PRJ-DEMO-2026`** en el portafolio.

---

### Paso 3: Ficha del Proyecto, Convenio y Presupuesto por Partidas (Min 07:00 – 12:00)
* **Pantalla:** Ficha del Proyecto (`PRJ-DEMO-2026`), pestañas **Convenio**, **Presupuesto** y **Cronograma (Gantt)**.
* **Elemento a mostrar:**
  * Pestaña *Convenio:* $150,000 USD donados por la Agencia Internacional de Cooperación, desembolso inicial de $60,000 USD (40%), plazo de 12 meses.
  * Pestaña *Presupuesto:* Desglose de las 4 partidas maestras (`BL-01 Talento Humano`, `BL-02 Infraestructura y Equipamiento`, `BL-03 Capacitación`, `BL-04 Monitoreo y Auditoría`).
  * Pestaña *Cronograma:* Tareas con dependencias y pesos porcentuales (Diagnóstico 100%, Instalación 50%).
* **Discurso Clave:**
  > *"Aquí observamos el corazón técnico del proyecto. Cada partida presupuestaria tiene su saldo exacto en tiempo real. Por ejemplo, en la partida BL-02 de Infraestructura, tenemos un presupuesto aprobado de $50,000 USD, de los cuales se han ejecutado $21,500 USD, restando un saldo disponible de $28,500 USD."*

---

### Paso 4: Operación de Terreno y Solicitud de Gasto (Min 12:00 – 16:00)
* **Pantalla:** Cambio de sesión a **`Coordinador Demo VOSERDEM`** (`MANAGER`).
* **Acción:**
  * Cerrar sesión o cambiar de rol en `/internal-demo` a Coordinador.
  * Navegar a la pestaña **Comprobantes / Gastos** del proyecto.
  * Mostrar el gasto pendiente: *“Adquisición de Lote 2 — Sistemas de Filtración Comunitarios”* por **$6,000.00 USD** imputado a `BL-02`.
  * Abrir el gestor documental para ver el comprobante adjunto ficticio (`comprobante_filtracion_demo.pdf`).
* **Discurso Clave:**
  > *"El equipo de terreno registra las adquisiciones directamente con su respaldo digital. Mientras este gasto de $6,000 USD no sea formalmente aprobado por la autoridad competente, permanece en estado 'Pendiente' y el saldo de la partida BL-02 no se ve alterado indebidamente."*

---

### Paso 5: Aprobación Transaccional y Consistencia Financiera (Min 16:00 – 20:00)
* **Pantalla:** Cambio de sesión a **`Director Demo VOSERDEM`** (`DIRECTOR`), bandeja **Aprobación de Gastos**.
* **Acción:**
  * Ingresar a la bandeja de aprobaciones.
  * Demostrar la regla de Segregación de Funciones: el Coordinador que creó el gasto no puede auto-aprobarse.
  * Como Director, revisar partida disponible ($28,500 USD disponibles > $6,000 USD solicitados) y hacer clic en **`Aprobar Gasto`**.
  * Volver a la pestaña **Presupuesto**: comprobar que en vivo `BL-02` pasa a **$27,500.00 USD ejecutados** (55%) y saldo de **$22,500.00 USD**, elevando la ejecución global al **42% ($63,000.00 USD)**.
* **Discurso Clave:**
  > *"La aprobación es transaccional y atómica en la base de datos: el gasto se aprueba, la partida presupuestaria se actualiza y el saldo se descuenta inmediatamente, evitando sobre-ejecución presupuestaria o duplicidades."*

---

### Paso 6: Transparencia y Auditoría Forense Inmutable (Min 20:00 – 24:00)
* **Pantalla:** Cambio de sesión a **`Auditor Demo VOSERDEM`** (`AUDITOR`), módulo **Bitácora / Auditoría**.
* **Elemento a mostrar:**
  * Desaparición de botones de edición/creación en la UI (Modo Solo Lectura estricto por RBAC).
  * Registro inmediato del evento `EXPENSE_APPROVED` en la bitácora con actor (`Director Demo VOSERDEM`), timestamp exacto, IP y estado anterior/posterior.
* **Discurso Clave:**
  > *"Cuando un auditor de USAID o una firma externa audita a VOSERDEM, tiene acceso a una bitácora inmutable protegida en PostgreSQL. Nadie, ni siquiera el administrador de la plataforma, puede alterar o borrar retroactivamente los registros de aprobación."*

---

### Paso 7: Reportes Ejecutivos y Propuesta de Cierre (Min 24:00 – 28:00)
* **Pantalla:** Módulo **Reportes**.
* **Acción:** Visualizar el informe consolidado del proyecto listo para ser exportado a PDF o Excel para el donante.
* **Discurso de Cierre Comercial:**
  > *"PROYECTY transforma semanas de conciliación manual en un proceso transparente de segundos. Lo que acabamos de ver puede implementarse en VOSERDEM en un piloto asistido de 30 días para 2 proyectos estratégicos. ¿Les gustaría que definamos el cronograma de inicio?"*

---

## 4. Matriz de Contingencias Operativas

| Imprevisto | Causa Posible | Protocolo de Acción Inmediata |
| :--- | :--- | :--- |
| **Gasto ya aprobado por error antes de tiempo** | Prueba previa no reiniciada | Abrir pestaña auxiliar, ejecutar `POST /api/auth/demo-reset` o presionar botón de reseteo. Tarda 1.5 segundos. |
| **Corte de red o lentitud externa** | Falla de conexión a Internet | El entorno demo opera 100% sobre base de datos local y tokens JWT autónomos; no se interrumpe la navegación. |
| **Duda sobre permisos de un rol específico** | Pregunta del cliente | Cambiar en vivo a `Responsable Proyecto Demo` o `Financiador Demo` para exhibir restricciones específicas de lectura. |
| **Pregunta sobre IA en reportes** | Interés técnico del cliente | Mencionar que el asistente de análisis narrativo es un complemento sobre los datos estructurados, garantizando que los números son 100% deterministas. |

---

## 5. Checklist Go / No-Go para la Reunión
* [ ] Preflight ejecutado con resultado `GO`.
* [ ] Base de datos reseteada al estado inicial ($57k ejecutados, 1 gasto pendiente de $6k).
* [ ] Navegador limpio sin historial visible en la barra de direcciones.
* [ ] Notificaciones del sistema operativo en modo 'No Molestar'.
* [ ] Micrófono y audio verificados.
