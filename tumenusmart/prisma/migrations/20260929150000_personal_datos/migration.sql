-- Datos del personal de la Reserva de turnos: apellido, teléfono (internacional,
-- solo dígitos), profesión y foto. Todo opcional a nivel de base: los miembros
-- que ya existieran quedan sin esos datos.

ALTER TABLE "MiembroPersonal" ADD COLUMN "apellido" TEXT;
ALTER TABLE "MiembroPersonal" ADD COLUMN "telefono" TEXT;
ALTER TABLE "MiembroPersonal" ADD COLUMN "profesion" TEXT;
ALTER TABLE "MiembroPersonal" ADD COLUMN "fotoUrl" TEXT;
