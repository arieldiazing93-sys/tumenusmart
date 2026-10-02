-- Registro de asistencia: colaboradores, marcaciones y la llave del enlace del celular fijo.
-- Todo con IF NOT EXISTS / DROP IF EXISTS: se puede correr de nuevo sin romper nada.

ALTER TABLE "Store" ADD COLUMN IF NOT EXISTS "tokenAsistencia" TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS "Store_tokenAsistencia_key" ON "Store"("tokenAsistencia");

CREATE TABLE IF NOT EXISTS "Colaborador" (
  "id" TEXT NOT NULL,
  "storeId" TEXT NOT NULL,
  "nombre" TEXT NOT NULL,
  "apellido" TEXT,
  "cargo" TEXT,
  "fotoUrl" TEXT,
  "pinHash" TEXT NOT NULL,
  "horaEntrada" TEXT,
  "toleranciaMin" INTEGER NOT NULL DEFAULT 10,
  "activo" BOOLEAN NOT NULL DEFAULT true,
  "intentosFallidos" INTEGER NOT NULL DEFAULT 0,
  "bloqueadoHasta" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Colaborador_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "Colaborador_storeId_idx" ON "Colaborador"("storeId");
ALTER TABLE "Colaborador" DROP CONSTRAINT IF EXISTS "Colaborador_storeId_fkey";
ALTER TABLE "Colaborador" ADD CONSTRAINT "Colaborador_storeId_fkey"
  FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE IF NOT EXISTS "MarcacionAsistencia" (
  "id" TEXT NOT NULL,
  "storeId" TEXT NOT NULL,
  "colaboradorId" TEXT NOT NULL,
  "tipo" TEXT NOT NULL,
  "fecha" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "dia" TEXT NOT NULL,
  "fotoUrl" TEXT,
  "gestos" JSONB NOT NULL DEFAULT '[]',
  "verificada" BOOLEAN NOT NULL DEFAULT false,
  "tardanzaMin" INTEGER,
  "nota" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "MarcacionAsistencia_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "MarcacionAsistencia_storeId_dia_idx" ON "MarcacionAsistencia"("storeId", "dia");
CREATE INDEX IF NOT EXISTS "MarcacionAsistencia_colaboradorId_fecha_idx" ON "MarcacionAsistencia"("colaboradorId", "fecha");
ALTER TABLE "MarcacionAsistencia" DROP CONSTRAINT IF EXISTS "MarcacionAsistencia_storeId_fkey";
ALTER TABLE "MarcacionAsistencia" ADD CONSTRAINT "MarcacionAsistencia_storeId_fkey"
  FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MarcacionAsistencia" DROP CONSTRAINT IF EXISTS "MarcacionAsistencia_colaboradorId_fkey";
ALTER TABLE "MarcacionAsistencia" ADD CONSTRAINT "MarcacionAsistencia_colaboradorId_fkey"
  FOREIGN KEY ("colaboradorId") REFERENCES "Colaborador"("id") ON DELETE CASCADE ON UPDATE CASCADE;
