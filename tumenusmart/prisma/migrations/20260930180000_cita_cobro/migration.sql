-- Cobrar una cita desde el calendario: el detalle de la cita funciona como punto de
-- venta y lo que se cobra entra en la caja.
--
-- Cita gana el descuento de la cuenta y el enlace a la venta del punto de venta con
-- que se cobró (ventaPosId, único: una venta cobra una sola cita). Si esa venta se
-- cancela, el enlace se suelta (ON DELETE SET NULL cubre el borrado; la cancelación
-- lo suelta desde la aplicación). Aditiva pura: las citas que ya existan quedan sin
-- descuento y sin cobrar.

ALTER TABLE "Cita" ADD COLUMN "descuento" DECIMAL(10,2) NOT NULL DEFAULT 0;
ALTER TABLE "Cita" ADD COLUMN "descuentoPorcentaje" DECIMAL(5,2);
ALTER TABLE "Cita" ADD COLUMN "ventaPosId" TEXT;

CREATE UNIQUE INDEX "Cita_ventaPosId_key" ON "Cita"("ventaPosId");

ALTER TABLE "Cita" ADD CONSTRAINT "Cita_ventaPosId_fkey"
  FOREIGN KEY ("ventaPosId") REFERENCES "VentaPos"("id") ON DELETE SET NULL ON UPDATE CASCADE;
