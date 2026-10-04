-- Servicio comedor: sectores del restaurante (Salon, Patio, Terraza) y la mesa asignada a un sector.
-- Todo con IF NOT EXISTS / DROP IF EXISTS: se puede correr de nuevo sin romper nada.

CREATE TABLE IF NOT EXISTS "SectorComedor" (
  "id" TEXT NOT NULL,
  "storeId" TEXT NOT NULL,
  "nombre" TEXT NOT NULL,
  "clave" TEXT NOT NULL,
  "orden" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "SectorComedor_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "SectorComedor_storeId_clave_key" ON "SectorComedor"("storeId", "clave");
CREATE INDEX IF NOT EXISTS "SectorComedor_storeId_idx" ON "SectorComedor"("storeId");
ALTER TABLE "SectorComedor" DROP CONSTRAINT IF EXISTS "SectorComedor_storeId_fkey";
ALTER TABLE "SectorComedor" ADD CONSTRAINT "SectorComedor_storeId_fkey"
  FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- La mesa y su sector (opcional: una mesa sin sector se sigue ofreciendo al mozo).
ALTER TABLE "MesaComedor" ADD COLUMN IF NOT EXISTS "sectorId" TEXT;
CREATE INDEX IF NOT EXISTS "MesaComedor_sectorId_idx" ON "MesaComedor"("sectorId");
ALTER TABLE "MesaComedor" DROP CONSTRAINT IF EXISTS "MesaComedor_sectorId_fkey";
ALTER TABLE "MesaComedor" ADD CONSTRAINT "MesaComedor_sectorId_fkey"
  FOREIGN KEY ("sectorId") REFERENCES "SectorComedor"("id") ON DELETE SET NULL ON UPDATE CASCADE;
