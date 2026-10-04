-- Servicio comedor: propinas de los mozos. El cliente deja propina con tarjeta o transferencia al pagar la cuenta; esa plata entra al
-- negocio pero es del mozo: se acumula como "pendiente" hasta que se le paga en efectivo desde la caja (un retiro de caja).
-- Todo con IF NOT EXISTS / DROP IF EXISTS: se puede correr de nuevo sin romper nada.

CREATE TABLE IF NOT EXISTS "PropinaMozo" (
  "id" TEXT NOT NULL,
  "storeId" TEXT NOT NULL,
  "mozoId" TEXT NOT NULL,
  "cuentaMesaId" TEXT,
  "ventaPosId" TEXT,
  "turnoPosId" TEXT,
  "monto" DECIMAL(12,2) NOT NULL,
  "forma" TEXT NOT NULL,
  "registradoPor" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "estado" TEXT NOT NULL DEFAULT 'pendiente',
  "motivoAnulacion" TEXT,
  "pagadaEn" TIMESTAMP(3),
  "pagadaPor" TEXT,
  "pagoMovimientoId" TEXT,
  CONSTRAINT "PropinaMozo_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "PropinaMozo_storeId_estado_idx" ON "PropinaMozo"("storeId", "estado");
CREATE INDEX IF NOT EXISTS "PropinaMozo_mozoId_idx" ON "PropinaMozo"("mozoId");
CREATE INDEX IF NOT EXISTS "PropinaMozo_turnoPosId_idx" ON "PropinaMozo"("turnoPosId");
CREATE INDEX IF NOT EXISTS "PropinaMozo_ventaPosId_idx" ON "PropinaMozo"("ventaPosId");
CREATE INDEX IF NOT EXISTS "PropinaMozo_pagoMovimientoId_idx" ON "PropinaMozo"("pagoMovimientoId");

ALTER TABLE "PropinaMozo" DROP CONSTRAINT IF EXISTS "PropinaMozo_storeId_fkey";
ALTER TABLE "PropinaMozo" ADD CONSTRAINT "PropinaMozo_storeId_fkey"
  FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PropinaMozo" DROP CONSTRAINT IF EXISTS "PropinaMozo_mozoId_fkey";
ALTER TABLE "PropinaMozo" ADD CONSTRAINT "PropinaMozo_mozoId_fkey"
  FOREIGN KEY ("mozoId") REFERENCES "Mozo"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
