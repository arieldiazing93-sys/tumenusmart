-- Reporte de Promociones: cada línea vendida anota qué promoción se le aplicó, si es la parte regalada y a qué precio estaba ANTES de la
-- promoción. Con eso el reporte calcula cuánto se descontó y cuánto se regaló en el mostrador, el comedor y el delivery.
-- Las cuentas abiertas del comedor y del delivery también guardan el precio anterior, para pasarlo a la venta cuando se cobran.
-- Todo con IF NOT EXISTS: se puede correr de nuevo sin romper nada.

ALTER TABLE "VentaPosItem" ADD COLUMN IF NOT EXISTS "promocionId" TEXT;
ALTER TABLE "VentaPosItem" ADD COLUMN IF NOT EXISTS "cortesia" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "VentaPosItem" ADD COLUMN IF NOT EXISTS "precioAntesPromo" DECIMAL(10,2);
CREATE INDEX IF NOT EXISTS "VentaPosItem_promocionId_idx" ON "VentaPosItem"("promocionId");

ALTER TABLE "ItemCuentaMesa" ADD COLUMN IF NOT EXISTS "precioAntesPromo" DECIMAL(10,2);
ALTER TABLE "ItemCuentaDelivery" ADD COLUMN IF NOT EXISTS "precioAntesPromo" DECIMAL(10,2);
