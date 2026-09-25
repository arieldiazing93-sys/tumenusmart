-- Horario propio de cada persona del personal (un turno completo, uno intermedio, uno de tarde y noche…).
--
-- Las mismas columnas que HorarioTrabajo, una fila por día de la semana (0 = domingo … 6 = sábado). Una
-- persona CON filas usa este horario; una persona SIN filas sigue usando el horario general del negocio
-- (HorarioTrabajo), así que nada existente cambia. Si se borra la persona, se borran sus horarios.
-- Aditiva pura.

CREATE TABLE "HorarioPersonal" (
  "id" TEXT NOT NULL,
  "storeId" TEXT NOT NULL,
  "personalId" TEXT NOT NULL,
  "diaSemana" INTEGER NOT NULL,
  "trabaja" BOOLEAN NOT NULL DEFAULT true,
  "inicio" TEXT NOT NULL DEFAULT '09:00',
  "fin" TEXT NOT NULL DEFAULT '18:00',
  "descansa" BOOLEAN NOT NULL DEFAULT false,
  "descansoInicio" TEXT NOT NULL DEFAULT '13:00',
  "descansoFin" TEXT NOT NULL DEFAULT '14:00',
  CONSTRAINT "HorarioPersonal_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "HorarioPersonal_dia_valido" CHECK ("diaSemana" BETWEEN 0 AND 6)
);

CREATE UNIQUE INDEX "HorarioPersonal_personalId_diaSemana_key" ON "HorarioPersonal"("personalId", "diaSemana");
CREATE INDEX "HorarioPersonal_storeId_idx" ON "HorarioPersonal"("storeId");

ALTER TABLE "HorarioPersonal" ADD CONSTRAINT "HorarioPersonal_storeId_fkey"
  FOREIGN KEY ("storeId") REFERENCES "Store"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "HorarioPersonal" ADD CONSTRAINT "HorarioPersonal_personalId_fkey"
  FOREIGN KEY ("personalId") REFERENCES "MiembroPersonal"("id") ON DELETE CASCADE ON UPDATE CASCADE;
