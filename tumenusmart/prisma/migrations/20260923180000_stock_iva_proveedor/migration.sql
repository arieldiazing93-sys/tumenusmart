-- AlterTable
ALTER TABLE "Insumo" ADD COLUMN "iva" TEXT NOT NULL DEFAULT 'gravado10';

-- AlterTable
ALTER TABLE "CompraItem" ADD COLUMN "iva" TEXT NOT NULL DEFAULT 'gravado10';

-- AlterTable
ALTER TABLE "Proveedor" ADD COLUMN "razonSocial" TEXT;
ALTER TABLE "Proveedor" ADD COLUMN "ruc" TEXT;
ALTER TABLE "Proveedor" ADD COLUMN "ciudad" TEXT;
