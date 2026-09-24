-- AlterTable
ALTER TABLE "Gasto" ADD COLUMN "numeroComprobante" TEXT;
ALTER TABLE "Gasto" ADD COLUMN "timbrado" TEXT;
ALTER TABLE "Gasto" ADD COLUMN "proveedorRuc" TEXT;
ALTER TABLE "Gasto" ADD COLUMN "proveedorRazonSocial" TEXT;
ALTER TABLE "Gasto" ADD COLUMN "iva" TEXT NOT NULL DEFAULT 'gravado10';
ALTER TABLE "Gasto" ADD COLUMN "condicionPago" TEXT NOT NULL DEFAULT 'contado';
ALTER TABLE "Gasto" ADD COLUMN "fechaVencimiento" TIMESTAMP(3);
