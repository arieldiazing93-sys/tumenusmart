-- Factura rápida del Servicio delivery: la factura sale ANTES de cobrar la cuenta y de registrar la venta (para que el repartidor lleve
-- todos los documentos). El comprobante nace ligado a la cuenta de delivery; al cobrar, pasa a colgar también de la venta.
-- Todo con IF NOT EXISTS / DROP IF EXISTS: se puede correr de nuevo sin romper nada.

ALTER TABLE "Comprobante" ADD COLUMN IF NOT EXISTS "cuentaDeliveryId" TEXT;
CREATE INDEX IF NOT EXISTS "Comprobante_cuentaDeliveryId_idx" ON "Comprobante"("cuentaDeliveryId");
ALTER TABLE "Comprobante" DROP CONSTRAINT IF EXISTS "Comprobante_cuentaDeliveryId_fkey";
ALTER TABLE "Comprobante" ADD CONSTRAINT "Comprobante_cuentaDeliveryId_fkey"
  FOREIGN KEY ("cuentaDeliveryId") REFERENCES "CuentaDelivery"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Un comprobante tiene que tener origen. Antes: exactamente una de ventaPosId / orderId. Ahora también puede nacer solo de una cuenta de
-- delivery (la factura rápida, todavía sin venta) y, una vez cobrada la cuenta, tener la cuenta Y la venta. Lo único que no puede es
-- colgar a la vez de una venta y de un pedido, ni de nada.
ALTER TABLE "Comprobante" DROP CONSTRAINT IF EXISTS "Comprobante_origen_check";
ALTER TABLE "Comprobante" ADD CONSTRAINT "Comprobante_origen_check" CHECK (
  ("ventaPosId" IS NOT NULL OR "orderId" IS NOT NULL OR "cuentaDeliveryId" IS NOT NULL)
  AND NOT ("ventaPosId" IS NOT NULL AND "orderId" IS NOT NULL)
);
