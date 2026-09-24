-- Reserva de turnos: la agenda de los negocios que atienden con cita
-- (peluquería, barbería, salón de belleza). Dos tablas nuevas, el personal que
-- atiende y los turnos agendados. Aditiva pura: nada existente cambia.

CREATE TABLE "MiembroPersonal" (
  "id" TEXT NOT NULL,
  "storeId" TEXT NOT NULL,
  "nombre" TEXT NOT NULL,
  "orden" INTEGER NOT NULL DEFAULT 0,
  "activo" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "MiembroPersonal_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "MiembroPersonal_storeId_idx" ON "MiembroPersonal"("storeId");

ALTER TABLE "MiembroPersonal" ADD CONSTRAINT "MiembroPersonal_storeId_fkey"
  FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "Cita" (
  "id" TEXT NOT NULL,
  "storeId" TEXT NOT NULL,
  "personalId" TEXT NOT NULL,
  "clienteNombre" TEXT NOT NULL,
  "inicio" TIMESTAMP(3) NOT NULL,
  "fin" TIMESTAMP(3) NOT NULL,
  "estado" TEXT NOT NULL DEFAULT 'pendiente',
  "precio" DECIMAL(10,2),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Cita_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "Cita_fin_despues_de_inicio" CHECK ("fin" > "inicio")
);

CREATE INDEX "Cita_storeId_inicio_idx" ON "Cita"("storeId", "inicio");
CREATE INDEX "Cita_personalId_idx" ON "Cita"("personalId");

ALTER TABLE "Cita" ADD CONSTRAINT "Cita_storeId_fkey"
  FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Cita" ADD CONSTRAINT "Cita_personalId_fkey"
  FOREIGN KEY ("personalId") REFERENCES "MiembroPersonal"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
