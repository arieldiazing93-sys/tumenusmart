ALTER TABLE "OrderItem" ADD COLUMN "iva" TEXT NOT NULL DEFAULT 'gravado10';

ALTER TABLE "Order" ADD COLUMN "facturaNumero" TEXT;
ALTER TABLE "Order" ADD COLUMN "facturaTimbrado" TEXT;
ALTER TABLE "Order" ADD COLUMN "facturaVencimiento" TIMESTAMP(3);
ALTER TABLE "Order" ADD COLUMN "facturaGravado10" DECIMAL(10,2);
ALTER TABLE "Order" ADD COLUMN "facturaGravado5" DECIMAL(10,2);
ALTER TABLE "Order" ADD COLUMN "facturaExento" DECIMAL(10,2);
ALTER TABLE "Order" ADD COLUMN "facturaIva10" DECIMAL(10,2);
ALTER TABLE "Order" ADD COLUMN "facturaIva5" DECIMAL(10,2);
ALTER TABLE "Order" ADD COLUMN "facturaRazonSocialEmisor" TEXT;
ALTER TABLE "Order" ADD COLUMN "facturaRucEmisor" TEXT;
