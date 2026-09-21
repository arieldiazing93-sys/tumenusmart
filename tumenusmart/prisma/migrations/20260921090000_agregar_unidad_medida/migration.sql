-- AlterTable
ALTER TABLE "Product" ADD COLUMN "unidadMedida" TEXT NOT NULL DEFAULT 'unidad';

-- AlterTable
ALTER TABLE "ProductOption" ADD COLUMN "iva" TEXT NOT NULL DEFAULT 'gravado10';
ALTER TABLE "ProductOption" ADD COLUMN "unidadMedida" TEXT NOT NULL DEFAULT 'unidad';
