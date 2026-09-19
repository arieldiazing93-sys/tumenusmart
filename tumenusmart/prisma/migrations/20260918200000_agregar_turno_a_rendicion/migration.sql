-- Corte general de turno: la Rendición del repartidor queda atada al turno
-- de caja que estaba abierto en la estación desde donde se recibió, para
-- que el cierre del Punto de Venta pueda sumarla aparte (no mezclada con
-- las 4 formas de pago de mostrador) y mostrar un total general único.

ALTER TABLE "Rendicion" ADD COLUMN "turnoPosId" TEXT;

CREATE INDEX "Rendicion_turnoPosId_idx" ON "Rendicion"("turnoPosId");

ALTER TABLE "Rendicion" ADD CONSTRAINT "Rendicion_turnoPosId_fkey"
    FOREIGN KEY ("turnoPosId") REFERENCES "TurnoPos"("id") ON DELETE SET NULL ON UPDATE CASCADE;
