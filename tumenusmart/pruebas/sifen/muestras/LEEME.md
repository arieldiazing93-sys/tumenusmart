# Certificado de PRUEBA para probar la pantalla

`certificado-de-prueba.p12` es un certificado **autofirmado, sin ningún valor real** (titular `GASTRONOMIA FABRI S.A.`, RUC `80012345-0`),
creado solo para probar el flujo completo en el sistema sin tener todavía el certificado verdadero:

- Contraseña: `Prueba-123`
- En **Configuración de facturas → Facturación electrónica**: subí este archivo con esa contraseña, cargá el identificador `0001` y el
  CSC de prueba que publica la DNIT (`ABCD0000000000000000000000000000`), dejá el ambiente en **Pruebas**, y después firmá una factura
  desde **Facturas → Ver datos para factura electrónica → Firmar y guardar**.
- Va a avisar que el RUC del certificado no coincide con el de tus puntos de expedición: es lo esperado, porque es de mentira.
- La DNIT NO lo acepta (no lo emitió un prestador habilitado). Sirve para ver la firma, el XML y el comprobante impreso (KuDE).
- **Nunca lo cargues en un local real que vaya a facturar**: sacalo con «Quitar el certificado» al terminar de probar.

Los certificados de verdad los emite un prestador de servicios de certificación habilitado, con el RUC del contribuyente.
