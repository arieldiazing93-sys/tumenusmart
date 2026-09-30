-- Comisión de producto: aparte de la comisión de servicio que ya existe.
ALTER TABLE "MiembroPersonal" ADD COLUMN "comisionProductoPorcentaje" DECIMAL(5,2);

-- Quién vendió los productos de una cuenta del mostrador (independiente de si esa
-- cuenta también generó una Cita por un servicio).
ALTER TABLE "VentaPos" ADD COLUMN "personalId" TEXT;
ALTER TABLE "VentaPos" ADD COLUMN "comisionProductoPorcentaje" DECIMAL(5,2);
ALTER TABLE "VentaPos" ADD COLUMN "comisionProductoBase" DECIMAL(10,2);

ALTER TABLE "VentaPos" ADD CONSTRAINT "VentaPos_personalId_fkey"
  FOREIGN KEY ("personalId") REFERENCES "MiembroPersonal"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "VentaPos_personalId_idx" ON "VentaPos"("personalId");
