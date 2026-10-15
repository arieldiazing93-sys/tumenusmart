-- Reserva de turnos: pago de comisiones a las personas del personal. Cada pago es un retiro de caja en efectivo (MovimientoCaja) y queda
-- registrado (cuánto, a quién, qué período paga, quién lo pagó). Se puede correr de nuevo sin romper nada.

CREATE TABLE IF NOT EXISTS "PagoComisionPersonal" (
  "id" TEXT NOT NULL,
  "storeId" TEXT NOT NULL,
  "personalId" TEXT NOT NULL,
  "monto" DECIMAL(12,2) NOT NULL,
  "desde" TEXT,
  "hasta" TEXT,
  "nota" TEXT,
  "movimientoCajaId" TEXT NOT NULL,
  "turnoPosId" TEXT NOT NULL,
  "registradoPor" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PagoComisionPersonal_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "PagoComisionPersonal_storeId_createdAt_idx" ON "PagoComisionPersonal"("storeId", "createdAt");
CREATE INDEX IF NOT EXISTS "PagoComisionPersonal_personalId_idx" ON "PagoComisionPersonal"("personalId");
CREATE INDEX IF NOT EXISTS "PagoComisionPersonal_movimientoCajaId_idx" ON "PagoComisionPersonal"("movimientoCajaId");
ALTER TABLE "PagoComisionPersonal" DROP CONSTRAINT IF EXISTS "PagoComisionPersonal_storeId_fkey";
ALTER TABLE "PagoComisionPersonal" ADD CONSTRAINT "PagoComisionPersonal_storeId_fkey"
  FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PagoComisionPersonal" DROP CONSTRAINT IF EXISTS "PagoComisionPersonal_personalId_fkey";
ALTER TABLE "PagoComisionPersonal" ADD CONSTRAINT "PagoComisionPersonal_personalId_fkey"
  FOREIGN KEY ("personalId") REFERENCES "MiembroPersonal"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
