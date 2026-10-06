-- Servicio comedor: division de cuenta. Dos amigos comen en una mesa, se carga todo en una cuenta y cada uno quiere su factura:
-- la cuenta se divide en partes iguales o por producto, y cada parte es una cuenta propia que se cobra y se factura aparte.
--
--  * "cantidad" de los productos pasa de entero a decimal de doble precision: en partes iguales cada parte lleva, por ejemplo,
--    0,5 de una pizza. Los enteros que ya estan se conservan tal cual (1 sigue siendo 1). Se cambia en la cuenta de la mesa y en
--    la venta (VentaPosItem), porque la cantidad pasa de una a otra al cobrar. El comprobante (ComprobanteItem) ya era decimal.
--  * La cuenta que nace de dividir otra guarda de cual salio y como se llama la mesa original ("1" para "1-A", "1-B").
--
-- Se puede correr de nuevo sin romper nada (IF NOT EXISTS; cambiar una columna al tipo que ya tiene no hace nada).

ALTER TABLE "ItemCuentaMesa" ALTER COLUMN "cantidad" TYPE DOUBLE PRECISION;
ALTER TABLE "VentaPosItem" ALTER COLUMN "cantidad" TYPE DOUBLE PRECISION;
ALTER TABLE "CuentaMesa" ADD COLUMN IF NOT EXISTS "cuentaOrigenId" TEXT;
ALTER TABLE "CuentaMesa" ADD COLUMN IF NOT EXISTS "mesaBase" TEXT;
