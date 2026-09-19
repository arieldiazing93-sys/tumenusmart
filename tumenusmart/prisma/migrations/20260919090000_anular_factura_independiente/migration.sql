-- Anular una factura sin cancelar la cuenta/pedido que la sostiene — hasta
-- ahora cancelar una y otra era lo mismo. Los campos facturaNumero/
-- facturaRazonSocial/etc. existentes NUNCA se tocan: quedan como el
-- registro histórico de qué decía la factura antes de anularse.

ALTER TABLE "Order" ADD COLUMN "facturaAnulada" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Order" ADD COLUMN "facturaAnuladaPor" TEXT;
ALTER TABLE "Order" ADD COLUMN "facturaAnuladaEn" TIMESTAMP(3);
ALTER TABLE "Order" ADD COLUMN "facturaMotivoAnulacion" TEXT;

ALTER TABLE "VentaPos" ADD COLUMN "facturaAnulada" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "VentaPos" ADD COLUMN "facturaAnuladaPor" TEXT;
ALTER TABLE "VentaPos" ADD COLUMN "facturaAnuladaEn" TIMESTAMP(3);
ALTER TABLE "VentaPos" ADD COLUMN "facturaMotivoAnulacion" TEXT;
