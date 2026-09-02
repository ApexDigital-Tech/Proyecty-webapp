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

## DICTAMEN DE AUDITORÍA: FIN-ABUELITAS-V2
FIN-ABUELITAS-V2 rechazado. El servidor no inició debido a una inconsistencia estructural en la migración financiera. La prueba E2E no pudo ejecutarse. No se modificó producción. Se recomienda congelar el backend actual y reconstruir el núcleo relacional y financiero sobre un esquema PostgreSQL canónico, migraciones versionadas y pruebas reproducibles.

---

## E. Fase 2: Estabilización PMV y Despliegue Render (CERTIFICADO)

1. **Persistencia de Navegación (Fix: Regreso involuntario a Inicio):**
   - En `src/App.tsx`, se desacopló la renovación pasiva de tokens (`TOKEN_REFRESHED` de Supabase) del reseteo de navegación.
   - `handleLoginSuccess` ahora recibe `resetNavigation: boolean = false`. Solo los inicios de sesión explícitos desde la UI resetean a `dashboard`.
   - Se implementó persistencia en `sessionStorage` para `currentTab` y `selectedProjectId`. El usuario puede trabajar sin ser expulsado de sus pestañas/proyectos.

2. **Acceso Local y Vite Dev Server:**
   - En `server.ts`, se ajustó la condición de desarrollo (`process.env.NODE_ENV !== 'production' && process.env.NODE_ENV !== 'test'`) para que `npm run dev` active automáticamente el middleware Vite en vivo, resolviendo variables reales de `.env` y eliminando el fallo por host simulado de test (`127.0.0.1:54321`).
   - Se recompiló `dist/` con credenciales de producción para Render.

3. **Arquitectura de Despliegue (Render Web Service):**
   - El despliegue de producción se gestiona a través de Render (`render.yaml`).
   - Comando de compilación: `npm install --legacy-peer-deps && npm run build`.
   - Comando de arranque: `npm start` (`node dist/server.js`).

4. **Resolución de Error 500 en Detalle de Proyectos (`/api/projects/:id`):**
   - Causa raíz: En `src/db/schema.ts`, se habían declarado columnas (`budgetPlanId` en `budget_versions`, y `description`, `unit`, `quantity`, `unitCost`, `currency` en `budget_lines`) que no existían físicamente en la base de datos PostgreSQL de producción. Esto provocaba que cualquier consulta relacional en `getProjectById` fallara con código de error PostgreSQL `42703 (undefined column)`.
   - Solución: Se alinearon estrictamente las definiciones de `budgetVersions` y `budgetLines` con el esquema canónico de la base de datos.
   - Verificación automatizada: Endpoint probado exitosamente vía HTTP local contra la base de datos real, devolviendo `200 OK` con datos completos de partidas, versiones y documentos para el proyecto 216.

