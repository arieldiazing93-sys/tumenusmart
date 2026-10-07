-- Factura rápida del Servicio delivery: la factura sale ANTES de cobrar la cuenta y de registrar la venta (para que el repartidor lleve
-- todos los documentos). El comprobante nace ligado a la cuenta de delivery; al cobrar, pasa a colgar también de la venta.
-- Todo con IF NOT EXISTS / DROP IF EXISTS: se puede correr de nuevo sin romper nada.

ALTER TABLE "Comprobante" ADD COLUMN IF NOT EXISTS "cuentaDeliveryId" TEXT;
CREATE INDEX IF NOT EXISTS "Comprobante_cuentaDeliveryId_idx" ON "Comprobante"("cuentaDeliveryId");
ALTER TABLE "Comprobante" DROP CONSTRAINT IF EXISTS "Comprobante_cuentaDeliveryId_fkey";
ALTER TABLE "Comprobante" ADD CONSTRAINT "Comprobante_cuentaDeliveryId_fkey"
  FOREIGN KEY ("cuentaDeliveryId") REFERENCES "CuentaDelivery"("id") ON DELETE SET NULL ON UPDATE CASCADE;
