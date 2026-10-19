# Banco de pruebas (sin Node)

Corre el código REAL de `src/` en el navegador (Microsoft Edge), con una base de datos en memoria y "simulacros" de lo que no se puede cargar
(Prisma, `next/*`, la sesión). Sirve para probar acciones del servidor y pantallas de React 19 sin instalar nada.

## Cómo usarlo

1. Levantar el servidor local (solo lectura, solo esta computadora, puerto 8768):

       powershell -NoProfile -ExecutionPolicy Bypass -File pruebas\banco\servir.ps1 -dir pruebas\banco -proyecto .

2. Abrir `http://localhost:8768/banco.html?p=NOMBRE` (corre `pruebas/banco/NOMBRE.js`). Al final dice `aciertos: N · fallas: M`.

3. Antes de entregar, correr también `pruebas\verificar-sintaxis.ps1` y `pruebas\verificar-tipos.ps1`.

## Las pruebas

| Archivo | Qué prueba (con la función REAL) |
| --- | --- |
| `venta-logica` | `registrarVenta` y `cerrarTurno` del POS: totales, IVA, descuentos, pagos, factura, stock, turno cerrado en pleno cobro; 3.000 carritos al azar |
| `cancelacion-logica` | `cancelarVenta` y `cancelarFactura`: stock devuelto una sola vez, doble cancelación, turno cerrado, una sola cancelación a la DNIT |
| `cobro-credito-logica` | `registrarCobroVenta`: dos cobros a la vez no pasan de lo adeudado ni duplican el ingreso a caja |
| `login-logica` | `verificarIngreso`: el freno por intentos aguanta una ráfaga de pedidos simultáneos |
| `sesion-logica` | cookie de sesión atada a la contraseña (cambiarla cierra las demás sesiones) y el middleware de Edge |
| `enlace-personal-logica` | enlace firmado `/personal/<id>-<firma>` y sus acciones públicas |
| `ajustes-ui` | formularios y botones de Ajustes con React 19 real: error / corte de internet no pierden lo escrito ni dejan botones trabados |
| `asistencia-logica` | tardanza (turno noche), días/faltas/ausencias, salario ÷ 30 y jornal, turnos: miles de casos al azar que cierran al guaraní |
| `agenda-cobro-logica` | `cobrarCita`: cobrar menos que el precio de lista (descuento o precio bajado a mano) pide la contraseña de Seguridad |
| `canchas-guardar-logica` | `guardarReservaCancha`: un precio menor que la tarifa pide la contraseña de Seguridad; las reservas que no se tocan no |
| `analista-ventas-logica` | Ideas (analista comercial): lee las ventas de todos los puntos (mostrador, comedor, delivery, turnos y canchas), no cuenta canceladas ni envíos, la leyenda «qué analiza» coincide con las ideas que se pueden emitir, y la ganancia con costos solo en algunos productos (cobertura, ranking, lista de los que faltan costear) |
| `suscripcion-logica` | Vencimiento y suspensión: activar = 31 días justos (800 activaciones al azar), renovaciones, Registrar pago, Suspender/Reactivar con bitácora, y qué impide vender (solo «suspendido»; «vencido» no) |
| `historial-estacion-logica` | Historial de cuentas por estación (caja): el filtro y la columna «Estación» del Excel con la ruta real; con una sola caja la planilla queda igual |
| `clave-simple-logica` | Contraseña del dueño, administrador y cajero (5 caracteres de cualquier tipo; el superadmin sigue con 8 + letras y números) y exigirAutorizacion: si dos personas comparten contraseña no se autoriza a ninguna y la Bitácora avisa quiénes son; y en Mi cuenta / Usuarios, una contraseña que ya existe en el local se rechaza («Esa contraseña ya existe») con un freno de 5 pruebas en 10 minutos |
| `delivery-retiro-logica` | Un pedido del menú para retirar que pasa por una cuenta de delivery: la venta se guarda como «llevar» («Retiro · Cuenta N»), el Historial lo lista como Retiro, y los reportes de cancelaciones y promociones lo siguen poniendo en el canal «delivery» |

`cripto.js` es un `node:crypto` mínimo y síncrono (SHA-256, HMAC, scrypt lento simulado) comprobado contra vectores oficiales; lo usan las pruebas de
login, sesión y enlace.

## Método: la prueba de mutación

Una prueba que nunca falla no prueba nada. Después de que una prueba nueva pasa:

1. Hacer una copia del archivo de `src/` que protege lo probado.
2. Romper a propósito la protección (por ejemplo, cambiar `if (cond) {` por `if (false /* PRUEBA */) {`).
3. Volver a correr la prueba: TIENE que fallar, en las verificaciones de esa protección.
4. Restaurar la copia y comprobar que no queda la palabra `PRUEBA` en el archivo.

## Reglas para agregar pruebas

- El `$transaction` del simulacro tiene que ser lo más parecido a la base real: si la acción "reclama" con una condición dentro de la transacción,
  el simulacro debe aplicar esa condición.
- Los simulacros se registran en `window.Cargador.simulacros` con la ruta SIN extensión (`src/lib/auth`, `next/headers`...).
- No guardar nada del banco fuera del repositorio: la carpeta temporal de la sesión se borra.
