-- Reserva de canchas: cobrar la reserva como una venta del punto de venta (ticket o factura, formas de pago, turno de caja, IVA,
-- stock y cierre de caja, igual que cobrar una cita). Se puede correr de nuevo sin romper nada.
--  - ReservaCancha.ventaPosId: la venta con que se cobró (única: una reserva, un cobro). Si la venta se cancela, se suelta.
--  - Cancha.productId: el producto oculto «Alquiler <cancha>» con que se vende cada alquiler (se crea solo al primer cobro).

ALTER TABLE "ReservaCancha" ADD COLUMN IF NOT EXISTS "ventaPosId" TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS "ReservaCancha_ventaPosId_key" ON "ReservaCancha"("ventaPosId");
ALTER TABLE "ReservaCancha" DROP CONSTRAINT IF EXISTS "ReservaCancha_ventaPosId_fkey";
ALTER TABLE "ReservaCancha" ADD CONSTRAINT "ReservaCancha_ventaPosId_fkey"
  FOREIGN KEY ("ventaPosId") REFERENCES "VentaPos"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "Cancha" ADD COLUMN IF NOT EXISTS "productId" TEXT;
