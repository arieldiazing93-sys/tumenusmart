-- AlterTable
ALTER TABLE "Insumo" ADD COLUMN "rendimiento" DECIMAL(12,3) NOT NULL DEFAULT 1;

-- AlterTable
ALTER TABLE "CompraItem" ADD COLUMN "rendimiento" DECIMAL(12,3) NOT NULL DEFAULT 1;
