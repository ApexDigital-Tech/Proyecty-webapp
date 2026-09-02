# Cierre técnico — Plan de Gastos “Las Abuelitas de VOSERDEM”

## Resultado exigible

El presupuesto adjunto se incorporó como plantilla institucional importable, con **11 partidas** y un total controlado de **Bs 333.400**. La importación conserva código, categoría, subcategoría, descripción, unidad, cantidad, precio unitario, monto y moneda.

El circuito implementado es:

1. Dirección crea el proyecto en BOB, sin una partida presupuestaria ficticia.
2. Administración o Finanzas descarga y carga el CSV del plan.
3. El sistema valida estructura, duplicados, operaciones aritméticas y total.
4. La importación crea una versión **BORRADOR**; no altera todavía el presupuesto aprobado.
5. Dirección revisa las observaciones del clasificador y aprueba la versión.
6. Recién entonces las partidas quedan activas y el presupuesto del proyecto pasa a **Bs 333.400**.

## Observaciones que no deben ocultarse

El PDF utiliza los códigos `21400`, `31110`, `39500` y `43500` en conceptos cuya correspondencia con el clasificador institucional debe ser confirmada. El sistema los conserva fielmente, muestra cuatro advertencias y exige que Dirección las reconozca antes de aprobar. No se altera evidencia fuente ni se presentan esos códigos como oficialmente confirmados.

## Criterios mínimos de aceptación

- Creación del proyecto sin error de columna `donors.code`.
- Importación de 11 de 11 partidas.
- Total exacto: Bs 333.400.
- Moneda visible: BOB/Bs.
- Cantidad y precio unitario visibles por partida.
- Importación en borrador y aprobación segregada por Dirección.
- Rechazo de archivos duplicados por huella SHA-256.
- Persistencia después de reiniciar el servidor.
- Cero conexiones o cambios en producción.

## Alcance profesional honesto

Esta entrega consolida **gestión financiera institucional de proyectos**: plan de gastos, versiones, partidas, ejecución, comprobantes y aprobación. No constituye contabilidad empresarial de doble partida, libro mayor, impuestos, conciliación bancaria ni estados financieros contables.
