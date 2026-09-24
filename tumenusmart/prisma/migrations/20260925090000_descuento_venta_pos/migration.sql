-- AlterTable
ALTER TABLE "VentaPos" ADD COLUMN "descuento" DECIMAL(10,2) NOT NULL DEFAULT 0;
ALTER TABLE "VentaPos" ADD COLUMN "descuentoPorcentaje" DECIMAL(5,2);
