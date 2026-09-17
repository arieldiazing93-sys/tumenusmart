-- 1. Tabla Estacion
CREATE TABLE "Estacion" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "activa" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    CONSTRAINT "Estacion_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "Estacion_storeId_idx" ON "Estacion"("storeId");
ALTER TABLE "Estacion" ADD CONSTRAINT "Estacion_storeId_fkey"
  FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- 2. Una "Estación principal" por CADA local (tenga o no turnos todavía) —
-- así ningún negocio existente se queda sin poder abrir turno mañana.
INSERT INTO "Estacion" ("id", "storeId", "nombre")
SELECT gen_random_uuid()::text, "id", 'Estación principal' FROM "Store";

-- 3. Columna nueva en TurnoPos, backfill desde la estación principal de
-- cada local, y recién ahí NOT NULL.
ALTER TABLE "TurnoPos" ADD COLUMN "estacionId" TEXT;
UPDATE "TurnoPos" t SET "estacionId" = e."id"
FROM "Estacion" e WHERE e."storeId" = t."storeId";
ALTER TABLE "TurnoPos" ALTER COLUMN "estacionId" SET NOT NULL;
CREATE INDEX "TurnoPos_estacionId_idx" ON "TurnoPos"("estacionId");
ALTER TABLE "TurnoPos" ADD CONSTRAINT "TurnoPos_estacionId_fkey"
  FOREIGN KEY ("estacionId") REFERENCES "Estacion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- 4. El índice único pasa de "un turno abierto por LOCAL" a "un turno
-- abierto por ESTACIÓN" — con esto cada estación concurre sin pisar a las
-- demás. No hace falta storeId en el índice: una estación ya pertenece a un
-- solo local por su propia FK.
DROP INDEX "TurnoPos_un_abierto_por_local";
CREATE UNIQUE INDEX "TurnoPos_un_abierto_por_estacion" ON "TurnoPos"("estacionId") WHERE "estado" = 'abierto';
