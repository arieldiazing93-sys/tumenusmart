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
| `probar.ps1` | Corre TODAS las pruebas con Microsoft Edge sin ventana (no hace falta Node). |
| `banco/` | Las pruebas y el cargador de módulos que usa `probar.ps1`. |

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

## Cuando la DNIT publique una versión nueva

1. Bajar los XSD nuevos a `pruebas/sifen/xsd/` (y actualizar los nombres en `generar-esquema.ps1` si cambian de versión).
2. `powershell -ExecutionPolicy Bypass -File pruebas\sifen\generar-esquema.ps1`
3. Leer las notas técnicas nuevas y ajustar `src/lib/sifen/armar-de.ts` y `controlar.ts`.
4. Correr `probar.ps1`.

## Lo que todavía NO está (ver la memoria del proyecto)

Firma digital, conexión con los servicios de la DNIT (mTLS + SOAP), cola de envíos, eventos (cancelación,
inutilización), notas de crédito/débito, KuDE, contingencia. Para probar contra el ambiente de pruebas real hace falta el
certificado digital y el acceso al TEST del contribuyente (guía "Habilitación como Facturador Electrónico").
