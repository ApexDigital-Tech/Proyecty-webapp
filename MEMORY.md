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

Decisiones Arquitectónicas y de Cumplimiento Clave:
1. **Ventana Canónica Demostrativa de Auditoría**: Exposición controlada y determinista de eventos para el tenant demo tras reset (`ENABLE_INTERNAL_DEMO=true`), preservando la bitácora íntegra estándar para el resto de tenants.
2. **Inmutabilidad y Gobierno Documental (`DOCUMENT_IMMUTABLE_COMPLIANCE_RECORD`)**: Prohibición estricta de borrado físico o envío a papelera de comprobantes financieros y expedientes protegidos, respondiendo HTTP 423 a nivel de backend.
3. **Descargas Autenticadas Client-Side (Blob Fetch)**: Flujo de descarga seguro que no expone JWTs en URLs ni query parameters, preservando integridad y validando Content-Type `application/pdf`.
4. **Segregación de Alcance de Financiador**: Filtrado estricto por membresía (`projectMembers`) y `donorId` a nivel de base de datos en Dashboard, Portafolio y detalle de proyectos.

Resultados de Verificación:
- Pipeline automatizado: PASS.
- Integración: 10/10 suites (256/256 tests) PASS.
- E2E Playwright: 15/15 PASS.
- Suite de Remediación Directa: 25/25 PASS.
- Lockfile: INALTERADO.
- Working tree: LIMPIO.
- Producción modificada: NO.
- Push: NO.
- Merge: NO.
- Despliegue: NO.

Estado de Validación y Handoff:
- Auditoría Directa y Comprobación Visual de Dirección: CERTIFICADA.
- Entorno Temporal Cloudflare: CERRADO (PID 14104 terminado).
- Handoff a Pruebas de Campo con VOSERDEM: LISTO.
- Autorización comercial definitiva: PENDIENTE DE DIRECCIÓN.
