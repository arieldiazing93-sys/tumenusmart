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
| `xsd/` | Copia de los esquemas OFICIALES (DE_v150, DE_Types_v150, Paises, Departamentos, Monedas, Unidades de medida, xmldsig, siRecepDE_v150). |
| `generar-esquema.ps1` | Lee esos XSD y genera `src/lib/sifen/esquema-de.generated.ts` (estructura, orden, obligatoriedad y formato de cada campo). |
| `tablas/` | El **Código de Referencia Geográfica** oficial de e-Kuatia (departamentos, distritos y ciudades, actualización de noviembre de 2025; MD5 `0d817dee1a6a0c307a8fd25140c4f9be`, idéntico al publicado). |
| `generar-geografia.ps1` | Lee ese Excel (sin Excel ni Node) y genera `src/lib/sifen/geografia.generated.ts` con 18 departamentos, 272 distritos y 6.766 ciudades. |
| `probar.ps1` | Corre TODAS las pruebas con Microsoft Edge sin ventana (no hace falta Node). |
| `banco/` | Las pruebas y el cargador de módulos que usa `probar.ps1`. |

Código que prueban (todo en `src/lib/sifen/`): `xml.ts` (escribir y leer el XML, validar contra el esquema), `cdc.ts`, `qr.ts`, `controlar.ts` (las cuentas), `armar-de.ts` (el documento), `firma.ts` (firma digital XMLDSig), `certificado.ts` (leer el .p12 y la bóveda cifrada), `kude.ts` (el comprobante impreso) y `servidor.ts` (une todo con la base de datos; no se prueba acá porque necesita Prisma).

## Cómo correr las pruebas

```powershell
powershell -ExecutionPolicy Bypass -File pruebas\sifen\probar.ps1
```

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

Las pantallas (KuDE en cinta y en A4, estado, formularios del certificado y del CSC, botón de firmar en Facturas) se probaron
aparte con los componentes reales en el banco de React.

## Cuando la DNIT publique una versión nueva

Tabla geográfica: bajar el nuevo `.xlsx` de https://www.dnit.gov.py/web/e-kuatia/tablas-y-codificaciones a `pruebas/sifen/tablas/` (y actualizar el nombre en `generar-geografia.ps1`) y correr `powershell -ExecutionPolicy Bypass -File pruebas\sifen\generar-geografia.ps1`. El checksum PDF que publica la DNIT es de 2023 y no coincide con ningún Excel actual: no sirve para verificar.

Esquemas XML:

1. Bajar los XSD nuevos a `pruebas/sifen/xsd/` (y actualizar los nombres en `generar-esquema.ps1` si cambian de versión).
2. `powershell -ExecutionPolicy Bypass -File pruebas\sifen\generar-esquema.ps1`
3. Leer las notas técnicas nuevas y ajustar `src/lib/sifen/armar-de.ts` y `controlar.ts`.
4. Correr `probar.ps1`.

## Lo que todavía NO está (ver la memoria del proyecto)

Conexión con los servicios de la DNIT (mTLS + SOAP), cola de envíos, eventos (cancelación, inutilización), notas de
crédito/débito, contingencia, y que el punto de venta emita directamente electrónico (timbrado y numeración electrónicos por
punto de expedición). Para probar contra el ambiente de pruebas real hace falta el certificado digital y el acceso al TEST del
contribuyente (guía "Habilitación como Facturador Electrónico").

Dos decisiones que solo se confirman contra el ambiente de pruebas de la DNIT y están aisladas para cambiarlas en un lugar:
`OpcionesFirma` en `firma.ts` (qué canonización de SignedInfo y si exige una o dos transformaciones) y `NOMBRE_EMISOR_PRUEBAS`
en `armar-de.ts` (cuál de las dos redacciones oficiales del texto de pruebas acepta).
