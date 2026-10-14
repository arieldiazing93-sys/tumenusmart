-- Servicio comedor: pago de comisiones a los mozos. Cada pago es un retiro de caja en efectivo (MovimientoCaja) y queda registrado
-- (cuánto, a quién, qué período paga, quién lo pagó). Se puede correr de nuevo sin romper nada.

CREATE TABLE IF NOT EXISTS "PagoComisionMozo" (
  "id" TEXT NOT NULL,
  "storeId" TEXT NOT NULL,
  "mozoId" TEXT NOT NULL,
  "monto" DECIMAL(12,2) NOT NULL,
  "desde" TEXT,
  "hasta" TEXT,
  "nota" TEXT,
  "movimientoCajaId" TEXT NOT NULL,
  "turnoPosId" TEXT NOT NULL,
  "registradoPor" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PagoComisionMozo_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "PagoComisionMozo_storeId_createdAt_idx" ON "PagoComisionMozo"("storeId", "createdAt");
CREATE INDEX IF NOT EXISTS "PagoComisionMozo_mozoId_idx" ON "PagoComisionMozo"("mozoId");
CREATE INDEX IF NOT EXISTS "PagoComisionMozo_movimientoCajaId_idx" ON "PagoComisionMozo"("movimientoCajaId");
ALTER TABLE "PagoComisionMozo" DROP CONSTRAINT IF EXISTS "PagoComisionMozo_storeId_fkey";
ALTER TABLE "PagoComisionMozo" ADD CONSTRAINT "PagoComisionMozo_storeId_fkey"
  FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PagoComisionMozo" DROP CONSTRAINT IF EXISTS "PagoComisionMozo_mozoId_fkey";
ALTER TABLE "PagoComisionMozo" ADD CONSTRAINT "PagoComisionMozo_mozoId_fkey"
  FOREIGN KEY ("mozoId") REFERENCES "Mozo"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
