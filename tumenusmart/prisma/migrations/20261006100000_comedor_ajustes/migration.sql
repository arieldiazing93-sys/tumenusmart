-- Servicio comedor: configuración en Ajustes — reglas del mozo y las mesas del salón.
-- Todo con IF NOT EXISTS / DROP IF EXISTS: se puede correr de nuevo sin romper nada.

-- Reglas del mozo: ver las cuentas de otros mozos (hoy sí, como ya funciona) y imprimir su propia cuenta (apagado).
ALTER TABLE "Store" ADD COLUMN IF NOT EXISTS "mozosVenCuentasAjenas" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "Store" ADD COLUMN IF NOT EXISTS "mozoImprimeCuenta" BOOLEAN NOT NULL DEFAULT false;

-- Las mesas del salón.
CREATE TABLE IF NOT EXISTS "MesaComedor" (
  "id" TEXT NOT NULL,
  "storeId" TEXT NOT NULL,
  "nombre" TEXT NOT NULL,
  "clave" TEXT NOT NULL,
  "orden" INTEGER NOT NULL DEFAULT 0,
  "activa" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "MesaComedor_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "MesaComedor_storeId_clave_key" ON "MesaComedor"("storeId", "clave");
CREATE INDEX IF NOT EXISTS "MesaComedor_storeId_idx" ON "MesaComedor"("storeId");
ALTER TABLE "MesaComedor" DROP CONSTRAINT IF EXISTS "MesaComedor_storeId_fkey";
ALTER TABLE "MesaComedor" ADD CONSTRAINT "MesaComedor_storeId_fkey"
  FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;
