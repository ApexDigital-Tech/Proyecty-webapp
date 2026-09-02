# MEMORIA DE PROYECTO â€” PROYECTY / FINANCIERO (FIN-CORE-03)

## A. DecisiÃ³n de Producto

PROYECTY serÃ¡ una plataforma de planificaciÃ³n, administraciÃ³n, ejecuciÃ³n y rendiciÃ³n financiera de proyectos sociales.

**Incluye**:
- Financiadores
- Convenios
- Desembolsos
- Planes anuales/semestrales
- ImportaciÃ³n de planes
- ImportaciÃ³n histÃ³rica
- Partidas
- Gastos
- Comprobantes
- AprobaciÃ³n
- Reportes
- Exportaciones
- AuditorÃ­a
- Interoperabilidad contable

**No incluye**:
- Libro diario
- Libro mayor
- Impuestos
- ConciliaciÃ³n bancaria
- Activos fijos
- Contabilidad empresarial completa

---

## B. CertificaciÃ³n FIN-CORE-03

- FIN-CORE-03: CERTIFICADO Y CERRADO.
- Circuito financiero humano: PASS.
- Pipeline integral: PASS.
- IntegraciÃ³n: 9/9.
- Playwright: 16/16.
- MigraciÃ³n reproducible desde base vacÃ­a: PASS.
- HTTP estÃ¡tico y assets 404: PASS.
- Working tree previo: limpio.
- ProducciÃ³n: NO DESPLEGADA.
- Push y merge: NO EJECUTADOS.

**Valores certificados**:
- Gasto #228: approved.
- BL-02 ejecutado: USD 26.920.
- BL-02 pendiente: USD 6.000.
- BL-02 saldo: USD 23.080.
- Proyecto ejecutado: USD 62.420.
- Avance financiero: 41,61%.

---

## C. Incidente HistÃ³rico

Durante una ejecuciÃ³n desviada, infraestructura remota fue alcanzada y
recibiÃ³ operaciones tÃ©cnicas de inicializaciÃ³n. El incidente fue contenido;
el cÃ³digo fue restaurado y la certificaciÃ³n posterior se ejecutÃ³ Ã­ntegramente
en infraestructura local. Su revisiÃ³n remota queda como tarea independiente
antes de cualquier despliegue.

## D. Tareas Pendientes Próxima Sesión (Integración Abuelitas V2)
1. Localizar y extraer el archivo PROYECTY-CORREGIDO-ABUELITAS-V2.zip (verificar su existencia en Descargas).
2. Integrar **exclusivamente** 3 archivos de la V2: server.ts, src/db/migrations/financial-plan-import.ts, y drizzle/0002_financial_plan_import.sql.
3. Compilar el proyecto (
pm run build) y arrancar el servidor en la base aislada proyecty_abuelitas_test.
4. Implementar el recorrido de importación y aprobación mediante un script de **Playwright** (	ests/abuelitas-e2e.spec.ts), utilizando page.locator('input[type="file"]').setInputFiles(...) para sortear la limitación del agente con el cuadro de diálogo nativo del OS.
5. Ejecutar la prueba automatizada completa (proyecto, importación CSV, revisión de partidas, registro y aprobación de gastos).
6. Verificar persistencia de base de datos tras reinicio y presentar evidencias (SQL de 11 partidas = Bs 333,400, git status, hash commit).

## DICTAMEN DE AUDITORÃA: FIN-ABUELITAS-V2
FIN-ABUELITAS-V2 rechazado. El servidor no iniciÃ³ debido a una inconsistencia estructural en la migraciÃ³n financiera. La prueba E2E no pudo ejecutarse. No se modificÃ³ producciÃ³n. Se recomienda congelar el backend actual y reconstruir el nÃºcleo relacional y financiero sobre un esquema PostgreSQL canÃ³nico, migraciones versionadas y pruebas reproducibles.

