-- Horario general de trabajo de la Reserva de turnos: una fila por día de la
-- semana (0 = domingo … 6 = sábado) con si se trabaja, de qué hora a qué hora y
-- el descanso del medio. Aditiva pura: nada existente cambia.

CREATE TABLE "HorarioTrabajo" (
  "id" TEXT NOT NULL,
  "storeId" TEXT NOT NULL,
  "diaSemana" INTEGER NOT NULL,
  "trabaja" BOOLEAN NOT NULL DEFAULT true,
  "inicio" TEXT NOT NULL DEFAULT '09:00',
  "fin" TEXT NOT NULL DEFAULT '18:00',
  "descansa" BOOLEAN NOT NULL DEFAULT false,
  "descansoInicio" TEXT NOT NULL DEFAULT '13:00',
  "descansoFin" TEXT NOT NULL DEFAULT '14:00',
  CONSTRAINT "HorarioTrabajo_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "HorarioTrabajo_dia_valido" CHECK ("diaSemana" BETWEEN 0 AND 6)
);

CREATE UNIQUE INDEX "HorarioTrabajo_storeId_diaSemana_key" ON "HorarioTrabajo"("storeId", "diaSemana");
CREATE INDEX "HorarioTrabajo_storeId_idx" ON "HorarioTrabajo"("storeId");

ALTER TABLE "HorarioTrabajo" ADD CONSTRAINT "HorarioTrabajo_storeId_fkey"
  FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;
