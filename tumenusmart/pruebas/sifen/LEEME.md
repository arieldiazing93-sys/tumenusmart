# Factura electrónica (SIFEN): pruebas y esquema

La factura electrónica se construye dentro del sistema (módulo aparte de la factura autoimpresor). El código vive en
`src/lib/sifen/`; esta carpeta tiene lo que lo prueba y lo mantiene al día con la DNIT.

**Regla de oro: toda regla sale de la documentación OFICIAL de la DNIT** (Manual Técnico v150 más sus notas técnicas,
guías y XSD de https://www.dnit.gov.py/web/e-kuatia/documentacion-tecnica y https://ekuatia.set.gov.py/sifen/xsd/).
Las notas técnicas cambian reglas del manual base: la posterior gana. Cada regla importante lleva en su comentario la
sección o la nota de donde sale.

## Qué hay

| Archivo | Para qué |
|---|---|
| `xsd/` | Copia de los esquemas OFICIALES: el documento (DE_v150 y sus tipos), la firma (xmldsig), los servicios web (WS_SiRecepDE, WS_SiConsDE, WS_SiConsRUC, WS_SiRecepEvento y sus protocolos de respuesta) y los eventos (Evento_v150). |
| `generar-esquema.ps1` | Lee esos XSD y genera `src/lib/sifen/esquema-de.generated.ts` (estructura, orden, obligatoriedad y formato de cada campo). |
| `tablas/` | El **Código de Referencia Geográfica** oficial de e-Kuatia (departamentos, distritos y ciudades, actualización de noviembre de 2025; MD5 `0d817dee1a6a0c307a8fd25140c4f9be`, idéntico al publicado). |
| `generar-geografia.ps1` | Lee ese Excel (sin Excel ni Node) y genera `src/lib/sifen/geografia.generated.ts` con 18 departamentos, 272 distritos y 6.766 ciudades. |
| `probar.ps1` | Corre TODAS las pruebas con Microsoft Edge sin ventana (no hace falta Node). |
| `banco/` | Las pruebas y el cargador de módulos que usa `probar.ps1`. |

Código que prueban (todo en `src/lib/sifen/`): `xml.ts` (escribir y leer el XML, validar contra el esquema), `cdc.ts`, `qr.ts`, `controlar.ts` (las cuentas), `armar-de.ts` (el documento), `firma.ts` (firma digital XMLDSig de documentos y eventos), `certificado.ts` (leer el .p12 y la bóveda cifrada), `kude.ts` y `kude-escpos.ts` (el comprobante impreso en pantalla y en la impresora térmica), `ws.ts` (los mensajes SOAP de los servicios de la DNIT), `envio.ts` (estados, reintentos y cola de envío de documentos y eventos), `eventos.ts` y `solicitudes.ts` (cancelación e inutilización), `ruc.ts` y `consulta-ruc.ts` (verificar el RUC del comprador en la DNIT), `comprobante.ts` (emite y firma al vender) y `servidor.ts` (bóveda y firma con la base de datos). `transporte.ts` (la conexión real con la DNIT) no se puede probar acá: las pruebas la reemplazan por una DNIT simulada. Las pruebas usan una base de datos en memoria (`banco/base-falsa.js`).

## Cómo correr las pruebas

```powershell
powershell -ExecutionPolicy Bypass -File pruebas\sifen\probar.ps1
```

Para correr solo una prueba mientras se trabaja en ella (en vez de todas): `-Solo prueba-ruc.js` (varias, separadas por coma).

Necesita Edge e internet (baja Babel y, la primera vez, el validador XSD a `pruebas\sifen\.cache`). Tarda unos cuatro
minutos. Sale con código 0 si pasa todo.

Qué comprueba:

1. **Ejemplos del Manual Técnico**: el CDC de la sección 10.1 y el hash del QR de la sección 13.8.4 salen idénticos.
2. **Factura completa** armada a mano, con tres tasas de IVA, descuento y pago dividido: cada número, el XML escrito en
   el orden del esquema y validado por **libxml2** (el validador XSD de siempre, compilado a WebAssembly) contra los XSD
   oficiales.
3. **Casos de receptor, crédito, servicios, delivery y datos que faltan o están mal.**
4. **3.000 facturas al azar**: cuentas que cierran con la tolerancia de la DNIT (±0,50 Gs.), esquema OK y una de cada
   diez validada también por libxml2.
5. **Mutaciones**: se rompe el documento a propósito (campo borrado, texto donde va un número, valor enorme…) y nuestro
   validador y libxml2 tienen que coincidir en rechazarlo.
6. **Generador de QR** (`prueba-qr.js`): textos de todas las versiones del 1 al 20 y los QR de la factura (hasta 429 bytes),
   leídos con **jsQR**, un lector independiente. Encontró un error que existía desde antes: ningún QR de versión 7 en
   adelante se podía leer (la información de versión estaba mal calculada); ya está corregido y probado.
7. **Firma digital y certificados** (`prueba-firma.js`): se genera un certificado de prueba (con el RUC en el titular) y se
   firma el documento. La firma la verifican **tres jueces**: la verificación propia, libxml2 (el firmado sigue cumpliendo el
   esquema) y **xmldsigjs**, otra implementación completa de XMLDSig con su propio canonizador. También: tocar el documento
   rompe la firma, textos con comillas, saltos de línea, emojis y caracteres de control, la bóveda (cifrar y descifrar,
   atada al negocio, con otra clave o alterada no abre), el certificado vencido / chico / sin RUC, y el KuDE armado desde el
   archivo firmado.

8. **Emitir al vender** (`prueba-emision.js`): `crearComprobante` con un punto electrónico arma, firma y guarda el documento
   en la misma transacción; contado, pago dividido, crédito; y cada forma de fallar (sin certificado, certificado vencido,
   sin CSC, emisor incompleto, otra clave del servidor, RUC del comprador con el dígito mal, factura rápida del delivery)
   con un texto claro y sin dejar nada guardado.
9. **Envío a la DNIT** (`prueba-envio.js`): los mensajes SOAP se validan contra los esquemas oficiales con libxml2 y se
   prueba toda la lógica contra una DNIT simulada: aprobado, aprobado con observación, rechazado, sin conexión (reintentos
   cada vez más espaciados), consulta por CDC antes de reenviar (cero duplicados), «ya autorizado» (1001/1002), errores
   SOAP y páginas de error, documentos de otro local, y la tarea programada con dos corridas a la vez.
10. **Eventos** (`prueba-eventos.js`): cancelación e inutilización firmadas, validadas contra `Evento_v150.xsd` y verificadas por
    los dos jueces de firma; el plazo de 48 horas, la espera cuando el documento todavía no fue aprobado, los rechazos de la DNIT
    (4004, 4009, 4065, 4003/4066 como «ya hecho») y que anular una factura electrónica deje pedida su cancelación.

11. **Verificar el RUC en la DNIT** (`prueba-ruc.js`): el servicio siConsRUC (Manual 9.6). El mensaje y las respuestas de ejemplo se validan
    contra `WS_SiConsRUC_v141.xsd` con libxml2; se lee cada respuesta (0500 no existe, 0501 sin permiso, 0502 con los seis estados), y se
    prueba qué se le avisa al cajero y qué se **frena**: solo lo que la DNIT rechazaría con sus validaciones 1306 (el RUC del comprador no
    existe), 1307/1308 (estado cancelado, cancelado definitivo o suspensión temporal) y 1309 (dígito verificador mal, que ni se consulta).
    También la consulta de punta a punta contra una DNIT simulada: certificado y ambiente de cada local, una respuesta guardada 5 minutos, un tope de 30 consultas por minuto por local
    (nunca un fallo), local sin certificado en silencio, y que sin conexión, con error del servidor o respuesta rara NUNCA se frene una venta.

12. **Pedidos del menú digital** (`prueba-pedido-web.js`, no es de SIFEN pero comparte el banco): lo que llega del navegador se revisa sin
    confiar en nada (tipos, largos, cantidades, ubicación, RUC con su dígito), los nombres de cada paso según el tipo de negocio
    (gastronomía, distribuidora, tienda) y todo el recorrido del servidor contra una base en memoria: recibir el pedido (precio, zona y envío
    los calcula el servidor; un reintento no duplica; tope por teléfono y por dispositivo; avisos de stock), aceptarlo (abre la cuenta del
    delivery o de retiro y carga los productos; si la carga falla, todo vuelve atrás), aceptar solo, rechazar, «no hay» (quita una línea y
    recalcula), corregir el RUC, marcar listo y sincronizar con la cuenta cuando se cobra o se cancela desde el Servicio delivery. Y que un
    local nunca toque los pedidos de otro. El catálogo, el horario y la carga de productos a la cuenta se simulan (tienen sus pruebas).

Las pantallas (KuDE en cinta y en A4, estado y documentos con sus envíos, formularios del certificado y del CSC, puntos de
expedición con su tipo de timbrado, botón de firmar en Facturas, el cuadro «Nuevo cliente» y «Nueva factura» con la verificación del
RUC) se probaron aparte con los componentes reales en el banco de React.

## Cuando la DNIT publique una versión nueva

Tabla geográfica: bajar el nuevo `.xlsx` de https://www.dnit.gov.py/web/e-kuatia/tablas-y-codificaciones a `pruebas/sifen/tablas/` (y actualizar el nombre en `generar-geografia.ps1`) y correr `powershell -ExecutionPolicy Bypass -File pruebas\sifen\generar-geografia.ps1`. El checksum PDF que publica la DNIT es de 2023 y no coincide con ningún Excel actual: no sirve para verificar.

Esquemas XML:

1. Bajar los XSD nuevos a `pruebas/sifen/xsd/` (y actualizar los nombres en `generar-esquema.ps1` si cambian de versión).
2. `powershell -ExecutionPolicy Bypass -File pruebas\sifen\generar-esquema.ps1`
3. Leer las notas técnicas nuevas y ajustar `src/lib/sifen/armar-de.ts` y `controlar.ts`.
4. Correr `probar.ps1`.

## Lo que todavía NO está (ver la memoria del proyecto)

Probar la conexión REAL con el ambiente de pruebas de la DNIT: hace falta el certificado digital y la habilitación en
Marangatú (guía "Habilitación como Facturador Electrónico"). Todo lo que se puede probar sin eso ya está probado con una DNIT
simulada. Además faltan: notas de crédito y de débito (y la pantalla de devoluciones), contingencia (emitir sin conexión con
iTipEmi = 2), el envío por lotes asíncrono, los eventos del receptor y el alta guiada de cada cliente.

Decisiones que solo se confirman contra el ambiente de pruebas de la DNIT y están aisladas para cambiarlas en un lugar:
- `OpcionesFirma` en `firma.ts`: qué canonización de SignedInfo y si exige una o dos transformaciones (el Manual de 2019 muestra
  dos —enveloped y c14n exclusiva—; la Nota Técnica 16 de 2023 deja una sola, la que usamos).
- `NOMBRE_EMISOR_PRUEBAS` en `armar-de.ts`: cuál de las dos redacciones oficiales del texto de pruebas acepta.
- `urlsDelServicio` en `ws.ts`: el manual publica las direcciones con «.wsdl»; el envío prueba esa y, si contesta 404/405,
  la misma sin «.wsdl».
- Si la DNIT firma/verifica el documento dentro del sobre SOAP (que agrega su propio espacio de nombres) igual que sin él.
- Que el servicio de consulta de RUC conteste con el certificado del emisor (la DNIT contesta 0501 si ese RUC no tiene permiso para
  usarlo) y cómo se comporta el ambiente de pruebas con los RUC reales. La consulta masiva de RUC (Nota Técnica 11) no se usa.
- Que la impresora térmica de la caja entienda el comando de imagen en bloques (`GS v 0`) con el que sale el QR.
