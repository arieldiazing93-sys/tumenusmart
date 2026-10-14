-- Reserva de canchas (complejos deportivos): canchas, reservas y el horario del complejo.
-- Lo reserva el cliente desde /canchas/<dirección> (la misma página de reservas del negocio, PaginaReservas) o lo anota el negocio
-- desde el panel. Se puede correr de nuevo sin romper nada.

CREATE TABLE IF NOT EXISTS "Cancha" (
  "id" TEXT NOT NULL,
  "storeId" TEXT NOT NULL,
  "nombre" TEXT NOT NULL,
  "deporte" TEXT NOT NULL DEFAULT 'futbol5',
  "superficie" TEXT,
  "techada" BOOLEAN NOT NULL DEFAULT false,
  "descripcion" TEXT,
  "fotoUrl" TEXT,
  "precioHora" DECIMAL(10,2) NOT NULL,
  "precioNocturnoHora" DECIMAL(10,2),
  "nocheDesde" TEXT NOT NULL DEFAULT '18:00',
  "duraciones" INTEGER[] NOT NULL DEFAULT ARRAY[60, 90, 120]::INTEGER[],
  "pasoMin" INTEGER NOT NULL DEFAULT 30,
  "activa" BOOLEAN NOT NULL DEFAULT true,
  "orden" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Cancha_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "Cancha_storeId_idx" ON "Cancha"("storeId");
ALTER TABLE "Cancha" DROP CONSTRAINT IF EXISTS "Cancha_storeId_fkey";
ALTER TABLE "Cancha" ADD CONSTRAINT "Cancha_storeId_fkey"
  FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE IF NOT EXISTS "ReservaCancha" (
  "id" TEXT NOT NULL,
  "storeId" TEXT NOT NULL,
  "canchaId" TEXT NOT NULL,
  "canchaNombre" TEXT NOT NULL,
  "clienteNombre" TEXT NOT NULL,
  "clienteTelefono" TEXT,
  "clienteEmail" TEXT,
  "nota" TEXT,
  "extras" JSONB,
  "inicio" TIMESTAMP(3) NOT NULL,
  "fin" TIMESTAMP(3) NOT NULL,
  "duracionMin" INTEGER NOT NULL,
  "estado" TEXT NOT NULL DEFAULT 'pendiente',
  "precio" DECIMAL(10,2) NOT NULL,
  "origen" TEXT NOT NULL DEFAULT 'panel',
  "visible" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ReservaCancha_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "ReservaCancha_storeId_inicio_idx" ON "ReservaCancha"("storeId", "inicio");
CREATE INDEX IF NOT EXISTS "ReservaCancha_canchaId_inicio_idx" ON "ReservaCancha"("canchaId", "inicio");
ALTER TABLE "ReservaCancha" DROP CONSTRAINT IF EXISTS "ReservaCancha_storeId_fkey";
ALTER TABLE "ReservaCancha" ADD CONSTRAINT "ReservaCancha_storeId_fkey"
  FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ReservaCancha" DROP CONSTRAINT IF EXISTS "ReservaCancha_canchaId_fkey";
ALTER TABLE "ReservaCancha" ADD CONSTRAINT "ReservaCancha_canchaId_fkey"
  FOREIGN KEY ("canchaId") REFERENCES "Cancha"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE IF NOT EXISTS "HorarioCanchas" (
  "id" TEXT NOT NULL,
  "storeId" TEXT NOT NULL,
  "diaSemana" INTEGER NOT NULL,
  "trabaja" BOOLEAN NOT NULL DEFAULT true,
  "inicio" TEXT NOT NULL DEFAULT '08:00',
  "fin" TEXT NOT NULL DEFAULT '23:59',
  "descansa" BOOLEAN NOT NULL DEFAULT false,
  "descansoInicio" TEXT NOT NULL DEFAULT '13:00',
  "descansoFin" TEXT NOT NULL DEFAULT '14:00',
  CONSTRAINT "HorarioCanchas_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "HorarioCanchas_storeId_diaSemana_key" ON "HorarioCanchas"("storeId", "diaSemana");
CREATE INDEX IF NOT EXISTS "HorarioCanchas_storeId_idx" ON "HorarioCanchas"("storeId");
ALTER TABLE "HorarioCanchas" DROP CONSTRAINT IF EXISTS "HorarioCanchas_storeId_fkey";
ALTER TABLE "HorarioCanchas" ADD CONSTRAINT "HorarioCanchas_storeId_fkey"
  FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;
